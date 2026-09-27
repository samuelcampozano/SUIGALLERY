import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { walrus, DEFAULT_SPACE_ID, DEFAULT_BUCKET_ID } from "./walrus-client.js";
import { ResumableUploadManager, RESUMABLE_UPLOAD_LIMITS } from "./resumable-upload.js";
import { DirectUploadManager, DIRECT_UPLOAD_MAX_SEGMENT_SIZE } from "./direct-upload-manager.js";
import { AuthenticatedPublisher } from "./authenticated-publisher.js";
import { AuthTenantStore } from "./auth-tenant-store.js";
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
  isValidSolanaAddress,
  generateDemoSolanaSession,
  createOrganization,
  getOrganization,
  listUserOrganizations,
  addOrganizationMember,
  removeOrganizationMember,
  listOrganizationMembers,
  verifyOrgPermission,
  deriveOrgPDA,
  deriveMemberPDA,
  NODUS_SOLANA_PROGRAM_ID_STR
} from "./solana.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const tempStorageDir = path.join(rootDir, "temp_storage");
const resumableUploadDir = path.join(tempStorageDir, "resumable_uploads");
const directUploadDir = path.join(tempStorageDir, "direct_uploads");

// Ensure temp_storage directory exists
if (!fs.existsSync(tempStorageDir)) {
  fs.mkdirSync(tempStorageDir, { recursive: true });
}
const resumableUploads = new ResumableUploadManager({ rootDir: resumableUploadDir });
const directUploads = new DirectUploadManager({ rootDir: directUploadDir });
const authenticatedPublisher = new AuthenticatedPublisher();
const authTenantStore = process.env.DATABASE_URL ? new AuthTenantStore() : null;
if (authTenantStore) {
  authTenantStore.init().catch((err) => {
    console.error("❌ [Server] Failed to initialize PostgreSQL tenant store:", err.message);
  });
}

function configuredOrigins() {
  const configured = (process.env.NODUS_ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
  if (configured.length) return new Set(configured);
  if (process.env.NODE_ENV === "production") return new Set();
  return new Set(["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"]);
}

const allowedOrigins = configuredOrigins();
const corsOptions = {
  origin(origin, callback) {
    // Browser requests from this application and non-browser clients without an
    // Origin header are allowed; cross-origin browsers must be explicitly listed.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS policy"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Part-SHA256"],
  maxAge: 600
};

async function requireTenant(req, res, next) {
  // Development keeps legacy demos usable; production must never fall back to a global bucket.
  if (!authTenantStore) {
    if (process.env.NODE_ENV === "production") return res.status(503).json({ success: false, error: "Tenant authentication is not configured" });
    return next();
  }
  const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : "";
  const authorizationParts = authorization.split(/\s+/);
  const token = authorizationParts[0]?.toLowerCase() === "bearer" ? authorizationParts.slice(1).join(" ") : "";
  if (!token) return res.status(401).json({ success: false, error: "Bearer token required" });
  try {
    const context = await authTenantStore.resolve(token);
    if (!context) return res.status(401).json({ success: false, error: "Session expired, revoked, or invalid" });
    req.auth = { userId: context.user_id, address: context.solana_address, role: context.role };
    req.tenant = { organizationId: context.organization_id, spaceId: context.space_id, bucketId: context.bucket_id, sealPolicyId: context.seal_policy_id, quotaBytes: Number(context.quota_bytes) };
    return next();
  } catch (error) { return next(error); }
}

// Initialize Decrypted Cache Lifecycle Manager (10-minute TTL)
const cacheManager = new DecryptedCacheManager({ ttlMs: 10 * 60 * 1000 });

// Startup cleanup: purge stale decrypted files from prior sessions
cacheManager.cleanupOrphanedFiles(tempStorageDir);

// Periodic sweep: clean expired cache files every 5 minutes
const pruneInterval = setInterval(() => {
  cacheManager.prune();
  resumableUploads.pruneExpired();
  directUploads.pruneExpired();
}, 5 * 60 * 1000);
if (typeof pruneInterval.unref === "function") {
  pruneInterval.unref();
}

const app = express();

function requireTenantEnvelopeStore(req, res, next) {
  if (!authTenantStore || !req.auth || !req.tenant) {
    return res.status(503).json({ success: false, error: "Persistent tenant authentication is required for key envelopes" });
  }
  return next();
}

function containsRawKeyMaterial(value) {
  if (!value || typeof value !== "object") return false;
  return ["key", "keyHex", "privateKey", "recoveryPrivateKey"].some((field) => Object.prototype.hasOwnProperty.call(value, field));
}

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
app.use(cors(corsOptions));
app.use(express.json({ limit: "2mb" }));

// 3. Rate Limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  // Multipart part uploads use their own, less restrictive limiter below.
  skip: (req) => req.method === "PUT" && /^\/api\/(assets|photos)\/uploads\/[0-9a-f-]+\/parts\/\d+$/.test(req.path),
  message: { success: false, error: "Too many requests. Please try again later." }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // Limit each IP to 60 uploads per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Upload rate limit exceeded. Please wait a few minutes." }
});

const resumablePartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many upload parts. Please retry shortly." }
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

const resumablePartBody = express.raw({
  type: "application/octet-stream",
  limit: `${RESUMABLE_UPLOAD_LIMITS.MAX_PART_SIZE / (1024 * 1024)}mb`
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
      },
      direct_publisher: {
        configured: authenticatedPublisher.isConfigured(),
        max_segment_bytes: DIRECT_UPLOAD_MAX_SEGMENT_SIZE
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

  const organizationId = req.body.organizationId;
  if (authTenantStore) {
    if (!organizationId) return res.status(400).json({ success: false, error: "organizationId is required for tenant authentication" });
    return authTenantStore.createSession({ address, organizationId })
      .then((session) => res.json({ success: true, address, provider: "solana", scheme: "ed25519", verifiedAt: result.verifiedAt, organizations: userOrgs, accessToken: session.token, expiresAt: session.expiresAt, tenant: { organizationId, ...session.tenant }, role: session.role }))
      .catch((error) => res.status(403).json({ success: false, error: error.message }));
  }
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

// List only organizations that the authenticated principal can access.
app.get("/api/orgs", requireTenant, async (req, res, next) => {
  if (authTenantStore) {
    try {
      const organizations = await authTenantStore.listOrganizations(req.auth.userId);
      return res.json({ success: true, organizations });
    } catch (error) {
      return next(error);
    }
  }
  const address = req.headers["x-solana-address"] || req.query.address;
  if (address) {
    const orgs = listUserOrganizations(address);
    return res.json({ success: true, organizations: orgs });
  }
  const defaultOrg = getOrganization("nodus-devs");
  res.json({ success: true, organizations: defaultOrg ? [defaultOrg] : [] });
});

// Production organizations are pre-provisioned with a storage context. This
// legacy helper remains only for the zero-environment development demo.
app.post("/api/orgs", requireTenant, (req, res) => {
  if (authTenantStore) {
    return res.status(501).json({ success: false, error: "Organizations must be pre-provisioned by an administrator" });
  }
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

// Get organization details only when the authenticated user is a member.
app.get("/api/orgs/:orgId", requireTenant, async (req, res, next) => {
  const { orgId } = req.params;
  if (authTenantStore) {
    try {
      const organization = await authTenantStore.getOrganizationForUser({ organizationId: orgId, userId: req.auth.userId });
      if (!organization) return res.status(404).json({ success: false, error: `Organization '${orgId}' not found` });
      return res.json({ success: true, organization });
    } catch (error) {
      return next(error);
    }
  }
  const org = getOrganization(orgId);
  if (!org) {
    return res.status(404).json({ success: false, error: `Organization '${orgId}' not found` });
  }
  res.json({ success: true, organization: org });
});

// Add/update a member only as an admin/owner in the active organization.
app.post("/api/orgs/:orgId/members", requireTenant, async (req, res, next) => {
  const { orgId } = req.params;
  const { memberAddress, role, callerAddress } = req.body;

  if (authTenantStore) {
    if (orgId !== req.tenant.organizationId) return res.status(403).json({ success: false, error: "Organization does not match the active tenant" });
    if (!['owner', 'admin'].includes(req.auth.role)) return res.status(403).json({ success: false, error: "Insufficient organization role" });
    if (!isValidSolanaAddress(memberAddress)) return res.status(400).json({ success: false, error: "memberAddress must be a valid Solana address" });
    try {
      const member = await authTenantStore.addMembership({ organizationId: orgId, address: memberAddress, role: role || "viewer" });
      return res.json({ success: true, member });
    } catch (error) {
      return next(error);
    }
  }

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

// Remove a member only as an admin/owner in the active organization.
app.delete("/api/orgs/:orgId/members/:memberAddress", requireTenant, async (req, res, next) => {
  const { orgId, memberAddress } = req.params;
  const callerAddress = req.headers["x-solana-address"] || req.query.callerAddress;

  if (authTenantStore) {
    if (orgId !== req.tenant.organizationId) return res.status(403).json({ success: false, error: "Organization does not match the active tenant" });
    if (!['owner', 'admin'].includes(req.auth.role)) return res.status(403).json({ success: false, error: "Insufficient organization role" });
    if (!isValidSolanaAddress(memberAddress)) return res.status(400).json({ success: false, error: "memberAddress must be a valid Solana address" });
    try {
      const removed = await authTenantStore.removeMembership({ organizationId: orgId, address: memberAddress });
      return res.json({
        success: true,
        removed: true,
        keyRotationRequired: removed.revokedEnvelopeAssetIds.length > 0,
        rotationRequiredAssetIds: removed.revokedEnvelopeAssetIds,
        warning: removed.revokedEnvelopeAssetIds.length
          ? "Existing ciphertext must be re-encrypted client-side before revoked access can be considered strongly revoked."
          : null
      });
    } catch (error) {
      const status = error.message === "Organization member not found" ? 404 : 400;
      return res.status(status).json({ success: false, error: error.message });
    }
  }

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

// ==========================================
// RESUMABLE ENCRYPTED UPLOADS
// ==========================================

// Create an upload session. The client supplies ciphertext size because each AES-GCM
// chunk carries its own authentication tag and can be safely retried independently.
app.post(["/api/assets/uploads", "/api/photos/uploads"], requireTenant, uploadLimiter, (req, res) => {
  const {
    originalName,
    originalType,
    originalSize,
    encryptedSize,
    partSize,
    description,
    tags,
    encryption
  } = req.body || {};

  if (containsRawKeyMaterial(encryption)) {
    return res.status(400).json({ success: false, error: "Raw data keys must not be sent to the server" });
  }

  try {
    const parsedTags = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
        ? tags.split(",").map((tag) => tag.trim())
        : [];
    const session = resumableUploads.create({
      originalName: sanitizeString(originalName, 128),
      originalType: sanitizeString(originalType, 255),
      originalSize,
      encryptedSize,
      partSize,
      description: sanitizeString(description, 512),
      tags: sanitizeTags(parsedTags),
      encryption,
      organizationId: req.tenant?.organizationId
    });
    res.status(201).json({ success: true, upload: session });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Query received parts after an interrupted browser session or network failure.
app.get(["/api/assets/uploads/:uploadId", "/api/photos/uploads/:uploadId"], requireTenant, (req, res) => {
  try {
    const session = resumableUploads.get(req.params.uploadId, req.tenant?.organizationId);
    res.json({ success: true, upload: session });
  } catch (err) {
    const status = err.message === "Upload session not found" ? 404 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

// Store exactly one authenticated ciphertext part. The checksum makes retries
// idempotent and prevents corrupt parts from being assembled.
app.put(
  ["/api/assets/uploads/:uploadId/parts/:partNumber", "/api/photos/uploads/:uploadId/parts/:partNumber"],
  requireTenant, resumablePartLimiter,
  resumablePartBody,
  (req, res) => {
    try {
      const result = resumableUploads.writePart(
        req.params.uploadId,
        req.params.partNumber,
        req.body,
        req.headers["x-part-sha256"],
        req.tenant?.organizationId
      );
      res.status(result.duplicate ? 200 : 201).json({ success: true, ...result });
    } catch (err) {
      const status = err.message === "Upload session not found" ? 404 : 400;
      res.status(status).json({ success: false, error: err.message });
    }
  }
);

// Assemble ciphertext sequentially on disk, verify all parts, then hand the completed
// blob to the existing Walrus adapter. This uses constant memory regardless of upload size.
app.post(["/api/assets/uploads/:uploadId/complete", "/api/photos/uploads/:uploadId/complete"], requireTenant, uploadLimiter, async (req, res) => {
  const { uploadId } = req.params;
  try {
    const { session, assembledPath, ciphertextSha256 } = await resumableUploads.assemble(uploadId, req.tenant?.organizationId);
    const validation = await validateCiphertextPayload(assembledPath, session.encryption);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const result = await walrus.uploadPhoto({
      localPath: assembledPath,
      fileName: session.originalName,
      description: session.description,
      tags: session.tags,
      encryption: {
        ...session.encryption,
        originalName: session.originalName,
        originalType: session.originalType,
        originalSize: session.originalSize,
        ciphertextSha256
      },
      tenant: req.tenant
    });
    const completed = resumableUploads.markCompleted(uploadId, result, ciphertextSha256, req.tenant?.organizationId);
    res.json({ success: true, upload: completed, asset: result, result });
  } catch (err) {
    try { resumableUploads.markRetryable(uploadId, req.tenant?.organizationId); } catch {}
    console.error(`❌ [ResumableUpload] Completion failed for ${uploadId}:`, err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// Explicit cancellation immediately removes staged ciphertext and session metadata.
app.delete(["/api/assets/uploads/:uploadId", "/api/photos/uploads/:uploadId"], requireTenant, (req, res) => {
  try {
    resumableUploads.abort(req.params.uploadId, req.tenant?.organizationId);
    res.json({ success: true, aborted: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// DIRECT AUTHENTICATED PUBLISHER UPLOADS
// ==========================================
// These endpoints are control-plane only: ciphertext flows from the browser
// directly to the Walrus publisher and never enters this Express process.
app.post("/api/assets/direct-uploads", requireTenant, uploadLimiter, (req, res) => {
  const { originalName, originalType, originalSize, segmentSize, description, tags, encryption, epochs } = req.body || {};
  if (containsRawKeyMaterial(encryption)) {
    return res.status(400).json({ success: false, error: "Raw data keys must not be sent to the server" });
  }
  try {
    const parsedTags = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",").map((tag) => tag.trim()) : [];
    const upload = directUploads.create({
      originalName: sanitizeString(originalName, 128),
      originalType: sanitizeString(originalType, 255),
      originalSize,
      segmentSize,
      description: sanitizeString(description, 512),
      tags: sanitizeTags(parsedTags),
      encryption,
      epochs,
      tenant: req.tenant
    });
    res.status(201).json({ success: true, upload, publisherConfigured: authenticatedPublisher.isConfigured() });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get("/api/assets/direct-uploads/:uploadId", requireTenant, (req, res) => {
  try {
    res.json({ success: true, upload: directUploads.get(req.params.uploadId, req.tenant?.organizationId) });
  } catch (err) {
    res.status(err.message === "Upload session not found" ? 404 : 400).json({ success: false, error: err.message });
  }
});

app.post("/api/assets/direct-uploads/:uploadId/segments/:segmentIndex/authorize", requireTenant, uploadLimiter, (req, res) => {
  try {
    authenticatedPublisher.assertConfigured();
    const { session, segment } = directUploads.authorizeSegment(req.params.uploadId, req.params.segmentIndex, req.tenant?.organizationId);
    const ciphertextSha256 = req.body?.ciphertextSha256;
    const authorization = authenticatedPublisher.authorize({
      uploadId: session.uploadId,
      segment,
      epochs: session.epochs,
      ciphertextSha256,
      sendObjectTo: req.body?.sendObjectTo || null
    });
    directUploads.saveAuthorization(session.uploadId, segment.index, authorization, req.tenant?.organizationId);
    res.json({ success: true, authorization });
  } catch (err) {
    const status = err.message === "Authenticated publisher is not configured" ? 503 : err.message === "Upload session not found" ? 404 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

app.post("/api/assets/direct-uploads/:uploadId/segments/:segmentIndex/complete", requireTenant, uploadLimiter, (req, res) => {
  try {
    authenticatedPublisher.assertConfigured();
    const context = directUploads.completionContext(req.params.uploadId, req.params.segmentIndex, req.tenant?.organizationId);
    const receipt = authenticatedPublisher.verifyReceipt(req.body?.receipt, context);
    const upload = directUploads.completeSegment(req.params.uploadId, req.params.segmentIndex, {
      blobId: receipt.blobId,
      ciphertextSha256: req.body?.ciphertextSha256,
      publisherResponse: req.body?.publisherResponse,
      receipt,
      verified: true
    }, req.tenant?.organizationId);
    res.json({ success: true, upload });
  } catch (err) {
    res.status(err.message === "Upload session not found" ? 404 : 400).json({ success: false, error: err.message });
  }
});

app.post("/api/assets/direct-uploads/:uploadId/finalize", requireTenant, uploadLimiter, (req, res) => {
  try {
    const result = directUploads.finalize(req.params.uploadId, req.tenant?.organizationId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.message === "Upload session not found" ? 404 : 400).json({ success: false, error: err.message });
  }
});

app.get("/api/assets/direct-uploads/:uploadId/manifest", requireTenant, (req, res) => {
  try {
    res.json({ success: true, manifest: directUploads.manifest(req.params.uploadId, req.tenant?.organizationId) });
  } catch (err) {
    res.status(err.message === "Upload session not found" ? 404 : 400).json({ success: false, error: err.message });
  }
});

// ==========================================
// CLIENT-SIDE KEY ENVELOPE DIRECTORY
// ==========================================
// The directory contains only public encryption identities and ciphertext
// envelopes. Every operation is scoped to the organization in the bearer token.
app.post("/api/key-identities/:address", requireTenant, requireTenantEnvelopeStore, async (req, res, next) => {
  try {
    if (req.params.address !== req.auth.address) return res.status(403).json({ success: false, error: "A user may only register their own encryption identity" });
    const identity = await authTenantStore.registerKeyIdentity({ userId: req.auth.userId, payload: req.body || {} });
    return res.status(201).json({ success: true, identity: { address: req.auth.address, ...identity } });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// A public identity is discoverable only by members of the active organization.
app.get("/api/key-identities/:address", requireTenant, requireTenantEnvelopeStore, async (req, res, next) => {
  try {
    if (!isValidSolanaAddress(req.params.address)) return res.status(400).json({ success: false, error: "Invalid Solana address" });
    const recipient = await authTenantStore.getOrganizationKeyRecipient({ organizationId: req.tenant.organizationId, address: req.params.address });
    if (!recipient) return res.status(404).json({ success: false, error: "Encryption identity not found" });
    return res.json({ success: true, identity: recipient });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

app.get("/api/orgs/:orgId/key-recipients", requireTenant, requireTenantEnvelopeStore, async (req, res, next) => {
  if (req.params.orgId !== req.tenant.organizationId) return res.status(403).json({ success: false, error: "Organization does not match the active tenant" });
  try {
    const recipients = await authTenantStore.listOrganizationKeyRecipients({ organizationId: req.tenant.organizationId });
    return res.json({ success: true, organizationId: req.tenant.organizationId, recipients });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

app.get("/api/key-rotations/pending", requireTenant, requireTenantEnvelopeStore, async (req, res) => {
  if (req.auth.role !== "owner") return res.status(403).json({ success: false, error: "Only organization owners may inspect key rotations" });
  try {
    const rotations = await authTenantStore.listPendingKeyRotations({ organizationId: req.tenant.organizationId, ownerUserId: req.auth.userId });
    return res.json({ success: true, organizationId: req.tenant.organizationId, rotations });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// The client must first decrypt and re-encrypt the content with a new data key,
// upload it as replacementAssetId, and create envelopes for remaining members.
// The server never receives a plaintext or data key during this revocation flow.
app.post("/api/key-rotations/:rotationId/complete", requireTenant, requireTenantEnvelopeStore, async (req, res) => {
  if (req.auth.role !== "owner") return res.status(403).json({ success: false, error: "Only organization owners may complete key rotations" });
  if (!isValidFileId(req.body?.replacementAssetId)) return res.status(400).json({ success: false, error: "A valid replacementAssetId is required" });
  try {
    const rotation = await authTenantStore.validateKeyRotation({
      organizationId: req.tenant.organizationId,
      rotationId: req.params.rotationId,
      ownerUserId: req.auth.userId,
      replacementAssetId: req.body.replacementAssetId
    });
    await walrus.deletePhoto(rotation.sourceAssetId, req.tenant);
    await authTenantStore.finalizeKeyRotation({
      organizationId: req.tenant.organizationId,
      rotationId: req.params.rotationId,
      ownerUserId: req.auth.userId,
      replacementAssetId: req.body.replacementAssetId,
      sourceAssetId: rotation.sourceAssetId
    });
    cacheManager.evict(`${req.tenant.organizationId}:${rotation.sourceAssetId}`);
    return res.json({ success: true, rotation });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

app.post("/api/assets/:assetId/key-envelopes", requireTenant, requireTenantEnvelopeStore, async (req, res, next) => {
  try {
    if (!isValidFileId(req.params.assetId)) throw new Error("Invalid asset ID");
    if (!['owner', 'admin', 'contributor'].includes(req.auth.role)) return res.status(403).json({ success: false, error: "Only organization contributors may share an asset" });
    const asset = await authTenantStore.putKeyEnvelopes({ organizationId: req.tenant.organizationId, assetId: req.params.assetId, ownerUserId: req.auth.userId, envelopes: req.body?.envelopes });
    return res.status(201).json({ success: true, asset });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

app.get("/api/assets/:assetId/key-envelopes", requireTenant, requireTenantEnvelopeStore, async (req, res, next) => {
  try {
    if (!isValidFileId(req.params.assetId)) throw new Error("Invalid asset ID");
    const result = await authTenantStore.envelopesForRecipient({ organizationId: req.tenant.organizationId, assetId: req.params.assetId, recipientUserId: req.auth.userId });
    if (!result) return res.status(404).json({ success: false, error: "Key envelopes not found" });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// Read one encrypted segment through the gateway. The gateway never decrypts
// it; this proxy lets the SDK stream directly from the authenticated publisher
// without exposing publisher topology or credentials to an application.
app.get("/api/assets/:assetId/direct-segments/:segmentIndex", requireTenant, async (req, res) => {
  try {
    const manifest = directUploads.manifestByAssetId(req.params.assetId, req.tenant?.organizationId);
    const index = Number(req.params.segmentIndex);
    const segment = manifest.segments.find((entry) => entry.index === index);
    if (!segment) return res.status(404).json({ success: false, error: "Direct segment not found" });

    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const publisherResponse = await fetch(authenticatedPublisher.readUrl(segment.blobId), { headers });
    if (!publisherResponse.ok) {
      return res.status(502).json({ success: false, error: `Publisher read failed: HTTP ${publisherResponse.status}` });
    }

    const passthroughHeaders = ["content-type", "content-length", "content-range", "accept-ranges", "etag"];
    for (const name of passthroughHeaders) {
      const value = publisherResponse.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.status(publisherResponse.status);
    if (!publisherResponse.body) return res.end();
    Readable.fromWeb(publisherResponse.body).on("error", (error) => res.destroy(error)).pipe(res);
  } catch (err) {
    const status = err.message === "Upload session not found" ? 404 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

// A manifest is intentionally public encryption metadata only: no data key,
// plaintext, or publisher credential is included.
app.get("/api/assets/:assetId/direct-manifest", requireTenant, (req, res) => {
  try {
    res.json({ success: true, manifest: directUploads.manifestByAssetId(req.params.assetId, req.tenant?.organizationId) });
  } catch (err) {
    const status = err.message === "Upload session not found" ? 404 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

app.delete("/api/assets/direct-uploads/:uploadId", requireTenant, async (req, res, next) => {
  try {
    directUploads.abort(req.params.uploadId, req.tenant?.organizationId);
    if (authTenantStore) await authTenantStore.deleteKeyEnvelopeAsset({ organizationId: req.tenant.organizationId, assetId: `direct_${req.params.uploadId}` });
    res.json({ success: true, aborted: true });
  } catch (error) {
    return next(error);
  }
});

// 2. List Assets in Bucket
app.get(["/api/photos", "/api/assets"], requireTenant, async (req, res) => {
  try {
    const rawFiles = await walrus.listPhotos(req.tenant?.bucketId);
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
      original_name: file.original_name || file.name,
      original_type: file.original_type || getContentType(file.name),
      original_size: file.original_size || file.size,
      encryption_mode: file.encryption_mode || "aes-gcm-v1",
      chunk_size: file.chunk_size || null,
      chunk_count: file.chunk_count || null,
      tags: Array.isArray(file.tags) ? file.tags : [],
      description: file.description || ""
    }));

    // Logical large files are manifests whose ciphertext segments live directly
    // on Walrus; they are not Console/MCP file records.
    photos.push(...directUploads.listAssets(req.tenant?.organizationId).map((asset) => ({
      ...asset,
      blob_id: null
    })));

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
app.post(["/api/photos/upload", "/api/assets/upload"], requireTenant, uploadLimiter, upload.any(), async (req, res) => {
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
  } else if (req.body.iv) {
    encryption = {
      iv: req.body.iv,
      originalName: req.body.originalName || originalName,
      originalType: req.body.originalType || req.file.mimetype,
      originalSize: Number(req.body.originalSize) || req.file.size
    };
  }

  console.log(`📸 [API] Received upload request for ${originalName} (${req.file.size} bytes, encrypted: ${Boolean(encryption)})`);

  if (containsRawKeyMaterial(req.body) || containsRawKeyMaterial(encryption)) {
    try { if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath); } catch {}
    return res.status(400).json({ success: false, error: "Raw data keys must not be sent to the server" });
  }

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
      encryption: encryption || undefined, tenant: req.tenant
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
app.get(["/api/photos/:fileId/stream", "/api/assets/:fileId/stream"], requireTenant, async (req, res) => {
  const { fileId } = req.params;
  const shouldDownload = req.query.download === "true";

  if (!isValidFileId(fileId)) {
    return res.status(400).json({ success: false, error: "Invalid file ID parameter" });
  }

  try {
    const files = await walrus.listPhotos(req.tenant?.bucketId);
    const matched = files.find((f) => f.id === fileId);
    if (!matched) {
      return res.status(404).json({ success: false, error: `File not found: ${fileId}` });
    }

    const cacheKey = `${req.tenant?.organizationId || "development"}:${fileId}`;
    let cachedPath = cacheManager.get(cacheKey);

    // If not in cache or file was pruned, fetch from Walrus
    if (!cachedPath || !fs.existsSync(cachedPath)) {
      const destFilename = `stream_${fileId}_${Date.now()}.bin`;
      const destPath = path.join(tempStorageDir, destFilename);

      await walrus.downloadAndDecryptPhoto({ fileId, destPath, tenant: req.tenant });
      cachedPath = destPath;
      cacheManager.set(cacheKey, cachedPath);
    }

    const filename = matched.original_name || matched.name || `asset_${fileId}.bin`;
    const contentType = matched.encrypted ? "application/octet-stream" : getContentType(filename);

    res.setHeader("Content-Type", contentType);
    res.setHeader("x-nodus-encrypted", matched.encrypted ? "true" : "false");
    if (matched.iv) res.setHeader("x-nodus-iv", matched.iv);
    if (matched.original_type) res.setHeader("x-nodus-original-type", matched.original_type);
    if (matched.original_name) res.setHeader("x-nodus-original-name", encodeURIComponent(matched.original_name));
    if (matched.encryption_mode) res.setHeader("x-nodus-encryption-mode", matched.encryption_mode);
    if (matched.chunk_size) res.setHeader("x-nodus-chunk-size", String(matched.chunk_size));
    if (matched.chunk_count) res.setHeader("x-nodus-chunk-count", String(matched.chunk_count));
    if (matched.original_size) res.setHeader("x-nodus-original-size", String(matched.original_size));

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
app.delete(["/api/photos/:fileId", "/api/assets/:fileId"], requireTenant, async (req, res, next) => {
  const { fileId } = req.params;

  if (!isValidFileId(fileId)) {
    return res.status(400).json({ success: false, error: "Invalid file ID parameter" });
  }

  try {
    await walrus.deletePhoto(fileId, req.tenant);
    if (authTenantStore) await authTenantStore.deleteKeyEnvelopeAsset({ organizationId: req.tenant.organizationId, assetId: fileId });

    // Immediately evict and unlink decrypted cache from disk
    cacheManager.evict(`${req.tenant?.organizationId || "development"}:${fileId}`);

    res.json({ success: true, message: `Asset ${fileId} deleted from Walrus` });
  } catch (err) {
    console.error(`❌ [API] Delete failed for fileId ${fileId}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Update Asset Metadata (Sanitized Rename, Tags, Description)
app.patch(["/api/photos/:fileId", "/api/assets/:fileId"], requireTenant, async (req, res) => {
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
      tags: cleanTags, tenant: req.tenant
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
app.post(["/api/photos/batch-delete", "/api/assets/batch-delete"], requireTenant, async (req, res) => {
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
      await walrus.deletePhoto(fileId, req.tenant);
      if (authTenantStore) await authTenantStore.deleteKeyEnvelopeAsset({ organizationId: req.tenant.organizationId, assetId: fileId });
      cacheManager.evict(`${req.tenant?.organizationId || "development"}:${fileId}`);
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

// CORS rejection is intentional and should not be exposed as a generic 500.
app.use((error, req, res, next) => {
  if (error?.message === "Origin is not allowed by CORS policy") {
    return res.status(403).json({ success: false, error: error.message });
  }
  return next(error);
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
