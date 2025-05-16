---
title: "Building a Python Based MCP Server for Kubernetes"
date: 2025-05-16T11:35:14-04:00
draft: true
---

It feels like you can’t go far on the internet these days without running into a post or blog about Generative AI or Agentic AI. And for good reason—there are a lot of fascinating use cases and projects built around these concepts, all aiming, in one way or another, to automate mundane tasks and help us understand and solve complex problems.

After building some small tools with Large Language Models (LLMs) and LangChain over the past year or so, I drew some new inspiration to start a project that ties in the world of AI into an area I know quite well, containers and Kubernetes.

The reality is, Kubernetes is hard - especially for those who are new to the field and trying to get a solid grasp of containers at the same time. I’ve been fortunate to work with Kubernetes for over eight years and have become quite familiar with the API and interacting with it via `kubectl`. While I don’t discount the value in spending countless hours troubleshooting cluster or application issues, vigorously typing `kubectl` commands, hopefully searching Stackoverflow for answers, I actually encourage it (it’s how I learned). I think we’ve definitely entered a new age of learning with AI, and we should embrace that.

Enter this project. The idea was to build something that helps users troubleshoot when things aren’t going as planned in their Kubernetes cluster - while also providing helpful explanations and suggestions from LLMs.

I chose to build this as a Module Context Protocol (MCP) server because MCP abstracts away the actual LLM component, letting me focus on building a tool that provides the best possible context to it.

Here is the GitHub [link](https://github.com/jacobmammoliti/mcp-server-kubernetes).

## Goal of this Project

I started this project to learn something new in MCP and to get more hands-on experience with LLMs - specifically, how they respond to different types of context. By building a tool that helps simplify the technologies I work with daily, I hoped it would motivate me to dive deeper and continue evolving the project.

The initial inspiration came from several existing projects (linked below). These were developed earlier and are more feature-rich, so I’d definitely encourage you to check them out:

- [Kubectl-ai](https://github.com/GoogleCloudPlatform/kubectl-ai)
- [MCP Server Kubernetes](https://github.com/Flux159/mcp-server-kubernetes)
- [K8s GPT](https://k8sgpt.ai/)

Let’s dive into the beginnings of the project!

## Don't Boil the Ocean

> If you're not embarassed by the first version of your product, you've launched too late. _- Reid Hoffman, Co-founder of LinkedIn_

To get a basic understanding of how both the MCP protocol and the Python SDK work, I started with just a few tool definitions. I wrote separate tools that invoke the Kubernetes Python client to list pods, deployments, and services, as well as a tool to read events in a given namespace. This setup covers the fundamentals and provides enough functionality to make the tool usable from day one - albeit with limited capabilities.

With those tools in place, I loaded the server into Claude Desktop and began testing against my Docker Desktop single-node Kubernetes cluster.

### Test 1 - List all pods in the kube-system namespace

The first test I ran was asking Claude to list all the pods in the `kube-system` namespace. In the screenshot below, you can see the `list_pods` tool being invoked, returning a list of pods along with a quick summary of their purposes.

![list_pods](/images/building-a-python-based-mcp-server-for-kubernetes/list_pods.png)

### Test 2 - Why is my deployment in the default namespace not running?

The second test was a bit more interesting. I created a deployment in the `default` namespace that references an image in a private registry—without an `ImagePullSecret`. As expected, the pod spawned by the deployment fails.

```bash
$ kubectl get pods
NAME                    READY   STATUS             RESTARTS   AGE
test-6fdc47645d-rz8nh   0/1     ImagePullBackOff   0          23h

$ kubectl get events
LAST SEEN   TYPE     REASON    OBJECT                      MESSAGE
2m42s       Normal   BackOff   pod/test-6fdc47645d-rz8nh   Back-off pulling image "jacobmammoliti/anthostest:latest"
```

With this test, I wanted to confirm that the LLM could interpret the relevant events and suggest a resolution. In the screenshots below, you’ll see it calls multiple tools, eventually invoking the `get_events` tool, where it picks up on the image pull back-off message.

![get_events_1](/images/building-a-python-based-mcp-server-for-kubernetes/get_events_1.png)

![get_events_2](/images/building-a-python-based-mcp-server-for-kubernetes/get_events_2.png)

What’s really cool is that it not only explains the likely cause of the error but also suggests a potential fix - which in this case is adding an `ImagePullSecret`.

Going through these tests, it’s impressive to watch the interaction between the MCP server, Claude Desktop (the MCP client), and the LLM. It does a great job interpreting natural language, choosing the appropriate tool, and reasoning step-by-step to reach a solution. Another major benefit of MCP is that I didn’t have to embed the LLM directly into my code - I just built the tools, and Claude Desktop handled passing them in as context.

## What's Next

Right now, the project is fairly limited in what it can do, but it’s already proving to be a valuable experiment. Pretty quickly, and with only a few lines of code, I’ve been able to use MCP to wire up an integration with a Kubernetes cluster, tie that with Claude Desktop, and have it return some insights from the cluster.

Looking ahead, I’m going to explore more of what MCP offers - concepts like resources, prompts, sampling, etc - to see if it improves how the LLM behaves and responds. Of course, in a real-world environment, this would come with obvious risks. My preferred approach would be to surface those changes through GitOps tools like ConfigSync or Flux. Still, this is all part of exploring the art of the possible and deepening my understanding of MCP.