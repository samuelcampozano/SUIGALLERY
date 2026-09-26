import crypto from "node:crypto";
import http from "node:http";

// Keep this suite deterministic and independent from a locally configured Walrus MCP.
process.env.NODE_ENV = "test";

const MiB = 1024 * 1024;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✅ PASS: ${message}`);
}

async function json(response) {
  const body = await response.json();
  return { response, body };
}

async function run() {
  console.log("==================================================");
  console.log("🌐 NODUS — RESUMABLE UPLOAD API TEST SUITE");
  console.log("==================================================");

  const { default: app } = await import("../server/index.js");
  const { walrus } = await import("../server/walrus-client.js");
  const testServer = http.createServer(app);
  let assetId = null;
  let uploadId = null;
  let abortUploadId = null;

  await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  const { port } = testServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const plainSize = 2 * MiB;
    const partSize = MiB + 16;
    // The first bytes deliberately avoid known plaintext signatures checked by the API.
    const firstPart = Buffer.concat([Buffer.from([0x01, 0x02, 0x03, 0x04]), crypto.randomBytes(partSize - 4)]);
    const secondPart = crypto.randomBytes(partSize);
    const encryption = {
      mode: "chunked-aes-gcm-v1",
      iv: crypto.randomBytes(12).toString("hex"),
      chunkSize: MiB,
      chunkCount: 2
    };

    const create = await json(await fetch(`${baseUrl}/api/assets/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalName: "resumable-test.bin",
        originalType: "application/octet-stream",
        originalSize: plainSize,
        encryptedSize: firstPart.length + secondPart.length,
        partSize,
        description: "Automated resumable upload test",
        tags: ["test", "resumable"],
        encryption
      })
    }));
    assert(create.response.status === 201 && create.body.success, "Creates a resumable encrypted upload session");
    assert(create.body.upload.partCount === 2 && create.body.upload.missingParts.length === 2, "Returns resumable state with both parts missing");
    assert(!JSON.stringify(create.body).includes("key"), "Session response contains no raw encryption key");
    uploadId = create.body.upload.uploadId;

    // Completion is deliberately rejected here; suppress only the server's expected error log
    // so a successful negative-path assertion does not look like a failed test run.
    const originalConsoleError = console.error;
    console.error = () => {};
    let incomplete;
    try {
      incomplete = await json(await fetch(`${baseUrl}/api/assets/uploads/${uploadId}/complete`, { method: "POST" }));
    } finally {
      console.error = originalConsoleError;
    }
    assert(incomplete.response.status === 400 && /part\(s\) missing/.test(incomplete.body.error), "Rejects completion while parts are still missing");

    const invalidPart = await json(await fetch(`${baseUrl}/api/assets/uploads/${uploadId}/parts/0`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "x-part-sha256": "0".repeat(64) },
      body: firstPart
    }));
    assert(invalidPart.response.status === 400 && /checksum mismatch/.test(invalidPart.body.error), "Rejects an individual part with an invalid checksum");

    const firstUpload = await json(await fetch(`${baseUrl}/api/assets/uploads/${uploadId}/parts/0`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "x-part-sha256": sha256(firstPart) },
      body: firstPart
    }));
    assert(firstUpload.response.status === 201 && !firstUpload.body.duplicate, "Accepts the first checksum-verified ciphertext part");

    const retry = await json(await fetch(`${baseUrl}/api/assets/uploads/${uploadId}/parts/0`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "x-part-sha256": sha256(firstPart) },
      body: firstPart
    }));
    assert(retry.response.status === 200 && retry.body.duplicate, "Makes an identical retried part idempotent");

    const status = await json(await fetch(`${baseUrl}/api/assets/uploads/${uploadId}`));
    assert(status.body.upload.receivedParts.join(",") === "0" && status.body.upload.missingParts.join(",") === "1", "Reports received and missing parts for client-side resume");

    const secondUpload = await json(await fetch(`${baseUrl}/api/assets/uploads/${uploadId}/parts/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "x-part-sha256": sha256(secondPart) },
      body: secondPart
    }));
    assert(secondUpload.response.status === 201, "Accepts the final ciphertext part");

    const complete = await json(await fetch(`${baseUrl}/api/assets/uploads/${uploadId}/complete`, { method: "POST" }));
    assert(complete.response.status === 200 && complete.body.upload.status === "completed", "Assembles and finalizes the upload only after all parts arrive");
    assetId = complete.body.asset.id;
    assert(Boolean(assetId) && complete.body.upload.completedAsset.id === assetId, "Persists the resulting Walrus asset in session status");

    const completedStatus = await json(await fetch(`${baseUrl}/api/assets/uploads/${uploadId}`));
    assert(completedStatus.body.upload.missingParts.length === 0 && completedStatus.body.upload.ciphertextSha256, "Completed sessions retain final checksum and no missing parts");

    const list = await json(await fetch(`${baseUrl}/api/assets`));
    const asset = list.body.assets.find((item) => item.id === assetId);
    assert(asset?.encryption_mode === "chunked-aes-gcm-v1" && asset.chunk_count === 2, "Lists chunk encryption metadata required for download and decryption");

    const streamed = await fetch(`${baseUrl}/api/assets/${assetId}/stream`);
    const streamedBytes = Buffer.from(await streamed.arrayBuffer());
    assert(streamed.status === 200 && streamed.headers.get("x-nodus-encryption-mode") === "chunked-aes-gcm-v1", "Streams ciphertext with chunk-encryption headers");
    assert(streamedBytes.equals(Buffer.concat([firstPart, secondPart])), "Streams exactly the ciphertext assembled from uploaded parts");

    const abort = await json(await fetch(`${baseUrl}/api/assets/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalName: "cancelled.bin",
        originalType: "application/octet-stream",
        originalSize: MiB,
        encryptedSize: MiB + 16,
        partSize: MiB + 16,
        encryption
      })
    }));
    abortUploadId = abort.body.upload.uploadId;
    const aborted = await json(await fetch(`${baseUrl}/api/assets/uploads/${abortUploadId}`, { method: "DELETE" }));
    assert(aborted.response.status === 200 && aborted.body.aborted, "Cancels an unfinished upload session");
    const absent = await fetch(`${baseUrl}/api/assets/uploads/${abortUploadId}`);
    assert(absent.status === 404, "Does not expose an aborted upload for resume");
    abortUploadId = null;
  } finally {
    if (assetId) await walrus.deletePhoto(assetId).catch(() => {});
    if (uploadId) await fetch(`${baseUrl}/api/assets/uploads/${uploadId}`, { method: "DELETE" }).catch(() => {});
    if (abortUploadId) await fetch(`${baseUrl}/api/assets/uploads/${abortUploadId}`, { method: "DELETE" }).catch(() => {});
    if (typeof testServer.closeAllConnections === "function") testServer.closeAllConnections();
    await new Promise((resolve) => testServer.close(resolve));
    await walrus.disconnect();
  }

  console.log("==================================================");
  console.log("🎉 ALL RESUMABLE UPLOAD API TESTS PASSED");
  console.log("==================================================");
}

run().catch((error) => {
  console.error("❌ Resumable upload API test failed:", error.message);
  process.exit(1);
});
