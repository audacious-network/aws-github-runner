const core = require('@actions/core');
const github = require('@actions/github');

class Config {
  constructor() {
    this.input = {
      mode: core.getInput('mode'),
      githubToken: core.getInput('github-token'),
      awsRegion: core.getInput('aws-region'),
      awsImageId: core.getInput('aws-image-id'),
      awsImageSearchPattern: core.getInput('aws-image-search-pattern'),
      awsImageSearchOwners: JSON.parse(core.getInput('aws-image-search-owners')),
      awsInstanceType: core.getInput('aws-instance-type'),
      awsInstanceLifecycle: core.getInput('aws-instance-lifecycle'),
      awsInstanceRootVolumeType: core.getInput('aws-instance-root-volume-type'),
      awsInstanceRootVolumeName: core.getInput('aws-instance-root-volume-name'),
      awsInstanceRootVolumeSize: parseInt(core.getInput('aws-instance-root-volume-size')),
      awsSubnetId: core.getInput('aws-subnet-id'),
      awsSecurityGroupId: core.getInput('aws-security-group-id'),
      awsInstanceId: core.getInput('aws-instance-id'),
      awsIamRoleName: core.getInput('aws-iam-role-name'),
      awsInstanceUserData: core.getInput('aws-instance-user-data'),
      awsInstancePackages: JSON.parse(core.getInput('aws-instance-packages')),
      awsInstanceUsername: core.getInput('aws-instance-username'),
      awsInstanceSshPublicKey: core.getInput('aws-instance-ssh-public-key'),
      runnerInstallDir: core.getInput('runner-install-dir'),
      runnerArch: core.getInput('runner-arch'),
      runnerVersion: core.getInput('runner-version'),
      runnerLabel: core.getInput('runner-label'),
      nodeVersion: core.getInput('node-version'),
      nvmVersion: core.getInput('nvm-version'),
    };

    const awsAccessKeyId = core.getInput('aws-access-key-id');
    core.setSecret(awsAccessKeyId);
    core.exportVariable('AWS_ACCESS_KEY_ID', awsAccessKeyId);

    const awsSecretAccessKey = core.getInput('aws-secret-access-key');
    core.setSecret(awsSecretAccessKey);
    core.exportVariable('AWS_SECRET_ACCESS_KEY', awsSecretAccessKey);

    const tags = JSON.parse(core.getInput('aws-resource-tags') || `[
      {
        "Key": "Name",
        "Value": "github-action-runner"
      },
      {
        "Key": "github-org",
        "Value": "${github.context.repo.owner}"
      },
      {
        "Key": "github-repo",
        "Value": "${github.context.repo.repo}"
      }
    ]`);
    this.tagSpecifications = null;
    if (tags.length > 0) {
      this.tagSpecifications = [
        {
          ResourceType: 'instance',
          Tags: tags
        },
        {
          ResourceType: 'volume',
          Tags: tags
        }
      ];
    }

    // the values of github.context.repo.owner and github.context.repo.repo are taken from
    // the environment variable GITHUB_REPOSITORY specified in "owner/repo" format and
    // provided by the GitHub Action on the runtime
    this.githubContext = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
    };

    if (!this.input.mode) {
      throw new Error(`'mode' input is not specified`);
    }

    if (!this.input.githubToken) {
      throw new Error(`'github-token' input is not specified`);
    }

    if (!this.input.awsRegion) {
      throw new Error(`'aws-region' input is not specified`);
    }

    if (this.input.mode === 'start') {
      if ((!this.input.awsImageId && !this.input.awsImageSearchPattern) || !this.input.awsInstanceType) {
        throw new Error(`not all the required inputs are provided for the 'start' mode`);
      }
    } else if (this.input.mode === 'stop') {
      if (!this.input.runnerLabel || !this.input.awsInstanceId) {
        throw new Error(`not all the required inputs are provided for the 'stop' mode`);
      }
    } else {
      throw new Error('unknown mode. Defined values: start, stop.');
    }
  }

  generateUniqueLabel() {
    return Math.random().toString(36).substr(2, 5);
  }
}

try {
  module.exports = new Config();
} catch (error) {
  core.error(error);
  core.setFailed(error.message);
}
