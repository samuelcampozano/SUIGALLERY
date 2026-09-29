import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MiB = 1024 * 1024;
export const DIRECT_UPLOAD_DEFAULT_SEGMENT_SIZE = 64 * MiB;
export const DIRECT_UPLOAD_MAX_SEGMENT_SIZE = 1024 * MiB;
export const DIRECT_UPLOAD_MAX_FILE_SIZE = 500 * 1024 * MiB;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(temporaryPath, filePath);
      return;
    } catch (error) {
      const retryable = error?.code === "EPERM" || error?.code === "EACCES";
      if (!retryable || attempt === 4) {
        fs.rmSync(temporaryPath, { force: true });
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
}

function isUploadId(value) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

/**
 * Durable control-plane state for browser-to-publisher uploads.
 *
 * Unlike ResumableUploadManager, this class never receives or stores ciphertext.
 * Authenticated tenant deployments persist this state in PostgreSQL. JSON is a
 * development-only fallback, never a store for direct-upload ciphertext.
 */
export class DirectUploadManager {
  constructor({ rootDir, ttlMs = SESSION_TTL_MS, stateStore = null } = {}) {
    if (!rootDir && !stateStore) throw new Error("rootDir is required when stateStore is not configured");
    this.rootDir = rootDir ? path.resolve(rootDir) : null;
    this.ttlMs = ttlMs;
    this.stateStore = stateStore;
    this.operationLocks = new Map();
    if (!this.stateStore) fs.mkdirSync(this.rootDir, { recursive: true, mode: 0o700 });
  }

  async create({ originalName, originalType, originalSize, segmentSize, description = "", tags = [], encryption, epochs = 1, tenant = null, userId = null, assetId = null, quotaReservationId = null, uploadId = crypto.randomUUID() }) {
    const size = Number(originalSize);
    const normalizedSegmentSize = Number(segmentSize) || DIRECT_UPLOAD_DEFAULT_SEGMENT_SIZE;
    const normalizedEpochs = Number(epochs) || 1;
    const chunkSize = Number(encryption?.chunkSize);

    if (!Number.isSafeInteger(size) || size < 1 || size > DIRECT_UPLOAD_MAX_FILE_SIZE) {
      throw new Error(`originalSize must be between 1 byte and ${DIRECT_UPLOAD_MAX_FILE_SIZE} bytes`);
    }
    if (!Number.isSafeInteger(normalizedSegmentSize) || normalizedSegmentSize < MiB || normalizedSegmentSize > DIRECT_UPLOAD_MAX_SEGMENT_SIZE) {
      throw new Error(`segmentSize must be between ${MiB} and ${DIRECT_UPLOAD_MAX_SEGMENT_SIZE} bytes`);
    }
    if (!encryption?.iv || !Number.isSafeInteger(chunkSize) || chunkSize < MiB) {
      throw new Error("A chunked client-side encryption envelope is required");
    }
    if (Object.prototype.hasOwnProperty.call(encryption, "key") || Object.prototype.hasOwnProperty.call(encryption, "keyHex")) {
      throw new Error("Raw data keys must not be sent to the server");
    }
    if (normalizedSegmentSize % chunkSize !== 0) {
      throw new Error("segmentSize must be an exact multiple of encryption.chunkSize");
    }
    if (!Number.isSafeInteger(normalizedEpochs) || normalizedEpochs < 1 || normalizedEpochs > 1000) {
      throw new Error("epochs must be between 1 and 1000");
    }

    if (!isUploadId(uploadId)) throw new Error("Invalid upload ID");
    const segments = [];
    for (let start = 0, index = 0; start < size; start += normalizedSegmentSize, index++) {
      const end = Math.min(start + normalizedSegmentSize, size);
      const chunkStart = Math.floor(start / chunkSize);
      const chunkCount = Math.ceil((end - start) / chunkSize);
      segments.push({
        index,
        plainStart: start,
        plainEnd: end,
        plainSize: end - start,
        ciphertextSize: (end - start) + (chunkCount * 16),
        chunkStart,
        chunkCount,
        status: "pending",
        blobId: null,
        ciphertextSha256: null,
        chunkSha256s: null,
        authorizedAt: null,
        uploadedAt: null,
        verificationState: "pending"
        ,authorization: null
      });
    }

    const now = new Date().toISOString();
    const session = {
      uploadId,
      organizationId: tenant?.organizationId || null,
      userId,
      assetId: assetId || `direct_${uploadId}`,
      quotaReservationId,
      status: "uploading",
      originalName: String(originalName || "asset.bin").slice(0, 255),
      originalType: String(originalType || "application/octet-stream").slice(0, 255),
      originalSize: size,
      segmentSize: normalizedSegmentSize,
      epochs: normalizedEpochs,
      description: String(description).slice(0, 1024),
      tags: Array.isArray(tags) ? tags.slice(0, 30).map((tag) => String(tag).slice(0, 64)) : [],
      encryption,
      segments,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
      completedAsset: null
    };
    await this.write(session);
    return this.publicSession(session);
  }

  async get(uploadId, context = null) {
    const session = await this.read(uploadId);
    this.assertAccess(session, context);
    if (this.isExpired(session) && session.status !== "completed") {
      await this.abort(uploadId);
      throw new Error("Upload session expired");
    }
    return this.publicSession(session);
  }

  async authorizeSegment(uploadId, index, context = null) {
    return this.withUploadLock(uploadId, async () => {
      const session = await this.read(uploadId);
      this.assertAccess(session, context);
      await this.ensureWritable(session);
      const segment = this.segment(session, index);
      if (segment.status === "completed") throw new Error("Segment has already been completed");
      segment.status = "authorized";
      segment.authorizedAt = new Date().toISOString();
      session.updatedAt = segment.authorizedAt;
      await this.write(session);
      return { session, segment: { ...segment } };
    });
  }

  async saveAuthorization(uploadId, index, authorization, context = null) {
    return this.withUploadLock(uploadId, async () => {
      const session = await this.read(uploadId);
      this.assertAccess(session, context);
      await this.ensureWritable(session);
      const segment = this.segment(session, index);
      if (!authorization?.jti || !authorization?.expiresAt || !authorization?.ciphertextSha256) throw new Error("Invalid publisher authorization");
      segment.authorization = { jti: authorization.jti, expiresAt: authorization.expiresAt, ciphertextSha256: authorization.ciphertextSha256 };
      await this.write(session);
    });
  }

  async completionContext(uploadId, index, context = null) {
    const session = await this.read(uploadId);
    this.assertAccess(session, context);
    await this.ensureWritable(session);
    const segment = this.segment(session, index);
    if (!segment.authorization) throw new Error("Segment has not been authorized");
    return { uploadId: session.uploadId, segmentIndex: segment.index, ciphertextSize: segment.ciphertextSize, ...segment.authorization };
  }

  async completeSegment(uploadId, index, { blobId, ciphertextSha256, chunkSha256s = null, publisherResponse = null, receipt = null, verified = false } = {}, context = null) {
    return this.withUploadLock(uploadId, async () => {
      const session = await this.read(uploadId);
      this.assertAccess(session, context);
      await this.ensureWritable(session);
      const segment = this.segment(session, index);
      if (!blobId || !/^[A-Za-z0-9_-]{16,256}$/.test(blobId)) throw new Error("Invalid Walrus blob ID");
      if (ciphertextSha256 && !/^[a-f0-9]{64}$/i.test(ciphertextSha256)) throw new Error("Invalid ciphertext SHA-256");
      if (!Array.isArray(chunkSha256s) || chunkSha256s.length !== segment.chunkCount || chunkSha256s.some((hash) => !/^[a-f0-9]{64}$/i.test(hash || ""))) {
        throw new Error("Verified SHA-256 hashes are required for every encrypted chunk");
      }
      if (!segment.authorization || segment.authorization.ciphertextSha256 !== ciphertextSha256) throw new Error("Segment completion does not match its authorized checksum");
      if (!verified || !receipt) throw new Error("An independently verified publisher receipt is required");
      if (segment.status === "completed") {
        if (segment.blobId === blobId && segment.ciphertextSha256 === (ciphertextSha256 || null)) return this.publicSession(session);
        throw new Error("Segment was already completed with different content");
      }
      segment.status = "completed";
      segment.blobId = blobId;
      segment.ciphertextSha256 = ciphertextSha256 || null;
      segment.chunkSha256s = chunkSha256s.map((hash) => hash.toLowerCase());
      segment.publisherResponse = this.safePublisherResponse(publisherResponse);
      segment.receipt = { blobId: receipt.blobId, jti: receipt.jti, issuedAt: receipt.iat, expiresAt: receipt.exp };
      segment.verificationState = verified ? "verified" : "pending";
      segment.uploadedAt = new Date().toISOString();
      session.updatedAt = segment.uploadedAt;
      await this.write(session);
      return this.publicSession(session);
    });
  }

  async finalize(uploadId, context = null) {
    return this.withUploadLock(uploadId, async () => {
      const session = await this.read(uploadId);
      this.assertAccess(session, context);
      if (session.status === "completed") return { upload: this.publicSession(session), asset: session.completedAsset, manifest: this.buildManifest(session) };
      await this.ensureWritable(session);
      const missing = session.segments.filter((segment) => segment.status !== "completed").map((segment) => segment.index);
      if (missing.length) throw new Error(`Cannot finalize upload; ${missing.length} segment(s) missing`);

      const asset = {
      id: session.assetId,
      name: session.originalName,
      original_name: session.originalName,
      original_type: session.originalType,
      original_size: session.originalSize,
      content_type: "application/octet-stream",
      encrypted: true,
      encryption_mode: "chunked-aes-gcm-v2",
      chunk_size: session.encryption.chunkSize,
      segment_size: session.segmentSize,
      segment_count: session.segments.length,
      epochs: session.epochs,
      tags: session.tags,
      description: session.description,
      created_at: new Date().toISOString(),
      manifest_url: `/api/assets/direct-uploads/${session.uploadId}/manifest`,
      stream_url: `/api/assets/${session.assetId}/direct-manifest`,
      download_url: `/api/assets/${session.assetId}/direct-manifest`,
      status: "active"
    };
      session.status = "completed";
      session.completedAsset = asset;
      session.completedAt = asset.created_at;
      session.updatedAt = asset.created_at;
      await this.write(session);
      return { upload: this.publicSession(session), asset, manifest: this.buildManifest(session) };
    });
  }

  async manifest(uploadId, context = null) {
    const session = await this.read(uploadId);
    this.assertAccess(session, context);
    if (session.status !== "completed") throw new Error("Upload is not finalized");
    return this.buildManifest(session);
  }

  async manifestByAssetId(assetId, context = null) {
    if (typeof assetId !== "string") throw new Error("Asset is not a direct publisher asset");
    if (this.stateStore?.findByAssetId && context?.organizationId) {
      const session = await this.stateStore.findByAssetId(assetId, context.organizationId);
      if (!session) throw new Error("Asset is not a direct publisher asset");
      this.assertAccess(session, context);
      if (session.status !== "completed") throw new Error("Upload is not finalized");
      return this.buildManifest(session);
    }
    for (const session of await this.listSessions()) {
      if (session.assetId === assetId || (assetId === `direct_${session.uploadId}` && !session.assetId)) return this.manifest(session.uploadId, context);
    }
    throw new Error("Asset is not a direct publisher asset");
  }

  async listAssets(organizationId = null) {
    const assets = [];
    for (const session of await this.listSessions(organizationId)) {
      if (session.status === "completed" && session.completedAsset && (!organizationId || session.organizationId === organizationId)) assets.push(session.completedAsset);
    }
    return assets;
  }

  async abort(uploadId, context = null) {
    return this.withUploadLock(uploadId, () => this.abortUnlocked(uploadId, context));
  }

  async abortUnlocked(uploadId, context = null) {
    if (this.stateStore) {
      const session = await this.read(uploadId);
      if (context) this.assertAccess(session, context);
      await this.stateStore.remove(uploadId);
      return true;
    }
    const target = this.filePath(uploadId);
    if (context && fs.existsSync(target)) this.assertAccess(await this.read(uploadId), context);
    if (fs.existsSync(target)) fs.unlinkSync(target);
    return true;
  }

  async pruneExpired() {
    let count = 0;
    for (const session of await this.listSessions()) {
      try {
        if (session.status !== "completed" && this.isExpired(session)) {
          await this.abort(session.uploadId);
          count++;
        }
      } catch {}
    }
    return count;
  }

  async read(uploadId) {
    if (this.stateStore) {
      const session = await this.stateStore.load(uploadId);
      if (!session) throw new Error("Upload session not found");
      return session;
    }
    const target = this.filePath(uploadId);
    if (!fs.existsSync(target)) throw new Error("Upload session not found");
    return JSON.parse(fs.readFileSync(target, "utf8"));
  }

  async write(session) {
    if (this.stateStore) return this.stateStore.save(session);
    writeJsonAtomic(this.filePath(session.uploadId), session);
  }

  async listSessions(organizationId = null) {
    if (this.stateStore) return this.stateStore.list(organizationId);
    const sessions = [];
    for (const entry of fs.readdirSync(this.rootDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try { sessions.push(JSON.parse(fs.readFileSync(path.join(this.rootDir, entry.name), "utf8"))); } catch {}
    }
    return sessions;
  }

  filePath(uploadId) {
    if (!isUploadId(uploadId)) throw new Error("Invalid upload ID");
    return path.join(this.rootDir, `${uploadId}.json`);
  }

  segment(session, index) {
    const value = Number(index);
    if (!Number.isInteger(value) || value < 0 || value >= session.segments.length) throw new Error("Invalid segment index");
    return session.segments[value];
  }

  async ensureWritable(session) {
    if (session.status !== "uploading") throw new Error(`Upload is not writable in '${session.status}' state`);
    if (this.isExpired(session)) {
      await this.abortUnlocked(session.uploadId);
      throw new Error("Upload session expired");
    }
  }

  async withUploadLock(uploadId, operation) {
    const previous = this.operationLocks.get(uploadId) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.operationLocks.set(uploadId, tail);
    await previous;
    try { return await operation(); } finally {
      release();
      if (this.operationLocks.get(uploadId) === tail) this.operationLocks.delete(uploadId);
    }
  }

  isExpired(session) {
    return new Date(session.expiresAt).getTime() <= Date.now();
  }

  assertAccess(session, context) {
    const normalized = typeof context === "string" ? { organizationId: context } : (context || {});
    if (normalized.organizationId && session.organizationId !== normalized.organizationId) {
      throw new Error("Upload session does not belong to the active organization");
    }
    if (normalized.userId && session.userId && session.userId !== normalized.userId && !normalized.canManage) {
      throw new Error("Upload session does not belong to the authenticated user");
    }
  }

  safePublisherResponse(response) {
    if (!response || typeof response !== "object") return null;
    const blobId = response?.newlyCreated?.blobObject?.blobId || response?.alreadyCertified?.blobId || response.blobId || response.blob_id || null;
    return blobId ? { blobId } : null;
  }

  buildManifest(session) {
    const manifest = {
      version: 1,
      assetId: session.completedAsset?.id || session.assetId || `direct_${session.uploadId}`,
      originalName: session.originalName,
      originalType: session.originalType,
      originalSize: session.originalSize,
      segmentSize: session.segmentSize,
      encryption: {
        mode: "chunked-aes-gcm-v2",
        chunkSize: session.encryption.chunkSize,
        chunkCount: Math.ceil(session.originalSize / session.encryption.chunkSize),
        iv: session.encryption.iv
      },
      segments: session.segments.map((segment) => ({
        index: segment.index,
        plainStart: segment.plainStart,
        plainEnd: segment.plainEnd,
        plainSize: segment.plainSize,
        ciphertextSize: segment.ciphertextSize,
        chunkStart: segment.chunkStart,
        chunkCount: segment.chunkCount,
        blobId: segment.blobId,
        ciphertextSha256: segment.ciphertextSha256,
        chunkSha256s: segment.chunkSha256s,
        verificationState: segment.verificationState
      }))
    };
    return {
      ...manifest,
      manifestSha256: crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex")
    };
  }

  publicSession(session) {
    const completed = session.segments.filter((segment) => segment.status === "completed").map((segment) => segment.index);
    return {
      uploadId: session.uploadId,
      assetId: session.assetId || null,
      status: session.status,
      originalName: session.originalName,
      originalType: session.originalType,
      originalSize: session.originalSize,
      segmentSize: session.segmentSize,
      segmentCount: session.segments.length,
      epochs: session.epochs,
      completedSegments: completed,
      missingSegments: session.segments.filter((segment) => segment.status !== "completed").map((segment) => segment.index),
      segments: session.segments.map(({ index, plainStart, plainEnd, plainSize, ciphertextSize, chunkStart, chunkCount, status, blobId, ciphertextSha256, verificationState }) => ({ index, plainStart, plainEnd, plainSize, ciphertextSize, chunkStart, chunkCount, status, blobId, ciphertextSha256, verificationState })),
      expiresAt: session.expiresAt,
      completedAsset: session.completedAsset
    };
  }
}
