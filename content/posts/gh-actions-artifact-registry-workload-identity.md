---
title: "How I Push Container Images to Google Artifact Registry with GitHub Actions and Workload Identity Federation"
date: 2023-04-02T09:16:01-05:00
draft: false
---

Ever since GitHub announced Actions in 2018, it has been my go-to CI tool for personal projects. I will say, I have been tempted at times to switch to other tools, such as Argo Workflows, but with GitHub Actions, there is native support within my GitHub repositories and I don't have to host anything.

One switch I recently have made is to Google Artifact Registry from DockerHub to host my container images. With the combination of GitHub Actions, Artifact Registry, and Workload Identity Federation, I am able to push my images into a private registry without having to generate and store any long lived credentials.

The core of my GCP environment is built and maintained within a [single repository](https://github.com/jacobmammoliti/homelab-gcp) containing all the Terraform code needed to run my environment. Given that, the steps shown here were orchestrated through that repository as well. If you are interested in doing this through a CLI, I recommend you check out this [GitHub Gist](https://gist.github.com/palewire/12c4b2b974ef735d22da7493cf7f4d37).

In this blog, I'll walk through how I set up my application's GitHub repository (found [here](https://github.com/jacobmammoliti/scoreboard)) to automatically build and push container images to Google Artifact Registry with Workload Identity Federation.

> **Note:** It is important to understand Workload Identity Federation prior to using it. A good initial resource can be found in the documentation [here](https://cloud.google.com/iam/docs/workload-identity-federation).

## Setting up Google Artifact Registry

Setting up the Artifact Registry was pretty elementary when doing it with Terraform since I leveraged the Google Cloud Foundation Fabric modules.

The Terraform code below specifies the project, region, format, and name of the registry. I also leveraged the module to assign the Artifact Registry Admin role to the admin group in my organization.

```hcl
module "docker_artifact_registry" {
  source = "github.com/GoogleCloudPlatform/cloud-foundation-fabric.git//modules/artifact-registry?ref=v20.0.0"

  project_id = module.project.project_id
  location   = var.region
  format     = "DOCKER"
  id         = "core"
  iam = {
    "roles/artifactregistry.admin" = [format("group:%s", var.admin_group)]
  }
}
```

## Setting up Workload Identity Federation

Setting up Workload Identity Federation required two steps. First I created a dedicated service account that will be used by the GitHub Actions workflow to authenticate to Google Cloud and push the built image to Artifact Registry.

The Terraform code below creates the service account and assigns the predefined Artifact Registry Writer role.

```hcl
module "wif-artifact-registry-service-account" {
  source = "github.com/GoogleCloudPlatform/cloud-foundation-fabric.git//modules/iam-service-account?ref=v20.0.0"

  project_id   = module.project.project_id
  name         = "artifact-registry-pusher"
  description  = "Artifact Registry Pusher WIF service account"
  generate_key = false

  iam_project_roles = {
    (module.project.project_id) = [
      "roles/artifactregistry.writer",
    ]
  }
}
```

The second step was to add the newly created service account to the Workload Identity pool. The Terraform code below creates a dedicated workload identity pool with the GitHub provider and adds the service account to the pool. Additionally, I assigned an attribute to the mapping to say that this service account must only be used in the specified GitHub repository [here](https://github.com/jacobmammoliti/scoreboard). With this assignment, if I were to try to use this service account in a different repository, authentication would fail.

```hcl
module "gh_oidc" {
  source      = "terraform-google-modules/github-actions-runners/google//modules/gh-oidc"
  project_id  = module.project.project_id
  pool_id     = "github-pool-prod"
  provider_id = "github-provider-prod"
  sa_mapping = {
...
    "artifact-registry-account" = {
      sa_name   = module.wif-artifact-registry-service-account.id
      attribute = format("attribute.repository/%s/scoreboard", var.github_organization)     
    }
  }
}
```

## Crafting the GitHub Actions

With Google Cloud configured, the last piece was to set up the GitHub Actions. I currently have two actions in the repository. The first one (found [here](https://github.com/jacobmammoliti/scoreboard/blob/main/.github/workflows/test-and-scan.yml)) runs tests and scans the container image for any vulnerabilities and is run anytime I merge code into the main branch. 

The second action, which is the one I am focusing on here, builds and pushes the image to Artifact Registry and only runs when I create a new release.

It contains five steps:
1. Checkout the code in the repository.
2. Get the current release tag. This was used to tag the container image before pushing to Artifact Registry.
3. Authenticate to Google Cloud with the specified service account and workload identity provider. I also specified that I want the token format as an `access_token` to use to authenticate to Artifact Registry in the next step.
4. Login to Artifact Registry with the `access_token`.
5. Build and tag the container image with both the release and latest tag and then push it to Artifact Registry named `core` in my main GCP project `proj-mission-control-80492`.

> **Note:** I redacted some text in the below snippet for eligibility. Please see the [repository](https://github.com/jacobmammoliti/scoreboard) for the complete code.

```yaml
name: Build and Push
on:
  push:
    tags: 'v*.*.*'
jobs:
  build-and-push:
    name: Build and Push
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Get tag
        id: get-tag
        run: echo ::set-output name=short_ref::${GITHUB_REF#refs/*/}

      - name: Authenticate to Google Cloud
        id: auth-gcp
        uses: google-github-actions/auth@v0
        with:
          token_format: access_token
          workload_identity_provider: ...
          service_account: ...

      - name: Login to Artifact Registry
        uses: docker/login-action@v1
        with:
          registry: us-east1-docker.pkg.dev
          username: oauth2accesstoken
          password: ${{ steps.auth-gcp.outputs.access_token }}

      - name: Tag Docker image and push to Google Artifact Registry
        id: build-push-tag
        uses: docker/build-push-action@v2
        with:
          push: true
          tags: |
             us-east1-docker.pkg.dev/proj-mission-control-80492/core/scoreboard:${{ steps.get-tag.outputs.short_ref }}
             us-east1-docker.pkg.dev/proj-mission-control-80492/core/scoreboard:latest
```

## Wrapping Up

With the GitHub Actions in place, the repository is now equipped to build and push the container images for my application whenever I cut a new release. This has significantly increased the speed at which I can release new updates of my application since I just need to worry about the code. Testing, scanning, and pushing the container is now taken care of securely by GitHub Actions and Workload Identity Federation.