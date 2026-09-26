/**
 * @fileoverview Nodus Developer SDK (@nodus/sdk)
 * Isomorphic client library for Node.js (v20+) and modern browsers.
 * Provides zero-knowledge client-side encryption, decentralized Walrus storage,
 * and private search primitives.
 */

import { PublicKey } from "@solana/web3.js";

export const DEFAULT_NODUS_PROGRAM_ID = "NodUS11111111111111111111111111111111111111";
export const DEFAULT_RESUMABLE_THRESHOLD_BYTES = 20 * 1024 * 1024;
export const DEFAULT_RESUMABLE_CHUNK_SIZE = 8 * 1024 * 1024;
export const DEFAULT_DIRECT_PUBLISHER_SEGMENT_SIZE = 64 * 1024 * 1024;

/**
 * Derives the deterministic Anchor Program Derived Address (PDA) for an Organization.
 * @param {string} orgId
 * @param {string} [programIdStr]
 * @returns {{ pda: PublicKey, bump: number, pdaString: string }}
 */
export function deriveOrgPDA(orgId, programIdStr = DEFAULT_NODUS_PROGRAM_ID) {
  const programId = new PublicKey(programIdStr);
  const cleanId = orgId.toLowerCase().trim();
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("nodus_org"), Buffer.from(cleanId)],
    programId
  );
  return { pda, bump, pdaString: pda.toBase58() };
}

/**
 * Derives the deterministic Anchor Program Derived Address (PDA) for an Organization Member.
 * @param {PublicKey|string} orgPDA
 * @param {PublicKey|string} memberPubkey
 * @param {string} [programIdStr]
 * @returns {{ pda: PublicKey, bump: number, pdaString: string }}
 */
export function deriveMemberPDA(orgPDA, memberPubkey, programIdStr = DEFAULT_NODUS_PROGRAM_ID) {
  const programId = new PublicKey(programIdStr);
  const orgPub = typeof orgPDA === "string" ? new PublicKey(orgPDA) : orgPDA;
  const memPub = typeof memberPubkey === "string" ? new PublicKey(memberPubkey) : memberPubkey;
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("nodus_member"), orgPub.toBuffer(), memPub.toBuffer()],
    programId
  );
  return { pda, bump, pdaString: pda.toBase58() };
}

/**
 * Low-level WebCrypto cryptographic primitives for AES-256-GCM envelope encryption.
 */
export const NodusCrypto = {
  /**
   * Generates a random 256-bit symmetric key for AES-GCM.
   * @returns {Promise<CryptoKey>}
   */
  async generateDataKey() {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error("WebCrypto (crypto.subtle) is not available in this environment.");
    return subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  },

  /**
   * Exports raw symmetric key as hexadecimal string.
   * @param {CryptoKey} key
   * @returns {Promise<string>}
   */
  async exportKeyHex(key) {
    const subtle = globalThis.crypto?.subtle;
    const raw = await subtle.exportKey("raw", key);
    return Array.from(new Uint8Array(raw))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  },

  /**
   * Imports symmetric key from hexadecimal string.
   * @param {string} keyHex
   * @returns {Promise<CryptoKey>}
   */
  async importKeyHex(keyHex, usages = ["decrypt"]) {
    const subtle = globalThis.crypto?.subtle;
    const bytes = new Uint8Array(keyHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
    return subtle.importKey(
      "raw",
      bytes,
      { name: "AES-GCM" },
      false,
      usages
    );
  },

  /**
   * Encrypts plaintext buffer/bytes in-memory using AES-256-GCM with a 96-bit random IV.
   * @param {ArrayBuffer|Uint8Array} dataBuffer
   * @param {CryptoKey} [existingKey]
   * @returns {Promise<{ ciphertext: Uint8Array, keyHex: string, ivHex: string }>}
   */
  async encryptBuffer(dataBuffer, existingKey = null) {
    const subtle = globalThis.crypto?.subtle;
    const key = existingKey || (await this.generateDataKey());
    const keyHex = await this.exportKeyHex(key);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ivHex = Array.from(iv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const encryptedBuffer = await subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      dataBuffer
    );

    return {
      ciphertext: new Uint8Array(encryptedBuffer),
      keyHex,
      ivHex
    };
  },

  /**
   * Decrypts ciphertext buffer using provided AES key and IV.
   * @param {ArrayBuffer|Uint8Array} ciphertextBuffer
   * @param {string} keyHex
   * @param {string} ivHex
   * @returns {Promise<Uint8Array>}
   */
  async decryptBuffer(ciphertextBuffer, keyHex, ivHex) {
    const subtle = globalThis.crypto?.subtle;
    const key = await this.importKeyHex(keyHex);
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
    const decrypted = await subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertextBuffer
    );
    return new Uint8Array(decrypted);
  },

  /**
   * Derives a distinct 96-bit IV for an AES-GCM chunk without persisting an IV
   * per part. XOR with the chunk counter preserves uniqueness for each index.
   */
  deriveChunkIv(baseIvHex, chunkIndex) {
    if (!/^[a-f0-9]{24}$/i.test(baseIvHex)) throw new Error("Invalid base IV");
    if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0) throw new Error("Invalid chunk index");
    const iv = new Uint8Array(baseIvHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
    let counter = BigInt(chunkIndex);
    for (let offset = 0; offset < 8; offset++) {
      iv[11 - offset] ^= Number(counter & 0xffn);
      counter >>= 8n;
    }
    return iv;
  },

  async encryptChunk(plaintext, keyHex, baseIvHex, chunkIndex) {
    const subtle = globalThis.crypto?.subtle;
    const key = await this.importKeyHex(keyHex, ["encrypt", "decrypt"]);
    const iv = this.deriveChunkIv(baseIvHex, chunkIndex);
    const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
    return new Uint8Array(ciphertext);
  },

  async decryptChunk(ciphertext, keyHex, baseIvHex, chunkIndex) {
    const subtle = globalThis.crypto?.subtle;
    const key = await this.importKeyHex(keyHex, ["encrypt", "decrypt"]);
    const iv = this.deriveChunkIv(baseIvHex, chunkIndex);
    const plaintext = await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new Uint8Array(plaintext);
  },

  async sha256Hex(bytes) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
};

/**
 * In-memory client-side zero-knowledge search index.
 * Allows searching asset catalogs locally without dispatching queries to any server.
 */
export class NodusSearchIndex {
  constructor() {
    this.documents = new Map();
  }

  /**
   * Index or update an asset in the local search index.
   * @param {object} doc
   */
  indexDocument(doc) {
    if (!doc || !doc.id) return;
    const tokens = this._tokenize(
      `${doc.name || ""} ${doc.original_name || ""} ${doc.description || ""} ${(doc.tags || []).join(" ")} ${doc.content_type || ""}`
    );
    this.documents.set(doc.id, {
      id: doc.id,
      doc,
      tokens
    });
  }

  /**
   * Bulk index an array of assets.
   * @param {object[]} docs
   */
  indexAll(docs) {
    if (!Array.isArray(docs)) return;
    for (const doc of docs) {
      this.indexDocument(doc);
    }
  }

  /**
   * Search indexed documents locally.
   * @param {string} query
   * @param {object} [options]
   * @param {string} [options.type] - Filter by type prefix (e.g. 'image', 'application/pdf')
   * @param {string} [options.tag] - Filter by tag
   * @param {number} [options.limit=50]
   * @returns {object[]}
   */
  search(query = "", options = {}) {
    const rawTokens = this._tokenize(query);
    const limit = options.limit || 50;
    const results = [];

    for (const item of this.documents.values()) {
      const doc = item.doc;

      // Type filter
      if (options.type) {
        const mime = (doc.original_type || doc.content_type || "").toLowerCase();
        if (!mime.includes(options.type.toLowerCase())) continue;
      }

      // Tag filter
      if (options.tag) {
        const tags = Array.isArray(doc.tags) ? doc.tags.map((t) => t.toLowerCase()) : [];
        if (!tags.includes(options.tag.toLowerCase())) continue;
      }

      // If query is empty, return document if it passed filters
      if (rawTokens.length === 0) {
        results.push({ item: doc, score: 1 });
        continue;
      }

      // Compute match score
      let matches = 0;
      for (const qTok of rawTokens) {
        for (const dTok of item.tokens) {
          if (dTok.includes(qTok)) {
            matches += dTok === qTok ? 2 : 1;
          }
        }
      }

      if (matches > 0) {
        results.push({ item: doc, score: matches });
      }
    }

    // Sort highest score first
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map((r) => r.item);
  }

  _tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s.-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }
}

/**
 * Main Nodus Client class.
 */
export class NodusClient {
  /**
   * @param {object} [config]
   * @param {string} [config.gatewayUrl='http://localhost:3000'] - Gateway URL
   * @param {string} [config.apiKey] - Optional scoped API key
   * @param {Function} [config.fetch] - Custom fetch polyfill
   */
  constructor(config = {}) {
    this.gatewayUrl = (config.gatewayUrl || "http://localhost:3000").replace(/\/+$/, "");
    this.apiKey = config.apiKey || null;
    this._fetch = config.fetch || globalThis.fetch.bind(globalThis);
    this.searchIndex = new NodusSearchIndex();
  }

  /**
   * Check status, storage quota, and on-chain Seal threshold policy.
   * @returns {Promise<object>}
   */
  async getStatus() {
    const res = await this._fetch(`${this.gatewayUrl}/api/status`, {
      headers: this._getHeaders()
    });
    if (!res.ok) throw new Error(`Status check failed: HTTP ${res.status}`);
    return res.json();
  }

  /**
   * Ingest and anchor an asset into Walrus.
   * Encrypts client-side using AES-256-GCM before transport by default.
   *
   * @param {Uint8Array|ArrayBuffer|string} data - Binary data or UTF-8 string
   * @param {object} options
   * @param {string} options.name - Asset name (e.g. 'contract.pdf')
   * @param {string} [options.type='application/octet-stream'] - Original MIME type
   * @param {string} [options.description] - Metadata description
   * @param {string[]} [options.tags] - Categorization tags
   * @param {boolean} [options.encrypt=true] - Whether to apply client-side AES-256-GCM
   * @returns {Promise<object>} Result containing asset id and blob_id
   */
  async put(data, options = {}) {
    const name = options.name || `asset_${Date.now()}.bin`;
    const type = options.type || "application/octet-stream";
    const description = options.description || "Uploaded via Nodus SDK";
    const tags = options.tags || ["nodus-sdk"];
    const encrypt = options.encrypt !== false;

    const sourceSize = this._sourceSize(data);
    if (options.directPublisher === true) {
      return this.putDirectPublisher(data, { ...options, name, type, description, tags, encrypt });
    }
    const resumableThreshold = options.resumableThresholdBytes || DEFAULT_RESUMABLE_THRESHOLD_BYTES;
    if (options.resumable !== false && (options.resumable === true || sourceSize > resumableThreshold)) {
      return this.putResumable(data, { ...options, name, type, description, tags, encrypt });
    }

    // Convert data to Uint8Array
    let rawBytes;
    if (typeof data === "string") {
      rawBytes = new TextEncoder().encode(data);
    } else if (data instanceof ArrayBuffer) {
      rawBytes = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      rawBytes = data;
    } else if (typeof Blob !== "undefined" && data instanceof Blob) {
      rawBytes = new Uint8Array(await data.arrayBuffer());
    } else {
      throw new Error("Unsupported data format. Provide Uint8Array, ArrayBuffer, Blob, or string.");
    }

    const originalSize = rawBytes.byteLength;

    let payloadBytes = rawBytes;
    let keyHex = null;
    let ivHex = null;

    if (encrypt) {
      const encrypted = await NodusCrypto.encryptBuffer(rawBytes);
      payloadBytes = encrypted.ciphertext;
      keyHex = encrypted.keyHex;
      ivHex = encrypted.ivHex;
    }

    // Build FormData payload
    const formData = new FormData();
    const blob = new Blob([payloadBytes], { type: "application/octet-stream" });
    formData.append("photo", blob, name);
    formData.append("originalName", name);
    formData.append("originalType", type);
    formData.append("originalSize", String(originalSize));
    formData.append("description", description);
    formData.append("tags", tags.join(","));

    if (encrypt) {
      formData.append("encrypted", "true");
      formData.append("key", keyHex);
      formData.append("iv", ivHex);
    }

    const res = await this._fetch(`${this.gatewayUrl}/api/photos/upload`, {
      method: "POST",
      headers: this._getHeaders(false),
      body: formData
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(`Nodus upload failed: ${body.error || `HTTP ${res.status}`}`);
    }

    const record = body.photo || body.asset || body.result;
    if (record) {
      if (!record.tags || record.tags.length === 0) {
        record.tags = tags;
      }
      if (!record.description) {
        record.description = description;
      }
      if (!record.original_type) {
        record.original_type = type;
      }
      if (!record.original_name) {
        record.original_name = name;
      }
      if (!record.name) {
        record.name = name;
      }
      this.searchIndex.indexDocument(record);
    }

    return {
      success: true,
      id: record.id,
      blob_id: record.blob_id,
      name,
      size: originalSize,
      encrypted: encrypt,
      key: keyHex,
      iv: ivHex,
      record
    };
  }

  /**
   * Starts an encrypted multipart upload. Files above `resumableThresholdBytes`
   * automatically use this path through put(). Only one ciphertext chunk is held
   * in memory at once when the input is a Blob/File.
   *
   * To resume after an interrupted process, retain `error.uploadId`,
   * `error.encryption.key`, and `error.encryption.iv`, then call
   * resumeResumableUpload(uploadId, file, { key, iv }).
   */
  async putResumable(data, options = {}) {
    if (options.encrypt === false) {
      throw new Error("Resumable uploads require client-side encryption");
    }

    const originalSize = this._sourceSize(data);
    if (originalSize < 1) throw new Error("Cannot upload an empty asset");
    const chunkSize = Number(options.chunkSize || DEFAULT_RESUMABLE_CHUNK_SIZE);
    if (!Number.isSafeInteger(chunkSize) || chunkSize < 1024 * 1024 || chunkSize > (32 * 1024 * 1024) - 16) {
      throw new Error("chunkSize must be between 1 MiB and 32 MiB minus the AES-GCM tag");
    }

    const name = options.name || `asset_${Date.now()}.bin`;
    const type = options.type || "application/octet-stream";
    const description = options.description || "Uploaded via Nodus SDK";
    const tags = options.tags || ["nodus-sdk"];
    const chunkCount = Math.ceil(originalSize / chunkSize);
    const encryptedSize = originalSize + (chunkCount * 16); // AES-GCM authentication tag per chunk.
    const encryptedPartSize = chunkSize + 16;
    let upload;
    let keyHex = options.key || null;
    let ivHex = options.iv || null;

    if (options.uploadId) {
      if (!keyHex || !ivHex) {
        throw new Error("Resuming an encrypted upload requires the original key and IV");
      }
      upload = await this.getResumableUpload(options.uploadId);
      if (upload.originalSize !== originalSize || upload.partCount !== chunkCount || upload.partSize !== encryptedPartSize) {
        throw new Error("Source file or chunk size does not match the existing upload session");
      }
    } else {
      const key = await NodusCrypto.generateDataKey();
      keyHex = keyHex || await NodusCrypto.exportKeyHex(key);
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      ivHex = ivHex || Array.from(iv).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      upload = await this.createResumableUpload({
        originalName: name,
        originalType: type,
        originalSize,
        encryptedSize,
        partSize: encryptedPartSize,
        description,
        tags,
        encryption: {
          mode: "chunked-aes-gcm-v1",
          key: keyHex,
          iv: ivHex,
          chunkSize,
          chunkCount,
          originalName: name,
          originalType: type,
          originalSize
        }
      });
    }

    const received = new Set(upload.receivedParts || []);
    try {
      for (let partNumber = 0; partNumber < chunkCount; partNumber++) {
        if (received.has(partNumber)) continue;
        const start = partNumber * chunkSize;
        const end = Math.min(start + chunkSize, originalSize);
        const plaintextPart = await this._readSourceChunk(data, start, end);
        const ciphertextPart = await NodusCrypto.encryptChunk(plaintextPart, keyHex, ivHex, partNumber);
        const checksum = await NodusCrypto.sha256Hex(ciphertextPart);
        await this.uploadResumablePart(upload.uploadId, partNumber, ciphertextPart, checksum);
        if (typeof options.onProgress === "function") {
          options.onProgress({
            uploadId: upload.uploadId,
            partNumber,
            partCount: chunkCount,
            uploadedBytes: Math.min(end, originalSize),
            totalBytes: originalSize
          });
        }
      }

      const completed = await this.completeResumableUpload(upload.uploadId);
      const record = completed.asset || completed.result;
      if (record) this._indexRecord(record, { name, type, description, tags });
      return {
        success: true,
        uploadId: upload.uploadId,
        id: record?.id || record?.fileId,
        blob_id: record?.blob_id || record?.blobId,
        name,
        size: originalSize,
        encrypted: true,
        key: keyHex,
        iv: ivHex,
        record,
        upload: completed.upload
      };
    } catch (error) {
      error.uploadId = upload.uploadId;
      error.encryption = { key: keyHex, iv: ivHex, chunkSize, chunkCount };
      throw error;
    }
  }

  async resumeResumableUpload(uploadId, data, options = {}) {
    return this.putResumable(data, { ...options, uploadId, resumable: true });
  }

  /**
   * Publishes encrypted segments directly from the client to an authenticated
   * Walrus publisher. The Nodus gateway only issues one-time authorizations and
   * stores the manifest; it never receives the ciphertext.
   *
   * This is opt-in while a project migrates from the local-staging protocol:
   * `put(file, { directPublisher: true })`.
   */
  async putDirectPublisher(data, options = {}) {
    if (options.encrypt === false) throw new Error("Direct publisher uploads require client-side encryption");
    const originalSize = this._sourceSize(data);
    if (originalSize < 1) throw new Error("Cannot upload an empty asset");
    const chunkSize = Number(options.chunkSize || DEFAULT_RESUMABLE_CHUNK_SIZE);
    const segmentSize = Number(options.segmentSize || DEFAULT_DIRECT_PUBLISHER_SEGMENT_SIZE);
    if (!Number.isSafeInteger(chunkSize) || chunkSize < 1024 * 1024 || chunkSize > 32 * 1024 * 1024) {
      throw new Error("chunkSize must be between 1 MiB and 32 MiB");
    }
    if (!Number.isSafeInteger(segmentSize) || segmentSize < 1024 * 1024 || segmentSize > 1024 * 1024 * 1024 || segmentSize % chunkSize !== 0) {
      throw new Error("segmentSize must be between 1 MiB and 1 GiB and divisible by chunkSize");
    }

    const name = options.name || `asset_${Date.now()}.bin`;
    const type = options.type || "application/octet-stream";
    const description = options.description || "Uploaded via Nodus SDK";
    const tags = options.tags || ["nodus-sdk"];
    let upload;
    let keyHex = options.key || null;
    let ivHex = options.iv || null;

    if (options.uploadId) {
      if (!keyHex || !ivHex) throw new Error("Resuming a direct upload requires the original key and IV");
      upload = await this.getDirectUpload(options.uploadId);
      if (upload.originalSize !== originalSize || upload.segmentSize !== segmentSize) {
        throw new Error("Source file or segment size does not match the existing direct upload session");
      }
    } else {
      const key = await NodusCrypto.generateDataKey();
      keyHex = keyHex || await NodusCrypto.exportKeyHex(key);
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      ivHex = ivHex || Array.from(iv).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      upload = await this.createDirectUpload({
        originalName: name,
        originalType: type,
        originalSize,
        segmentSize,
        description,
        tags,
        epochs: Number(options.epochs || 1),
        encryption: {
          mode: "chunked-aes-gcm-v2",
          iv: ivHex,
          chunkSize,
          originalName: name,
          originalType: type,
          originalSize
        }
      });
    }

    try {
      for (const segment of upload.segments) {
        if (segment.status === "completed") continue;
        const { ciphertext, ciphertextSha256 } = await this._encryptDirectSegment(data, segment, keyHex, ivHex, chunkSize);
        const authorization = await this.authorizeDirectSegment(upload.uploadId, segment.index, ciphertextSha256, options.sendObjectTo);
        const published = await this._fetch(authorization.uploadUrl, {
          method: authorization.method || "PUT",
          headers: authorization.headers,
          body: ciphertext
        });
        const publisherResponse = await this._readPublisherResponse(published);
        if (!published.ok) {
          throw new Error(publisherResponse?.error || publisherResponse?.message || `Publisher rejected segment ${segment.index}: HTTP ${published.status}`);
        }
        const blobId = this._publisherBlobId(publisherResponse);
        if (!blobId) throw new Error(`Publisher did not return a blob ID for segment ${segment.index}`);
        upload = await this.completeDirectSegment(upload.uploadId, segment.index, { ciphertextSha256, publisherResponse, receipt: publisherResponse?.receipt });
        if (typeof options.onProgress === "function") {
          options.onProgress({
            uploadId: upload.uploadId,
            segmentIndex: segment.index,
            segmentCount: upload.segmentCount,
            uploadedBytes: segment.plainEnd,
            totalBytes: originalSize
          });
        }
      }
      const completed = await this.finalizeDirectUpload(upload.uploadId);
      const record = completed.asset;
      if (record) this._indexRecord(record, { name, type, description, tags });
      return {
        success: true,
        uploadId: upload.uploadId,
        id: record?.id,
        blob_id: null,
        name,
        size: originalSize,
        encrypted: true,
        key: keyHex,
        iv: ivHex,
        record,
        upload: completed.upload,
        manifest: completed.manifest
      };
    } catch (error) {
      error.uploadId = upload.uploadId;
      error.encryption = { key: keyHex, iv: ivHex, chunkSize, segmentSize };
      throw error;
    }
  }

  async resumeDirectPublisherUpload(uploadId, data, options = {}) {
    return this.putDirectPublisher(data, { ...options, uploadId, directPublisher: true });
  }

  async createDirectUpload(payload) {
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/direct-uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._getHeaders() },
      body: JSON.stringify(payload)
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to create direct upload: HTTP ${res.status}`);
    return body.upload;
  }

  async getDirectUpload(uploadId) {
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/direct-uploads/${encodeURIComponent(uploadId)}`, { headers: this._getHeaders() });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to read direct upload: HTTP ${res.status}`);
    return body.upload;
  }

  async authorizeDirectSegment(uploadId, segmentIndex, ciphertextSha256, sendObjectTo = null) {
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/direct-uploads/${encodeURIComponent(uploadId)}/segments/${segmentIndex}/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._getHeaders() },
      body: JSON.stringify({ ciphertextSha256, ...(sendObjectTo ? { sendObjectTo } : {}) })
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to authorize segment ${segmentIndex}: HTTP ${res.status}`);
    return body.authorization;
  }

  async completeDirectSegment(uploadId, segmentIndex, payload) {
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/direct-uploads/${encodeURIComponent(uploadId)}/segments/${segmentIndex}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._getHeaders() },
      body: JSON.stringify(payload)
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to complete segment ${segmentIndex}: HTTP ${res.status}`);
    return body.upload;
  }

  async finalizeDirectUpload(uploadId) {
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/direct-uploads/${encodeURIComponent(uploadId)}/finalize`, {
      method: "POST",
      headers: this._getHeaders()
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to finalize direct upload: HTTP ${res.status}`);
    return body;
  }

  async _encryptDirectSegment(data, segment, keyHex, ivHex, chunkSize) {
    // The client keeps one segment, never the complete file, in memory. For a
    // production 500 GiB profile, replace this bounded buffer with a browser
    // ReadableStream once the selected publisher accepts chunked request bodies.
    const ciphertext = new Uint8Array(segment.ciphertextSize);
    let offset = 0;
    for (let chunkOffset = 0; chunkOffset < segment.chunkCount; chunkOffset++) {
      const start = segment.plainStart + (chunkOffset * chunkSize);
      const end = Math.min(start + chunkSize, segment.plainEnd);
      const plaintext = await this._readSourceChunk(data, start, end);
      const encrypted = await NodusCrypto.encryptChunk(plaintext, keyHex, ivHex, segment.chunkStart + chunkOffset);
      ciphertext.set(encrypted, offset);
      offset += encrypted.byteLength;
    }
    if (offset !== ciphertext.byteLength) throw new Error("Encrypted segment size mismatch");
    return { ciphertext, ciphertextSha256: await NodusCrypto.sha256Hex(ciphertext) };
  }

  async _readPublisherResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { message: text.slice(0, 512) }; }
  }

  _publisherBlobId(response) {
    return response?.newlyCreated?.blobObject?.blobId || response?.alreadyCertified?.blobId || response?.blobId || response?.blob_id || null;
  }

  async createResumableUpload(payload) {
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._getHeaders() },
      body: JSON.stringify(payload)
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to create resumable upload: HTTP ${res.status}`);
    return body.upload;
  }

  async getResumableUpload(uploadId) {
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/uploads/${encodeURIComponent(uploadId)}`, {
      headers: this._getHeaders()
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to read resumable upload: HTTP ${res.status}`);
    return body.upload;
  }

  async uploadResumablePart(uploadId, partNumber, data, checksum) {
    const res = await this._fetch(
      `${this.gatewayUrl}/api/assets/uploads/${encodeURIComponent(uploadId)}/parts/${partNumber}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-part-sha256": checksum,
          ...this._getHeaders(false)
        },
        body: data
      }
    );
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to upload part ${partNumber}: HTTP ${res.status}`);
    return body;
  }

  async completeResumableUpload(uploadId) {
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/uploads/${encodeURIComponent(uploadId)}/complete`, {
      method: "POST",
      headers: this._getHeaders()
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to complete resumable upload: HTTP ${res.status}`);
    return body;
  }

  async abortResumableUpload(uploadId) {
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/uploads/${encodeURIComponent(uploadId)}`, {
      method: "DELETE",
      headers: this._getHeaders()
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to abort resumable upload: HTTP ${res.status}`);
    return body;
  }

  /**
   * Retrieves an asset from Walrus via the gateway.
   * If the asset was encrypted, decrypts on-device and returns plaintext binary.
   *
   * @param {string} fileId
   * @param {object} [options]
   * @param {string} [options.key] - Override decryption key
   * @param {string} [options.iv] - Override decryption IV
   * @returns {Promise<{ data: Uint8Array, name: string, type: string, size: number }>}
   */
  async get(fileId, options = {}) {
    if (!fileId) throw new Error("fileId is required");

    const res = await this._fetch(`${this.gatewayUrl}/api/photos/${fileId}/stream`, {
      headers: this._getHeaders()
    });

    if (!res.ok) {
      throw new Error(`Failed to retrieve asset ${fileId}: HTTP ${res.status}`);
    }

    const isEncrypted = res.headers.get("x-nodus-encrypted") === "true";
    const ivHex = options.iv || res.headers.get("x-nodus-iv");
    const keyHex = options.key || res.headers.get("x-nodus-key");
    const encryptionMode = res.headers.get("x-nodus-encryption-mode") || "aes-gcm-v1";
    const chunkSize = Number(res.headers.get("x-nodus-chunk-size"));
    const chunkCount = Number(res.headers.get("x-nodus-chunk-count"));
    const originalSize = Number(res.headers.get("x-nodus-original-size"));
    const originalType = res.headers.get("x-nodus-original-type") || res.headers.get("content-type") || "application/octet-stream";
    const originalName = res.headers.get("x-nodus-original-name") || fileId;

    const arrayBuffer = await res.arrayBuffer();
    let dataBytes = new Uint8Array(arrayBuffer);

    if (isEncrypted) {
      if (!keyHex || !ivHex) {
        throw new Error(`Asset ${fileId} is encrypted but missing key or IV parameters`);
      }
      if (encryptionMode === "chunked-aes-gcm-v1") {
        if (!Number.isSafeInteger(chunkSize) || !Number.isSafeInteger(chunkCount) || !Number.isSafeInteger(originalSize)) {
          throw new Error(`Asset ${fileId} is missing resumable encryption metadata`);
        }
        const plaintext = new Uint8Array(originalSize);
        let ciphertextOffset = 0;
        let plaintextOffset = 0;
        for (let index = 0; index < chunkCount; index++) {
          const plainLength = Math.min(chunkSize, originalSize - plaintextOffset);
          const cipherLength = plainLength + 16;
          const decryptedChunk = await NodusCrypto.decryptChunk(
            dataBytes.slice(ciphertextOffset, ciphertextOffset + cipherLength),
            keyHex,
            ivHex,
            index
          );
          plaintext.set(decryptedChunk, plaintextOffset);
          ciphertextOffset += cipherLength;
          plaintextOffset += decryptedChunk.byteLength;
        }
        dataBytes = plaintext;
      } else {
        dataBytes = await NodusCrypto.decryptBuffer(dataBytes, keyHex, ivHex);
      }
    }

    return {
      data: dataBytes,
      name: originalName,
      type: originalType,
      size: dataBytes.byteLength,
      encrypted: isEncrypted
    };
  }

  /**
   * Lists assets anchored in the user's bucket and populates the local search index.
   * @param {object} [filters]
   * @returns {Promise<object[]>}
   */
  async list(filters = {}) {
    const res = await this._fetch(`${this.gatewayUrl}/api/photos`, {
      headers: this._getHeaders()
    });
    if (!res.ok) throw new Error(`Failed to list assets: HTTP ${res.status}`);
    const data = await res.json();
    const photos = data.photos || [];

    // Automatically index documents for client-side search
    this.searchIndex.indexAll(photos);

    if (filters.tag) {
      return photos.filter((p) => (p.tags || []).includes(filters.tag));
    }
    return photos;
  }

  /**
   * Executes a private, zero-knowledge search over locally indexed assets.
   * Queries NEVER leave the user's process or device.
   *
   * @param {string} query
   * @param {object} [options]
   * @returns {Promise<object[]>}
   */
  async search(query, options = {}) {
    // If index is empty, fetch catalog once to populate
    if (this.searchIndex.documents.size === 0) {
      await this.list();
    }
    return this.searchIndex.search(query, options);
  }

  /**
   * Deletes an asset, revokes decryption mapping, and enforces verifiable crypto-shredding.
   *
   * @param {string} fileId
   * @returns {Promise<{ success: boolean, deleted: boolean }>}
   */
  async delete(fileId) {
    if (!fileId) throw new Error("fileId is required");

    const res = await this._fetch(`${this.gatewayUrl}/api/photos/${fileId}`, {
      method: "DELETE",
      headers: this._getHeaders()
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(`Failed to delete asset ${fileId}: ${data.error || `HTTP ${res.status}`}`);
    }

    this.searchIndex.documents.delete(fileId);
    return { success: true, deleted: true };
  }

  /**
   * Request a Sign-In With Solana (SIWS) authentication challenge.
   * @param {string} address - Base58 Solana public key
   * @param {string} [domain='nodus.cloud']
   * @returns {Promise<{ nonce: string, message: string, expiresAt: string }>}
   */
  async getSolanaChallenge(address, domain = "nodus.cloud") {
    const res = await this._fetch(`${this.gatewayUrl}/api/auth/solana/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, domain })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  /**
   * Verify a signed Solana challenge and authenticate the client session.
   * @param {string} address - Base58 Solana public key
   * @param {string} signature - Base58 encoded 64-byte Ed25519 signature
   * @param {string} [message] - Message string that was signed
   * @returns {Promise<object>} Authenticated session info
   */
  async verifySolanaAuth(address, signature, message) {
    const res = await this._fetch(`${this.gatewayUrl}/api/auth/solana/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature, message })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    this.userAddress = address;
    return data;
  }

  /**
   * List organizations for the authenticated Solana user.
   * @param {string} [address] - Optional override address
   * @returns {Promise<object[]>}
   */
  async listOrganizations(address) {
    const targetAddr = address || this.userAddress;
    const url = targetAddr
      ? `${this.gatewayUrl}/api/orgs?address=${encodeURIComponent(targetAddr)}`
      : `${this.gatewayUrl}/api/orgs`;
    const res = await this._fetch(url, { headers: this._getHeaders() });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    return data.organizations || [];
  }

  /**
   * Create an organization with Anchor Org PDA.
   * @param {object} params
   * @param {string} params.orgId
   * @param {string} [params.name]
   * @param {string} params.ownerAddress
   * @param {number} [params.storageCapBytes]
   * @returns {Promise<object>}
   */
  async createOrganization(params) {
    const res = await this._fetch(`${this.gatewayUrl}/api/orgs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._getHeaders() },
      body: JSON.stringify(params)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    return data.organization;
  }

  /**
   * Retrieve organization details and verifiable Anchor PDA proof.
   * @param {string} orgId
   * @returns {Promise<object>}
   */
  async getOrganization(orgId) {
    const res = await this._fetch(`${this.gatewayUrl}/api/orgs/${orgId}`, {
      headers: this._getHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    return data.organization;
  }

  /**
   * Add a member to an organization with a specified role.
   * @param {string} orgId
   * @param {object} params
   * @param {string} params.memberAddress
   * @param {string} [params.role='viewer']
   * @param {string} params.callerAddress
   * @returns {Promise<object>}
   */
  async addOrganizationMember(orgId, params) {
    const res = await this._fetch(`${this.gatewayUrl}/api/orgs/${orgId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._getHeaders() },
      body: JSON.stringify(params)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    return data.member;
  }

  /**
   * Remove a member from an organization.
   * @param {string} orgId
   * @param {string} memberAddress
   * @param {string} [callerAddress]
   * @returns {Promise<boolean>}
   */
  async removeOrganizationMember(orgId, memberAddress, callerAddress) {
    const caller = callerAddress || this.userAddress;
    const res = await this._fetch(
      `${this.gatewayUrl}/api/orgs/${orgId}/members/${encodeURIComponent(memberAddress)}?callerAddress=${encodeURIComponent(caller || "")}`,
      {
        method: "DELETE",
        headers: this._getHeaders()
      }
    );
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    return data.removed;
  }

  deriveOrgPDA(orgId) {
    return deriveOrgPDA(orgId);
  }

  deriveMemberPDA(orgPDA, memberAddress) {
    return deriveMemberPDA(orgPDA, memberAddress);
  }

  _sourceSize(data) {
    if (typeof data === "string") return new TextEncoder().encode(data).byteLength;
    if (data instanceof ArrayBuffer) return data.byteLength;
    if (data instanceof Uint8Array) return data.byteLength;
    if (typeof Blob !== "undefined" && data instanceof Blob) return data.size;
    throw new Error("Unsupported data format. Provide Uint8Array, ArrayBuffer, Blob, or string.");
  }

  async _readSourceChunk(data, start, end) {
    if (typeof data === "string") {
      return new TextEncoder().encode(data).slice(start, end);
    }
    if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(start, end));
    if (data instanceof Uint8Array) return data.slice(start, end);
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      return new Uint8Array(await data.slice(start, end).arrayBuffer());
    }
    throw new Error("Unsupported data format. Provide Uint8Array, ArrayBuffer, Blob, or string.");
  }

  _indexRecord(record, defaults = {}) {
    if (!record) return;
    if (!record.tags || record.tags.length === 0) record.tags = defaults.tags || [];
    if (!record.description) record.description = defaults.description || "";
    if (!record.original_type) record.original_type = defaults.type || "application/octet-stream";
    if (!record.original_name) record.original_name = defaults.name || record.name;
    if (!record.name) record.name = defaults.name || record.original_name;
    this.searchIndex.indexDocument(record);
  }

  _getHeaders(includeJson = true) {
    const headers = {};
    if (includeJson) headers["Accept"] = "application/json";
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
    if (this.userAddress) headers["x-solana-address"] = this.userAddress;
    return headers;
  }
}

/**
 * Factory helper for initializing the Nodus client.
 * @param {object} [config]
 * @returns {NodusClient}
 */
export function createNodusClient(config) {
  return new NodusClient(config);
}

export default NodusClient;
