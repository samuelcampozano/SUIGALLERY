import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ResumableUploadManager } from "../server/resumable-upload.js";
import { DirectUploadManager } from "../server/direct-upload-manager.js";

const MiB = 1024 * 1024;
const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodus-tenant-context-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✅ PASS: ${message}`);
}

function rejects(callback) {
  try { callback(); return false; } catch (error) { return error.message === "Upload session does not belong to the active organization"; }
}

function rejectsDifferentUser(callback) {
  try { callback(); return false; } catch (error) { return error.message === "Upload session does not belong to the authenticated user"; }
}

async function run() {
  console.log("==================================================");
  console.log("🏢 NODUS — TENANT UPLOAD CONTEXT TEST SUITE");
  console.log("==================================================");
  try {
    const resumable = new ResumableUploadManager({ rootDir: path.join(rootDir, "resumable") });
    const resumableSession = resumable.create({
      originalName: "tenant.bin", originalType: "application/octet-stream",
      originalSize: MiB, encryptedSize: MiB + 16, partSize: MiB + 16,
      organizationId: "org-alpha", userId: "user-owner", assetId: "asset-resumable", encryption: { iv: "b".repeat(24) }
    });
    assert(resumable.get(resumableSession.uploadId, "org-alpha").uploadId === resumableSession.uploadId, "Allows the owning organization to read a resumable session");
    assert(rejects(() => resumable.get(resumableSession.uploadId, "org-beta")), "Rejects another organization reading a resumable session");
    assert(rejects(() => resumable.abort(resumableSession.uploadId, "org-beta")), "Rejects another organization aborting a resumable session");
    assert(rejectsDifferentUser(() => resumable.get(resumableSession.uploadId, { organizationId: "org-alpha", userId: "user-viewer" })), "Rejects a different user reading an unfinished resumable session");
    assert(resumable.get(resumableSession.uploadId, { organizationId: "org-alpha", userId: "user-admin", canManage: true }).assetId === "asset-resumable", "Allows an organization administrator to inspect an owned resumable session");

    const direct = new DirectUploadManager({ rootDir: path.join(rootDir, "direct") });
    const directSession = direct.create({
      originalName: "tenant-direct.bin", originalType: "application/octet-stream", originalSize: MiB,
      segmentSize: MiB, tenant: { organizationId: "org-alpha" }, userId: "user-owner", assetId: "asset-direct",
      encryption: { iv: "c".repeat(24), chunkSize: MiB }
    });
    assert(direct.get(directSession.uploadId, "org-alpha").uploadId === directSession.uploadId, "Allows the owning organization to read a direct session");
    assert(rejects(() => direct.authorizeSegment(directSession.uploadId, 0, "org-beta")), "Rejects another organization authorizing a direct segment");
    assert(rejects(() => direct.abort(directSession.uploadId, "org-beta")), "Rejects another organization aborting a direct session");
    assert(rejectsDifferentUser(() => direct.get(directSession.uploadId, { organizationId: "org-alpha", userId: "user-viewer" })), "Rejects a different user reading an unfinished direct session");
    assert(direct.get(directSession.uploadId, { organizationId: "org-alpha", userId: "user-admin", canManage: true }).assetId === "asset-direct", "Allows an organization administrator to inspect an owned direct session");
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
  console.log("🎉 ALL TENANT UPLOAD CONTEXT TESTS PASSED");
}

run().catch((error) => { console.error("❌ Tenant context test failed:", error.message); process.exit(1); });
