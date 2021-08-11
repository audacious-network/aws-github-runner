const AWS = require('aws-sdk');
const core = require('@actions/core');
const config = require('./config');

async function startInstance(label, githubRegistrationToken) {
  AWS.config.update({ region: config.input.awsRegion });
  const ec2 = new AWS.EC2();

  const awsInstanceUserData = config.input.awsInstanceUserData || [
    '#cloud-config',
    'system_info:',
    '    default_user:',
    ...(config.input.awsInstanceUsername) && [
      `        name: ${config.input.awsInstanceUsername}`,
      `        gecos: ${config.input.awsInstanceUsername}`,
      `        primary_group: ${config.input.awsInstanceUsername}`,
    ],
    '        ssh_import_id: None',
    '        lock_passwd: true',
    ...(config.input.awsInstanceSshPublicKey) && [
      '        ssh_authorized_keys:',
      `            - ${config.input.awsInstanceSshPublicKey}`
    ],
    'users:',
    '    - default',
    'packages:',
    '    - docker',
    '    - git',
    'write_files:',
    '    -',
    '        path: /etc/environment',
    '        permissions: 0644',
    '        content: |',
    '            RUNNER_ALLOW_RUNASROOT=1',
    '            RUNNER_INSTALL_DIR=/opt/actions-runner',
    '            RUNNER_VERSION=2.280.1',
    '            DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
    'runcmd:',
    '    - systemctl enable --now docker',
    '    - mkdir -p ${RUNNER_INSTALL_DIR}',
    '    - case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
    '    - curl -O -L https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz',
    '    - tar xfz actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz -C ${RUNNER_INSTALL_DIR} --strip-components=1',
    `    - \${RUNNER_INSTALL_DIR}/config.sh --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels ${label}`,
    '    - ${RUNNER_INSTALL_DIR}/run.sh', // todo: https://docs.github.com/en/actions/hosting-your-own-runners/configuring-the-self-hosted-runner-application-as-a-service
    '',
  ].join('\n');

  if (!config.input.awsImageId && !!config.input.awsImageSearchPattern) {
    try {
      const result = await ec2.describeImages({
        Filters: [
          {
            Name: 'name',
            Values: [
              config.input.awsImageSearchPattern
            ]
          },
          {
            Name: 'state',
            Values: [
              'available'
            ]
          }
        ],
        ...(config.input.awsImageSearchOwners && config.input.awsImageSearchOwners.length) && { Owners: config.input.awsImageSearchOwners }
      }).promise();
      config.input.awsImageId = result.Images.sort((a, b) => ((a.CreationDate < b.CreationDate) ? -1 : ((a.CreationDate > b.CreationDate) ? 1 : 0))).slice(-1)[0].ImageId;
      core.info(`aws image ${config.input.awsImageId} found for search pattern: ${config.input.awsImageSearchPattern}`);
    } catch (error) {
      core.error('aws image search error');
      throw error;
    }
  }

  switch (config.input.awsInstanceLifecycle) {
    case 'spot':
      try {
        const requestSpotInstancesResult = await ec2.requestSpotInstances({
          InstanceCount: 1,
          LaunchSpecification: {
            ImageId: config.input.awsImageId,
            InstanceType: config.input.awsInstanceType,
            UserData: Buffer.from(awsInstanceUserData).toString('base64'),
            ...(!!config.input.awsSubnetId) && { SubnetId: config.input.awsSubnetId },
            ...(!!config.input.awsSecurityGroupId) && { SecurityGroupIds: [ config.input.awsSecurityGroupId ] },
            ...(!!config.input.awsIamRoleName) && { IamInstanceProfile: { Name: config.input.awsIamRoleName } },
          },
        }).promise();
        const awsSpotInstanceRequestId = requestSpotInstancesResult.SpotInstanceRequests[0].SpotInstanceRequestId;
        const awsSpotInstanceData = await ec2.waitFor('spotInstanceRequestFulfilled', { SpotInstanceRequestIds: [ awsSpotInstanceRequestId ] }).promise();
        const awsInstanceId = awsSpotInstanceData.SpotInstanceRequests[0].InstanceId;
        await ec2.waitFor('instanceStatusOk', { InstanceIds: [ awsInstanceId ] }).promise();
        core.info(`aws spot instance ${awsInstanceId} is started`);

        if (!!config.tagSpecifications && !!config.tagSpecifications.length) {
          try {
            await ec2.createTags({
              Resources: [ awsSpotInstanceRequestId, awsInstanceId ], 
              Tags: config.tagSpecifications[0].Tags
            }).promise();
            core.info(`aws spot instance: ${awsInstanceId} and spot instance request: ${awsSpotInstanceRequestId} are tagged`);
          } catch (error) {
            core.error(`aws spot instance and spot instance request tagging error: ${error.message}`);
          }
        }

        return awsInstanceId;
      } catch (error) {
        core.error('aws spot instance starting error');
        throw error;
      }
    default:
      try {
        const runInstancesResult = await ec2.runInstances({
          ImageId: config.input.awsImageId,
          InstanceType: config.input.awsInstanceType,
          MinCount: 1,
          MaxCount: 1,
          UserData: Buffer.from(awsInstanceUserData).toString('base64'),
          ...(!!config.input.awsSubnetId) && { SubnetId: config.input.awsSubnetId },
          ...(!!config.input.awsSecurityGroupId) && { SecurityGroupIds: [config.input.awsSecurityGroupId] },
          ...(!!config.input.awsIamRoleName) && { IamInstanceProfile: { Name: config.input.awsIamRoleName } },
          ...(!!config.tagSpecifications) && { TagSpecifications: config.tagSpecifications },
        }).promise();
        const awsInstanceId = runInstancesResult.Instances[0].InstanceId;
        core.info(`aws scheduled instance ${awsInstanceId} is started`);
        return awsInstanceId;
      } catch (error) {
        core.error('aws scheduled instance starting error');
        throw error;
      }
  }
}

async function terminateInstance() {
  AWS.config.update({ region: config.input.awsRegion });
  const ec2 = new AWS.EC2();

  const params = {
    InstanceIds: [config.input.awsInstanceId],
  };

  try {
    await ec2.terminateInstances(params).promise();
    core.info(`aws instance: ${config.input.awsInstanceId}, in region: ${config.input.awsRegion}, is terminated`);
    return;
  } catch (error) {
    core.error(`aws instance: ${config.input.awsInstanceId}, in region: ${config.input.awsRegion}, termination error`);
    throw error;
  }
}

async function awaitInstanceRunning(awsInstanceId) {
  AWS.config.update({ region: config.input.awsRegion });
  const ec2 = new AWS.EC2();

  const params = {
    InstanceIds: [awsInstanceId],
  };

  try {
    await ec2.waitFor('instanceRunning', params).promise();
    core.info(`aws instance: ${awsInstanceId}, in region: ${config.input.awsRegion}, is running`);
    return;
  } catch (error) {
    core.error(`aws instance: ${awsInstanceId}, in region: ${config.input.awsRegion}, initialization error`);
    throw error;
  }
}

module.exports = {
  startInstance,
  terminateInstance,
  awaitInstanceRunning,
};
