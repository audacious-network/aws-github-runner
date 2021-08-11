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
      awsInstanceLifecycle: core.getInput('aws-instance-lifecycle') || 'scheduled',
      awsSubnetId: core.getInput('aws-subnet-id'),
      awsSecurityGroupId: core.getInput('aws-security-group-id'),
      awsInstanceId: core.getInput('aws-instance-id'),
      awsIamRoleName: core.getInput('aws-iam-role-name'),
      awsInstanceUserData: core.getInput('aws-instance-user-data'),
      awsInstanceUsername: core.getInput('aws-instance-username'),
      awsInstanceSshPublicKey: core.getInput('aws-instance-ssh-public-key'),
      runnerInstallDir: core.getInput('runner-install-dir') || '/opt/actions-runner',
      runnerArch: core.getInput('runner-arch') || 'x64',
      runnerVersion: core.getInput('runner-version') || '2.280.1',
      runnerLabel: core.getInput('runner-label'),
    };

    const tags = JSON.parse(core.getInput('aws-resource-tags'));
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
      if (!this.input.label || !this.input.awsInstanceId) {
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
