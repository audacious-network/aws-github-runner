const aws = require('./aws');
const gh = require('./gh');
const config = require('./config');
const core = require('@actions/core');

function setOutput(runnerLabel, awsRegion, awsInstanceId) {
  core.setOutput('runner-label', runnerLabel);
  core.setOutput('aws-region', awsRegion);
  core.setOutput('aws-instance-id', awsInstanceId);
}

async function start() {
  const runnerLabel = config.generateUniqueLabel();
  const githubRegistrationToken = await gh.getRegistrationToken();
  const startInstance = await aws.startInstance(runnerLabel, githubRegistrationToken);
  setOutput(runnerLabel, startInstance.awsRegion, startInstance.awsInstanceId);
  await aws.awaitInstanceRunning(startInstance.awsRegion, startInstance.awsInstanceId);
  await gh.waitForRunnerRegistered(runnerLabel);
}

async function stop() {
  await aws.terminateInstance();
  await gh.removeRunner();
}

(async function () {
  try {
    config.input.mode === 'start' ? await start() : await stop();
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
})();
