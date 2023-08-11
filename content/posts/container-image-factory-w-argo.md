---
title: "Building a Container Image Factory with Argo and Azure Workload Identity"
date: 2023-08-11T08:20:19-04:00
draft: false
---

## Introduction

In this post, I'll walk you through a recent setup I've implemented within my Azure environment that addresses a common pain point in the development process – automating container image builds. Specifically, I’ll go through the solution I’ve built that allows developers to seamlessly build and push container images to an Azure Container Registry (ACR) with minimal disruption to their already established workflows.

By leveraging Argo Events, Argo Workflows, and Azure Workload Identity, I’m able to offer this framework to development teams to enforce a consistent approach to image building while also preventing the need for developers to have elevated access on the container registry or the need for static credentials to authorize to the ACR.

Throughout this post, I am going to be referencing snippets from YAML files that make up the pipeline. I’m only including relevant pieces I want to touch on but you can find the full YAML files in my GitHub repository [here](https://github.com/jacobmammoliti/blog-artifacts).

*I also want to add a quick note here on depth of this blog. It covers a lot of pieces in a condensed format. For me to cover everything would end up being a lengthy blog and would get away from the main point. I’ve linked the GitHub repository above but if there is anything that is still unclear after this, please feel free to reach out.*

## Environment

To set the stage, I want to cover the relevant pieces that make up the Azure environment:

- Azure Kubernetes Service (AKS) - The Kubernetes cluster that runs Argo Workflows and Argo Events.
- Azure Container Registry (ACR) - Holds the container images pushed via Argo Workflows.
- Argo Workflows - Runs the automation to build and push container images to ACR.
- Argo Events - Triggers Argo Workflows to run on events from GitHub.

## Azure Workload Identity

A core piece to make all of this work is Azure Workload Identity. It’s a feature that allows workloads running in an AKS cluster to authenticate and access Azure resources without having to manually manage credentials. If you’re interested in learning more about it, I’d recommend checking out the official documentation [here](https://azure.github.io/azure-workload-identity/docs/) and if you’re interested in learning how to configure Workload Identity in your own environment, I suggest this tutorial from Microsoft [here](https://learn.microsoft.com/en-us/azure/aks/learn/tutorial-kubernetes-workload-identity).

In my environment, I’ve created a Managed Identity called `argo-mi` and assigned the `AcrPush` role assignment scoped to my Azure Container Registry named `nonProductionACR`. This is what Argo Workflows will use to authenticate to Azure.

*Note: I’ve redacted some information increase legibility.*

```bash
$ az identity list \
--resource-group <REDACTED> \
--output table

ClientId    Location   Name      PrincipalId   ResourceGroup   TenantId
----------  ---------  --------  ------------  --------------  ----------
<REDACTED>  eastus     argo-mi   <REDACTED>    <REDACTED>      <REDACTED>

$ az role assignment list \
--resource-group <REDACTED> \
--assignee <REDACTED> \
--all \
--output table

Principal   Role     Scope
----------  -------  ------------------------------------------------------------------
<REDACTED>  AcrPush  <REDACTED>/Microsoft.ContainerRegistry/registries/nonProductionACR
```

Finally, I linked the Kubernetes service account that is going to be running the Argo Workflows to the Managed Identity above by creating a federated identity credential. This states that a workload in Kubernetes can only leverage the `argo-mi` Managed Identity if it is running with the Kubernetes Service account called `argo-sa` in the `argo-events` namespace.

> **Note:** that this service account is not created when you deploy Argo Events or Workflows. I created this for the sole purpose of being used to build and push container images to ACR. One key thing to note when creating this Kubernetes service account is adding an annotation with the Client ID of your Managed Identity. This creates the link between the Kubernetes SA and the Managed Identity.

```bash
$ az identity federated-credential list \
--resource-group <REDACTED> \
--identity-name argo-mi \
--output table

Issuer      Name     ResourceGroup    Subject
----------  -------  ---------------  ----------------------------------
<REDACTED>  argo-fi  <REDACTED>       system:serviceaccount:argo-events:argo-sa
```

## Argo Workflows

With Argo Workflows, I’d recommend using templates where possible. Templating offers the advantage of creating reusable artifacts in contrast to each person or team creating their own workflow that potentially achieves the same outcome. By leveraging templates, I can establish a standardized approach for performing specific tasks or managing a series of tasks seamlessly.

The below `WorkflowTemplate` handles building and pushing the container image to ACR using a tool called Kaniko. You can read more about Kaniko [here](https://github.com/GoogleContainerTools/kaniko) but it essentially builds images from Dockerfiles in a container without the need of the Docker daemon.

[Kaniko Argo WorkflowTemplate](https://github.com/jacobmammoliti/blog-artifacts/blob/main/container-image-factory-w-argo/argo/workflow-template-kaniko.yaml)

The `WorkflowTemplate` takes in three parameters: release-tag, image-name, and registry-name. This allows enough initial parameters into the template such that multiple development teams can reuse it without needing to define the full workflow each time.

The other key piece of this `WorkflowTemplate` is the label we set on the template:

```yaml
metadata:
  labels:
    azure.workload.identity/use: "true"
```

This will label the pod that runs the workflow which is required to use Azure Workload Identity for authentication and authorization to push to the ACR.

## Argo Events

Up until this point, all of the pieces are in-place to allow developers to build and push container images. However, it still would be a manual process to actually run the workflow. This is where Argo Events comes in. I use it in this setup to automatically trigger the Argo Workflows defined above. Specifically, I want the container images to be automatically built and pushed into ACR whenever a new release is created in a GitHub repository that is configured to do so. This can be achieved by defining an Argo Events Event Source and Sensor to listen for a webhook that GitHub will fire when a new release is created. That Sensor, which I’ll dive deeper into shortly, creates an Argo Workflow each time a GitHub release is created.

> **Note:** There are a few other Argo Event resources that are required such as the `EventBus` and the GitHub `EventSource`. Setting those up are out of scope for this post but you can find their definitions in the GitHub repository I’ve linked.*

Let’s have a look at a few snippets of the Argo Events Sensor I mentioned previously. Of course, you can view the full Sensor in the GitHub repository.

The first snippet is focused on defining the event and its scope. As I mentioned, I only want this to get triggered when development teams create a new release so we filter the webhook receive from GitHub to define just that.

```yaml
dependencies:
  - name: release-dependency
    eventSourceName: github-webhook
    eventName: demo
    filters:
      data:
        - path: headers.X-Github-Event
          type: string
          value:
            - release
        - path: body.action
          type: string
          value:
            - created
```

The next piece is the trigger. This is where we tell Argo Events what to do when we get a webhook that satisfies our filtering. In this case, we define an Argo Workflow custom resource.

```yaml
triggers:
  - template:
      name: github-workflow-trigger
      k8s:
        operation: create
        source:
          resource:
            apiVersion: argoproj.io/v1alpha1
            kind: Workflow
```

Moving down the YAML spec, the next piece I want to highlight focuses on defining the Kubernetes service account as well as the structure of the Workflow. The service account is critical here as this, plus the label I highlighted above, make up the necessary components to leverage Azure Workload Identity.

Under the service account definition is the templates key, which defines what the workflow actually does. Because I already defined the WorkflowTemplates, this is rather straightforward and I’m just calling them in the order I need:

1. Clone the repository first to grab the Dockerfile and the application source code
2. Use Kaniko to build and push the container image

```yaml
serviceAccountName: argo-sa
templates:
  - name: docker-build-push
    inputs:
      parameters:
        - name: release-tag
        - name: git-repository-url
        - name: image-name
    steps:
      - - name: git-clone
          templateRef:
            name: git-clone
            template: git-clone
          arguments:
            parameters:
              - name: git-repository-url
                value: "{{inputs.parameters.git-repository-url}}"
      - - name: kaniko-build-azure
          templateRef:
            name: kaniko-build-azure
            template: kaniko-build-azure
          arguments:
            parameters:
              - name: release-tag
                value: "{{inputs.parameters.release-tag}}"
              - name: image-name
                value: "{{inputs.parameters.image-name}}"
              - name: registry-name
                value: "nonproductionacr.azurecr.io"
```

The final piece I want to highlight is how the input parameters are getting populated. You’ll notice that we are not actually defining any values in the workflow so far and that is by design to keep this sensor dynamic and generic to be consumed by multiple development teams and repositories. When GitHub sends a webhook, it sends a ton of useful information in the payload that can be used to populate those values that we need.

If you’re interested in viewing some of the available values, have a look at the GitHub documentation [here](https://docs.github.com/en/webhooks-and-events/webhooks/webhook-events-and-payloads).

```yaml
parameters:
  - src:
      dependencyName: release-dependency
      dataKey: body.release.tag_name
      dest: spec.arguments.parameters.0.value
  - src:
      dependencyName: release-dependency
      dataKey: body.repository.html_url
      dest: spec.arguments.parameters.1.value
  - src:
      dependencyName: release-dependency
      dataKey: body.repository.name
      dest: spec.arguments.parameters.2.value
```

## Sample Workflow Run

Tying this all together, I wanted to show what a sample run would look like. Again, I’ve redacted some information to increase legibility but you can see that the process from creating the release in GitHub to the image being built and stored in ACR took about 1 minute.

```bash
$ argo get buildkit-pdjkl --namespace argo-events

Name:                buildkit-pdjkl
Namespace:           argo-events
ServiceAccount:      argo-events-sa
Status:              Succeeded
Conditions:          
 PodRunning          False
 Completed           True
...
Duration:            1 minute 3 seconds
Progress:            2/2
ResourcesDuration:   44s*(1 cpu),44s*(100Mi memory)
Parameters:          
  release-tag:       1.0
  git-repository-url: https://github.com/jacobmammoliti/blog-artifacts
  image-name:        blog-artifacts

STEP                       TEMPLATE                               
 ✔ buildkit-pdjkl          docker-build-push            
 ├───✔ git-clone           git-clone/git-clone                         
 └───✔ kaniko-build-azure  kaniko-build-azure/kaniko-build-azure
```

## Wrapping Up and Next Steps

So we have a pretty basic pipeline setup that automatically builds and pushes container images. This process is facilitated by a combination of tools from the Argo suite, while Azure Workload Identity takes care of authentication and authorization. Like any good system, there is always room for refinement and expansion. Some initial thoughts I currently have are:

- **Image scanning with Trivy** - Right now, we’re not actually scanning the container images we are building which is a huge security risk. I’d like to add a step in the workflow to scan the image and reject the actual push to ACR if there are high or critical vulnerabilities that can be fixed.
- **Support for main branch builds** - Right now, images only get built when a new release is cut. I’d like to add support to also build images when code gets merged into the main branch and tag those images as “dev” or something similar to allow developers to test their containerized application before cutting a release.

I hope from reading this it has given you some ideas on how could implement a similar workflow for your development teams should this be a problem you are facing. As always, if you have further questions after reading this, please feel free to reach out.