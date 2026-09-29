import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";

const MiB = 1024 * 1024;
const DEFAULT_PART_SIZE = 8 * MiB;
const MAX_PART_SIZE = 32 * MiB;
const MAX_UPLOAD_SIZE = 500 * 1024 * 1024 * 1024;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function isUploadId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

/**
 * Durable, local staging manager for encrypted multipart uploads.
 *
 * It only accepts ciphertext parts. Storage finalization remains separate so the
 * staging layer can later be replaced by direct, authenticated Walrus publisher uploads.
 */
export class ResumableUploadManager {
  constructor({ rootDir, ttlMs = SESSION_TTL_MS } = {}) {
    if (!rootDir) throw new Error("rootDir is required");
    this.rootDir = path.resolve(rootDir);
    this.ttlMs = ttlMs;
    fs.mkdirSync(this.rootDir, { recursive: true, mode: 0o700 });
  }

  create({ originalName, originalType, originalSize, encryptedSize, partSize, description = "", tags = [], encryption, organizationId = null, userId = null, assetId = null, quotaReservationId = null, uploadId = crypto.randomUUID() }) {
    const normalizedOriginalSize = Number(originalSize);
    const normalizedEncryptedSize = Number(encryptedSize);
    const normalizedPartSize = Number(partSize) || DEFAULT_PART_SIZE;

    if (!Number.isSafeInteger(normalizedOriginalSize) || normalizedOriginalSize < 1 || normalizedOriginalSize > MAX_UPLOAD_SIZE) {
      throw new Error(`originalSize must be between 1 byte and ${MAX_UPLOAD_SIZE} bytes`);
    }
    if (!Number.isSafeInteger(normalizedEncryptedSize) || normalizedEncryptedSize < normalizedOriginalSize || normalizedEncryptedSize > MAX_UPLOAD_SIZE + (1024 * MiB)) {
      throw new Error("encryptedSize is invalid");
    }
    if (!Number.isSafeInteger(normalizedPartSize) || normalizedPartSize < MiB || normalizedPartSize > MAX_PART_SIZE) {
      throw new Error(`partSize must be between ${MiB} and ${MAX_PART_SIZE} bytes`);
    }
    if (!encryption || typeof encryption !== "object" || !encryption.iv) {
      throw new Error("A client-side encryption envelope is required for resumable uploads");
    }
    if (Object.prototype.hasOwnProperty.call(encryption, "key") || Object.prototype.hasOwnProperty.call(encryption, "keyHex")) {
      throw new Error("Raw data keys must not be sent to the server");
    }

    if (!isUploadId(uploadId)) throw new Error("Invalid upload ID");
    const partCount = Math.ceil(normalizedEncryptedSize / normalizedPartSize);
    const sessionDir = this.sessionDir(uploadId);
    fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });

    const now = new Date().toISOString();
    const session = {
      uploadId,
      organizationId,
      userId,
      assetId,
      quotaReservationId,
      status: "uploading",
      originalName: String(originalName || "asset.bin").slice(0, 255),
      originalType: String(originalType || "application/octet-stream").slice(0, 255),
      originalSize: normalizedOriginalSize,
      encryptedSize: normalizedEncryptedSize,
      partSize: normalizedPartSize,
      partCount,
      description: String(description || "").slice(0, 1024),
      tags: Array.isArray(tags) ? tags.slice(0, 30).map((tag) => String(tag).slice(0, 64)) : [],
      encryption,
      receivedParts: {},
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
      completedAsset: null
    };
    this.writeSession(session);
    return this.publicSession(session);
  }

  get(uploadId, context = null) {
    const session = this.readSession(uploadId);
    this.assertAccess(session, context);
    if (this.isExpired(session) && session.status !== "completed") {
      this.abort(uploadId);
      throw new Error("Upload session expired");
    }
    return this.publicSession(session);
  }

  getInternal(uploadId, context = null) {
    const session = this.readSession(uploadId);
    this.assertAccess(session, context);
    return session;
  }

  writePart(uploadId, partNumber, body, declaredHash, context = null) {
    const session = this.readSession(uploadId);
    this.assertAccess(session, context);
    if (session.status !== "uploading") throw new Error(`Upload is not writable in '${session.status}' state`);
    if (this.isExpired(session)) {
      this.abort(uploadId);
      throw new Error("Upload session expired");
    }

    const index = Number(partNumber);
    if (!Number.isInteger(index) || index < 0 || index >= session.partCount) {
      throw new Error("Invalid part number");
    }
    if (!Buffer.isBuffer(body) || body.length === 0) throw new Error("Part body is required");
    const expectedSize = this.expectedPartSize(session, index);
    if (body.length !== expectedSize) {
      throw new Error(`Part ${index} must be exactly ${expectedSize} bytes; received ${body.length}`);
    }

    const actualHash = sha256(body);
    if (!declaredHash || !/^[a-f0-9]{64}$/i.test(declaredHash) || actualHash !== declaredHash.toLowerCase()) {
      throw new Error("Part checksum mismatch");
    }

    const partPath = this.partPath(uploadId, index);
    const existing = session.receivedParts[String(index)];
    if (existing) {
      if (existing.sha256 === actualHash && fs.existsSync(partPath)) {
        return { accepted: true, duplicate: true, partNumber: index, receivedBytes: body.length };
      }
      throw new Error("Part already exists with a different checksum");
    }

    const temporaryPath = `${partPath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporaryPath, body, { mode: 0o600 });
    fs.renameSync(temporaryPath, partPath);
    session.receivedParts[String(index)] = { size: body.length, sha256: actualHash, receivedAt: new Date().toISOString() };
    session.updatedAt = new Date().toISOString();
    this.writeSession(session);
    return { accepted: true, duplicate: false, partNumber: index, receivedBytes: body.length };
  }

  async assemble(uploadId, context = null) {
    const session = this.readSession(uploadId);
    this.assertAccess(session, context);
    if (session.status !== "uploading") throw new Error(`Upload is not completable in '${session.status}' state`);
    const missingParts = this.missingParts(session);
    if (missingParts.length > 0) throw new Error(`Cannot complete upload; ${missingParts.length} part(s) missing`);

    session.status = "assembling";
    session.updatedAt = new Date().toISOString();
    this.writeSession(session);

    const assembledPath = path.join(this.sessionDir(uploadId), "assembled.ciphertext");
    const output = fs.createWriteStream(assembledPath, { flags: "w", mode: 0o600 });
    const hash = crypto.createHash("sha256");
    let byteLength = 0;

    try {
      for (let index = 0; index < session.partCount; index++) {
        const input = fs.createReadStream(this.partPath(uploadId, index));
        for await (const chunk of input) {
          hash.update(chunk);
          byteLength += chunk.length;
          if (!output.write(chunk)) await once(output, "drain");
        }
      }
      output.end();
      await once(output, "finish");
    } catch (error) {
      output.destroy();
      try { if (fs.existsSync(assembledPath)) fs.unlinkSync(assembledPath); } catch {}
      session.status = "uploading";
      session.updatedAt = new Date().toISOString();
      this.writeSession(session);
      throw error;
    }

    if (byteLength !== session.encryptedSize) {
      throw new Error(`Assembled upload size mismatch: expected ${session.encryptedSize}, received ${byteLength}`);
    }
    return { session, assembledPath, ciphertextSha256: hash.digest("hex"), byteLength };
  }

  markCompleted(uploadId, asset, ciphertextSha256, context = null) {
    const session = this.readSession(uploadId);
    this.assertAccess(session, context);
    if (session.status === "completed") return this.publicSession(session);
    session.status = "completed";
    session.completedAsset = asset;
    session.ciphertextSha256 = ciphertextSha256;
    session.completedAt = new Date().toISOString();
    session.updatedAt = session.completedAt;
    this.writeSession(session);
    this.removePayloadFiles(uploadId);
    return this.publicSession(session);
  }

  markRetryable(uploadId, context = null) {
    const session = this.readSession(uploadId);
    this.assertAccess(session, context);
    if (session.status === "completed") return this.publicSession(session);
    session.status = "uploading";
    session.updatedAt = new Date().toISOString();
    this.writeSession(session);
    try {
      const assembledPath = path.join(this.sessionDir(uploadId), "assembled.ciphertext");
      if (fs.existsSync(assembledPath)) fs.unlinkSync(assembledPath);
    } catch {}
    return this.publicSession(session);
  }

  abort(uploadId, context = null) {
    const sessionDir = this.sessionDir(uploadId);
    if (context && fs.existsSync(sessionDir)) this.assertAccess(this.readSession(uploadId), context);
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
    return true;
  }

  pruneExpired() {
    let pruned = 0;
    for (const entry of fs.readdirSync(this.rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isUploadId(entry.name)) continue;
      try {
        const session = this.readSession(entry.name);
        if (session.status !== "completed" && this.isExpired(session)) {
          this.abort(entry.name);
          pruned++;
        }
      } catch {
        // An incomplete/corrupt session cannot safely resume and is removed after the TTL sweep.
      }
    }
    return pruned;
  }

  sessionDir(uploadId) {
    if (!isUploadId(uploadId)) throw new Error("Invalid upload ID");
    return path.join(this.rootDir, uploadId);
  }

  partPath(uploadId, index) {
    return path.join(this.sessionDir(uploadId), `part-${String(index).padStart(8, "0")}.bin`);
  }

  readSession(uploadId) {
    const metadataPath = path.join(this.sessionDir(uploadId), "session.json");
    if (!fs.existsSync(metadataPath)) throw new Error("Upload session not found");
    const session = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    // One-way migration for sessions created by the legacy uploader. The key
    // belongs on the originating device, not in durable gateway state.
    if (session.encryption && (Object.prototype.hasOwnProperty.call(session.encryption, "key") || Object.prototype.hasOwnProperty.call(session.encryption, "keyHex"))) {
      delete session.encryption.key;
      delete session.encryption.keyHex;
      writeJsonAtomic(metadataPath, session);
    }
    return session;
  }

  writeSession(session) {
    writeJsonAtomic(path.join(this.sessionDir(session.uploadId), "session.json"), session);
  }

  expectedPartSize(session, index) {
    if (index < session.partCount - 1) return session.partSize;
    return session.encryptedSize - (session.partSize * (session.partCount - 1));
  }

  missingParts(session) {
    const missing = [];
    for (let index = 0; index < session.partCount; index++) {
      if (!session.receivedParts[String(index)] || !fs.existsSync(this.partPath(session.uploadId, index))) missing.push(index);
    }
    return missing;
  }

  removePayloadFiles(uploadId) {
    const dir = this.sessionDir(uploadId);
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith("part-") || entry === "assembled.ciphertext") {
        try { fs.unlinkSync(path.join(dir, entry)); } catch {}
      }
    }
  }

  isExpired(session) {
    return new Date(session.expiresAt).getTime() <= Date.now();
  }

  assertAccess(session, context) {
    const normalized = typeof context === "string" ? { organizationId: context } : (context || {});
    // Older development sessions do not contain a tenant. They remain usable only
    // without a tenant argument; authenticated callers can never claim them.
    if (normalized.organizationId && session.organizationId !== normalized.organizationId) {
      throw new Error("Upload session does not belong to the active organization");
    }
    if (normalized.userId && session.userId && session.userId !== normalized.userId && !normalized.canManage) {
      throw new Error("Upload session does not belong to the authenticated user");
    }
  }

  publicSession(session) {
    const received = Object.keys(session.receivedParts).map(Number).sort((a, b) => a - b);
    const missing = session.status === "completed" ? [] : this.missingParts(session);
    return {
      uploadId: session.uploadId,
      assetId: session.assetId || null,
      status: session.status,
      originalName: session.originalName,
      originalSize: session.originalSize,
      encryptedSize: session.encryptedSize,
      partSize: session.partSize,
      partCount: session.partCount,
      receivedParts: received,
      missingParts: missing,
      receivedBytes: received.reduce((total, index) => total + (session.receivedParts[String(index)]?.size || 0), 0),
      expiresAt: session.expiresAt,
      completedAsset: session.completedAsset,
      ciphertextSha256: session.ciphertextSha256 || null
    };
  }
}

export const RESUMABLE_UPLOAD_LIMITS = { DEFAULT_PART_SIZE, MAX_PART_SIZE, MAX_UPLOAD_SIZE };
