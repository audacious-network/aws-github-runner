#  on-demand self-hosted aws runner (with convenient aws defaults) for github actions

github action for creation and registration of aws instances as gitjub actions self-hosted runners.
this action is a fork of [machulav/ec2-github-runner](https://github.com/machulav/ec2-github-runner).
it has been modified to:
- support image (ami) search patterns and owners rather than a specific ami id. useful if, for example, the latest ubuntu image is required.
- bootstrap the image by installing docker and git if they are not preinstalled.
- support overriding user-data when custom dependencies need to be preinstalled.
- setting of the aws region with the aws-region input rather than an environment variable.
- support use of the default subnet and security group for the vpc/az instead of requiring an explicit security group and subnet.
- support use of cheaper spot or scheduled instances as opposed to only scheduled instances.
- support setting the volume (disk) size so that more than the default 8gb is available to jobs.

start your aws [self-hosted runner](https://docs.github.com/en/free-pro-team@latest/actions/hosting-your-own-runners) right before you need it.
run the job on it.
finally, stop it when you finish.
and all this automatically as a part of your github actions workflow.

![github actions self-hosted aws runner](docs/images/github-actions-summary.png)

see [below](#example) the yaml code of the depicted workflow. <br><br>

**table of contents**

- [use cases](#use-cases)
  - [access private resources in your vpc](#access-private-resources-in-your-vpc)
  - [customize hardware configuration](#customize-hardware-configuration)
  - [save costs](#save-costs)
- [usage](#usage)
  - [how to start](#how-to-start)
  - [inputs](#inputs)
  - [environment variables](#environment-variables)
  - [outputs](#outputs)
  - [example](#example)
  - [real user examples](#real-user-examples)
- [self-hosted runner security with public repositories](#self-hosted-runner-security-with-public-repositories)
- [license summary](#license-summary)

## use cases

### access private resources in your vpc

the action can start the aws runner in any subnet of your vpc that you need - public or private.
in this way, you can easily access any private resources in your vpc from your github actions workflow.

for example, you can access your database in the private subnet to run the database migration.

### customize hardware configuration

github provides one fixed hardware configuration for their linux virtual machines: 2-core cpu, 7 gb of ram, 14 gb of ssd disk space.

some of your ci workloads may require more powerful hardware than github-hosted runners provide.
in the action, you can configure any aws instance type for your runner that aws provides.

for example, you may run a c5.4xlarge aws runner for some of your compute-intensive workloads.
or r5.xlarge aws runner for workloads that process large data sets in memory.

### save costs

if your ci workloads don't need the power of the github-hosted runners and the execution takes more than a couple of minutes,
you can consider running it on a cheaper and less powerful instance from aws.

according to [github's documentation](https://docs.github.com/en/free-pro-team@latest/actions/hosting-your-own-runners/about-self-hosted-runners), you don't need to pay for the jobs handled by the self-hosted runners:

> self-hosted runners are free to use with github actions, but you are responsible for the cost of maintaining your runner machines.

so you will be charged by github only for the time the self-hosted runner start and stop.
aws self-hosted runner will handle everything else so that you will pay for it to aws, which can be less expensive than the price for the github-hosted runner.

## usage

### how to start

use the following steps to prepare your workflow for running on your aws self-hosted runner:

**1. prepare iam user with aws access keys**

1. create new aws access keys for the new or an existing iam user with the following least-privilege minimum required permissions:

   ```
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ec2:RunInstances",
           "ec2:TerminateInstances",
           "ec2:DescribeInstances",
           "ec2:DescribeInstanceStatus"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

   If you plan to attach an IAM role to the aws runner with the `iam-role-name` parameter, you will need to allow additional permissions:

   ```
   {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "ec2:ReplaceIamInstanceProfileAssociation",
          "ec2:AssociateIamInstanceProfile"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": "iam:PassRole",
        "Resource": "*"
      }
    ]
   }
   ```

   If you use the `aws-resource-tags` parameter, you will also need to allow the permissions to create tags:

   ```
   {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "ec2:CreateTags"
        ],
        "Resource": "*",
        "Condition": {
          "StringEquals": {
            "ec2:CreateAction": "RunInstances"
          }
        }
      }
    ]
   }
   ```

   these example policies above are provided as a guide. they can and most likely should be limited even more by specifying the resources you use.

2. add the keys to github secrets.
3. use the [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) action to set up the keys as environment variables.

**2. prepare github personal access token**

1. create a new github personal access token with the `repo` scope.
   the action will use the token for self-hosted runners management in the github account on the repository level.
2. add the token to github secrets.

**3. prepare aws image**

1. create a new aws instance based on any linux distribution you need.
2. connect to the instance using ssh, install `docker` and `git`, then enable `docker` service.

   for amazon linux 2, it looks like the following:

   ```
    sudo yum update -y && \
    sudo yum install docker -y && \
    sudo yum install git -y && \
    sudo systemctl enable docker
   ```

   for other linux distributions, it could be slightly different.

3. install any other tools required for your workflow.
4. create a new aws image (ami) from the instance.
5. remove the instance if not required anymore after the image is created.

**4. prepare vpc with subnet and security group**

1. create a new vpc and a new subnet in it.
   or use the existing vpc and subnet.
2. create a new security group for the runners in the vpc.
   only the outbound traffic on port 443 should be allowed for pulling jobs from github.
   no inbound traffic is required.

**5. configure the github workflow**

1. create a new github actions workflow or edit the existing one.
2. use the documentation and example below to configure your workflow.
3. please don't forget to set up a job for removing the aws instance at the end of the workflow execution.
   otherwise, the aws instance won't be removed and continue to run even after the workflow execution is finished.

now you're ready to go!

### inputs

| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;name&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | required                                   | description                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                                                                                                                                                                       | always required.                           | specify here which mode you want to use: <br> - `start` - to start a new runner; <br> - `stop` - to stop the previously created runner.                                                                                                                                                                                               |
| `github-token`                                                                                                                                                               | always required.                           | github personal access token with the `repo` scope assigned.                                                                                                                                                                                                                                                                          |
| `aws-image-id`                                                                                                                                                               | required if you use the `start` mode.      | aws image id (ami). <br><br> the new runner will be launched from this image. <br><br> the action is compatible with amazon linux 2 images.                                                                                                                                                                                           |
| `aws-instance-type`                                                                                                                                                          | required if you use the `start` mode.      | aws instance type.                                                                                                                                                                                                                                                                                                                    |
| `subnet-id`                                                                                                                                                                  | required if you use the `start` mode.      | vpc subnet id. <br><br> the subnet should belong to the same vpc as the specified security group.                                                                                                                                                                                                                                     |
| `security-group-id`                                                                                                                                                          | required if you use the `start` mode.      | aws security group id. <br><br> the security group should belong to the same vpc as the specified subnet. <br><br> only the outbound traffic for port 443 should be allowed. no inbound traffic is required.                                                                                                                          |
| `label`                                                                                                                                                                      | required if you use the `stop` mode.       | name of the unique label assigned to the runner. <br><br> the label is provided by the output of the action in the `start` mode. <br><br> the label is used to remove the runner from github when the runner is not needed anymore.                                                                                                   |
| `aws-instance-id`                                                                                                                                                            | required if you use the `stop` mode.       | aws instance id of the created runner. <br><br> the id is provided by the output of the action in the `start` mode. <br><br> the id is used to terminate the aws instance when the runner is not needed anymore.                                                                                                                      |
| `iam-role-name`                                                                                                                                                              | optional. used only with the `start` mode. | iam role name to attach to the created aws runner. <br><br> this allows the runner to have permissions to run additional actions within the aws account, without having to manage additional github secrets and aws users. <br><br> setting this requires additional aws permissions for the role launching the instance (see above). |
| `aws-resource-tags`                                                                                                                                                          | optional. used only with the `start` mode. | specifies tags to add to the aws instance and any attached storage. <br><br> this field is a stringified json array of tag objects, each containing a `key` and `value` field (see example below). <br><br> setting this requires additional aws permissions for the role launching the instance (see above).                         |

### environment variables

in addition to the inputs described above, the action also requires the following environment variables to access your aws account:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

we recommend using [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) action right before running the step for creating a self-hosted runner. this action perfectly does the job of setting the required environment variables.

### outputs

| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;name&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | description                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`                                                                                                                                                                      | name of the unique label assigned to the runner. <br><br> the label is used in two cases: <br> - to use as the input of `runs-on` property for the following jobs; <br> - to remove the runner from github when it is not needed anymore. |
| `aws-instance-id`                                                                                                                                                            | aws instance id of the created runner. <br><br> the id is used to terminate the aws instance when the runner is not needed anymore.                                                                                                       |

### example

the workflow showed in the picture above and declared in `do-the-job.yml` looks like this:

```yml
name: do-the-job
on: pull_request
jobs:
  start-runner:
    name: start self-hosted aws runner
    runs-on: ubuntu-latest
    outputs:
      runner-label: ${{ steps.start-aws-runner.outputs.runner-label }}
      aws-instance-id: ${{ steps.start-aws-runner.outputs.aws-instance-id }}
    steps:
      - name: start aws runner
        id: start-aws-runner
        uses: audacious-network/aws-github-runner@v1
        with:
          mode: start
          github-token: ${{ secrets.GH_PERSONAL_ACCESS_TOKEN }}
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
          aws-image-id: ami-123
          aws-instance-type: t3.nano
          subnet-id: subnet-123
          security-group-id: sg-123
          iam-role-name: my-role-name # optional, requires additional permissions
          aws-resource-tags: > # optional, requires additional permissions
            [
              {"Key": "Name", "Value": "aws-github-runner"},
              {"Key": "GitHubRepository", "Value": "${{ github.repository }}"}
            ]
  do-the-job:
    name: do the job on the runner
    needs: start-runner # required to start the main job when the runner is ready
    runs-on: ${{ needs.start-runner.outputs.runner-label }} # run the job on the newly created runner
    steps:
      - name: hello world
        run: echo 'hello world!'
  stop-runner:
    name: stop self-hosted aws runner
    needs:
      - start-runner # required to get output from the start-runner job
      - do-the-job # required to wait when the main job is done
    runs-on: ubuntu-latest
    if: ${{ always() }} # required to stop the runner even if the error happened in the previous jobs
    steps:
      - name: Stop aws runner
        uses: audacious-network/aws-github-runner@v1
        with:
          mode: stop
          github-token: ${{ secrets.GH_PERSONAL_ACCESS_TOKEN }}
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
          runner-label: ${{ needs.start-runner.outputs.runner-label }}
          aws-instance-id: ${{ needs.start-runner.outputs.aws-instance-id }}
```

## self-hosted runner security with public repositories

> github recommends that you do not use self-hosted runners with public repositories.
>
> forks of your public repository can potentially run dangerous code on your self-hosted runner machine by creating a pull request that executes the code in a workflow.

please find more details about this security note on [github documentation](https://docs.github.com/en/free-pro-team@latest/actions/hosting-your-own-runners/about-self-hosted-runners#self-hosted-runner-security-with-public-repositories).

## license summary

This code is made available under the [MIT license](LICENSE).
