import { spawn } from "node:child_process";
import path from "node:path";

const suites = [
  { name: "Unit & Security Hardening", file: "test/test-security.js" },
  { name: "REST API Integration", file: "test/test-api.js" },
  { name: "Zero-Plaintext & Client Encryption", file: "test/test-zero-plaintext.js" },
  { name: "Developer SDK & Private Search", file: "test/test-sdk.js" },
  { name: "Live Sui On-Chain Verification", file: "test/test-onchain.js" },
  { name: "End-to-End Crypto-Shredding", file: "test-crypto-shredding.js" },
  { name: "Solana Identity & Anchor PDAs", file: "test/test-solana.js" }
];

async function runSuite(suite) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    console.log(`\n===============================================================`);
    console.log(`▶️ RUNNING SUITE: ${suite.name} (${suite.file})`);
    console.log(`===============================================================`);

    const child = spawn("node", [suite.file], {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, NODE_ENV: "test" }
    });

    child.on("close", (code) => {
      const durationMs = Date.now() - startTime;
      resolve({
        name: suite.name,
        file: suite.file,
        passed: code === 0,
        code,
        durationMs
      });
    });
  });
}

async function runAll() {
  console.log("===============================================================");
  console.log("🌊 NODUS SOVEREIGN CLOUD COMPREHENSIVE AUTOMATED TEST RUNNER");
  console.log("===============================================================");

  const results = [];
  const startTotal = Date.now();

  for (const suite of suites) {
    const res = await runSuite(suite);
    results.push(res);
  }

  const totalDuration = ((Date.now() - startTotal) / 1000).toFixed(2);
  console.log("\n===============================================================");
  console.log("📊 COMPREHENSIVE TEST SUITE SUMMARY");
  console.log("===============================================================");
  console.log(`Total Duration: ${totalDuration}s\n`);

  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? "✅ PASS" : "❌ FAIL";
    const duration = (r.durationMs / 1000).toFixed(2);
    console.log(`  ${icon} | ${r.name.padEnd(35)} | ${duration}s (exit code: ${r.code})`);
    if (!r.passed) allPassed = false;
  }

  console.log("===============================================================\n");
  if (!allPassed) {
    console.error("❌ ONE OR MORE TEST SUITES FAILED.");
    process.exit(1);
  } else {
    console.log("🎉 ALL TEST SUITES PASSED FLAWLESSLY!");
    process.exit(0);
  }
}

runAll();
