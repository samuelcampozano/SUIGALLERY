import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ResumableUploadManager } from "../server/resumable-upload.js";

const MiB = 1024 * 1024;
const rootDir = path.resolve("./temp_storage/resumable-upload-test");

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✅ PASS: ${message}`);
}

function checksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function run() {
  console.log("==================================================");
  console.log("📦 NODUS — RESUMABLE UPLOAD SESSION TEST SUITE");
  console.log("==================================================");
  fs.rmSync(rootDir, { recursive: true, force: true });

  try {
    const manager = new ResumableUploadManager({ rootDir });
    const plainSize = 2 * MiB;
    const partSize = MiB + 16;
    const session = manager.create({
      originalName: "large-encrypted-video.mp4",
      originalType: "video/mp4",
      originalSize: plainSize,
      encryptedSize: plainSize + 32,
      partSize,
      description: "Synthetic encrypted upload",
      tags: ["video", "resumable"],
      encryption: {
        mode: "chunked-aes-gcm-v1",
        iv: "b".repeat(24),
        chunkSize: MiB,
        chunkCount: 2
      }
    });

    assert(session.partCount === 2, "Creates a two-part encrypted upload session");
    assert(session.missingParts.length === 2, "Reports both parts as missing initially");

    const first = crypto.randomBytes(partSize);
    const firstResult = manager.writePart(session.uploadId, 0, first, checksum(first));
    assert(firstResult.accepted && !firstResult.duplicate, "Stores first ciphertext part with checksum verification");

    const retry = manager.writePart(session.uploadId, 0, first, checksum(first));
    assert(retry.accepted && retry.duplicate, "Makes identical part retries idempotent");

    let badChecksumRejected = false;
    try { manager.writePart(session.uploadId, 1, crypto.randomBytes(partSize), "0".repeat(64)); } catch { badChecksumRejected = true; }
    assert(badChecksumRejected, "Rejects a part whose declared checksum does not match");

    const statusAfterOne = manager.get(session.uploadId);
    assert(statusAfterOne.receivedParts.length === 1 && statusAfterOne.missingParts[0] === 1, "Exposes missing parts for resume");

    const second = crypto.randomBytes(partSize);
    manager.writePart(session.uploadId, 1, second, checksum(second));
    const assembled = await manager.assemble(session.uploadId);
    const expected = Buffer.concat([first, second]);
    assert(assembled.byteLength === expected.length, "Assembles parts without changing total ciphertext size");
    assert(fs.readFileSync(assembled.assembledPath).equals(expected), "Assembled ciphertext preserves part ordering bit-for-bit");

    const completed = manager.markCompleted(session.uploadId, { id: "asset_123", blob_id: "blob_123" }, assembled.ciphertextSha256);
    assert(completed.status === "completed" && completed.completedAsset.id === "asset_123", "Persists final asset result for completed upload");

    const aborted = manager.create({
      originalName: "abort.bin",
      originalType: "application/octet-stream",
      originalSize: MiB,
      encryptedSize: MiB + 16,
      partSize: MiB + 16,
      encryption: { iv: "d".repeat(24) }
    });
    manager.abort(aborted.uploadId);
    let absent = false;
    try { manager.get(aborted.uploadId); } catch { absent = true; }
    assert(absent, "Explicit abort permanently removes staged session data");

    let rawKeyRejected = false;
    try {
      manager.create({
        originalName: "key-leak.bin", originalType: "application/octet-stream",
        originalSize: MiB, encryptedSize: MiB + 16, partSize: MiB + 16,
        encryption: { iv: "e".repeat(24), key: "f".repeat(64) }
      });
    } catch (error) { rawKeyRejected = /Raw data keys/.test(error.message); }
    assert(rawKeyRejected, "Rejects a resumable session that tries to persist a raw data key");
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
  console.log("==================================================");
  console.log("🎉 ALL RESUMABLE UPLOAD TESTS PASSED");
  console.log("==================================================");
}

run().catch((error) => {
  console.error("❌ Resumable upload test failed:", error.message);
  process.exit(1);
});
