---
title: "Comparing External Secrets Operator With HashiCorp's Vault Secrets Operator"
date: 2023-05-01T14:25:42-04:00
draft: false
---
## Introduction

HashiCorp recently released their own Kubernetes Operator to retrieve secrets from Vault. This is a similar to the GoDaddy tool, External Secrets Operator (ESO), started a few years ago.

The Vault Secrets Operator (VSO) is the third method to consume secrets from Vault to Kubernetes workloads that HashiCorp officially supports. The other two options are their Kubernetes Vault Agent and their Container Storage Interface (CSI) provider.

I did not want to write a blog comparing all of the options because I have seen a couple blogs doing just that. Instead, this blog is just set to compare VSO and ESO. Additionally, discussing whether syncing secrets from Vault to Kubernetes secrets is a good idea or not, when it makes sense to do so, and things to consider when doing so is out of scope for this blog.

> **Note:** VSO is still in its beta phase, so I expect consistent updates until a stable release. Given that, I’ll do my best to keep this post updated but if you see something that is severely out of date, feel free to reach out.

## Criteria

To compare both operators, I’m going to review them in the following areas:

- **Installation** - How easy it to install the operator? Is there a Helm chart provided? How well is it documented?
- **Usage** - How do I define the secrets I want to consume? Are the Custom Resources Definitions (CRDs) intuitive?
- **Telemetry** - What kind of metrics are exposed? How do I know if my secrets are failing to sync?

## Installation

### Vault Secrets Operator

The Helm chart provided with the Vault Secrets Operator makes it easy to deploy it to a Kubernetes cluster. Notably, it allows for setting a default Vault cluster to point to, along with a default authentication method for Vault.

### External Secrets Operator

The External Secrets Operator also comes with a Helm chart. It does not allow you to define any Vault defaults but I think it is important to remember that this operator supports a lot more secret stores than HashiCorp Vault. Given that, I can appreciate why defining anything specific to a secret store should happen post-deployment.

The external Secrets Operator also supports installation via Operator Lifecycle Manager (OLM).

### Conclusion

Both operators make deployment easy via their Helm charts and are decently documented via their respective docs. Not much more to say here.

## Usage

Both operators leverage their own Custom Resources Definitions (CRDs) to define where Vault lives, how to authenticate to it, and the secrets to pull, as well as where to store them in Kubernetes.

### Vault Secrets Operator

To define the Vault cluster to use, VSO uses a CRD called `VaultConnection`. It is a simple CRD that just defines the address to the Vault. The API reference is [here](https://developer.hashicorp.com/vault/docs/platform/k8s/vso/api-reference#vaultconnection).

After defining the connection, you need to define how to authenticate to Vault. VSO uses a CRD called `VaultAuth`. This CRD defines the method to use to authenticate to Vault, as well as the Vault namespace, and mount point. The API reference is [here](https://developer.hashicorp.com/vault/docs/platform/k8s/vso/api-reference#vaultauth).

The last step, and probably the most exciting, is the CRD to get secrets into the Kubernetes cluster. VSO actually has a few CRDs to handle this. If you want to pull a secret from a KV Secrets Engine, you can use the `VaultStaticSecret` CRD. There are also dedicated CRDs if you want to pull a secret from a dynamic Secrets Engine or a PKI secrets Engine. The full list of available CRDs can be found [here](https://developer.hashicorp.com/vault/docs/platform/k8s/vso#vaultstaticsecret-custom-resource).

### External Secrets Operator

In ESO, you define the Vault cluster to use and the authentication method in the same CRD. ESO gives two options to define this, `SecretStore` and `ClusterSecretStore`. As you can probably guess from the names, one is cluster-scoped and one is not.

To pull secrets from Vault, ESO has a single CRD, `ExternalSecret`, where you define the secret store reference and then the path to the secret to retrieve. 

### Conclusion

Although both operators have their own CRDs, the concepts and thinking behind them are similar. You define where Vault is located and how to authenticate to it, and then use dedicated CRDs to specify which secrets to synchronize to Kubernetes. If I had to nitpick, I would say that ESO having a single CRD to define a secret is preferable, whereas with VSO, it depends on the type of secret being retrieved. However, this is not a significant issue, and there isn't much to separate these two when it comes to usage.

## Telemetry

The main thing I am looking for here is Prometheus support and the exposure of metrics to know if my secrets are properly synchronizing or not.

### Vault Secrets Operator

VSO exposes various metrics, such as sync operations, sync failures, and authentication failures, through a Prometheus endpoint. However, understanding the metrics exposed required some digging, and I had to set up my own ServiceMonitor post-installation. It would be beneficial if the documentation improved as the tool matures and if the Helm chart included an option for the ServiceMonitor.

### External Secrets Operator

ESO also exposes similar metrics through a Prometheus endpoint, including the crucial metric of whether secret syncs are failing or not. This is the main metric that I am interested in, and ESO provides it.

The documentation for the metrics is great and can be found [here](https://external-secrets.io/v0.8.1/api/metrics/), and because I mentioned it earlier, ESO does provide the ability to create a ServiceMonitor in the Helm chart.

### Conclusion

While both operators provide the necessary metrics I need, I think right now, ESO is the winner because of the overall documentation behind the metrics. I’m sure HashiCorp will improve this shortly, but for now, ESO wins in this category.

## Final Remarks

Both operators aim to solve the same problem, and they do it well. However, it's worth noting that ESO supports more than just HashiCorp Vault. If you have applications that need to interact with other secret stores, such as Azure Key Vault or Google Secrets Manager, ESO provides a single interface for multiple secret stores.

If you're starting with a new deployment or currently using ESO and are considering whether to migrate to VSO, here are some questions to consider:

- Are all of my secrets currently stored in HashiCorp Vault?
- Do I need to use a tool from the vendor?

If the answer to both questions is "yes," then VSO is likely the path to follow. Keep in mind that it's still in beta, but from my testing, it's a fully functional tool.

## Additional Resources

- [https://www.hashicorp.com/blog/vault-secrets-operator-a-new-method-for-kubernetes-integration](https://www.hashicorp.com/blog/vault-secrets-operator-a-new-method-for-kubernetes-integration)
- [https://www.hashicorp.com/blog/kubernetes-vault-integration-via-sidecar-agent-injector-vs-csi-provider](https://www.hashicorp.com/blog/kubernetes-vault-integration-via-sidecar-agent-injector-vs-csi-provider)
