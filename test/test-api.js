process.env.NODE_ENV = "test";
import http from "node:http";
import app from "../server/index.js";

async function runApiTests() {
  console.log("==================================================");
  console.log("🔌 SUIGALLERY — REST API INTEGRATION TEST SUITE");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Start ephemeral test server on an open port
  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, resolve));
  const port = testServer.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`🚀 Ephemeral test server listening on ${baseUrl}\n`);

  try {
    // ----------------------------------------------------
    // TEST 1: Security Headers (Helmet)
    // ----------------------------------------------------
    console.log("[TEST 1] Security Headers & Defense");
    const headerRes = await fetch(`${baseUrl}/api/status`);
    const csp = headerRes.headers.get("content-security-policy");
    const nosniff = headerRes.headers.get("x-content-type-options");
    const frameOptions = headerRes.headers.get("x-frame-options");

    assert(csp !== null && csp.includes("default-src"), "Enforces strict Content-Security-Policy header");
    assert(nosniff === "nosniff", "Enforces X-Content-Type-Options: nosniff header");
    assert(frameOptions === "DENY" || frameOptions === "SAMEORIGIN", "Enforces X-Frame-Options clickjacking protection");

    // ----------------------------------------------------
    // TEST 2: GET /api/status
    // ----------------------------------------------------
    console.log("\n[TEST 2] GET /api/status");
    const statusRes = await fetch(`${baseUrl}/api/status`);
    const statusData = await statusRes.json();

    assert(statusRes.status === 200, "Status endpoint returns HTTP 200");
    assert(statusData.success === true, "Status returns success: true");
    assert(statusData.space && statusData.space.id, "Status contains space allocation metadata");
    assert(statusData.bucket && statusData.bucket.seal_policy_id, "Status exposes on-chain seal_policy_id");

    // ----------------------------------------------------
    // TEST 3: GET /api/photos
    // ----------------------------------------------------
    console.log("\n[TEST 3] GET /api/photos");
    const photosRes = await fetch(`${baseUrl}/api/photos`);
    const photosData = await photosRes.json();

    assert(photosRes.status === 200, "Photos endpoint returns HTTP 200");
    assert(photosData.success === true, "Photos returns success: true");
    assert(Array.isArray(photosData.photos), "Returns array of anchored photos");

    // ----------------------------------------------------
    // TEST 4: POST /api/wallet/generate
    // ----------------------------------------------------
    console.log("\n[TEST 4] POST /api/wallet/generate");
    const walletRes = await fetch(`${baseUrl}/api/wallet/generate`, { method: "POST" });
    const walletData = await walletRes.json();

    assert(walletRes.status === 200, "Wallet endpoint returns HTTP 200");
    assert(walletData.success === true, "Wallet generation returns success: true");
    assert(
      walletData.wallet && walletData.wallet.address.startsWith("0x") && walletData.wallet.address.length === 66,
      `Generates valid 66-character Ed25519 Sui address (${walletData?.wallet?.address?.slice(0, 10)}...)`
    );

    // ----------------------------------------------------
    // TEST 5: Upload Validation (Missing Payload)
    // ----------------------------------------------------
    console.log("\n[TEST 5] POST /api/photos/upload (Validation)");
    const emptyUploadRes = await fetch(`${baseUrl}/api/photos/upload`, { method: "POST" });
    const emptyUploadData = await emptyUploadRes.json();

    assert(emptyUploadRes.status === 400, "Rejects empty upload with HTTP 400 Bad Request");
    assert(emptyUploadData.success === false, "Returns success: false on missing file");

    // ----------------------------------------------------
    // TEST 6: Path Traversal Parameter Guards
    // ----------------------------------------------------
    console.log("\n[TEST 6] Path Traversal Route Guards");
    const badStreamRes = await fetch(`${baseUrl}/api/photos/..%2F..%2Fetc%2Fpasswd/stream`);
    assert(badStreamRes.status === 400 || badStreamRes.status === 404, "Rejects path traversal on stream route");

    const badDeleteRes = await fetch(`${baseUrl}/api/photos/..%2F..%2FWindows%2FSystem32`, { method: "DELETE" });
    assert(badDeleteRes.status === 400 || badDeleteRes.status === 404, "Rejects path traversal on delete route");

    const badPatchRes = await fetch(`${baseUrl}/api/photos/..%2F..%2Fhack`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "hacked" })
    });
    assert(badPatchRes.status === 400 || badPatchRes.status === 404, "Rejects encoded path traversal on patch route");

    // ----------------------------------------------------
    // TEST 7: Batch Delete Input Validation
    // ----------------------------------------------------
    console.log("\n[TEST 7] POST /api/photos/batch-delete (Validation)");
    const badBatchRes = await fetch(`${baseUrl}/api/photos/batch-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileIds: [] })
    });
    assert(badBatchRes.status === 400, "Rejects empty fileIds array in batch delete with HTTP 400");
  } finally {
    testServer.close();
  }

  console.log("\n==================================================");
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runApiTests();
