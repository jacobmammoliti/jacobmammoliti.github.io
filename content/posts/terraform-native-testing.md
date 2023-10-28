---
title: "Experimenting with Terraform’s New Native Testing Functionality"
date: 2023-10-28T12:18:30-04:00
draft: false
---

The release of Terraform 1.6 brought us the introduction of the long-awaited native testing framework. Previously, if you wanted to write tests for your Terraform code, you had to look to tools such as [tftest](https://pypi.org/project/tftest/) or [Terratest](https://github.com/gruntwork-io/terratest). 

In our Cloud and Data practice at PwC, we rely heavily on Terraform in both internal and external projects and a central focus for us is ensuring the quality and consistency of the code we produce. Currently, we have been using Terratest from Gruntwork to accomplish this. What initially attracted me to Terratest was its simplicity and its ability to test not only Terraform code but a variety of other artifacts such as Packer templates, Kubernetes manifests, OPA policies, and more. This versatility offers a standardized approach to testing across various workflows and tool sets.

Having said this, I was still curious to explore HashiCorp's native testing framework and compare it to our existing testing practices. For this experiment, I used a simple Terraform module that we use in our workshop builds.

## Background on the Terraform Module

The Terraform module I used reads a YAML file that is expected to have two lists of email addresses - one for students and one for instructors. We take the list of student email addresses and scrub the usernames so that we can use them throughout the workshop automation. The module has three outputs: the original student and instructor emails, each in their own separate list and then a third list containing the scrubbed usernames.

Here is an example of the YAML file:

```yaml
---
student_list:
  - test_student@pwc.com
instructor_list:
  - test_instructor@pwc.com
```

And here is the output from Terraform:

```bash
instructor_list = [
  "test_instructor@pwc.com",
]
student_list = [
  "test_student@pwc.com",
]
student_list_scrubbed = [
  "tesent",
]
```

With that bit of context of the module, let’s move onto the testing.

## Testing a Terraform Module with Terragrunt

Being that Terratest is a Go library, the tests written are also in Go. While writing these tests are not overly complex, it helps to have some familiarity with setting up Go environments, a grasp of the language's syntax, and reviewing the examples offered by Terragrunt.

As this module is straightforward, the test for it is equally simple. The goal is to verify that the module indeed returns three lists and that the contained strings match our expected values.

Here is the test code:

```go
// student_instructor_list_test.go

package test

import (
  "testing"

  "github.com/gruntwork-io/terratest/modules/terraform"
  "github.com/stretchr/testify/assert"
)

func TestStudentInstructorList(t *testing.T) {

  terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
    TerraformDir: "../../../modules/student-instructor-lists",
  })

  // At the end of the test, run `terraform destroy` to clean up any resources that were created
  defer terraform.Destroy(t, terraformOptions)

  // This will run `terraform init` and `terraform apply` and fail the test if there are any errors
  terraform.InitAndApply(t, terraformOptions)

  // Run `terraform output` to get the value of an output variable
  instructor_list := terraform.OutputList(t, terraformOptions, "instructor_list")
  student_list := terraform.OutputList(t, terraformOptions, "student_list")
  student_list_scrubbed := terraform.OutputList(t, terraformOptions, "student_list_scrubbed")

  // Assertions on the three returned lists
  assert.Equal(t, []string{"test_instructor@acceleratorlabs.ca"}, instructor_list)
  assert.Equal(t, []string{"test_student@pwc.com"}, student_list)
  assert.Equal(t, []string{"tesent"}, student_list_scrubbed)
}
```

Here is what a successful test looks like:

```bash
$ go test
...
PASS
ok      github.com/<redacted>/modules/student-instructor-lists     0.695s
```

And here is what an unsuccessful test looks like:

```bash
$ go test
...
--- FAIL: TestStudentInstructorList (0.29s)
    student_instructor_lists_test.go:29: 
                Error Trace:    <redacted>
                Error:          Not equal: 
                                expected: []string{"test_student@pwc.com"}
                                actual  : []string{"test_student@pwc.coms"}
                            
                                Diff:
                                --- Expected
                                +++ Actual
                                @@ -1,3 +1,3 @@
                                 ([]string) (len=1) {
                                - (string) (len=20) "test_student@pwc.com"
                                + (string) (len=21) "test_student@pwc.coms"
                                 }
                Test:           TestStudentInstructorList
FAIL
exit status 1
FAIL    github.com/<redacted>/modules/student-instructor-lists     0.535s
```

## Testing the same module natively with Terraform

Now to test with Terraform natively. These tests are written in HashiCorp Configuration Language (HCL) which people will likely be familiar with if they’ve written Terraform code before.

**Note:** The testing capabilities shown here are quite limited since the test is fairly simple. I’d recommend reading the documentation [here](https://developer.hashicorp.com/terraform/language/tests) to see the full list of capabilities available today.

I was able to replicate the same test I’m using in Terragrunt with the following code:

```go
variables {
  expected_instructor_list       = ["test_instructor@pwc.com"]
  expected_student_list          = ["test_student@pwc.com"]
  expected_student_list_scrubbed = ["tesent"]
}

run "valid_student_instructor_lists" {
  command = apply

  assert {
    condition     = output.instructor_list == var.expected_instructor_list
    error_message = format("The instructor list does not match the expected output. Got %v but expected %v.", output.instructor_list, var.expected_instructor_list)
  }

  assert {
    condition     = output.student_list == var.expected_student_list
    error_message = format("The student list does not match the expected output. Got %v but expected %v.", output.student_list, var.expected_student_list)
  }

  assert {
    condition     = output.student_list_scrubbed == var.expected_student_list_scrubbed
    error_message = format("The student list does not match the expected output. Got %v but expected %v.", output.student_list_scrubbed, var.expected_student_list_scrubbed)
  }
}
```

Overall, I found it quite easy to create this testing code after spending a brief amount of time in the documentation. I can appreciate how it can be more accessible, particularly if you lack experience in Go and are already familiar with the HCL syntax.

Here is what a successful test looks like:

```bash
$ terraform test validate.tftest.hcl
validate.tftest.hcl... in progress
  run "valid_student_instructor_lists"... pass
validate.tftest.hcl... tearing down
validate.tftest.hcl... pass

Success! 1 passed, 0 failed.
```

And here is what an unsuccessful test looks like:

```bash
$ terraform test validate.tftest.hcl
validate.tftest.hcl... in progress
  run "valid_student_instructor_lists"... fail
╷
│ Error: Test assertion failed
│ 
│   on validate.tftest.hcl line 16, in run "valid_student_instructor_lists":
│   16:     condition     = output.student_list == var.expected_student_list
│     ├────────────────
│     │ output.student_list is tuple with 1 element
│     │ var.expected_student_list is tuple with 1 element
│ 
│ The student list does not match the expected output. Got ["test_student@pwc.coms"] but expected ["test_student@pwc.com"].
╵
validate.tftest.hcl... tearing down
validate.tftest.hcl... fail

Failure! 0 passed, 1 failed.
```

The outputs for both successful and unsuccessful tests are concise and exactly what I was looking for.

## Final Thoughts

Overall, I'm really enjoying the native testing framework integrated into Terraform now. Writing the test code felt intuitive and didn't require extensive research or comprehension. Now mind you, I’m just doing a simple test here and I'm eager to delve deeper into its capabilities and explore its compatibility with more complex modules in our environment.

Regarding the choice of which path to take, I recommend assessing your current testing setup and consider whether it makes sense to migrate to the native testing framework. As I mentioned earlier, I'm a fan of Terragrunt because of its support for testing not just Terraform code but also Dockerfiles, Kubernetes manifests, and more. If the versatility of a single testing tool for these artifacts is a priority for you, there may not be an immediate need to rush into switching to the native framework. It's crucial to weigh the learning curve and the time required to rewrite your existing tests.

That being said, if having a testing framework from the vendor is something you have been waiting for, then I suggest starting small with a single piece of Terraform code or a module that you currently test, and writing it in HCL. This will help you gauge its capabilities and potential limitations. If it fulfills all your requirements, then it's worth developing a plan and initiating the migration of your Terraform tests to the native framework.
