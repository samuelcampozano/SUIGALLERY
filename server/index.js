import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { walrus, DEFAULT_SPACE_ID, DEFAULT_BUCKET_ID } from "./walrus-client.js";
import {
  validateMagicBytes,
  validateCiphertextPayload,
  isValidFileId,
  sanitizeString,
  sanitizeTags,
  DecryptedCacheManager
} from "./security.js";
import {
  generateAuthChallenge,
  verifySolanaSignature,
  generateDemoSolanaSession,
  createOrganization,
  getOrganization,
  listUserOrganizations,
  addOrganizationMember,
  removeOrganizationMember,
  deriveOrgPDA,
  deriveMemberPDA,
  NODUS_SOLANA_PROGRAM_ID_STR
} from "./solana.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const tempStorageDir = path.join(rootDir, "temp_storage");

// Ensure temp_storage directory exists
if (!fs.existsSync(tempStorageDir)) {
  fs.mkdirSync(tempStorageDir, { recursive: true });
}

// Initialize Decrypted Cache Lifecycle Manager (10-minute TTL)
const cacheManager = new DecryptedCacheManager({ ttlMs: 10 * 60 * 1000 });

// Startup cleanup: purge stale decrypted files from prior sessions
cacheManager.cleanupOrphanedFiles(tempStorageDir);

// Periodic sweep: clean expired cache files every 5 minutes
const pruneInterval = setInterval(() => {
  cacheManager.prune();
}, 5 * 60 * 1000);
if (typeof pruneInterval.unref === "function") {
  pruneInterval.unref();
}

const app = express();

// 1. Security Headers (Helmet + Custom Content Security Policy)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "https://*.sui.io", "https://*.solana.com", "https://*.walrus.xyz"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// 2. Cross-Origin Resource Sharing
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// 3. Rate Limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please try again later." }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // Limit each IP to 60 uploads per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Upload rate limit exceeded. Please wait a few minutes." }
});

app.use("/api/", apiLimiter);

// Serve static frontend files
const publicDir = path.join(rootDir, "public");
app.use(express.static(publicDir));

// Configure Multer for disk uploads within allowed root
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempStorageDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `upload_${Date.now()}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB max
});

// Helper to determine Content-Type
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".doc":
      return "application/msword";
    case ".txt":
      return "text/plain";
    case ".md":
      return "text/markdown";
    case ".json":
      return "application/json";
    case ".zip":
      return "application/zip";
    case ".tar":
      return "application/x-tar";
    case ".gz":
      return "application/gzip";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Health & Storage Status
app.get("/api/status", async (req, res) => {
  try {
    const [ping, usage, bucket] = await Promise.all([
      walrus.ping().catch(() => ({ ok: false })),
      walrus.getStorageUsage().catch(() => null),
      walrus.getBucketDetails().catch(() => null)
    ]);

    res.json({
      success: true,
      service: "Nodus Sovereign Cloud Backend",
      version: "1.1.0",
      status: ping?.ok ? "connected" : "degraded",
      space: {
        id: DEFAULT_SPACE_ID,
        name: "Personal Space",
        storage_cap_bytes: usage?.storage_cap || 5000000000,
        storage_used_bytes: usage?.storage_used || 0,
        available_bytes: usage?.available || 5000000000,
        percent_used: usage?.percent_used || 0
      },
      bucket: {
        id: DEFAULT_BUCKET_ID,
        name: bucket?.name || "Default",
        visibility: bucket?.visibility || "private",
        seal_policy_id: bucket?.seal_policy_id || "active",
        file_count: bucket?.file_count || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// SOLANA IDENTITY & ANCHOR PDA ROUTES (PHASE 3)
// ==========================================

// Issue Sign-In With Solana (SIWS) authentication challenge
app.post("/api/auth/solana/challenge", (req, res) => {
  const { address, domain } = req.body;
  if (!address) {
    return res.status(400).json({ success: false, error: "Solana address required" });
  }

  try {
    const challenge = generateAuthChallenge(address, domain);
    res.json({ success: true, ...challenge });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Verify Solana Ed25519 signature
app.post("/api/auth/solana/verify", (req, res) => {
  const { address, signature, message } = req.body;
  if (!address || !signature) {
    return res.status(400).json({ success: false, error: "Address and signature are required" });
  }

  const result = verifySolanaSignature(address, signature, message);
  if (!result.valid) {
    return res.status(401).json({ success: false, error: result.error });
  }

  // Retrieve user's organizations
  const userOrgs = listUserOrganizations(address);

  res.json({
    success: true,
    address,
    provider: "solana",
    scheme: "ed25519",
    verifiedAt: result.verifiedAt,
    organizations: userOrgs
  });
});

// Instant Ephemeral Solana Session for zero-env demoing / testing without browser extension
app.post("/api/auth/solana/demo", (req, res) => {
  try {
    const session = generateDemoSolanaSession();
    res.json({ success: true, ...session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List user organizations (or default demo orgs)
app.get("/api/orgs", (req, res) => {
  const address = req.headers["x-solana-address"] || req.query.address;
  if (address) {
    const orgs = listUserOrganizations(address);
    return res.json({ success: true, organizations: orgs });
  }
  const defaultOrg = getOrganization("nodus-devs");
  res.json({ success: true, organizations: defaultOrg ? [defaultOrg] : [] });
});

// Create organization with Anchor Org PDA
app.post("/api/orgs", (req, res) => {
  const { orgId, name, ownerAddress, storageCapBytes } = req.body;
  if (!orgId || !ownerAddress) {
    return res.status(400).json({ success: false, error: "orgId and ownerAddress are required" });
  }

  try {
    const org = createOrganization({ orgId, name, ownerAddress, storageCapBytes });
    res.json({ success: true, organization: org });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get organization details and PDA proof
app.get("/api/orgs/:orgId", (req, res) => {
  const { orgId } = req.params;
  const org = getOrganization(orgId);
  if (!org) {
    return res.status(404).json({ success: false, error: `Organization '${orgId}' not found` });
  }
  res.json({ success: true, organization: org });
});

// Add or update organization member (derives Member PDA)
app.post("/api/orgs/:orgId/members", (req, res) => {
  const { orgId } = req.params;
  const { memberAddress, role, callerAddress } = req.body;

  if (!memberAddress || !callerAddress) {
    return res.status(400).json({ success: false, error: "memberAddress and callerAddress are required" });
  }

  try {
    const member = addOrganizationMember({ orgId, memberAddress, role, callerAddress });
    res.json({ success: true, member });
  } catch (err) {
    const status = err.message.startsWith("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

// Remove organization member
app.delete("/api/orgs/:orgId/members/:memberAddress", (req, res) => {
  const { orgId, memberAddress } = req.params;
  const callerAddress = req.headers["x-solana-address"] || req.query.callerAddress;

  if (!callerAddress) {
    return res.status(400).json({ success: false, error: "callerAddress is required" });
  }

  try {
    const removed = removeOrganizationMember({ orgId, memberAddress, callerAddress });
    res.json({ success: true, removed });
  } catch (err) {
    const status = err.message.startsWith("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

// 2. List Assets in Bucket
app.get(["/api/photos", "/api/assets"], async (req, res) => {
  try {
    const rawFiles = await walrus.listPhotos();
    const photos = (Array.isArray(rawFiles) ? rawFiles : []).map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      status: file.status || "active",
      blob_id: file.blob_id || null,
      created_at: file.created_at || new Date().toISOString(),
      content_type: file.original_type || getContentType(file.name),
      stream_url: `/api/photos/${file.id}/stream`,
      download_url: `/api/photos/${file.id}/stream?download=true`,
      encrypted: Boolean(file.encrypted),
      iv: file.iv || null,
      key: file.key || null,
      original_name: file.original_name || file.name,
      original_type: file.original_type || getContentType(file.name),
      original_size: file.original_size || file.size,
      tags: Array.isArray(file.tags) ? file.tags : [],
      description: file.description || ""
    }));

    // Sort newest first
    photos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      count: photos.length,
      photos,
      assets: photos
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Upload Asset (Zero-Knowledge Ciphertext Ingestion)
app.post(["/api/photos/upload", "/api/assets/upload"], uploadLimiter, upload.any(), async (req, res) => {
  const uploadedFile = req.file || (req.files && req.files[0]);
  if (!uploadedFile) {
    return res.status(400).json({ success: false, error: "No asset file uploaded" });
  }
  req.file = uploadedFile;

  const localFilePath = req.file.path;
  const originalName = req.body.originalName || req.body.original_name || req.file.originalname;
  const description = req.body.description || "Uploaded via Nodus";

  // Extract client-side encryption metadata
  let encryption = null;
  if (req.body.encryption) {
    try {
      encryption = typeof req.body.encryption === "string" ? JSON.parse(req.body.encryption) : req.body.encryption;
    } catch {
      encryption = null;
    }
  } else if (req.body.iv && req.body.key) {
    encryption = {
      iv: req.body.iv,
      key: req.body.key,
      originalName: req.body.originalName || originalName,
      originalType: req.body.originalType || req.file.mimetype,
      originalSize: Number(req.body.originalSize) || req.file.size
    };
  }

  console.log(`📸 [API] Received upload request for ${originalName} (${req.file.size} bytes, encrypted: ${Boolean(encryption)})`);

  try {
    // Phase 0 Zero-Knowledge Enforcement:
    // If client provided encryption metadata, validate that payload is genuine ciphertext and NOT raw plaintext
    if (encryption) {
      const validation = await validateCiphertextPayload(localFilePath, encryption);
      if (!validation.valid) {
        console.warn(`⚠️ [API] Rejected upload of ${originalName}: ${validation.error}`);
        try {
          if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        } catch {}
        return res.status(400).json({ success: false, error: validation.error });
      }
    } else {
      // Fallback for raw files in test suites: validate magic bytes
      const magic = await validateMagicBytes(localFilePath);
      if (!magic.valid) {
        console.warn(`⚠️ [API] Rejected upload of ${originalName}: ${magic.error}`);
        try {
          if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        } catch {}
        return res.status(400).json({ success: false, error: magic.error });
      }
    }

    const sanitizedName = sanitizeString(originalName, 128);
    const sanitizedDesc = sanitizeString(description, 512);
    const ext = path.extname(originalName).replace(".", "");
    let userTags = [];
    if (req.body.tags) {
      if (Array.isArray(req.body.tags)) {
        userTags = req.body.tags;
      } else if (typeof req.body.tags === "string") {
        userTags = req.body.tags.split(",").map((s) => s.trim());
      }
    }
    const combinedTags = Array.from(new Set(["nodus", ext, ...userTags].filter(Boolean)));

    const result = await walrus.uploadPhoto({
      localPath: localFilePath,
      fileName: sanitizedName,
      description: sanitizedDesc,
      tags: combinedTags,
      encryption: encryption || undefined
    });

    // Clean up temp upload file
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch {}

    res.json({
      success: true,
      message: "Asset stored on Walrus successfully",
      photo: result,
      result
    });
  } catch (err) {
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch {}
    console.error("❌ [API] Upload failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Stream Ciphertext Stream (with TTL Cache & Zero Server-Side Plaintext)
app.get(["/api/photos/:fileId/stream", "/api/assets/:fileId/stream"], async (req, res) => {
  const { fileId } = req.params;
  const shouldDownload = req.query.download === "true";

  if (!isValidFileId(fileId)) {
    return res.status(400).json({ success: false, error: "Invalid file ID parameter" });
  }

  try {
    const files = await walrus.listPhotos();
    const matched = files.find((f) => f.id === fileId);
    if (!matched) {
      return res.status(404).json({ success: false, error: `File not found: ${fileId}` });
    }

    let cachedPath = cacheManager.get(fileId);

    // If not in cache or file was pruned, fetch from Walrus
    if (!cachedPath || !fs.existsSync(cachedPath)) {
      const destFilename = `stream_${fileId}_${Date.now()}.bin`;
      const destPath = path.join(tempStorageDir, destFilename);

      await walrus.downloadAndDecryptPhoto({ fileId, destPath });
      cachedPath = destPath;
      cacheManager.set(fileId, cachedPath);
    }

    const filename = matched.original_name || matched.name || `asset_${fileId}.bin`;
    const contentType = matched.encrypted ? "application/octet-stream" : getContentType(filename);

    res.setHeader("Content-Type", contentType);
    res.setHeader("x-nodus-encrypted", matched.encrypted ? "true" : "false");
    if (matched.iv) res.setHeader("x-nodus-iv", matched.iv);
    if (matched.key) res.setHeader("x-nodus-key", matched.key);
    if (matched.original_type) res.setHeader("x-nodus-original-type", matched.original_type);
    if (matched.original_name) res.setHeader("x-nodus-original-name", encodeURIComponent(matched.original_name));

    if (shouldDownload) {
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
    }

    const stream = fs.createReadStream(cachedPath);
    stream.pipe(res);
  } catch (err) {
    console.error(`❌ [API] Stream failed for fileId ${fileId}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Delete Asset (Crypto-Shredding)
app.delete(["/api/photos/:fileId", "/api/assets/:fileId"], async (req, res) => {
  const { fileId } = req.params;

  if (!isValidFileId(fileId)) {
    return res.status(400).json({ success: false, error: "Invalid file ID parameter" });
  }

  try {
    await walrus.deletePhoto(fileId);

    // Immediately evict and unlink decrypted cache from disk
    cacheManager.evict(fileId);

    res.json({ success: true, message: `Asset ${fileId} deleted from Walrus` });
  } catch (err) {
    console.error(`❌ [API] Delete failed for fileId ${fileId}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Update Asset Metadata (Sanitized Rename, Tags, Description)
app.patch(["/api/photos/:fileId", "/api/assets/:fileId"], async (req, res) => {
  const { fileId } = req.params;
  const { name, description, tags } = req.body;

  if (!isValidFileId(fileId)) {
    return res.status(400).json({ success: false, error: "Invalid file ID parameter" });
  }

  const cleanName = name !== undefined ? sanitizeString(name, 128) : undefined;
  const cleanDesc = description !== undefined ? sanitizeString(description, 512) : undefined;
  const cleanTags = tags !== undefined ? sanitizeTags(tags) : undefined;

  try {
    const result = await walrus.updatePhoto({
      fileId,
      name: cleanName,
      description: cleanDesc,
      tags: cleanTags
    });

    res.json({
      success: true,
      message: "Asset metadata updated successfully",
      result
    });
  } catch (err) {
    console.error(`❌ [API] Update failed for fileId ${fileId}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Batch Delete Assets
app.post(["/api/photos/batch-delete", "/api/assets/batch-delete"], async (req, res) => {
  const { fileIds } = req.body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ success: false, error: "fileIds array required" });
  }

  // Filter valid file IDs to prevent traversal injection
  const validIds = fileIds.filter(isValidFileId);
  if (validIds.length === 0) {
    return res.status(400).json({ success: false, error: "No valid file IDs provided" });
  }

  const results = [];
  for (const fileId of validIds) {
    try {
      await walrus.deletePhoto(fileId);
      cacheManager.evict(fileId);
      results.push({ fileId, success: true });
    } catch (err) {
      results.push({ fileId, success: false, error: err.message });
    }
  }

  res.json({
    success: true,
    deleted_count: results.filter((r) => r.success).length,
    results
  });
});

// Fallback to index.html for GET client routing; 404 for non-GET
app.use((req, res) => {
  if (req.method === "GET") {
    res.sendFile(path.join(publicDir, "index.html"));
  } else {
    res.status(404).json({ success: false, error: "Endpoint not found" });
  }
});

// Start Server only if executed directly and not in test mode
let server = null;
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (process.env.NODE_ENV !== "test" && isDirectRun) {
  const PORT = process.env.PORT || 3000;
  server = app.listen(PORT, () => {
    console.log("====================================================");
    console.log(`🌊 Nodus Sovereign Cloud running on:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log("====================================================");
  });
}

// Handle graceful shutdown
function shutdown() {
  console.log("\nShutting down server...");
  clearInterval(pruneInterval);
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default app;
