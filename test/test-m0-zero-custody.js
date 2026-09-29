import crypto from "node:crypto";
import http from "node:http";
import { NodusClient, NodusCrypto } from "../sdk/index.js";

process.env.NODE_ENV = "test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✅ PASS: ${message}`);
}

async function assertRejectedWithoutLeak(response, canary, label) {
  const body = await response.text();
  const headers = [...response.headers.entries()].map(([name, value]) => `${name}:${value}`).join("\n");
  assert(response.status === 400, `${label} is rejected with HTTP 400`);
  assert(!body.includes(canary) && !headers.includes(canary), `${label} is never echoed in an API response or header`);
}

async function close(server) {
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

async function run() {
  console.log("==================================================");
  console.log("🔐 NODUS — M0 ZERO-CUSTODY UPLOAD TEST SUITE");
  console.log("==================================================");

  const { default: app } = await import("../server/index.js");
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const gatewayUrl = `http://127.0.0.1:${server.address().port}`;
  const canary = `NODUS_RAW_KEY_CANARY_${crypto.randomUUID().replaceAll("-", "")}`;
  const capturedLogs = [];
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  const capture = (...args) => capturedLogs.push(args.map((entry) => String(entry)).join(" "));

  try {
    console.log = capture;
    console.warn = capture;
    console.error = capture;

    const rawHeader = await fetch(`${gatewayUrl}/api/status`, {
      headers: { "x-nodus-key": canary }
    });
    await assertRejectedWithoutLeak(rawHeader, canary, "A raw key HTTP header");

    const rawQuery = await fetch(`${gatewayUrl}/api/status?recoveryKey=${encodeURIComponent(canary)}`);
    await assertRejectedWithoutLeak(rawQuery, canary, "A raw recovery key query parameter");

    const resumableRawKey = await fetch(`${gatewayUrl}/api/assets/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalName: "m0.bin",
        originalType: "application/octet-stream",
        originalSize: 1024,
        encryptedSize: 1040,
        partSize: 1040,
        encryption: { mode: "chunked-aes-gcm-v1", iv: "0".repeat(24), nested: { keyHex: canary } }
      })
    });
    await assertRejectedWithoutLeak(resumableRawKey, canary, "A nested raw key in a resumable session");

    const directRawKey = await fetch(`${gatewayUrl}/api/assets/direct-uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalName: "m0.bin",
        originalType: "application/octet-stream",
        originalSize: 1024,
        segmentSize: 1024 * 1024,
        encryption: { mode: "chunked-aes-gcm-v2", iv: "1".repeat(24), nested: { recoveryPrivateKey: canary } }
      })
    });
    await assertRejectedWithoutLeak(directRawKey, canary, "A nested recovery key in a direct session");

    const formData = new FormData();
    formData.append("photo", new Blob([crypto.randomBytes(48)], { type: "application/octet-stream" }), "m0.enc");
    formData.append("iv", "2".repeat(24));
    formData.append("originalName", "m0.enc");
    formData.append("originalType", "application/octet-stream");
    formData.append("originalSize", "32");
    formData.append("key", canary);
    const multipartRawKey = await fetch(`${gatewayUrl}/api/assets/upload`, { method: "POST", body: formData });
    await assertRejectedWithoutLeak(multipartRawKey, canary, "A legacy multipart raw key field");
  } finally {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  }

  try {
    assert(!capturedLogs.join("\n").includes(canary), "Raw key canary is absent from server logs");

    const identity = await NodusCrypto.createEnvelopeIdentity();
    const passphrase = "m0 recovery passphrase with sufficient length";
    const recoveryKit = await NodusCrypto.createRecoveryKit(identity, passphrase);
    const assetId = crypto.randomUUID();
    const dataKey = crypto.randomBytes(32).toString("hex");
    const envelope = await NodusCrypto.wrapDataKey(dataKey, identity.recoveryPublicKey, {
      assetId,
      recipientAddress: "m0-owner",
      recipientType: "recovery",
      organizationId: "m0-org"
    });
    const persistedClientMaterial = JSON.stringify({ recoveryKit, envelope });
    assert(!persistedClientMaterial.includes(dataKey), "Recovery material contains only an encrypted recovery kit and key envelope");

    // Simulates reopening the application with no in-memory device identity.
    const reopenedRecoveryPrivateKey = await NodusCrypto.openRecoveryKit(recoveryKit, passphrase);
    const restoredKey = await NodusCrypto.unwrapDataKey(envelope, reopenedRecoveryPrivateKey, { assetId });
    assert(restoredKey === dataKey, "A reopened client recovers the file key from its encrypted recovery envelope");

    let aadRejected = false;
    try {
      await NodusCrypto.unwrapDataKey(envelope, reopenedRecoveryPrivateKey, { assetId: crypto.randomUUID() });
    } catch {
      aadRejected = true;
    }
    assert(aadRejected, "Envelope AAD rejects recovery under a different asset identifier");

    const cleanupClient = new NodusClient({ gatewayUrl });
    cleanupClient.organizationId = "m0-org";
    cleanupClient.userAddress = "m0-owner";
    cleanupClient.keyCache.set("unprotected-asset", dataKey);
    let discardedAsset = null;
    cleanupClient.delete = async (assetIdToDelete) => {
      discardedAsset = assetIdToDelete;
      return { success: true, deleted: true };
    };
    let protectionRejected = false;
    try {
      await cleanupClient._protectOrDiscardUploadedAsset("unprotected-asset", {});
    } catch {
      protectionRejected = true;
    }
    assert(protectionRejected, "Tenant uploads fail closed when no device envelope identity is available");
    assert(discardedAsset === "unprotected-asset" && !cleanupClient.keyCache.has("unprotected-asset"), "An unprotected tenant ciphertext is discarded and its local key cache entry is removed");
  } finally {
    await close(server);
  }

  console.log("==================================================");
  console.log("🎉 ALL M0 ZERO-CUSTODY TESTS PASSED");
  console.log("==================================================");
}

run().catch((error) => {
  console.error("❌ M0 zero-custody test failed:", error.message);
  process.exit(1);
});
