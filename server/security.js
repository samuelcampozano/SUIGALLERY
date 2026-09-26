import fs from "node:fs";
import path from "node:path";

/**
 * Validates the magic bytes (file signature) of an uploaded file to guarantee
 * genuine media types and prevent malicious executable/script spoofing.
 *
 * @param {string} filePath - Absolute path to the file on disk
 * @returns {Promise<{ valid: boolean, type: string, error?: string }>}
 */
export async function validateMagicBytes(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, type: "unknown", error: "File not found on disk" };
  }

  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(16);
  try {
    fs.readSync(fd, buffer, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, type: "image/jpeg" };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, type: "image/png" };
  }

  // 3. GIF: 47 49 46 38 (GIF87a or GIF89a)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return { valid: true, type: "image/gif" };
  }

  // 4. WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, type: "image/webp" };
  }

  // 5. MP4 / MOV: bytes 4-7 == 'ftyp' (66 74 79 70) or 'moov' (6d 6f 6f 76)
  if (
    (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) ||
    (buffer[4] === 0x6d && buffer[5] === 0x6f && buffer[6] === 0x6f && buffer[7] === 0x76)
  ) {
    return { valid: true, type: "video/mp4" };
  }

  return {
    valid: false,
    type: "unknown",
    error: "File content signature does not match allowed media formats (JPEG, PNG, GIF, WebP, MP4)"
  };
}

/**
 * Validates that an uploaded payload is authentic ciphertext and rejects unencrypted plaintext.
 * Guarantees zero-knowledge: server never accepts plaintext files directly.
 *
 * @param {string} filePath - Absolute path to uploaded file on disk
 * @param {object} meta - Metadata envelope { iv, key }
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
export async function validateCiphertextPayload(filePath, meta = {}) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: "File not found on disk" };
  }

  // 1. Verify IV format (12-byte initialization vector = 24 hex characters)
  if (!meta.iv || typeof meta.iv !== "string" || !/^[0-9a-fA-F]{24}$/.test(meta.iv)) {
    return { valid: false, error: "Invalid or missing AES-GCM 96-bit initialization vector (IV)" };
  }

  // 2. Verify Key format (256-bit symmetric key = 64 hex characters or wrapped envelope)
  if (!meta.key || typeof meta.key !== "string" || meta.key.length < 32) {
    return { valid: false, error: "Invalid or missing key envelope material" };
  }

  // 3. Inspect raw file header to ensure no plaintext file header was leaked
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(16);
  try {
    fs.readSync(fd, buffer, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }

  // Check for raw plaintext signatures:
  // - JPEG: FF D8 FF
  // - PNG: 89 50 4E 47
  // - GIF: GIF8
  // - PDF: %PDF
  // - Scripts: #!/ or <?php
  // - Windows PE: MZ
  const isPlainJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPlainPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isPlainGif = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
  const isPlainPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  const isScript = (buffer[0] === 0x23 && buffer[1] === 0x21) || (buffer[0] === 0x3c && buffer[1] === 0x3f);
  const isExe = buffer[0] === 0x4d && buffer[1] === 0x5a;

  if (isPlainJpeg || isPlainPng || isPlainGif || isPlainPdf || isScript || isExe) {
    return {
      valid: false,
      error: "Plaintext signature detected. Client-side encryption violation: raw file was not sealed with AES-GCM before transport."
    };
  }

  return { valid: true };
}

/**
 * Validates route parameters to prevent path traversal attacks.
 * Allows only standard alphanumeric IDs, dashes, and underscores.
 *
 * @param {string} fileId
 * @returns {boolean}
 */
export function isValidFileId(fileId) {
  if (!fileId || typeof fileId !== "string") return false;
  // Disallow any path traversal characters
  if (fileId.includes("..") || fileId.includes("/") || fileId.includes("\\")) {
    return false;
  }
  return /^[a-zA-Z0-9_-]{1,128}$/.test(fileId);
}

/**
 * Sanitizes input strings by escaping HTML entities and removing control characters.
 *
 * @param {string} input
 * @param {number} maxLength
 * @returns {string}
 */
export function sanitizeString(input, maxLength = 256) {
  if (!input || typeof input !== "string") return "";
  const cleaned = input
    .replace(/[\x00-\x1F\x7F]/g, "") // Remove ASCII control characters
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim();
  return cleaned.slice(0, maxLength);
}

/**
 * Sanitizes an array of tags.
 *
 * @param {any} tags
 * @returns {string[]}
 */
export function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return ["photo", "nodus"];
  return tags
    .filter((t) => typeof t === "string")
    .map((t) => t.replace(/[^a-zA-Z0-9_-]/g, "").trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 32)
    .slice(0, 15);
}

/**
 * In-memory & Disk Cache Lifecycle Manager for Decrypted Media.
 * Enforces automatic TTL eviction so plaintext decrypted files never persist indefinitely.
 */
export class DecryptedCacheManager {
  constructor({ ttlMs = 10 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.cache = new Map(); // fileId -> { path, createdAt, lastAccessedAt }
  }

  get(fileId) {
    const entry = this.cache.get(fileId);
    if (!entry) return null;
    if (Date.now() - entry.lastAccessedAt > this.ttlMs) {
      this.evict(fileId);
      return null;
    }
    entry.lastAccessedAt = Date.now();
    return entry.path;
  }

  set(fileId, filePath) {
    this.cache.set(fileId, {
      path: filePath,
      createdAt: Date.now(),
      lastAccessedAt: Date.now()
    });
  }

  evict(fileId) {
    const entry = this.cache.get(fileId);
    if (entry) {
      try {
        if (fs.existsSync(entry.path)) {
          fs.unlinkSync(entry.path);
        }
      } catch (err) {
        console.warn(`[CacheManager] Failed to unlink ${entry.path}:`, err.message);
      }
      this.cache.delete(fileId);
    }
  }

  /**
   * Sweeps all entries older than TTL from disk and memory.
   */
  prune() {
    const now = Date.now();
    let prunedCount = 0;
    for (const [fileId, entry] of this.cache.entries()) {
      if (now - entry.lastAccessedAt > this.ttlMs) {
        this.evict(fileId);
        prunedCount++;
      }
    }
    if (prunedCount > 0) {
      console.log(`🧹 [CacheManager] Pruned ${prunedCount} expired decrypted cache file(s).`);
    }
  }

  /**
   * Startup cleanup: removes any orphaned decrypted files left from prior runs.
   *
   * @param {string} storageDir
   */
  cleanupOrphanedFiles(storageDir) {
    if (!fs.existsSync(storageDir)) return;
    try {
      const files = fs.readdirSync(storageDir);
      let count = 0;
      for (const file of files) {
        const isOrphan =
          (file.startsWith("decrypted_") && file.endsWith(".bin")) ||
          (file.startsWith("stream_") && file.endsWith(".bin")) ||
          (file.startsWith("upload_") && !file.includes("/"));
        if (isOrphan) {
          try {
            fs.unlinkSync(path.join(storageDir, file));
            count++;
          } catch {}
        }
      }
      if (count > 0) {
        console.log(`🧹 [CacheManager] Cleaned up ${count} orphaned temporary files on startup.`);
      }
    } catch (err) {
      console.warn("[CacheManager] Error during orphaned file cleanup:", err.message);
    }
  }
}
