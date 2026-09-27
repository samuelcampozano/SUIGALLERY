/**
 * @fileoverview Nodus Developer SDK (@nodus/sdk)
 * Isomorphic client library for Node.js (v20+) and modern browsers.
 * Provides zero-knowledge client-side encryption, decentralized Walrus storage,
 * and private search primitives.
 */

import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const DEFAULT_NODUS_PROGRAM_ID = "NodUS11111111111111111111111111111111111111";
export const DEFAULT_RESUMABLE_THRESHOLD_BYTES = 20 * 1024 * 1024;
export const DEFAULT_RESUMABLE_CHUNK_SIZE = 8 * 1024 * 1024;
export const DEFAULT_DIRECT_PUBLISHER_SEGMENT_SIZE = 64 * 1024 * 1024;
export const DEFAULT_DIRECT_UPLOAD_CONCURRENCY = 3;
export const DEFAULT_DIRECT_UPLOAD_MAX_RETRIES = 4;

/** Controls an in-flight large upload without ever retaining its data key. */
export class NodusUploadControl {
  constructor() {
    this.paused = false;
    this.cancelled = false;
    this._resumeWaiters = [];
  }

  pause() { this.paused = true; }

  resume() {
    this.paused = false;
    for (const resolve of this._resumeWaiters.splice(0)) resolve();
  }

  cancel() {
    this.cancelled = true;
    this.resume();
  }

  async waitUntilReady() {
    if (this.cancelled) throw new Error("Upload cancelled");
    while (this.paused && !this.cancelled) await new Promise((resolve) => this._resumeWaiters.push(resolve));
    if (this.cancelled) throw new Error("Upload cancelled");
  }
}

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

  bytesToHex(bytes) {
    return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  },

  hexToBytes(hex) {
    if (typeof hex !== "string" || !/^[a-f0-9]+$/i.test(hex) || hex.length % 2) throw new Error("Invalid hexadecimal value");
    return new Uint8Array(hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
  },

  async createEnvelopeIdentity({ recovery = true } = {}) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error("WebCrypto (crypto.subtle) is not available in this environment.");
    const createPair = async () => {
      const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      return { publicKey: await subtle.exportKey("jwk", pair.publicKey), privateKey: await subtle.exportKey("jwk", pair.privateKey) };
    };
    const primary = await createPair();
    const recoveryPair = recovery ? await createPair() : null;
    return {
      version: 1,
      algorithm: "ECDH-P256/AES-256-GCM",
      primaryPublicKey: primary.publicKey,
      primaryPrivateKey: primary.privateKey,
      recoveryPublicKey: recoveryPair?.publicKey || null,
      recoveryPrivateKey: recoveryPair?.privateKey || null
    };
  },

  async wrapDataKey(dataKeyHex, recipientPublicKey, { assetId, recipientAddress, recipientType = "user", organizationId = null } = {}) {
    const subtle = globalThis.crypto?.subtle;
    const recipient = await subtle.importKey("jwk", recipientPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const ephemeral = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const shared = await subtle.deriveBits({ name: "ECDH", public: recipient }, ephemeral.privateKey, 256);
    const wrappingKey = await subtle.importKey("raw", shared, { name: "AES-GCM" }, false, ["encrypt"]);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const aad = new TextEncoder().encode(`nodus:key-envelope:v1:${assetId}:${recipientAddress}:${recipientType}:${organizationId || "personal"}`);
    const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, wrappingKey, this.hexToBytes(dataKeyHex));
    return {
      recipientAddress,
      recipientType,
      organizationId,
      algorithm: "ECDH-P256/AES-256-GCM",
      ephemeralPublicKey: await subtle.exportKey("jwk", ephemeral.publicKey),
      iv: this.bytesToHex(iv),
      ciphertext: this.bytesToHex(ciphertext)
    };
  },

  async unwrapDataKey(envelope, recipientPrivateKey, { assetId } = {}) {
    const subtle = globalThis.crypto?.subtle;
    const privateKey = await subtle.importKey("jwk", recipientPrivateKey, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const ephemeral = await subtle.importKey("jwk", envelope.ephemeralPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = await subtle.deriveBits({ name: "ECDH", public: ephemeral }, privateKey, 256);
    const wrappingKey = await subtle.importKey("raw", shared, { name: "AES-GCM" }, false, ["decrypt"]);
    const aad = new TextEncoder().encode(`nodus:key-envelope:v1:${assetId}:${envelope.recipientAddress}:${envelope.recipientType}:${envelope.organizationId || "personal"}`);
    const plaintext = await subtle.decrypt({ name: "AES-GCM", iv: this.hexToBytes(envelope.iv), additionalData: aad }, wrappingKey, this.hexToBytes(envelope.ciphertext));
    return this.bytesToHex(plaintext);
  },

  async createRecoveryKit(identity, passphrase) {
    if (!identity?.recoveryPrivateKey || typeof passphrase !== "string" || passphrase.length < 12) {
      throw new Error("A recovery identity and a passphrase of at least 12 characters are required");
    }
    const subtle = globalThis.crypto?.subtle;
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const material = await subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    const key = await subtle.deriveKey({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const payload = new TextEncoder().encode(JSON.stringify({ version: 1, recoveryPrivateKey: identity.recoveryPrivateKey }));
    const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, payload);
    return { version: 1, algorithm: "PBKDF2-SHA256/AES-256-GCM", iterations: 210000, salt: this.bytesToHex(salt), iv: this.bytesToHex(iv), ciphertext: this.bytesToHex(ciphertext) };
  },

  async openRecoveryKit(kit, passphrase) {
    if (!kit || kit.algorithm !== "PBKDF2-SHA256/AES-256-GCM" || typeof passphrase !== "string") throw new Error("Invalid recovery kit");
    const subtle = globalThis.crypto?.subtle;
    const material = await subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    const key = await subtle.deriveKey({ name: "PBKDF2", salt: this.hexToBytes(kit.salt), iterations: kit.iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plaintext = await subtle.decrypt({ name: "AES-GCM", iv: this.hexToBytes(kit.iv) }, key, this.hexToBytes(kit.ciphertext));
    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    if (!payload?.recoveryPrivateKey) throw new Error("Recovery kit has no recovery identity");
    return payload.recoveryPrivateKey;
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
   * @param {string} [config.accessToken] - Persistent tenant session token
   * @param {Function} [config.fetch] - Custom fetch polyfill
   */
  constructor(config = {}) {
    this.gatewayUrl = (config.gatewayUrl || "http://localhost:3000").replace(/\/+$/, "");
    this.apiKey = config.apiKey || null;
    this.accessToken = config.accessToken || null;
    this.organizationId = config.organizationId || null;
    this._fetch = config.fetch || globalThis.fetch.bind(globalThis);
    this.searchIndex = new NodusSearchIndex();
    // Ephemeral device-local mapping. It is never serialized into an upload,
    // session, catalog entry, or HTTP header.
    this.keyCache = new Map();
    this.keyIdentity = config.keyIdentity || null;
    this.resumeStorage = config.resumeStorage || globalThis.localStorage || null;
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
    // Large objects never traverse the gateway. A caller can explicitly opt out
    // while migrating an older publisher integration, but should not do so for
    // production-scale uploads.
    if (options.directPublisher !== false && options.resumable !== true && sourceSize > resumableThreshold) {
      return this.putDirectPublisher(data, { ...options, name, type, description, tags, encrypt });
    }
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
      if (encrypt && record.id) {
        this.keyCache.set(record.id, keyHex);
        await this._protectUploadedAsset(record.id, options);
      }
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
   * the locally retained encryption key and IV, then call
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
    this._saveUploadReference(upload, "resumable");
    const startedAt = Date.now();
    try {
      for (let partNumber = 0; partNumber < chunkCount; partNumber++) {
        await this._waitForUploadControl(options.control);
        if (received.has(partNumber)) continue;
        const start = partNumber * chunkSize;
        const end = Math.min(start + chunkSize, originalSize);
        const plaintextPart = await this._readSourceChunk(data, start, end);
        const ciphertextPart = await NodusCrypto.encryptChunk(plaintextPart, keyHex, ivHex, partNumber);
        const checksum = await NodusCrypto.sha256Hex(ciphertextPart);
        await this.uploadResumablePart(upload.uploadId, partNumber, ciphertextPart, checksum);
        this._emitUploadProgress(options, {
            uploadId: upload.uploadId,
            partNumber,
            partCount: chunkCount,
            uploadedBytes: Math.min(end, originalSize),
            totalBytes: originalSize,
            startedAt
          });
      }

      const completed = await this.completeResumableUpload(upload.uploadId);
      this._removeUploadReference(upload.uploadId);
      const record = completed.asset || completed.result;
      if (record) this._indexRecord(record, { name, type, description, tags });
      if (record?.id || record?.fileId) {
        const assetId = record.id || record.fileId;
        this.keyCache.set(assetId, keyHex);
        await this._protectUploadedAsset(assetId, options);
      }
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
      if (this._isCancellation(error, options.control)) {
        await this.abortResumableUpload(upload.uploadId).catch(() => {});
        this._removeUploadReference(upload.uploadId);
      }
      error.uploadId = upload.uploadId;
      error.encryption = { key: keyHex, iv: ivHex, chunkSize, chunkCount };
      error.userMessage = this._friendlyUploadError(error);
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
    const pending = upload.segments.filter((segment) => segment.status !== "completed");
      this._saveUploadReference(upload, "direct");
      const startedAt = Date.now();
      const concurrency = Number(options.concurrency || DEFAULT_DIRECT_UPLOAD_CONCURRENCY);
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5) throw new Error("direct upload concurrency must be between 1 and 5");
      const maxRetries = Number(options.maxRetries || DEFAULT_DIRECT_UPLOAD_MAX_RETRIES);
      if (!Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 8) throw new Error("direct upload maxRetries must be between 1 and 8");

      let nextIndex = 0;
      let uploadedBytes = upload.segments
        .filter((segment) => segment.status === "completed")
        .reduce((total, segment) => total + segment.plainSize, 0);
      const publishOne = async (segment) => {
        await this._waitForUploadControl(options.control);
        await this._withExponentialBackoff(async () => {
          const { ciphertextSha256, chunkSha256s, ciphertextStream } = await this._prepareDirectSegmentUpload(data, segment, keyHex, ivHex, chunkSize);
          const authorization = await this.authorizeDirectSegment(upload.uploadId, segment.index, ciphertextSha256, options.sendObjectTo);
          const request = {
            method: authorization.method || "PUT",
            headers: authorization.headers,
            body: ciphertextStream,
            // Required by Node's fetch and supported by Chromium for request streams.
            duplex: "half"
          };
          const published = await this._fetch(authorization.uploadUrl, request);
          const publisherResponse = await this._readPublisherResponse(published);
          if (!published.ok) throw new Error(publisherResponse?.error || publisherResponse?.message || `Publisher rejected segment ${segment.index}: HTTP ${published.status}`);
          if (!this._publisherBlobId(publisherResponse)) throw new Error(`Publisher did not return a blob ID for segment ${segment.index}`);
          await this.completeDirectSegment(upload.uploadId, segment.index, { ciphertextSha256, chunkSha256s, publisherResponse, receipt: publisherResponse?.receipt });
        }, maxRetries);
        uploadedBytes += segment.plainSize;
        this._emitUploadProgress(options, { uploadId: upload.uploadId, segmentIndex: segment.index, segmentCount: upload.segmentCount, uploadedBytes, totalBytes: originalSize, startedAt });
      };
      const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
        while (nextIndex < pending.length) {
          const segment = pending[nextIndex++];
          await publishOne(segment);
        }
      });
      await Promise.all(workers);
      const completed = await this.finalizeDirectUpload(upload.uploadId);
      this._removeUploadReference(upload.uploadId);
      const record = completed.asset;
      if (record) this._indexRecord(record, { name, type, description, tags });
      if (record?.id) {
        this.keyCache.set(record.id, keyHex);
        await this._protectUploadedAsset(record.id, options);
      }
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
      if (this._isCancellation(error, options.control)) {
        await this.abortDirectUpload(upload.uploadId).catch(() => {});
        this._removeUploadReference(upload.uploadId);
      }
      error.uploadId = upload.uploadId;
      error.encryption = { key: keyHex, iv: ivHex, chunkSize, segmentSize };
      error.userMessage = this._friendlyUploadError(error);
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

  async abortDirectUpload(uploadId) {
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/direct-uploads/${encodeURIComponent(uploadId)}`, {
      method: "DELETE",
      headers: this._getHeaders()
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to abort direct upload: HTTP ${res.status}`);
    return body;
  }

  /** Returns browser-persistent upload references, never plaintext or data keys. */
  listPendingUploadReferences() {
    if (!this.resumeStorage) return [];
    const prefix = this._resumeStoragePrefix();
    const references = [];
    for (let index = 0; index < this.resumeStorage.length; index++) {
      const key = this.resumeStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      try { references.push(JSON.parse(this.resumeStorage.getItem(key))); } catch {}
    }
    return references.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getDirectManifest(assetId) {
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/${encodeURIComponent(assetId)}/direct-manifest`, {
      headers: this._getHeaders()
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to read direct asset manifest: HTTP ${res.status}`);
    await this._verifyDirectManifest(body.manifest);
    return body.manifest;
  }

  /**
   * Streams an authenticated-publisher asset and decrypts each AES-GCM chunk
   * as it arrives. No complete ciphertext segment or plaintext file is kept in
   * memory. For non-direct legacy assets, use get().
   */
  async stream(fileId, options = {}) {
    if (!fileId?.startsWith("direct_")) {
      throw new Error("Streaming is currently available for direct publisher assets only");
    }
    const manifest = await this.getDirectManifest(fileId);
    const keyHex = options.key || this.keyCache.get(fileId) || await this.recoverAssetKey(fileId, options);
    const ivHex = options.iv || manifest.encryption?.iv;
    if (!keyHex || !ivHex) {
      throw new Error(`Asset ${fileId} is encrypted; provide its device-local key to stream it`);
    }
    const chunkSize = Number(manifest.encryption?.chunkSize);
    if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) {
      throw new Error(`Asset ${fileId} has invalid chunk encryption metadata`);
    }

    const requestedRange = this._parsePlainRange(options.range, manifest.originalSize);
    const selectedSegments = manifest.segments.filter((segment) => !requestedRange
      || (segment.plainEnd > requestedRange.start && segment.plainStart <= requestedRange.end));
    return new ReadableStream({
      start: async (controller) => {
        try {
          for (const segment of selectedSegments) {
            const requestedStart = requestedRange ? Math.max(requestedRange.start, segment.plainStart) : segment.plainStart;
            const requestedEndExclusive = requestedRange ? Math.min(requestedRange.end + 1, segment.plainEnd) : segment.plainEnd;
            const firstChunk = Math.floor((requestedStart - segment.plainStart) / chunkSize);
            const lastChunk = Math.ceil((requestedEndExclusive - segment.plainStart) / chunkSize) - 1;
            const ciphertextStart = firstChunk * (chunkSize + 16);
            const lastPlainLength = Math.min(chunkSize, segment.plainSize - (lastChunk * chunkSize));
            const ciphertextEnd = (lastChunk * (chunkSize + 16)) + lastPlainLength + 15;
            const response = await this._fetch(
              `${this.gatewayUrl}/api/assets/${encodeURIComponent(fileId)}/direct-segments/${segment.index}`,
              { headers: { ...this._getHeaders(), ...(requestedRange ? { Range: `bytes=${ciphertextStart}-${ciphertextEnd}` } : {}) } }
            );
            if (!response.ok || !response.body) {
              throw new Error(`Failed to read direct segment ${segment.index}: HTTP ${response.status}`);
            }
            const reader = response.body.getReader();
            let pending = new Uint8Array();
            let plainOffset = firstChunk * chunkSize;
            let chunkOffset = firstChunk;
            const consume = async () => {
              while (chunkOffset <= lastChunk) {
                const plainLength = Math.min(chunkSize, segment.plainSize - plainOffset);
                const ciphertextLength = plainLength + 16;
                if (pending.byteLength < ciphertextLength) return;
                const ciphertext = pending.slice(0, ciphertextLength);
                pending = pending.slice(ciphertextLength);
                const expectedChunkHash = segment.chunkSha256s?.[chunkOffset];
                if (!expectedChunkHash || await NodusCrypto.sha256Hex(ciphertext) !== expectedChunkHash) {
                  throw new Error(`Ciphertext integrity check failed for direct segment ${segment.index}, chunk ${chunkOffset}`);
                }
                const plaintext = await NodusCrypto.decryptChunk(ciphertext, keyHex, ivHex, segment.chunkStart + chunkOffset);
                const chunkPlainStart = segment.plainStart + plainOffset;
                const from = Math.max(0, requestedStart - chunkPlainStart);
                const to = Math.min(plaintext.byteLength, requestedEndExclusive - chunkPlainStart);
                if (to > from) controller.enqueue(plaintext.slice(from, to));
                plainOffset += plaintext.byteLength;
                chunkOffset++;
              }
            };
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (chunkOffset > lastChunk) continue;
              const combined = new Uint8Array(pending.byteLength + value.byteLength);
              combined.set(pending);
              combined.set(value, pending.byteLength);
              pending = combined;
              await consume();
            }
            await consume();
            if (chunkOffset !== lastChunk + 1 || pending.byteLength !== 0) {
              throw new Error(`Ciphertext length mismatch for direct segment ${segment.index}`);
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });
  }

  async _readStreamFully(stream) {
    const reader = stream.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      length += value.byteLength;
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return data;
  }

  async _prepareDirectSegmentUpload(data, segment, keyHex, ivHex, chunkSize) {
    // The publisher JWT binds a SHA-256 checksum, so hash one deterministic
    // encryption pass before authorization. The second pass is streamed directly
    // to the publisher; no ciphertext segment (up to 1 GiB) is ever allocated.
    const hasher = sha256.create();
    const chunkSha256s = [];
    for (let chunkOffset = 0; chunkOffset < segment.chunkCount; chunkOffset++) {
      const start = segment.plainStart + (chunkOffset * chunkSize);
      const end = Math.min(start + chunkSize, segment.plainEnd);
      const plaintext = await this._readSourceChunk(data, start, end);
      const encrypted = await NodusCrypto.encryptChunk(plaintext, keyHex, ivHex, segment.chunkStart + chunkOffset);
      hasher.update(encrypted);
      chunkSha256s.push(NodusCrypto.bytesToHex(sha256(encrypted)));
    }
    return {
      ciphertextSha256: NodusCrypto.bytesToHex(hasher.digest()),
      chunkSha256s,
      ciphertextStream: this._encryptedSegmentStream(data, segment, keyHex, ivHex, chunkSize)
    };
  }

  _encryptedSegmentStream(data, segment, keyHex, ivHex, chunkSize) {
    let chunkOffset = 0;
    return new ReadableStream({
      pull: async (controller) => {
        if (chunkOffset >= segment.chunkCount) return controller.close();
        const start = segment.plainStart + (chunkOffset * chunkSize);
        const end = Math.min(start + chunkSize, segment.plainEnd);
        const plaintext = await this._readSourceChunk(data, start, end);
        const encrypted = await NodusCrypto.encryptChunk(plaintext, keyHex, ivHex, segment.chunkStart + chunkOffset);
        chunkOffset++;
        controller.enqueue(encrypted);
      }
    });
  }

  async _withExponentialBackoff(operation, maxRetries) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try { return await operation(); } catch (error) {
        lastError = error;
        if (attempt === maxRetries - 1) break;
        const delay = Math.min(2000, 150 * (2 ** attempt)) + Math.floor(Math.random() * 100);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  async _verifyDirectManifest(manifest) {
    if (!manifest || typeof manifest !== "object" || !/^[a-f0-9]{64}$/i.test(manifest.manifestSha256 || "")) {
      throw new Error("Direct manifest is missing its integrity hash");
    }
    const { manifestSha256, ...unsigned } = manifest;
    const actual = await NodusCrypto.sha256Hex(new TextEncoder().encode(JSON.stringify(unsigned)));
    if (actual !== manifestSha256.toLowerCase()) throw new Error("Direct manifest integrity check failed");
  }

  _parsePlainRange(range, size) {
    if (!range) return null;
    const value = typeof range === "string" ? range.replace(/^bytes=/i, "") : `${range.start}-${range.end ?? ""}`;
    const match = /^(\d+)-(\d*)$/.exec(value);
    if (!match) throw new Error("Invalid plaintext range");
    const start = Number(match[1]);
    const end = match[2] === "" ? size - 1 : Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= size) throw new Error("Plaintext range is outside the asset");
    return { start, end };
  }

  async _waitForUploadControl(control) {
    if (control instanceof NodusUploadControl) await control.waitUntilReady();
  }

  _isCancellation(error, control) {
    return control instanceof NodusUploadControl && control.cancelled || error?.message === "Upload cancelled";
  }

  _emitUploadProgress(options, progress) {
    if (typeof options.onProgress !== "function") return;
    const elapsedSeconds = Math.max(0.001, (Date.now() - progress.startedAt) / 1000);
    const bytesPerSecond = progress.uploadedBytes / elapsedSeconds;
    const bytesRemaining = Math.max(0, progress.totalBytes - progress.uploadedBytes);
    options.onProgress({
      ...progress,
      bytesPerSecond,
      bytesRemaining,
      estimatedSecondsRemaining: bytesPerSecond > 0 ? bytesRemaining / bytesPerSecond : null
    });
  }

  _friendlyUploadError(error) {
    const message = String(error?.message || "Upload failed");
    if (/quota/i.test(message)) return "Storage quota exceeded. Free space or upgrade the organization plan, then resume the upload.";
    if (/expired/i.test(message)) return "The upload session expired. Start a new upload session and keep your local key envelope available.";
    if (/publisher/i.test(message) || /network|fetch failed/i.test(message)) return "The storage publisher is temporarily unavailable. Keep the upload reference and retry when the connection is restored.";
    if (/cancelled/i.test(message)) return "Upload cancelled. The reserved quota was released.";
    return message;
  }

  _resumeStoragePrefix() {
    return `nodus:upload-reference:${this.organizationId || "default"}:`;
  }

  _saveUploadReference(upload, kind) {
    if (!this.resumeStorage || !upload?.uploadId) return;
    const reference = {
      uploadId: upload.uploadId,
      assetId: upload.assetId || null,
      kind,
      originalName: upload.originalName,
      originalSize: upload.originalSize,
      expiresAt: upload.expiresAt,
      createdAt: new Date().toISOString()
    };
    try { this.resumeStorage.setItem(`${this._resumeStoragePrefix()}${upload.uploadId}`, JSON.stringify(reference)); } catch {}
  }

  _removeUploadReference(uploadId) {
    if (!this.resumeStorage || !uploadId) return;
    try { this.resumeStorage.removeItem(`${this._resumeStoragePrefix()}${uploadId}`); } catch {}
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

    if (fileId.startsWith("direct_")) {
      const manifest = await this.getDirectManifest(fileId);
      const data = await this._readStreamFully(await this.stream(fileId, options));
      return {
        data,
        name: manifest.originalName || fileId,
        type: manifest.originalType || "application/octet-stream",
        size: data.byteLength,
        encrypted: true
      };
    }

    const res = await this._fetch(`${this.gatewayUrl}/api/photos/${fileId}/stream`, {
      headers: this._getHeaders()
    });

    if (!res.ok) {
      throw new Error(`Failed to retrieve asset ${fileId}: HTTP ${res.status}`);
    }

    const isEncrypted = res.headers.get("x-nodus-encrypted") === "true";
    const ivHex = options.iv || res.headers.get("x-nodus-iv");
    const keyHex = options.key || this.keyCache.get(fileId) || await this.recoverAssetKey(fileId, options);
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
  async verifySolanaAuth(address, signature, message, organizationId = null) {
    const res = await this._fetch(`${this.gatewayUrl}/api/auth/solana/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, signature, message, ...(organizationId ? { organizationId } : {}) })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    this.userAddress = address;
    if (data.accessToken) this.accessToken = data.accessToken;
    if (data.tenant?.organizationId) this.organizationId = data.tenant.organizationId;
    return data;
  }

  /** Creates a device encryption identity and registers only its public half. */
  async bootstrapKeyIdentity({ passphrase } = {}) {
    if (!this.userAddress) throw new Error("Authenticate with Solana before creating an encryption identity");
    const identity = await NodusCrypto.createEnvelopeIdentity();
    await this.registerKeyIdentity(identity);
    const recoveryKit = passphrase ? await NodusCrypto.createRecoveryKit(identity, passphrase) : null;
    return { identity, recoveryKit };
  }

  async registerKeyIdentity(identity) {
    if (!this.userAddress) throw new Error("Authenticate with Solana before registering an encryption identity");
    if (!identity?.primaryPublicKey || !identity?.primaryPrivateKey) throw new Error("A complete device encryption identity is required");
    const res = await this._fetch(`${this.gatewayUrl}/api/key-identities/${encodeURIComponent(this.userAddress)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._getHeaders() },
      body: JSON.stringify({ publicKey: identity.primaryPublicKey, recoveryPublicKey: identity.recoveryPublicKey || null })
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to register encryption identity: HTTP ${res.status}`);
    this.keyIdentity = identity;
    return body.identity;
  }

  async getKeyIdentity(address) {
    const res = await this._fetch(`${this.gatewayUrl}/api/key-identities/${encodeURIComponent(address)}`, { headers: this._getHeaders() });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Encryption identity not found for ${address}`);
    return body.identity;
  }

  async getOrganizationKeyRecipients(orgId) {
    const res = await this._fetch(`${this.gatewayUrl}/api/orgs/${encodeURIComponent(orgId)}/key-recipients`, { headers: this._getHeaders() });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to load organization key recipients: HTTP ${res.status}`);
    return body.recipients || [];
  }

  async protectAssetKey(assetId, { recipientAddresses = [], organizationId = null } = {}) {
    if (!assetId || !this.userAddress || !this.keyIdentity) {
      throw new Error("An authenticated device encryption identity is required to protect an asset key");
    }
    const dataKeyHex = this.keyCache.get(assetId);
    if (!dataKeyHex) throw new Error(`No device-local data key is available for ${assetId}`);
    const activeOrganizationId = organizationId || this.organizationId;
    if (!activeOrganizationId) throw new Error("A tenant organization is required to protect an asset key");
    if (organizationId && this.organizationId && organizationId !== this.organizationId) {
      throw new Error("The requested organization does not match the authenticated tenant");
    }
    const recipients = new Map();
    for (const recipient of await this.getOrganizationKeyRecipients(activeOrganizationId)) {
      recipients.set(recipient.member, { ...recipient, organizationId: activeOrganizationId });
    }
    // The API is deliberately organization-scoped: arbitrary addresses cannot
    // receive an envelope unless they are a member of the active tenant.
    for (const address of recipientAddresses) {
      if (!recipients.has(address)) throw new Error(`Recipient ${address} is not a member of the active organization`);
    }

    const envelopes = [];
    for (const recipient of recipients.values()) {
      if (!recipient.identity?.publicKey) continue;
      envelopes.push(await NodusCrypto.wrapDataKey(dataKeyHex, recipient.identity.publicKey, {
        assetId, recipientAddress: recipient.member, recipientType: "user", organizationId: recipient.organizationId
      }));
      if (recipient.identity.recoveryPublicKey) {
        envelopes.push(await NodusCrypto.wrapDataKey(dataKeyHex, recipient.identity.recoveryPublicKey, {
          assetId, recipientAddress: recipient.member, recipientType: "recovery", organizationId: recipient.organizationId
        }));
      }
    }
    if (!envelopes.length) throw new Error("No recipient encryption identities are registered");
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/${encodeURIComponent(assetId)}/key-envelopes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._getHeaders() },
      body: JSON.stringify({ envelopes })
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Unable to store encrypted key envelopes: HTTP ${res.status}`);
    return body.asset;
  }

  async recoverAssetKey(assetId, { recoveryKit = null, passphrase = null, recoveryPrivateKey = null } = {}) {
    if (!this.userAddress) throw new Error("Authenticate with Solana before recovering an asset key");
    const res = await this._fetch(`${this.gatewayUrl}/api/assets/${encodeURIComponent(assetId)}/key-envelopes`, { headers: this._getHeaders() });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || `Key envelopes not found for ${assetId}`);
    const recoveryKey = recoveryPrivateKey || (recoveryKit ? await NodusCrypto.openRecoveryKit(recoveryKit, passphrase) : null);
    const primary = this.keyIdentity?.primaryPrivateKey || null;
    const candidates = recoveryKey
      ? body.envelopes.filter((entry) => entry.recipientType === "recovery").map((entry) => ({ entry, privateKey: recoveryKey }))
      : body.envelopes.filter((entry) => entry.recipientType === "user" && primary).map((entry) => ({ entry, privateKey: primary }));
    for (const candidate of candidates) {
      try {
        const keyHex = await NodusCrypto.unwrapDataKey(candidate.entry, candidate.privateKey, { assetId });
        this.keyCache.set(assetId, keyHex);
        return keyHex;
      } catch {
        // An envelope for another device/organization member cannot be opened
        // with this private key; try the remaining recipient envelopes.
      }
    }
    throw new Error(`No decryptable key envelope is available for ${assetId}`);
  }

  /** Lists assets that must be re-encrypted after a member's envelope is revoked. */
  async listPendingKeyRotations() {
    const res = await this._fetch(`${this.gatewayUrl}/api/key-rotations/pending`, { headers: this._getHeaders() });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || "Unable to load pending key rotations");
    return body.rotations || [];
  }

  /**
   * Performs strong revocation without server key custody. The SDK decrypts the
   * source asset locally, encrypts a replacement with a fresh data key, creates
   * envelopes for current members, then asks the API to shred the old asset.
   */
  async rotateAssetAfterRevocation({ rotationId, assetId, name, type, description, tags } = {}) {
    if (!rotationId || !assetId) throw new Error("rotationId and assetId are required");
    const source = await this.get(assetId);
    const record = source.record || source;
    const replacement = await this.put(source.data, {
      name: name || record.original_name || record.name,
      type: type || record.original_type || record.content_type,
      description: description || record.description || "Re-encrypted after member revocation",
      tags: tags || record.tags || [],
      organizationId: this.organizationId
    });
    const res = await this._fetch(`${this.gatewayUrl}/api/key-rotations/${encodeURIComponent(rotationId)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._getHeaders() },
      body: JSON.stringify({ replacementAssetId: replacement.id })
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.error || "Unable to complete key rotation");
    this.keyCache.delete(assetId);
    return { replacement, rotation: body.rotation };
  }

  async _protectUploadedAsset(assetId, options) {
    if (!this.keyIdentity || !this.userAddress) {
      if (options?.organizationId) throw new Error("Organization assets require an authenticated device encryption identity");
      return null;
    }
    return this.protectAssetKey(assetId, { organizationId: options?.organizationId || this.organizationId || null });
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
    if (this.accessToken || this.apiKey) headers["Authorization"] = `Bearer ${this.accessToken || this.apiKey}`;
    // Legacy local/demo endpoints still accept this hint. Production routes
    // authenticate exclusively from the bearer session token.
    if (this.userAddress && !this.accessToken) headers["x-solana-address"] = this.userAddress;
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
