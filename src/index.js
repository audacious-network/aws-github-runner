const aws = require('./aws');
const gh = require('./gh');
const config = require('./config');
const core = require('@actions/core');

function setOutput(label, awsInstanceId) {
  core.setOutput('label', label);
  core.setOutput('aws-instance-id', awsInstanceId);
}

async function start() {
  const label = config.generateUniqueLabel();
  const githubRegistrationToken = await gh.getRegistrationToken();
  const awsInstanceId = await aws.startInstance(label, githubRegistrationToken);
  setOutput(label, awsInstanceId);
  await aws.awaitInstanceRunning(awsInstanceId);
  await gh.waitForRunnerRegistered(label);
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
