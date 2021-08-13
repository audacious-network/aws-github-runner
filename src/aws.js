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
    /*
    ...(!!config.input.awsImageSearchPattern && (config.input.awsImageSearchPattern.indexOf('ubuntu') > -1)) && [
      'apt:',
      '    sources:',
      '        docker.list:',
      '            source: deb [arch=amd64] https://download.docker.com/linux/ubuntu focal stable', // todo: check config.input.runnerArch and handle arm64
      '            keyid: 9DC858229FC7DD38854AE2D88D81803C0EBFCD88',
      'packages:',
      '    - containerd.io',
      '    - docker-ce',
      '    - docker-ce-cli',
      '    - git',
    ],
    ...(!config.input.awsImageSearchPattern || (config.input.awsImageSearchPattern.indexOf('ubuntu') < 0)) && [
      'packages:',
      '    - docker',
      '    - git',
    ],
    */
    'apt:',
    '    sources:',
    '        docker.list:',
    '            source: deb [arch=amd64] https://download.docker.com/linux/ubuntu focal stable', // todo: check config.input.runnerArch and handle arm64
    '            keyid: 9DC858229FC7DD38854AE2D88D81803C0EBFCD88',
    'packages:',
    '    - build-essential',
    '    - clang',
    '    - cmake',
    '    - containerd.io',
    '    - docker-ce',
    '    - docker-ce-cli',
    '    - git',
    'write_files:',
    '    -',
    '        path: /etc/environment',
    '        permissions: 0644',
    '        content: |',
    '            RUNNER_ALLOW_RUNASROOT=1',
    `            RUNNER_ARCH=${config.input.runnerArch}`,
    `            RUNNER_VERSION=${config.input.runnerVersion}`,
    '            DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
    'runcmd:',
    // install rust and wasm toolchains
    `    - sudo -H -u ${config.input.awsInstanceUsername} bash -c 'curl -s https://sh.rustup.rs -sSf | sh -s -- -y'`,
    `    - sudo -H -u ${config.input.awsInstanceUsername} bash -c 'source /home/${config.input.awsInstanceUsername}/.cargo/env'`,
    `    - sudo -H -u ${config.input.awsInstanceUsername} bash -c '/home/${config.input.awsInstanceUsername}/.cargo/bin/rustup toolchain install nightly'`,
    `    - sudo -H -u ${config.input.awsInstanceUsername} bash -c '/home/${config.input.awsInstanceUsername}/.cargo/bin/rustup toolchain install stable'`,
    `    - sudo -H -u ${config.input.awsInstanceUsername} bash -c '/home/${config.input.awsInstanceUsername}/.cargo/bin/rustup default stable'`,
    `    - sudo -H -u ${config.input.awsInstanceUsername} bash -c '/home/${config.input.awsInstanceUsername}/.cargo/bin/rustup target add wasm32-unknown-unknown --toolchain nightly'`,
    `    - sudo -H -u ${config.input.awsInstanceUsername} bash -c '/home/${config.input.awsInstanceUsername}/.cargo/bin/rustup update'`,
    `    - sudo -H -u ${config.input.awsInstanceUsername} bash -c '/home/${config.input.awsInstanceUsername}/.cargo/bin/cargo +nightly install --git https://github.com/alexcrichton/wasm-gc --force'`,
    // enable and start docker daemon
    `    - usermod -aG docker ${config.input.awsInstanceUsername}`,
    '    - systemctl unmask docker.service',
    '    - systemctl unmask docker.socket',
    '    - systemctl enable --now docker',
    '    - systemctl enable --now containerd',
    '    - systemctl status docker',
    '    - systemctl status containerd',
    // install github action runner and start daemon
    `    - mkdir -p ${config.input.runnerInstallDir}`,
    `    - curl -O -L https://github.com/actions/runner/releases/download/v${config.input.runnerVersion}/actions-runner-linux-${config.input.runnerArch}-${config.input.runnerVersion}.tar.gz`,
    `    - tar xfz actions-runner-linux-${config.input.runnerArch}-${config.input.runnerVersion}.tar.gz -C ${config.input.runnerInstallDir} --strip-components=1`,
    `    - chown -R ${config.input.awsInstanceUsername}:${config.input.awsInstanceUsername} ${config.input.runnerInstallDir}`,
    `    - chown -R ${config.input.awsInstanceUsername}:${config.input.awsInstanceUsername} /home/${config.input.awsInstanceUsername}`,
    `    - sudo -H -u ${config.input.awsInstanceUsername} bash -c 'cd ${config.input.runnerInstallDir} && export RUNNER_ALLOW_RUNASROOT=1 && ${config.input.runnerInstallDir}/config.sh --unattended --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels ${label}'`,
    `    - sudo -H -u ${config.input.awsInstanceUsername} bash -c 'cd ${config.input.runnerInstallDir} && sudo ${config.input.runnerInstallDir}/svc.sh install'`,
    `    - sudo -H -u ${config.input.awsInstanceUsername} bash -c 'cd ${config.input.runnerInstallDir} && sudo ${config.input.runnerInstallDir}/svc.sh start'`,
    `    - sudo -H -u ${config.input.awsInstanceUsername} bash -c 'cd ${config.input.runnerInstallDir} && sudo ${config.input.runnerInstallDir}/svc.sh status'`,
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
      const awsImage = result.Images.sort((a, b) => ((a.CreationDate < b.CreationDate) ? -1 : ((a.CreationDate > b.CreationDate) ? 1 : 0))).slice(-1)[0];
      config.input.awsImageId = awsImage.ImageId;
      config.input.awsInstanceRootVolumeName = awsImage.BlockDeviceMappings[0].DeviceName;
      core.info(`aws image: ${config.input.awsImageId}, with root volume name: ${config.input.awsInstanceRootVolumeName}, found for search pattern: ${config.input.awsImageSearchPattern}`);

    } catch (error) {
      core.error('aws image search error');
      throw error;
    }
  } else if (config.input.awsImageId) {
    try {
      const result = await ec2.describeImages({ ImageId: config.input.awsImageId }).promise();
      const awsImage = result.Images[0];
      config.input.awsInstanceRootVolumeName = awsImage.BlockDeviceMappings[0].DeviceName;
      core.info(`aws image: ${config.input.awsImageId}, with root volume name: ${config.input.awsInstanceRootVolumeName}, found`);
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
            ...(config.input.awsInstanceRootVolumeSize !== 8) && { BlockDeviceMappings: [
                {
                  DeviceName: config.input.awsInstanceRootVolumeName,
                  Ebs: {
                    DeleteOnTermination: true,
                    VolumeSize: config.input.awsInstanceRootVolumeSize,
                    VolumeType: 'gp2'
                  }
                }
              ]
            },
          },
        }).promise();
        const awsSpotInstanceRequestId = requestSpotInstancesResult.SpotInstanceRequests[0].SpotInstanceRequestId;
        const awsSpotInstanceData = await ec2.waitFor('spotInstanceRequestFulfilled', { SpotInstanceRequestIds: [ awsSpotInstanceRequestId ] }).promise();
        const awsInstanceId = awsSpotInstanceData.SpotInstanceRequests[0].InstanceId;
        await ec2.waitFor('instanceStatusOk', { InstanceIds: [ awsInstanceId ] }).promise();
        core.info(`aws spot instance ${awsInstanceId} is started with a ${config.input.awsInstanceRootVolumeSize}gb root volume in region ${config.input.awsRegion}`);

        if (!!config.tagSpecifications && !!config.tagSpecifications.length) {
          try {
            await ec2.createTags({
              Resources: [ awsSpotInstanceRequestId, awsInstanceId ], 
              Tags: config.tagSpecifications[0].Tags
            }).promise();
            core.info(`aws spot instance: ${awsInstanceId} in region: ${config.input.awsRegion} and spot instance request: ${awsSpotInstanceRequestId} are tagged`);
          } catch (error) {
            core.error(`aws spot instance and spot instance request tagging error: ${error.message}`);
          }
        }

        return { awsRegion: config.input.awsRegion, awsInstanceId: awsInstanceId };
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
          ...(config.input.awsInstanceRootVolumeSize !== 8) && { BlockDeviceMappings: [
              {
                DeviceName: config.input.awsInstanceRootVolumeName,
                Ebs: {
                  DeleteOnTermination: true,
                  VolumeSize: config.input.awsInstanceRootVolumeSize,
                  VolumeType: 'gp2'
                }
              }
            ]
          },
        }).promise();
        const awsInstanceId = runInstancesResult.Instances[0].InstanceId;
        core.info(`aws scheduled instance: ${awsInstanceId} is started with a ${config.input.awsInstanceRootVolumeSize}gb root volume in region: ${config.input.awsRegion}`);
        return { awsRegion: config.input.awsRegion, awsInstanceId: awsInstanceId };
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
    core.error(`aws instance: ${awsInstanceId}, in region: ${config.input.awsRegion}, initialisation error`);
    throw error;
  }
}

module.exports = {
  startInstance,
  terminateInstance,
  awaitInstanceRunning,
};
