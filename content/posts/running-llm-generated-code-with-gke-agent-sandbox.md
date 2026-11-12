+++
date = '2026-11-11T10:00:00-05:00'
draft = false
title = 'Letting an LLM Run Code Without Trusting It: GKE Agent Sandbox'
tags = ['kubernetes', 'gke', 'security', 'ai']
+++

After getting [Gemma 4 running on my home lab's Iris Xe GPU](/posts/running-gemma-4-locally-on-an-intel-iris-xe-gpu/), the next step was wiring it into my budgeting app. Answering "how much did I spend on coffee last month?" is easy for a model when it can write a few lines of Python against my transactions and run them. Getting the model to write that code is the easy part. The real question is where the code runs.

The answer shouldn't be "on the same host as everything else." Model-generated code is untrusted code. It can be wrong, it can be manipulated through prompt injection, and either way it ends up executing next to my data and credentials. GKE Agent Sandbox went GA earlier this year, so I read through the docs and the upstream project to work out exactly what it isolates, what it doesn't, and what the configuration should look like.

## What Agent Sandbox Is

Agent Sandbox is a Kubernetes controller and a set of CRDs for running isolated, single-purpose pods for agent workloads. It's an open-source project under [kubernetes-sigs](https://github.com/kubernetes-sigs/agent-sandbox), and Google announced it as [generally available on GKE in May 2026](https://cloud.google.com/blog/products/containers-kubernetes/bringing-you-agent-sandbox-on-gke-and-agent-substrate). Per the [install docs](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/how-install-agent-sandbox), it's free to use; you pay for the GKE resources it runs on.

The isolation comes from [GKE Sandbox with gVisor](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/sandbox-pods). gVisor is a user-space kernel that intercepts the container's system calls and services them itself, so code in the pod never talks directly to the node's kernel. A kernel exploit inside the sandbox lands on gVisor, not on the host.

The project defines four resources. `Sandbox` (in `agents.x-k8s.io/v1beta1`) is a single isolated pod. `SandboxTemplate`, `SandboxWarmPool`, and `SandboxClaim` (in `extensions.agents.x-k8s.io/v1beta1`) let you define a blueprint, keep pods pre-warmed, and check one out on demand.

## Setting Up the Cluster

The [install docs](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/how-install-agent-sandbox) use a zonal Standard cluster with a separate gVisor node pool:

```bash
$ export CLUSTER_NAME="agent-sandbox-cluster"
$ export LOCATION="us-central1-a"
$ export MACHINE_TYPE="e2-standard-2"
$ export AGENT_SANDBOX_VERSION="v1.0.10"

# --enable-dataplane-v2 isn't in the Agent Sandbox docs. Without a
# network policy enforcer, the NetworkPolicy the controller creates does nothing.
$ gcloud container clusters create ${CLUSTER_NAME} \
    --location=${LOCATION} \
    --machine-type=${MACHINE_TYPE} \
    --num-nodes=1 \
    --enable-dataplane-v2

# The gVisor node pool. GKE taints these nodes so only sandboxed pods land here.
$ gcloud container node-pools create agent-sandbox-pool \
    --cluster=${CLUSTER_NAME} \
    --machine-type=${MACHINE_TYPE} \
    --location=${LOCATION} \
    --num-nodes=1 \
    --image-type=cos_containerd \
    --sandbox=type=gvisor
```

`--sandbox=type=gvisor` is what turns on GKE Sandbox for the pool, and it requires the `cos_containerd` image type. On Autopilot you skip the node pool entirely, because gVisor is already enabled there.

`--enable-dataplane-v2` is my addition. The Agent Sandbox network isolation is built on standard Kubernetes `NetworkPolicy`, and on GKE Standard those policies are only enforced when [Dataplane V2](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/dataplane-v2) or network policy enforcement is enabled.

Installing Agent Sandbox itself isn't a `gcloud` flag. You apply the upstream release manifest, then the recommended admission policy:

```bash
$ kubectl apply -f https://github.com/kubernetes-sigs/agent-sandbox/releases/download/${AGENT_SANDBOX_VERSION}/sandbox-with-extensions.yaml

# Without this policy, Agent Sandbox doesn't restrict what a Sandbox pod spec can contain
$ kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/agent-sandbox/${AGENT_SANDBOX_VERSION}/examples/policy/vap/secure-sandbox-policy.yaml
$ kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/agent-sandbox/${AGENT_SANDBOX_VERSION}/examples/policy/vap/secure-sandbox-binding.yaml
```

The docs pin `v1.0.6`. I'd use `v1.0.10`, the [latest release](https://github.com/kubernetes-sigs/agent-sandbox/releases) at the time of writing. If you're coming from a version older than `1.0.0`, the `v1alpha1` API was removed, so migrate first.

## Deploying a Sandbox

I'd start with a `SandboxTemplate` rather than a bare `Sandbox`. The controller only creates its default `NetworkPolicy` for pods built from a template. A `Sandbox` you create directly gets [no network policy at all](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/machine-learning/agent-sandbox).

```yaml
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxTemplate
metadata:
  name: budget-sandbox
spec:
  podTemplate:
    metadata:
      labels:
        app: budget-sandbox
    spec:
      runtimeClassName: gvisor              # Required: run under gVisor, not runc
      automountServiceAccountToken: false   # Required: no Kubernetes API token in the pod
      securityContext:
        runAsNonRoot: true                  # Required
        runAsUser: 1000                     # python:slim defaults to root
      nodeSelector:
        sandbox.gke.io/runtime: gvisor      # Required: schedule onto the gVisor pool
      tolerations:
      - key: "sandbox.gke.io/runtime"       # Required: tolerate the gVisor pool's taint
        value: "gvisor"
        effect: "NoSchedule"
      containers:
      - name: runtime
        image: python:3.13-slim
        command: ["sleep", "infinity"]
        securityContext:
          capabilities:
            drop: ["ALL"]                   # Required
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true      # My choice, not required
        resources:
          limits:                           # Required: CPU and memory limits
            cpu: "500m"
            memory: "512Mi"
        volumeMounts:
        - name: scratch
          mountPath: /tmp                   # The only writable path
      volumes:
      - name: scratch
        emptyDir:
          sizeLimit: 64Mi
```

The fields marked `Required` come from the [deployment requirements](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/how-install-agent-sandbox) enforced by the admission policy. The policy also rejects `hostNetwork`, `hostPID`, `hostIPC`, `privileged`, `hostPath` volumes, `hostPort`, and added capabilities.

Two of the required fields are worth calling out. `automountServiceAccountToken: false` matters because a mounted token is the first thing malicious code would read. With it, the code could talk to the Kubernetes API as that service account. Resource limits matter because the code doesn't need to steal anything to cause harm: an infinite loop or a giant allocation can starve everything else on the node.

Pods are checked out through a warm pool and a claim. The claim API [requires a `warmPoolRef`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/docs/api.md), so even a one-off sandbox goes through a pool:

```yaml
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxWarmPool
metadata:
  name: budget-pool
spec:
  replicas: 1              # One pre-started pod is plenty for a single user
  sandboxTemplateRef:
    name: budget-sandbox
---
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxClaim
metadata:
  name: budget-claim
spec:
  warmPoolRef:
    name: budget-pool
```

The warm pool keeps pre-started pods ready, so a claim doesn't wait for scheduling and an image pull. Google claims [300 sandboxes per second per cluster](https://cloud.google.com/blog/products/containers-kubernetes/bringing-you-agent-sandbox-on-gke-and-agent-substrate). For a single-user budgeting app, the practical benefit is simply that the first question doesn't wait on a cold start.

## What It Protects Against, and What It Doesn't

Reading the docs closely, the protection breaks down into four layers. Some of them don't come from gVisor at all.

**The kernel.** This is what gVisor provides. Code in the sandbox sees gVisor's implementation of the Linux syscall interface, not the node's kernel. Running `uname -a` or `dmesg` inside the pod is a quick way to see it: you're looking at gVisor, not the host. The trade-off is that gVisor implements a [subset of Linux syscalls](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/sandbox-pods), so some software won't run.

**Credentials.** With `automountServiceAccountToken: false`, there's nothing at `/var/run/secrets/kubernetes.io/serviceaccount` to steal. The other credential source on GKE is the metadata server, which hands out tokens for the node's service account. The default policy [blocks `169.254.0.0/16`](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/agent-sandbox), which covers it. If your sandbox legitimately needs Google Cloud APIs, you open that range up deliberately and use Workload Identity.

**The network.** This is where my assumptions were wrong. The default policy is not "deny all egress." According to the [upstream network policy docs](https://github.com/kubernetes-sigs/agent-sandbox/tree/main/examples/policy/network-policy-management), it blocks ingress from everything except the Sandbox Router. It blocks egress to RFC 1918 ranges, cluster DNS, and the metadata range, but it allows the public internet.

That stops lateral movement into the cluster. It does nothing to stop exfiltration: model-generated code can still post whatever data you hand it to any public endpoint. A code interpreter that only needs to crunch a CSV has no reason to reach the internet, so I'd set an explicit empty egress list on the template:

```yaml
spec:
  networkPolicyManagement: Managed
  networkPolicy:
    egress: []   # No outbound traffic at all
```

**The filesystem and resources.** Writes outside `/tmp` are blocked here, but by `runAsNonRoot` and `readOnlyRootFilesystem`, not by gVisor. The memory limit means a runaway allocation gets the container OOM-killed instead of pressuring the node. These are standard Kubernetes controls. The admission policy just makes them mandatory.

## Running Model-Generated Code

Here's the kind of script I'd expect Gemma to write for "how much did I spend on coffee last month?" It's hardcoded here, but in practice it would come back from the same OpenAI SDK call I showed in the Gemma post:

```python
import csv, sys
from collections import defaultdict

totals = defaultdict(float)
for row in csv.DictReader(sys.stdin):
    if row["date"].startswith("2026-10"):
        totals[row["category"]] += float(row["amount"])

for category, amount in sorted(totals.items(), key=lambda kv: -kv[1]):
    print(f"{category:<10} ${amount:>8.2f}")
print(f"\ncoffee in October: ${totals['coffee']:.2f}")
```

The script goes in as an argument and the CSV goes in on stdin, so nothing has to be written into the sandbox:

```bash
# Find the pod the claim was bound to
$ SBX=$(kubectl get pod -l app=budget-sandbox -o jsonpath='{.items[0].metadata.name}')

$ kubectl exec -i $SBX -- python3 -c "$(cat analyze.py)" < transactions.csv
```

The app only ever sees stdout. The script has no token, no metadata server, no route into the cluster and, with `egress: []`, no route out. If the model writes something malicious, it's limited to what it can do with a CSV and 512 MiB of memory.

## Cleaning Up

```bash
$ gcloud container clusters delete ${CLUSTER_NAME} --location=${LOCATION}
```

## Final Thoughts

What surprised me most is how much of the isolation is opt-in. The admission policy is a separate install, a bare `Sandbox` gets no network policy, and the default egress policy still allows the internet. gVisor does the hard part, keeping the code off the host kernel. Removing credentials and closing the network are settings you have to get right yourself, and if you deploy without reading the docs closely, you get less isolation than the name suggests.

For a production code interpreter, I wouldn't run model-generated code with less than this. For my budgeting app, running a GKE cluster just for this is hard to justify. But the shape of the solution carries over directly: a gVisor runtime, no credentials in the pod, a hard resource limit, and no network. That's what I'll be building toward at home.
