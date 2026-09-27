import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { walrus, DEFAULT_SPACE_ID, DEFAULT_BUCKET_ID } from "./walrus-client.js";
import { ResumableUploadManager, RESUMABLE_UPLOAD_LIMITS } from "./resumable-upload.js";
import { DirectUploadManager, DIRECT_UPLOAD_MAX_SEGMENT_SIZE } from "./direct-upload-manager.js";
import { AuthenticatedPublisher } from "./authenticated-publisher.js";
import { AuthTenantStore } from "./auth-tenant-store.js";
import { WebhookDispatcher, encryptWebhookSecret } from "./webhook-dispatcher.js";
import { TenantProvisioner } from "./tenant-provisioner.js";
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
const authenticatedPublisher = new AuthenticatedPublisher();
const authTenantStore = process.env.DATABASE_URL ? new AuthTenantStore() : null;
const webhookDispatcher = authTenantStore && process.env.NODUS_WEBHOOK_ENCRYPTION_KEY ? new WebhookDispatcher(authTenantStore) : null;
const tenantProvisioner = new TenantProvisioner();
const directUploads = new DirectUploadManager({
  rootDir: authTenantStore ? null : directUploadDir,
  stateStore: authTenantStore ? {
    load: (uploadId) => authTenantStore.loadUploadPayload(uploadId),
    save: (session) => authTenantStore.saveUploadPayload({ uploadId: session.uploadId, organizationId: session.organizationId, payload: session }),
    list: (organizationId) => authTenantStore.listUploadPayloads({ uploadKind: "direct", organizationId }),
    findByAssetId: (assetId, organizationId) => authTenantStore.loadDirectUploadPayloadByAssetId({ assetId, organizationId }),
    remove: (uploadId) => authTenantStore.removeUploadPayload(uploadId)
  } : null
});
if (authTenantStore) {
  authTenantStore.init().catch((err) => {
    console.error("❌ [Server] Failed to initialize PostgreSQL tenant store:", err.message);
  });
}
if (authTenantStore && !webhookDispatcher) console.warn("⚠️ [Webhooks] Disabled: set NODUS_WEBHOOK_ENCRYPTION_KEY to enable signed webhook delivery.");

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
  allowedHeaders: ["Authorization", "Content-Type", "X-Part-SHA256", "Idempotency-Key"],
  maxAge: 600
};

async function requireTenant(req, res, next) {
  // A bypass is intentionally opt-in and exists only for deterministic local tests.
  if (!authTenantStore) {
    if (process.env.NODE_ENV !== "test" && process.env.NODUS_ALLOW_INSECURE_DEV_AUTH !== "true") {
      return res.status(503).json({ success: false, error: "Tenant authentication is not configured" });
    }
    if (await enforcePublicIdempotency(req, res)) return;
    return next();
  }
  const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : "";
  const authorizationParts = authorization.split(/\s+/);
  const token = authorizationParts[0]?.toLowerCase() === "bearer" ? authorizationParts.slice(1).join(" ") : "";
  if (!token) return res.status(401).json({ success: false, error: "Bearer token required" });
  try {
    let context = await authTenantStore.resolve(token);
    let apiKey = false;
    if (!context) { context = await authTenantStore.resolveApiKey(token); apiKey = Boolean(context); }
    if (!context) return res.status(401).json({ success: false, error: "Session expired, revoked, or invalid" });
    req.auth = apiKey ? { apiKeyId: context.api_key_id, userId: context.created_by, scopes: context.scopes, role: 'api_key' } : { userId: context.user_id, address: context.solana_address, role: context.role };
    req.tenant = { organizationId: context.organization_id, spaceId: context.space_id, bucketId: context.bucket_id, sealPolicyId: context.seal_policy_id, quotaBytes: Number(context.quota_bytes) };
    if (apiKey) { const scope = req.method === 'GET' ? (req.path.includes('/audit') ? 'audit:read' : req.path.includes('/search') ? 'search:read' : 'assets:read') : req.method === 'DELETE' ? 'assets:delete' : req.path.includes('key-envelopes') ? 'assets:share' : 'assets:write'; if (!req.auth.scopes.includes(scope)) return res.status(403).json({ success:false,error:`API key lacks ${scope} scope` }); const now=Date.now(); const state=apiKeyRequestWindows.get(context.api_key_id)||{at:now,count:0}; if(now-state.at>60000){state.at=now;state.count=0;} if(++state.count>300)return res.status(429).json({success:false,error:'API key rate limit exceeded'}); apiKeyRequestWindows.set(context.api_key_id,state); }
    return next();
  } catch (error) { return next(error); }
}

function idempotencyOperation(req) {
  const path = req.path;
  if (!req.headers['idempotency-key'] || !['POST','PATCH','DELETE'].includes(req.method)) return null;
  if (/^\/api\/(assets|photos)\/uploads$/.test(path) || /^\/api\/assets\/direct-uploads$/.test(path) || /^\/api\/(assets|photos)\/upload$/.test(path)) return `${req.method}:upload.create`;
  if (/^\/api\/(assets|photos)\/uploads\/[^/]+\/complete$/.test(path) || /^\/api\/assets\/direct-uploads\/[^/]+\/finalize$/.test(path)) return `${req.method}:upload.finalize:${path}`;
  if (/^\/api\/(assets|photos)\/[^/]+$/.test(path) || /^\/api\/(assets|photos)\/batch-delete$/.test(path)) return `${req.method}:asset.mutate:${path}`;
  if (/\/key-envelopes$/.test(path) || /^\/api\/key-rotations\/[^/]+\/complete$/.test(path)) return `${req.method}:key.mutate:${path}`;
  return null;
}

async function enforcePublicIdempotency(req, res) {
  const operation=idempotencyOperation(req); if(!operation || !authTenantStore) return false;
  const idempotencyKey=String(req.headers['idempotency-key']); if(!/^[A-Za-z0-9._:-]{8,200}$/.test(idempotencyKey)){res.status(400).json({success:false,error:'Invalid Idempotency-Key'});return true;}
  const actorKey=req.auth.apiKeyId ? `api:${req.auth.apiKeyId}` : `user:${req.auth.userId}`;
  const requestHash=crypto.createHash('sha256').update(JSON.stringify(req.body||{})).digest('hex');
  const result=await authTenantStore.beginPublicIdempotency({organizationId:req.tenant.organizationId,actorKey,operation,idempotencyKey,requestHash});
  if(result.kind==='replay'){res.status(result.status||200).json({...result.body,idempotentReplay:true});return true;}
  if(result.kind==='conflict'){res.status(409).json({success:false,error:'Idempotency-Key was already used with a different payload'});return true;}
  if(result.kind==='in_progress'){res.status(409).json({success:false,error:'An identical request is still in progress'});return true;}
  const originalJson=res.json.bind(res); res.json=(body)=>{ if(res.statusCode<500) authTenantStore.completePublicIdempotency({id:result.id,status:res.statusCode,body}).catch((error)=>console.error('Idempotency completion failed:',error.message)); return originalJson(body); };
  return false;
}

const uploadWriteRoles = new Set(["owner", "admin", "contributor"]);

function requireUploadWrite(req, res, next) {
  if (!authTenantStore) return next(); // requireTenant has already allowed only explicit test/dev bypasses.
  if (!req.auth || (!req.auth.apiKeyId && !uploadWriteRoles.has(req.auth.role))) {
    return res.status(403).json({ success: false, error: "Your organization role cannot upload or modify uploads" });
  }
  return next();
}

function uploadAccessContext(req) {
  return {
    organizationId: req.tenant?.organizationId || null,
    userId: req.auth?.userId || null,
    canManage: ["owner", "admin"].includes(req.auth?.role)
  };
}

async function assertPersistentUploadAccess(req, uploadId, { completedOnly = false } = {}) {
  if (!authTenantStore) return null;
  const session = await authTenantStore.getUploadSessionForAccess({ uploadId, ...uploadAccessContext(req) });
  if (completedOnly && session.status !== "completed") throw new Error("Upload is not finalized");
  return session;
}

function directCiphertextSize(originalSize, chunkSize) {
  const size = Number(originalSize);
  const chunk = Number(chunkSize);
  if (!Number.isSafeInteger(size) || !Number.isSafeInteger(chunk) || size < 1 || chunk < 1) return NaN;
  return size + (Math.ceil(size / chunk) * 16);
}

// Initialize Decrypted Cache Lifecycle Manager (10-minute TTL)
const cacheManager = new DecryptedCacheManager({ ttlMs: 10 * 60 * 1000 });

// Startup cleanup: purge stale decrypted files from prior sessions
cacheManager.cleanupOrphanedFiles(tempStorageDir);

// Periodic sweep: clean expired cache files every 5 minutes
const pruneInterval = setInterval(() => {
  cacheManager.prune();
  resumableUploads.pruneExpired();
  if (authTenantStore) {
    authTenantStore.pruneExpiredUploadSessions()
      .then(() => directUploads.pruneExpired())
      .then(() => cleanupOrphanedPublisherBlobs())
      .catch((error) => console.error("❌ [Server] Upload session cleanup failed:", error.message));
  } else {
    directUploads.pruneExpired().catch((error) => console.error("❌ [Server] Direct upload cleanup failed:", error.message));
  }
}, 5 * 60 * 1000);
if (typeof pruneInterval.unref === "function") {
  pruneInterval.unref();
}

if (webhookDispatcher) {
  const webhookInterval = setInterval(() => webhookDispatcher.dispatchDue().catch((error) => console.error("❌ [Webhooks] Dispatch failed:", error.message)), 15_000);
  if (typeof webhookInterval.unref === "function") webhookInterval.unref();
}

async function cleanupOrphanedPublisherBlobs() {
  if (!authTenantStore || !authenticatedPublisher.isConfigured()) return 0;
  const orphans = await authTenantStore.listPendingOrphanedPublisherBlobs();
  let cleaned = 0;
  for (const orphan of orphans) {
    try {
      const response = await fetch(authenticatedPublisher.deleteUrl(orphan.blobId), { method: "DELETE" });
      if (!response.ok && response.status !== 404) continue;
      await authTenantStore.markOrphanedPublisherBlobCleaned(orphan.blobId);
      cleaned++;
    } catch {
      // Keep the tombstone pending for a later sweep.
    }
  }
  return cleaned;
}

const app = express();

function requireTenantEnvelopeStore(req, res, next) {
  if (!authTenantStore || !req.auth || !req.tenant) {
    return res.status(503).json({ success: false, error: "Persistent tenant authentication is required for key envelopes" });
  }
  return next();
}

function requireSessionAdmin(req, res, next) {
  if (!req.auth?.userId || !['owner','admin'].includes(req.auth.role)) return res.status(403).json({ success:false,error:'Owner or admin session required' });
  return next();
}

const apiKeyRequestWindows = new Map();
function apiKeyRateLimit(req, res, next) {
  if (!req.auth?.apiKeyId) return next(); const now=Date.now(); const state=apiKeyRequestWindows.get(req.auth.apiKeyId)||{at:now,count:0}; if(now-state.at>60000){state.at=now;state.count=0;} state.count++; apiKeyRequestWindows.set(req.auth.apiKeyId,state); if(state.count>300)return res.status(429).json({success:false,error:'API key rate limit exceeded'}); next();
}

function requireProvisioningAdmin(req, res, next) {
  const configured = process.env.NODUS_PROVISIONING_ADMIN_TOKEN;
  if (!configured) return res.status(503).json({ success: false, error: "Tenant provisioning administration is not configured" });
  const provided = typeof req.headers.authorization === "string" ? req.headers.authorization.replace(/^Bearer\s+/i, "") : "";
  const expectedBytes = Buffer.from(configured);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length || !crypto.timingSafeEqual(expectedBytes, providedBytes)) {
    return res.status(401).json({ success: false, error: "Provisioning administrator token required" });
  }
  if (!authTenantStore) return res.status(503).json({ success: false, error: "Persistent tenant store is required for provisioning" });
  return next();
}

function containsRawKeyMaterial(value) {
  const forbiddenFields = new Set([
    "key",
    "keyhex",
    "privatekey",
    "private_key",
    "recoverykey",
    "recovery_key",
    "recoveryprivatekey",
    "recovery_private_key"
  ]);
  const seen = new Set();

  const inspect = (candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    if (Array.isArray(candidate)) return candidate.some(inspect);

    // A JWK public key is allowed for ECDH identities. A JWK containing `d`
    // is private key material and must never reach the gateway.
    if (typeof candidate.kty === "string" && Object.prototype.hasOwnProperty.call(candidate, "d")) return true;

    return Object.entries(candidate).some(([field, nested]) =>
      forbiddenFields.has(String(field).replace(/[-_]/g, "").toLowerCase()) || inspect(nested)
    );
  };

  return inspect(value);
}

function rejectRawKeyMaterial(req, res, next) {
  const forbiddenHeaderNames = new Set([
    "key", "keyhex", "privatekey", "private-key", "recoverykey", "recovery-key",
    "x-key", "x-keyhex", "x-private-key", "x-recovery-key", "x-nodus-key"
  ]);
  const hasForbiddenHeader = Object.keys(req.headers || {}).some((header) => forbiddenHeaderNames.has(header.toLowerCase()));
  if (hasForbiddenHeader || containsRawKeyMaterial(req.query) || containsRawKeyMaterial(req.body)) {
    return res.status(400).json({ success: false, error: "Raw data keys must not be sent to the server" });
  }
  return next();
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
// Block raw data/private/recovery keys before they can reach legacy API
// handlers. Multipart fields are validated again after Multer parses them.
app.use("/api/", rejectRawKeyMaterial);

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

// ==========================================
// TENANT PROVISIONING ADMINISTRATION
// ==========================================
// This plane is intentionally separate from organization RBAC: an organization
// cannot create itself or select a storage context without an operator token.
async function runTenantProvisioning(operation, storage = null) {
  try {
    const context = await tenantProvisioner.provision({
      organizationId: operation.organizationId,
      name: operation.name,
      quotaBytes: operation.quotaBytes,
      idempotencyKey: operation.id,
      storage
    });
    return await authTenantStore.completeTenantProvisioning({ operationId: operation.id, storageContext: context });
  } catch (error) {
    await authTenantStore.failTenantProvisioning({ operationId: operation.id, error: error.message });
    throw error;
  }
}

app.get("/api/admin/tenants", requireProvisioningAdmin, async (req, res) => {
  try { return res.json({ success: true, tenants: await authTenantStore.listTenantProvisioning({ status: req.query.status || null, limit: req.query.limit }) }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});

app.post("/api/admin/tenants", requireProvisioningAdmin, async (req, res) => {
  const { organizationId, name, ownerAddress, quotaBytes, storage } = req.body || {};
  if (!isValidSolanaAddress(ownerAddress)) return res.status(400).json({ success: false, error: "ownerAddress must be a valid Solana address" });
  const idempotencyKey = TenantProvisioner.idempotencyKey(req.headers["idempotency-key"] || req.body?.idempotencyKey);
  try {
    const started = await authTenantStore.beginTenantProvisioning({ idempotencyKey, organizationId, name, ownerAddress, quotaBytes });
    if (started.duplicate) return res.status(200).json({ success: true, duplicate: true, tenant: started.operation });
    const tenant = await runTenantProvisioning(started.operation, storage || null);
    return res.status(201).json({ success: true, duplicate: false, tenant });
  } catch (error) { return res.status(502).json({ success: false, error: error.message, idempotencyKey }); }
});

app.get("/api/admin/tenants/:operationId", requireProvisioningAdmin, async (req, res) => {
  try {
    const tenant = await authTenantStore.getTenantProvisioning(req.params.operationId);
    if (!tenant) return res.status(404).json({ success: false, error: "Provisioning operation not found" });
    return res.json({ success: true, tenant, events: await authTenantStore.listTenantProvisioningEvents(tenant.id) });
  } catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});

app.post("/api/admin/tenants/:operationId/retry", requireProvisioningAdmin, async (req, res) => {
  try {
    const pending = await authTenantStore.retryTenantProvisioning(req.params.operationId);
    const tenant = await runTenantProvisioning(pending, req.body?.storage || null);
    return res.json({ success: true, tenant });
  } catch (error) { return res.status(502).json({ success: false, error: error.message }); }
});

app.patch("/api/admin/tenants/:operationId", requireProvisioningAdmin, async (req, res) => {
  try {
    const tenant = await authTenantStore.setTenantLifecycle({ operationId: req.params.operationId, status: req.body?.status, quotaBytes: req.body?.quotaBytes });
    return res.json({ success: true, tenant });
  } catch (error) { return res.status(400).json({ success: false, error: error.message }); }
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

// Invitations are scoped to the active organization. Their token is returned
// once to the inviter and is consumed only after the invited address proves
// possession through a fresh SIWS challenge.
app.get("/api/orgs/:orgId/invitations", requireTenant, requireTenantEnvelopeStore, async (req, res) => {
  if (req.params.orgId !== req.tenant.organizationId || !['owner', 'admin'].includes(req.auth.role)) return res.status(403).json({ success: false, error: "Insufficient organization role" });
  try { return res.json({ success: true, invitations: await authTenantStore.listInvitations({ organizationId: req.tenant.organizationId }) }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});

app.post("/api/orgs/:orgId/invitations", requireTenant, requireTenantEnvelopeStore, async (req, res) => {
  if (req.params.orgId !== req.tenant.organizationId || !['owner', 'admin'].includes(req.auth.role)) return res.status(403).json({ success: false, error: "Insufficient organization role" });
  const recipientAddress = req.body?.recipientAddress;
  if (!isValidSolanaAddress(recipientAddress)) return res.status(400).json({ success: false, error: "recipientAddress must be a valid Solana address" });
  try {
    const { invitation, token } = await authTenantStore.createInvitation({ organizationId: req.tenant.organizationId, invitedBy: req.auth.userId, recipientAddress, role: req.body?.role || "viewer", ttlSeconds: req.body?.ttlSeconds });
    return res.status(201).json({ success: true, invitation, acceptanceToken: token });
  } catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});

app.delete("/api/orgs/:orgId/invitations/:invitationId", requireTenant, requireTenantEnvelopeStore, async (req, res) => {
  if (req.params.orgId !== req.tenant.organizationId || !['owner', 'admin'].includes(req.auth.role)) return res.status(403).json({ success: false, error: "Insufficient organization role" });
  try { await authTenantStore.revokeInvitation({ organizationId: req.tenant.organizationId, invitationId: req.params.invitationId }); return res.json({ success: true, revoked: true }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});

app.post("/api/org-invitations/accept", async (req, res) => {
  const { token, address, signature, message } = req.body || {};
  if (!authTenantStore) return res.status(503).json({ success: false, error: "Persistent tenant authentication is required for invitation acceptance" });
  if (typeof token !== "string" || token.length < 32 || !isValidSolanaAddress(address)) return res.status(400).json({ success: false, error: "A valid invitation token and Solana address are required" });
  const verified = verifySolanaSignature(address, signature, message);
  if (!verified.valid) return res.status(401).json({ success: false, error: verified.error });
  try {
    const accepted = await authTenantStore.acceptInvitation({ token, address });
    const session = await authTenantStore.createSession({ address, organizationId: accepted.organizationId });
    return res.json({ success: true, organizationId: accepted.organizationId, role: accepted.role, accessToken: session.token, expiresAt: session.expiresAt });
  } catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});

app.get("/api/orgs/:orgId/api-keys", requireTenant, requireTenantEnvelopeStore, requireSessionAdmin, async (req,res)=>{
  if(req.params.orgId!==req.tenant.organizationId)return res.status(403).json({success:false,error:'Organization does not match active tenant'});
  try{return res.json({success:true,apiKeys:await authTenantStore.listApiKeys({organizationId:req.tenant.organizationId})});}catch(error){return res.status(400).json({success:false,error:error.message});}
});
app.post("/api/orgs/:orgId/api-keys", requireTenant, requireTenantEnvelopeStore, requireSessionAdmin, async (req,res)=>{
  if(req.params.orgId!==req.tenant.organizationId)return res.status(403).json({success:false,error:'Organization does not match active tenant'});
  try{const created=await authTenantStore.createApiKey({organizationId:req.tenant.organizationId,actorUserId:req.auth.userId,name:req.body?.name,scopes:req.body?.scopes,expiresAt:req.body?.expiresAt||null});return res.status(201).json({success:true,...created});}catch(error){return res.status(400).json({success:false,error:error.message});}
});
app.post("/api/orgs/:orgId/api-keys/:apiKeyId/rotate", requireTenant, requireTenantEnvelopeStore, requireSessionAdmin, async (req,res)=>{
  if(req.params.orgId!==req.tenant.organizationId)return res.status(403).json({success:false,error:'Organization does not match active tenant'});
  try{const created=await authTenantStore.rotateApiKey({organizationId:req.tenant.organizationId,apiKeyId:req.params.apiKeyId,actorUserId:req.auth.userId,...(req.body||{})});return res.json({success:true,...created});}catch(error){return res.status(400).json({success:false,error:error.message});}
});
app.delete("/api/orgs/:orgId/api-keys/:apiKeyId", requireTenant, requireTenantEnvelopeStore, requireSessionAdmin, async (req,res)=>{
  if(req.params.orgId!==req.tenant.organizationId)return res.status(403).json({success:false,error:'Organization does not match active tenant'});
  try{await authTenantStore.revokeApiKey({organizationId:req.tenant.organizationId,apiKeyId:req.params.apiKeyId,actorUserId:req.auth.userId});return res.json({success:true,revoked:true});}catch(error){return res.status(400).json({success:false,error:error.message});}
});

function createWebhookSecret() { return `whsec_${crypto.randomBytes(32).toString("base64url")}`; }
function requireWebhooks(req, res, next) {
  if (!webhookDispatcher) return res.status(503).json({ success: false, error: "Signed webhooks are not configured" });
  return next();
}
app.get("/api/orgs/:orgId/webhooks", requireTenant, requireTenantEnvelopeStore, requireSessionAdmin, async (req, res) => {
  if (req.params.orgId !== req.tenant.organizationId) return res.status(403).json({ success: false, error: "Organization does not match active tenant" });
  try { return res.json({ success: true, webhooks: await authTenantStore.listWebhooks({ organizationId: req.tenant.organizationId }) }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});
app.post("/api/orgs/:orgId/webhooks", requireTenant, requireTenantEnvelopeStore, requireSessionAdmin, requireWebhooks, async (req, res) => {
  if (req.params.orgId !== req.tenant.organizationId) return res.status(403).json({ success: false, error: "Organization does not match active tenant" });
  try { const secret = createWebhookSecret(); const webhook = await authTenantStore.createWebhook({ organizationId: req.tenant.organizationId, actorUserId: req.auth.userId, url: req.body?.url, eventTypes: req.body?.eventTypes, encryptedSecret: encryptWebhookSecret(secret), secretPrefix: secret.slice(0, 12) }); return res.status(201).json({ success: true, webhook, secret, warning: "Store this secret now; it is shown only once." }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});
app.post("/api/orgs/:orgId/webhooks/:webhookId/rotate", requireTenant, requireTenantEnvelopeStore, requireSessionAdmin, requireWebhooks, async (req, res) => {
  if (req.params.orgId !== req.tenant.organizationId) return res.status(403).json({ success: false, error: "Organization does not match active tenant" });
  try { const secret = createWebhookSecret(); const webhook = await authTenantStore.rotateWebhook({ organizationId: req.tenant.organizationId, webhookId: req.params.webhookId, actorUserId: req.auth.userId, encryptedSecret: encryptWebhookSecret(secret), secretPrefix: secret.slice(0, 12) }); return res.json({ success: true, webhook, secret, warning: "Store this replacement secret now; it is shown only once." }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});
app.delete("/api/orgs/:orgId/webhooks/:webhookId", requireTenant, requireTenantEnvelopeStore, requireSessionAdmin, async (req, res) => {
  if (req.params.orgId !== req.tenant.organizationId) return res.status(403).json({ success: false, error: "Organization does not match active tenant" });
  try { await authTenantStore.revokeWebhook({ organizationId: req.tenant.organizationId, webhookId: req.params.webhookId, actorUserId: req.auth.userId }); return res.json({ success: true, revoked: true }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});

// ==========================================
// RESUMABLE ENCRYPTED UPLOADS
// ==========================================

// Create an upload session. The client supplies ciphertext size because each AES-GCM
// chunk carries its own authentication tag and can be safely retried independently.
app.post(["/api/assets/uploads", "/api/photos/uploads"], requireTenant, requireUploadWrite, uploadLimiter, async (req, res) => {
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

  let reservation = null;
  try {
    const parsedTags = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
        ? tags.split(",").map((tag) => tag.trim())
        : [];
    const uploadId = crypto.randomUUID();
    const assetId = `staged_${uploadId}`;
    const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();
    if (authTenantStore) {
      reservation = await authTenantStore.reserveUpload({
        uploadId, assetId, organizationId: req.tenant.organizationId, userId: req.auth.userId,
        uploadKind: "resumable", reservedBytes: encryptedSize, expiresAt, originalName, originalSize
      });
    }
    const session = resumableUploads.create({
      originalName: sanitizeString(originalName, 128),
      originalType: sanitizeString(originalType, 255),
      originalSize,
      encryptedSize,
      partSize,
      description: sanitizeString(description, 512),
      tags: sanitizeTags(parsedTags),
      encryption,
      organizationId: req.tenant?.organizationId,
      userId: req.auth?.userId || null,
      assetId,
      quotaReservationId: reservation?.reservationId || null,
      uploadId
    });
    res.status(201).json({ success: true, upload: session });
  } catch (err) {
    if (reservation && authTenantStore) {
      try { await authTenantStore.abortUpload({ uploadId: reservation.uploadId, ...uploadAccessContext(req), reason: "failed" }); } catch {}
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

// Query received parts after an interrupted browser session or network failure.
app.get(["/api/assets/uploads/:uploadId", "/api/photos/uploads/:uploadId"], requireTenant, async (req, res) => {
  try {
    await assertPersistentUploadAccess(req, req.params.uploadId);
    const session = resumableUploads.get(req.params.uploadId, uploadAccessContext(req));
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
  requireTenant, requireUploadWrite, resumablePartLimiter,
  resumablePartBody,
  async (req, res) => {
    try {
      await assertPersistentUploadAccess(req, req.params.uploadId);
      const result = resumableUploads.writePart(
        req.params.uploadId,
        req.params.partNumber,
        req.body,
        req.headers["x-part-sha256"],
        uploadAccessContext(req)
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
app.post(["/api/assets/uploads/:uploadId/complete", "/api/photos/uploads/:uploadId/complete"], requireTenant, requireUploadWrite, uploadLimiter, async (req, res) => {
  const { uploadId } = req.params;
  try {
    await assertPersistentUploadAccess(req, uploadId);
    const existing = resumableUploads.getInternal(uploadId, uploadAccessContext(req));
    if (existing.status === "completed") {
      if (authTenantStore) await authTenantStore.completeUpload({ uploadId, ...uploadAccessContext(req), providerAssetId: existing.completedAsset?.id });
      return res.json({ success: true, upload: resumableUploads.get(uploadId, uploadAccessContext(req)), asset: existing.completedAsset, result: existing.completedAsset });
    }
    const { session, assembledPath, ciphertextSha256 } = await resumableUploads.assemble(uploadId, uploadAccessContext(req));
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
    const completed = resumableUploads.markCompleted(uploadId, result, ciphertextSha256, uploadAccessContext(req));
    if (authTenantStore) {
      await authTenantStore.completeUpload({ uploadId, ...uploadAccessContext(req), providerAssetId: result.id });
      await authTenantStore.registerAsset({
        organizationId: req.tenant.organizationId, actorUserId: req.auth.userId, assetId: result.id,
        name: session.originalName, contentType: session.originalType, byteSize: session.originalSize,
        description: session.description, tags: session.tags, storageKind: "walrus", folderId: req.body?.folderId || null
      });
    }
    res.json({ success: true, upload: completed, asset: result, result });
  } catch (err) {
    try { resumableUploads.markRetryable(uploadId, uploadAccessContext(req)); } catch {}
    console.error(`❌ [ResumableUpload] Completion failed for ${uploadId}:`, err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// Explicit cancellation immediately removes staged ciphertext and session metadata.
app.delete(["/api/assets/uploads/:uploadId", "/api/photos/uploads/:uploadId"], requireTenant, requireUploadWrite, async (req, res) => {
  try {
    if (authTenantStore) {
      const aborted = await authTenantStore.abortUpload({ uploadId: req.params.uploadId, ...uploadAccessContext(req) });
      if (aborted.alreadyCompleted) throw new Error("Completed upload cannot be aborted");
    }
    resumableUploads.abort(req.params.uploadId, uploadAccessContext(req));
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
app.post("/api/assets/direct-uploads", requireTenant, requireUploadWrite, uploadLimiter, async (req, res) => {
  const { originalName, originalType, originalSize, segmentSize, description, tags, encryption, epochs } = req.body || {};
  if (containsRawKeyMaterial(encryption)) {
    return res.status(400).json({ success: false, error: "Raw data keys must not be sent to the server" });
  }
  let reservation = null;
  try {
    const parsedTags = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",").map((tag) => tag.trim()) : [];
    const uploadId = crypto.randomUUID();
    const assetId = `direct_${uploadId}`;
    const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();
    if (authTenantStore) {
      reservation = await authTenantStore.reserveUpload({
        uploadId, assetId, organizationId: req.tenant.organizationId, userId: req.auth.userId,
        uploadKind: "direct", reservedBytes: directCiphertextSize(originalSize, encryption?.chunkSize),
        expiresAt, originalName, originalSize
      });
    }
    const upload = await directUploads.create({
      originalName: sanitizeString(originalName, 128),
      originalType: sanitizeString(originalType, 255),
      originalSize,
      segmentSize,
      description: sanitizeString(description, 512),
      tags: sanitizeTags(parsedTags),
      encryption,
      epochs,
      tenant: req.tenant,
      userId: req.auth?.userId || null,
      assetId,
      quotaReservationId: reservation?.reservationId || null,
      uploadId
    });
    res.status(201).json({ success: true, upload, publisherConfigured: authenticatedPublisher.isConfigured() });
  } catch (err) {
    if (reservation && authTenantStore) {
      try { await authTenantStore.abortUpload({ uploadId: reservation.uploadId, ...uploadAccessContext(req), reason: "failed" }); } catch {}
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get("/api/assets/direct-uploads/:uploadId", requireTenant, async (req, res) => {
  try {
    await assertPersistentUploadAccess(req, req.params.uploadId);
    res.json({ success: true, upload: await directUploads.get(req.params.uploadId, uploadAccessContext(req)) });
  } catch (err) {
    res.status(err.message === "Upload session not found" ? 404 : 400).json({ success: false, error: err.message });
  }
});

app.post("/api/assets/direct-uploads/:uploadId/segments/:segmentIndex/authorize", requireTenant, requireUploadWrite, uploadLimiter, async (req, res) => {
  try {
    authenticatedPublisher.assertConfigured();
    await assertPersistentUploadAccess(req, req.params.uploadId);
    const { session, segment } = await directUploads.authorizeSegment(req.params.uploadId, req.params.segmentIndex, uploadAccessContext(req));
    const ciphertextSha256 = req.body?.ciphertextSha256;
    const authorization = authenticatedPublisher.authorize({
      uploadId: session.uploadId,
      segment,
      epochs: session.epochs,
      ciphertextSha256,
      sendObjectTo: req.body?.sendObjectTo || null
    });
    await directUploads.saveAuthorization(session.uploadId, segment.index, authorization, uploadAccessContext(req));
    res.json({ success: true, authorization });
  } catch (err) {
    const status = err.message === "Authenticated publisher is not configured" ? 503 : err.message === "Upload session not found" ? 404 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

app.post("/api/assets/direct-uploads/:uploadId/segments/:segmentIndex/complete", requireTenant, requireUploadWrite, uploadLimiter, async (req, res) => {
  try {
    authenticatedPublisher.assertConfigured();
    await assertPersistentUploadAccess(req, req.params.uploadId);
    const context = await directUploads.completionContext(req.params.uploadId, req.params.segmentIndex, uploadAccessContext(req));
    const receipt = authenticatedPublisher.verifyReceipt(req.body?.receipt, context);
    const upload = await directUploads.completeSegment(req.params.uploadId, req.params.segmentIndex, {
      blobId: receipt.blobId,
      ciphertextSha256: req.body?.ciphertextSha256,
      chunkSha256s: req.body?.chunkSha256s,
      publisherResponse: req.body?.publisherResponse,
      receipt,
      verified: true
    }, uploadAccessContext(req));
    res.json({ success: true, upload });
  } catch (err) {
    res.status(err.message === "Upload session not found" ? 404 : 400).json({ success: false, error: err.message });
  }
});

app.post("/api/assets/direct-uploads/:uploadId/finalize", requireTenant, requireUploadWrite, uploadLimiter, async (req, res) => {
  try {
    await assertPersistentUploadAccess(req, req.params.uploadId);
    const result = await directUploads.finalize(req.params.uploadId, uploadAccessContext(req));
    if (authTenantStore) {
      await authTenantStore.completeUpload({ uploadId: req.params.uploadId, ...uploadAccessContext(req), providerAssetId: result.asset.id });
      await authTenantStore.registerAsset({
        organizationId: req.tenant.organizationId, actorUserId: req.auth.userId, assetId: result.asset.id,
        name: result.asset.name, contentType: result.asset.original_type, byteSize: result.asset.original_size,
        description: result.asset.description, tags: result.asset.tags, storageKind: "direct", folderId: req.body?.folderId || null
      });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.message === "Upload session not found" ? 404 : 400).json({ success: false, error: err.message });
  }
});

app.get("/api/assets/direct-uploads/:uploadId/manifest", requireTenant, async (req, res) => {
  try {
    await assertPersistentUploadAccess(req, req.params.uploadId, { completedOnly: true });
    res.json({ success: true, manifest: await directUploads.manifest(req.params.uploadId, uploadAccessContext(req)) });
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
    const manifest = await directUploads.manifestByAssetId(req.params.assetId, uploadAccessContext(req));
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
app.get("/api/assets/:assetId/direct-manifest", requireTenant, async (req, res) => {
  try {
    res.json({ success: true, manifest: await directUploads.manifestByAssetId(req.params.assetId, uploadAccessContext(req)) });
  } catch (err) {
    const status = err.message === "Upload session not found" ? 404 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

app.delete("/api/assets/direct-uploads/:uploadId", requireTenant, requireUploadWrite, async (req, res, next) => {
  try {
    const upload = await directUploads.get(req.params.uploadId, uploadAccessContext(req));
    if (authTenantStore) {
      const aborted = await authTenantStore.abortUpload({ uploadId: req.params.uploadId, ...uploadAccessContext(req) });
      if (aborted.alreadyCompleted) throw new Error("Completed upload cannot be aborted");
    }
    await directUploads.abort(req.params.uploadId, uploadAccessContext(req));
    if (authTenantStore) await authTenantStore.deleteKeyEnvelopeAsset({ organizationId: req.tenant.organizationId, assetId: upload.assetId || `direct_${req.params.uploadId}` });
    res.json({ success: true, aborted: true });
  } catch (error) {
    return next(error);
  }
});

// Persistent tenant catalog. Folders and metadata remain private control-plane
// records; only ciphertext is stored in Walrus.
app.get("/api/assets/folders", requireTenant, requireTenantEnvelopeStore, async (req, res) => {
  try { res.json({ success: true, folders: await authTenantStore.listFolders({ organizationId: req.tenant.organizationId }) }); }
  catch (error) { res.status(400).json({ success: false, error: error.message }); }
});
app.post("/api/assets/folders", requireTenant, requireTenantEnvelopeStore, async (req, res) => {
  if (!['owner', 'admin', 'contributor'].includes(req.auth.role)) return res.status(403).json({ success: false, error: "Insufficient organization role" });
  try { const folder = await authTenantStore.createFolder({ organizationId: req.tenant.organizationId, actorUserId: req.auth.userId, name: req.body?.name, parentId: req.body?.parentId || null }); return res.status(201).json({ success: true, folder }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});
app.patch("/api/assets/folders/:folderId", requireTenant, requireTenantEnvelopeStore, async (req, res) => {
  if (!['owner', 'admin', 'contributor'].includes(req.auth.role)) return res.status(403).json({ success: false, error: "Insufficient organization role" });
  try { return res.json({ success: true, folder: await authTenantStore.renameFolder({ organizationId: req.tenant.organizationId, actorUserId: req.auth.userId, folderId: req.params.folderId, name: req.body?.name }) }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});
app.delete("/api/assets/folders/:folderId", requireTenant, requireTenantEnvelopeStore, async (req, res) => {
  if (!['owner', 'admin', 'contributor'].includes(req.auth.role)) return res.status(403).json({ success: false, error: "Insufficient organization role" });
  try { await authTenantStore.deleteFolder({ organizationId: req.tenant.organizationId, actorUserId: req.auth.userId, folderId: req.params.folderId }); return res.json({ success: true, deleted: true }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});
app.get("/api/assets/:fileId/versions", requireTenant, requireTenantEnvelopeStore, async (req, res) => {
  try { const asset = await authTenantStore.getCatalogAsset({ organizationId: req.tenant.organizationId, assetId: req.params.fileId }); if (!asset) return res.status(404).json({ success: false, error: "Catalog asset not found" }); return res.json({ success: true, assetId: asset.id, versions: await authTenantStore.listAssetVersions({ organizationId: req.tenant.organizationId, assetId: asset.id }) }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});
app.get("/api/assets/:fileId/audit", requireTenant, requireTenantEnvelopeStore, async (req, res) => {
  try { const asset = await authTenantStore.getCatalogAsset({ organizationId: req.tenant.organizationId, assetId: req.params.fileId }); if (!asset) return res.status(404).json({ success: false, error: "Catalog asset not found" }); return res.json({ success: true, assetId: asset.id, events: await authTenantStore.listAssetAudit({ organizationId: req.tenant.organizationId, assetId: asset.id, limit: req.query.limit }) }); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
});

// 2. List assets. Authenticated deployments read PostgreSQL rather than an
// unbounded bucket listing, allowing cursor pagination and tenant-only metadata.
app.get(["/api/photos", "/api/assets"], requireTenant, async (req, res) => {
  try {
    if (authTenantStore) {
      const page = await authTenantStore.listCatalogAssets({ organizationId: req.tenant.organizationId, folderId: req.query.folderId, limit: req.query.limit, cursor: req.query.cursor });
      const assets = page.assets.map((asset) => ({ ...asset, created_at: asset.createdAt, content_type: asset.contentType, stream_url: asset.storageKind === "walrus" ? `/api/assets/${asset.id}/stream` : null, download_url: asset.storageKind === "walrus" ? `/api/assets/${asset.id}/stream?download=true` : null }));
      return res.json({ success: true, count: assets.length, assets, photos: assets, nextCursor: page.nextCursor });
    }
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
    photos.push(...(await directUploads.listAssets(req.tenant?.organizationId)).map((asset) => ({
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
app.post(["/api/photos/upload", "/api/assets/upload"], requireTenant, requireUploadWrite, uploadLimiter, upload.any(), async (req, res) => {
  const uploadedFile = req.file || (req.files && req.files[0]);
  if (!uploadedFile) {
    return res.status(400).json({ success: false, error: "No asset file uploaded" });
  }
  req.file = uploadedFile;

  const localFilePath = req.file.path;
  const originalName = req.body.originalName || req.body.original_name || req.file.originalname;
  const description = req.body.description || "Uploaded via Nodus";
  let uploadRecord = null;

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

    if (authTenantStore) {
      const uploadId = crypto.randomUUID();
      uploadRecord = await authTenantStore.reserveUpload({
        uploadId,
        assetId: `single_${uploadId}`,
        organizationId: req.tenant.organizationId,
        userId: req.auth.userId,
        uploadKind: "single",
        reservedBytes: req.file.size,
        expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(),
        originalName: sanitizedName,
        originalSize: Number(encryption?.originalSize) || req.file.size
      });
    }

    const result = await walrus.uploadPhoto({
      localPath: localFilePath,
      fileName: sanitizedName,
      description: sanitizedDesc,
      tags: combinedTags,
      encryption: encryption || undefined, tenant: req.tenant
    });
    if (uploadRecord && authTenantStore) {
      await authTenantStore.completeUpload({ uploadId: uploadRecord.uploadId, ...uploadAccessContext(req), providerAssetId: result.id });
      await authTenantStore.registerAsset({
        organizationId: req.tenant.organizationId, actorUserId: req.auth.userId, assetId: result.id,
        name: sanitizedName, contentType: encryption?.originalType || req.file.mimetype || "application/octet-stream",
        byteSize: Number(encryption?.originalSize) || req.file.size, description: sanitizedDesc, tags: combinedTags,
        storageKind: "walrus", folderId: req.body.folderId || null
      });
    }

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
    // A failed provider write must not hold quota until the TTL sweep. This is
    // intentionally best-effort because the original upload error is more useful.
    if (uploadRecord && authTenantStore) {
      try { await authTenantStore.abortUpload({ uploadId: uploadRecord.uploadId, ...uploadAccessContext(req), reason: "failed" }); } catch {}
    }
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
    if (authTenantStore) {
      const catalogAsset = await authTenantStore.getCatalogAsset({ organizationId: req.tenant.organizationId, assetId: fileId });
      if (!catalogAsset || catalogAsset.storageKind !== "walrus") return res.status(404).json({ success: false, error: "File not found" });
    }
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
    if (authTenantStore && !await authTenantStore.getCatalogAsset({ organizationId: req.tenant.organizationId, assetId: fileId })) {
      return res.status(404).json({ success: false, error: "Catalog asset not found" });
    }
    await walrus.deletePhoto(fileId, req.tenant);
    if (authTenantStore) await authTenantStore.deleteCatalogAsset({ organizationId: req.tenant.organizationId, assetId: fileId, actorUserId: req.auth.userId });
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
    if (authTenantStore && !await authTenantStore.getCatalogAsset({ organizationId: req.tenant.organizationId, assetId: fileId })) {
      return res.status(404).json({ success: false, error: "Catalog asset not found" });
    }
    const result = await walrus.updatePhoto({
      fileId,
      name: cleanName,
      description: cleanDesc,
      tags: cleanTags, tenant: req.tenant
    });
    if (authTenantStore) await authTenantStore.updateCatalogAsset({ organizationId: req.tenant.organizationId, assetId: fileId, actorUserId: req.auth.userId, changes: { name: cleanName, description: cleanDesc, tags: cleanTags, folderId: req.body.folderId } });

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
      if (authTenantStore && !await authTenantStore.getCatalogAsset({ organizationId: req.tenant.organizationId, assetId: fileId })) {
        results.push({ fileId, success: false, error: "Catalog asset not found" });
        continue;
      }
      await walrus.deletePhoto(fileId, req.tenant);
      if (authTenantStore) await authTenantStore.deleteCatalogAsset({ organizationId: req.tenant.organizationId, assetId: fileId, actorUserId: req.auth.userId });
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
