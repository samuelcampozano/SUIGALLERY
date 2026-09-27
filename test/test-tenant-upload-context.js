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

async function rejects(callback) {
  try { await callback(); return false; } catch (error) { return error.message === "Upload session does not belong to the active organization"; }
}

async function rejectsDifferentUser(callback) {
  try { await callback(); return false; } catch (error) { return error.message === "Upload session does not belong to the authenticated user"; }
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
    assert(await rejects(() => resumable.get(resumableSession.uploadId, "org-beta")), "Rejects another organization reading a resumable session");
    assert(await rejects(() => resumable.abort(resumableSession.uploadId, "org-beta")), "Rejects another organization aborting a resumable session");
    assert(await rejectsDifferentUser(() => resumable.get(resumableSession.uploadId, { organizationId: "org-alpha", userId: "user-viewer" })), "Rejects a different user reading an unfinished resumable session");
    assert(resumable.get(resumableSession.uploadId, { organizationId: "org-alpha", userId: "user-admin", canManage: true }).assetId === "asset-resumable", "Allows an organization administrator to inspect an owned resumable session");

    const direct = new DirectUploadManager({ rootDir: path.join(rootDir, "direct") });
    const directSession = await direct.create({
      originalName: "tenant-direct.bin", originalType: "application/octet-stream", originalSize: MiB,
      segmentSize: MiB, tenant: { organizationId: "org-alpha" }, userId: "user-owner", assetId: "asset-direct",
      encryption: { iv: "c".repeat(24), chunkSize: MiB }
    });
    assert((await direct.get(directSession.uploadId, "org-alpha")).uploadId === directSession.uploadId, "Allows the owning organization to read a direct session");
    assert(await rejects(() => direct.authorizeSegment(directSession.uploadId, 0, "org-beta")), "Rejects another organization authorizing a direct segment");
    assert(await rejects(() => direct.abort(directSession.uploadId, "org-beta")), "Rejects another organization aborting a direct session");
    assert(await rejectsDifferentUser(() => direct.get(directSession.uploadId, { organizationId: "org-alpha", userId: "user-viewer" })), "Rejects a different user reading an unfinished direct session");
    assert((await direct.get(directSession.uploadId, { organizationId: "org-alpha", userId: "user-admin", canManage: true })).assetId === "asset-direct", "Allows an organization administrator to inspect an owned direct session");

    const databaseRows = new Map();
    const stateStore = {
      load: async (uploadId) => databaseRows.get(uploadId) || null,
      save: async (session) => databaseRows.set(session.uploadId, structuredClone(session)),
      list: async () => [...databaseRows.values()].map((session) => structuredClone(session)),
      remove: async (uploadId) => databaseRows.delete(uploadId)
    };
    const persistentDirect = new DirectUploadManager({ stateStore });
    const persistentSession = await persistentDirect.create({
      originalName: "database-direct.bin", originalType: "application/octet-stream", originalSize: MiB,
      segmentSize: MiB, tenant: { organizationId: "org-alpha" }, userId: "user-owner", assetId: "asset-database",
      encryption: { iv: "d".repeat(24), chunkSize: MiB }
    });
    const restartedDirect = new DirectUploadManager({ stateStore });
    assert((await restartedDirect.get(persistentSession.uploadId, { organizationId: "org-alpha", userId: "user-owner" })).assetId === "asset-database", "Restores a direct session from the canonical database state store without local files");
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
  console.log("🎉 ALL TENANT UPLOAD CONTEXT TESTS PASSED");
}

run().catch((error) => { console.error("❌ Tenant context test failed:", error.message); process.exit(1); });
