import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { allowsSandboxStorage, deploymentEnvironment, isProductionDeployment } from "../server/deployment-environment.js";

function run() {
  assert.equal(deploymentEnvironment({ NODE_ENV: "test" }), "test");
  assert.equal(deploymentEnvironment({ NODE_ENV: "production" }), "production");
  assert.equal(deploymentEnvironment({ NODE_ENV: "production", NODUS_DEPLOYMENT_ENV: "sandbox" }), "sandbox");
  assert.equal(isProductionDeployment({ NODUS_DEPLOYMENT_ENV: "production" }), true);
  assert.equal(allowsSandboxStorage({ NODUS_DEPLOYMENT_ENV: "production" }), false);
  assert.equal(allowsSandboxStorage({ NODUS_DEPLOYMENT_ENV: "sandbox" }), true);
  assert.throws(() => deploymentEnvironment({ NODUS_DEPLOYMENT_ENV: "preview" }), /must be sandbox, production, or test/);

  const productionRuntime = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { directWalrusAdapter } from './server/walrus-direct-adapter.js';
    import { walrus } from './server/walrus-client.js';
    if (directWalrusAdapter.enabled || walrus.isMockMode()) process.exit(1);
  `], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", NODUS_DEPLOYMENT_ENV: "production", WALRUS_DIRECT_TESTNET_ENABLED: "true", WALRUS_MOCK: "true" }
  });
  assert.equal(productionRuntime.status, 0, productionRuntime.stderr.toString());
  console.log("✅ Deployment environment isolation checks passed");
}

run();
