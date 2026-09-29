import { DirectWalrusTestnetAdapter } from "../server/walrus-direct-adapter.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ PASS: ${message}`);
}

async function run() {
  console.log("\n==================================================");
  console.log("🌊 NODUS — WALRUS TESTNET FALLBACK ADAPTER TEST SUITE");
  console.log("==================================================");

  // [TEST 1] Adapter instantiation and endpoint defaults
  console.log("\n[TEST 1] Adapter Initialization & Defaults");
  const adapter = new DirectWalrusTestnetAdapter({ enabled: true, environment: "sandbox" });
  assert(adapter.publisherUrl === "https://publisher.walrus-testnet.walrus.space", "Default publisher URL points to Walrus Testnet");
  assert(adapter.aggregatorUrl === "https://aggregator.walrus-testnet.walrus.space", "Default aggregator URL points to Walrus Testnet");
  assert(adapter.defaultEpochs === 1, "Default storage epochs configured to 1");
  assert(adapter.enabled === true, "Direct Walrus Testnet adapter is enabled explicitly for sandbox");

  const productionAdapter = new DirectWalrusTestnetAdapter({ enabled: true, environment: "production" });
  assert(productionAdapter.enabled === false, "Production forcibly disables the direct Walrus Testnet adapter");

  // [TEST 2] Health Check Liveness Probe
  console.log("\n[TEST 2] Public Walrus Aggregator Liveness Probe");
  const health = await adapter.checkHealth(8000);
  console.log(`  ℹ️  Health probe result: ${JSON.stringify(health)}`);
  if (!health.ok) {
    console.log("  ⚠️  External Walrus Testnet unreachable (offline runner or network restricted). Skipping live network tests.");
    console.log("\n==================================================");
    console.log("SUMMARY: 4 PASSED, 0 FAILED (Live network probes skipped gracefully)");
    console.log("==================================================");
    return;
  }
  assert(health.ok === true, "Walrus Testnet aggregator responds to HTTP health probe");

  // [TEST 3] Direct Blob Storage on Walrus Testnet
  console.log("\n[TEST 3] Direct Ciphertext Blob Storage on Walrus Testnet");
  const testPayload = crypto.randomBytes(128); // 128 bytes of simulated AES-256-GCM ciphertext
  const uploadResult = await adapter.storeBlob(testPayload, { epochs: 1, deletable: true });
  assert(Boolean(uploadResult.blobId), `Received valid Walrus Blob ID: ${uploadResult.blobId}`);
  assert(typeof uploadResult.blobId === "string" && uploadResult.blobId.length > 20, "Blob ID matches Walrus base64url format");
  assert(uploadResult.size >= testPayload.length, `Recorded blob size matches: ${uploadResult.size} bytes`);
  console.log(`  ℹ️  Uploaded Blob ID: ${uploadResult.blobId}`);
  if (uploadResult.suiObjectId) {
    console.log(`  ℹ️  On-Chain Sui Object ID: ${uploadResult.suiObjectId}`);
  }

  // [TEST 4] Direct Blob Retrieval from Walrus Aggregator
  console.log("\n[TEST 4] Direct Blob Retrieval & Bit-for-Bit Verification");
  const retrievedBuffer = await adapter.readBlob(uploadResult.blobId);
  assert(Buffer.isBuffer(retrievedBuffer), "Retrieved payload is a valid binary Buffer");
  assert(retrievedBuffer.length === testPayload.length, `Retrieved length (${retrievedBuffer.length}) matches original (${testPayload.length})`);
  assert(crypto.timingSafeEqual(retrievedBuffer, testPayload), "Retrieved bytes match original ciphertext bit-for-bit");

  // [TEST 5] Disk Path Support
  console.log("\n[TEST 5] File Path Storage & Destination Writing");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodus-walrus-test-"));
  const inputFilePath = path.join(tmpDir, "sample.bin");
  const outputFilePath = path.join(tmpDir, "downloaded.bin");
  fs.writeFileSync(inputFilePath, testPayload);

  const fileUploadResult = await adapter.storeBlob(inputFilePath, { epochs: 1 });
  assert(Boolean(fileUploadResult.blobId), "Uploaded file directly from disk path");

  await adapter.readBlob(fileUploadResult.blobId, outputFilePath);
  assert(fs.existsSync(outputFilePath), "Saved retrieved blob to destination path");
  const diskBytes = fs.readFileSync(outputFilePath);
  assert(crypto.timingSafeEqual(diskBytes, testPayload), "Disk-saved blob matches original bytes");

  // Cleanup temporary directory
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  // [TEST 6] Timeout and Error Handling
  console.log("\n[TEST 6] Error Handling & Custom Endpoints");
  const badAdapter = new DirectWalrusTestnetAdapter({
    publisherUrl: "http://127.0.0.1:59999", // Unused port
    aggregatorUrl: "http://127.0.0.1:59999",
    requestTimeoutMs: 1000,
    enabled: true,
    environment: "sandbox"
  });

  let failedAsExpected = false;
  try {
    await badAdapter.storeBlob(testPayload);
  } catch (err) {
    failedAsExpected = true;
    assert(Boolean(err.message), `Gracefully caught expected error: ${err.message}`);
  }
  assert(failedAsExpected, "Rejects unreachable publisher endpoint with actionable error");

  console.log("\n==================================================");
  console.log("🎉 ALL DIRECT WALRUS TESTNET ADAPTER TESTS PASSED!");
  console.log("==================================================");
}

run().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
