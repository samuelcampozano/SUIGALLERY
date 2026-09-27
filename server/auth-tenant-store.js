import crypto from "node:crypto";
import { Pool } from "pg";

const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const validRoles = new Set(["owner", "admin", "contributor", "viewer"]);
const MAX_ENVELOPES_PER_ASSET = 500;

function isP256PublicJwk(value) {
  return value && typeof value === "object" && value.kty === "EC" && value.crv === "P-256"
    && typeof value.x === "string" && value.x.length >= 40
    && typeof value.y === "string" && value.y.length >= 40
    && !Object.prototype.hasOwnProperty.call(value, "d");
}

export class AuthTenantStore {
  constructor({ databaseUrl = process.env.DATABASE_URL } = {}) {
    if (!databaseUrl) throw new Error("DATABASE_URL is required for authenticated tenant mode");
    const isSsl = databaseUrl.includes("render.com") || databaseUrl.includes("sslmode=require") || process.env.NODE_ENV === "production";
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: isSsl ? { rejectUnauthorized: false } : false
    });
  }

  /** Initializes PostgreSQL tables and indexes. Tenant contexts are provisioned explicitly. */
  async init() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY,
          solana_address TEXT UNIQUE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS memberships (
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'contributor', 'viewer')),
          PRIMARY KEY (organization_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS tenant_storage_contexts (
          organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
          space_id TEXT NOT NULL,
          bucket_id TEXT NOT NULL,
          seal_policy_id TEXT NOT NULL,
          quota_bytes BIGINT NOT NULL CHECK (quota_bytes >= 0),
          active BOOLEAN NOT NULL DEFAULT true
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          revoked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS sessions_active_idx ON sessions (token_hash, expires_at) WHERE revoked_at IS NULL;

        CREATE TABLE IF NOT EXISTS user_key_identities (
          user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          public_key JSONB NOT NULL,
          recovery_public_key JSONB,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS key_envelope_assets (
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          asset_id TEXT NOT NULL,
          owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (organization_id, asset_id)
        );

        CREATE TABLE IF NOT EXISTS asset_key_envelopes (
          id UUID PRIMARY KEY,
          organization_id TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_type TEXT NOT NULL CHECK (recipient_type IN ('user', 'recovery')),
          algorithm TEXT NOT NULL CHECK (algorithm = 'ECDH-P256/AES-256-GCM'),
          ephemeral_public_key JSONB NOT NULL,
          iv TEXT NOT NULL,
          ciphertext TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          FOREIGN KEY (organization_id, asset_id) REFERENCES key_envelope_assets(organization_id, asset_id) ON DELETE CASCADE,
          UNIQUE (organization_id, asset_id, recipient_user_id, recipient_type)
        );
        CREATE INDEX IF NOT EXISTS asset_key_envelopes_recipient_idx ON asset_key_envelopes (organization_id, asset_id, recipient_user_id);

        CREATE TABLE IF NOT EXISTS key_rotation_tasks (
          id UUID PRIMARY KEY,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          asset_id TEXT NOT NULL,
          revoked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK (status IN ('pending', 'completed')) DEFAULT 'pending',
          replacement_asset_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          completed_at TIMESTAMPTZ,
          UNIQUE (organization_id, asset_id, revoked_user_id)
        );
        CREATE INDEX IF NOT EXISTS key_rotation_tasks_pending_idx ON key_rotation_tasks (organization_id, status, created_at);

        CREATE TABLE IF NOT EXISTS tenant_storage_usage (
          organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
          used_bytes BIGINT NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
          reserved_bytes BIGINT NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS managed_assets (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          provider_asset_id TEXT,
          upload_kind TEXT NOT NULL CHECK (upload_kind IN ('resumable', 'direct', 'single')),
          status TEXT NOT NULL CHECK (status IN ('uploading', 'active', 'aborted', 'expired', 'failed')),
          original_name TEXT NOT NULL,
          original_size BIGINT NOT NULL CHECK (original_size >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          finalized_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS managed_assets_tenant_idx ON managed_assets (organization_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS upload_sessions (
          id UUID PRIMARY KEY,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          asset_id TEXT NOT NULL REFERENCES managed_assets(id) ON DELETE CASCADE,
          upload_kind TEXT NOT NULL CHECK (upload_kind IN ('resumable', 'direct', 'single')),
          reserved_bytes BIGINT NOT NULL CHECK (reserved_bytes > 0),
          status TEXT NOT NULL CHECK (status IN ('uploading', 'assembling', 'completed', 'aborted', 'expired', 'failed')),
          expires_at TIMESTAMPTZ NOT NULL,
          completed_asset_id TEXT,
          idempotency_key TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          completed_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS upload_sessions_tenant_status_idx ON upload_sessions (organization_id, status, expires_at);

        CREATE TABLE IF NOT EXISTS quota_reservations (
          id UUID PRIMARY KEY,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          upload_id UUID NOT NULL UNIQUE REFERENCES upload_sessions(id) ON DELETE CASCADE,
          bytes BIGINT NOT NULL CHECK (bytes > 0),
          status TEXT NOT NULL CHECK (status IN ('active', 'committed', 'released')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          finalized_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS upload_audit_events (
          id BIGSERIAL PRIMARY KEY,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          upload_id UUID REFERENCES upload_sessions(id) ON DELETE SET NULL,
          asset_id TEXT,
          event_type TEXT NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS upload_audit_events_tenant_idx ON upload_audit_events (organization_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS upload_session_payloads (
          upload_id UUID PRIMARY KEY REFERENCES upload_sessions(id) ON DELETE CASCADE,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS upload_session_payloads_org_idx ON upload_session_payloads (organization_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS orphaned_publisher_blobs (
          blob_id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          upload_id UUID REFERENCES upload_sessions(id) ON DELETE SET NULL,
          reason TEXT NOT NULL,
          discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          cleaned_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS asset_folders (
          id UUID PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          parent_id UUID, name TEXT NOT NULL, created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (organization_id, id),
          FOREIGN KEY (organization_id, parent_id) REFERENCES asset_folders(organization_id, id) ON DELETE RESTRICT,
          UNIQUE NULLS NOT DISTINCT (organization_id, parent_id, name)
        );
        CREATE TABLE IF NOT EXISTS catalog_assets (
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, asset_id TEXT NOT NULL,
          owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, folder_id UUID, name TEXT NOT NULL,
          content_type TEXT NOT NULL, byte_size BIGINT NOT NULL CHECK (byte_size >= 0), description TEXT NOT NULL DEFAULT '',
          tags JSONB NOT NULL DEFAULT '[]'::jsonb, storage_kind TEXT NOT NULL CHECK (storage_kind IN ('walrus', 'direct')),
          status TEXT NOT NULL CHECK (status IN ('active', 'deleted')) DEFAULT 'active',
          current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ,
          PRIMARY KEY (organization_id, asset_id),
          FOREIGN KEY (organization_id, folder_id) REFERENCES asset_folders(organization_id, id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS catalog_assets_list_idx ON catalog_assets (organization_id, status, created_at DESC, asset_id DESC);
        CREATE INDEX IF NOT EXISTS catalog_assets_folder_idx ON catalog_assets (organization_id, folder_id, status, created_at DESC);
        CREATE TABLE IF NOT EXISTS asset_versions (
          organization_id TEXT NOT NULL, asset_id TEXT NOT NULL, version INTEGER NOT NULL CHECK (version >= 1),
          name TEXT NOT NULL, content_type TEXT NOT NULL, byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
          description TEXT NOT NULL DEFAULT '', tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, change_reason TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (organization_id, asset_id, version),
          FOREIGN KEY (organization_id, asset_id) REFERENCES catalog_assets(organization_id, asset_id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS asset_audit_events (
          id UUID PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, asset_id TEXT,
          actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL, event_type TEXT NOT NULL,
          details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS asset_audit_events_asset_idx ON asset_audit_events (organization_id, asset_id, created_at DESC);

      `);
      console.log("🐘 [AuthTenantStore] PostgreSQL database schema verified.");
    } catch (err) {
      console.error("❌ [AuthTenantStore] Migration error:", err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  async createSession({ address, organizationId, ttlSeconds = 3600 }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const userId = crypto.randomUUID();
      await client.query("INSERT INTO users (id, solana_address) VALUES ($1, $2) ON CONFLICT (solana_address) DO NOTHING", [userId, address]);
      const user = await client.query("SELECT id FROM users WHERE solana_address = $1", [address]);
      const member = await client.query("SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2", [organizationId, user.rows[0].id]);
      const tenant = await client.query("SELECT space_id, bucket_id, seal_policy_id, quota_bytes FROM tenant_storage_contexts WHERE organization_id = $1 AND active = true", [organizationId]);
      if (!member.rowCount || !tenant.rowCount) throw new Error("No active membership or storage context for organization");
      const token = crypto.randomBytes(32).toString("base64url");
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await client.query("INSERT INTO sessions (id, user_id, organization_id, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)", [sessionId, user.rows[0].id, organizationId, tokenHash(token), expiresAt]);
      await client.query("COMMIT");
      return { token, expiresAt: expiresAt.toISOString(), userId: user.rows[0].id, role: member.rows[0].role, tenant: tenant.rows[0] };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async resolve(token) {
    const query = `SELECT s.id, u.id AS user_id, u.solana_address, m.role, t.organization_id, t.space_id, t.bucket_id, t.seal_policy_id, t.quota_bytes
      FROM sessions s JOIN users u ON u.id = s.user_id JOIN memberships m ON m.user_id = u.id AND m.organization_id = s.organization_id
      JOIN tenant_storage_contexts t ON t.organization_id = s.organization_id AND t.active = true
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`;
    const result = await this.pool.query(query, [tokenHash(token)]);
    if (!result.rowCount) return null;
    return result.rows[0];
  }

  async reserveUpload({ uploadId, assetId, organizationId, userId, uploadKind, reservedBytes, expiresAt, originalName, originalSize }) {
    if (!/^(resumable|direct|single)$/.test(uploadKind || "")) throw new Error("Unsupported upload kind");
    const bytes = Number(reservedBytes);
    const size = Number(originalSize);
    if (!Number.isSafeInteger(bytes) || bytes < 1) throw new Error("Upload reservation size is invalid");
    if (!Number.isSafeInteger(size) || size < 1) throw new Error("Original asset size is invalid");
    if (!uploadId || !assetId || !organizationId || !userId || !expiresAt) throw new Error("Upload reservation context is incomplete");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT u.id, u.organization_id, u.user_id, u.asset_id, u.expires_at AS "expiresAt", q.id AS "reservationId"
           FROM upload_sessions u JOIN quota_reservations q ON q.upload_id = u.id
          WHERE u.idempotency_key = $1 FOR UPDATE`,
        [uploadId]
      );
      if (existing.rowCount) {
        const session = existing.rows[0];
        if (session.organization_id !== organizationId || session.user_id !== userId) throw new Error("Upload idempotency key belongs to a different user or organization");
        await client.query("COMMIT");
        return { uploadId: session.id, assetId: session.asset_id, reservationId: session.reservationId, expiresAt: session.expiresAt, duplicate: true };
      }

      const tenant = await client.query(
        "SELECT quota_bytes FROM tenant_storage_contexts WHERE organization_id = $1 AND active = true FOR UPDATE",
        [organizationId]
      );
      if (!tenant.rowCount) throw new Error("Active tenant storage context not found");
      await client.query("INSERT INTO tenant_storage_usage (organization_id) VALUES ($1) ON CONFLICT (organization_id) DO NOTHING", [organizationId]);
      const usage = await client.query("SELECT used_bytes, reserved_bytes FROM tenant_storage_usage WHERE organization_id = $1 FOR UPDATE", [organizationId]);
      const used = Number(usage.rows[0].used_bytes);
      const reserved = Number(usage.rows[0].reserved_bytes);
      if (used + reserved + bytes > Number(tenant.rows[0].quota_bytes)) throw new Error("Storage quota exceeded");

      const reservationId = crypto.randomUUID();
      await client.query(
        `INSERT INTO managed_assets (id, organization_id, owner_user_id, upload_kind, status, original_name, original_size)
         VALUES ($1, $2, $3, $4, 'uploading', $5, $6)`,
        [assetId, organizationId, userId, uploadKind, String(originalName || "asset.bin").slice(0, 255), size]
      );
      await client.query(
        `INSERT INTO upload_sessions (id, organization_id, user_id, asset_id, upload_kind, reserved_bytes, status, expires_at, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, 'uploading', $7, $8)`,
        [uploadId, organizationId, userId, assetId, uploadKind, bytes, expiresAt, uploadId]
      );
      await client.query(
        "INSERT INTO quota_reservations (id, organization_id, upload_id, bytes, status) VALUES ($1, $2, $3, $4, 'active')",
        [reservationId, organizationId, uploadId, bytes]
      );
      await client.query(
        "UPDATE tenant_storage_usage SET reserved_bytes = reserved_bytes + $2, updated_at = now() WHERE organization_id = $1",
        [organizationId, bytes]
      );
      await this.insertUploadAudit(client, { organizationId, userId, uploadId, assetId, eventType: "upload.started", metadata: { uploadKind, reservedBytes: bytes } });
      await client.query("COMMIT");
      return { uploadId, assetId, reservationId, expiresAt, duplicate: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getUploadSessionForAccess({ uploadId, organizationId, userId, canManage = false }) {
    const result = await this.pool.query(
      `SELECT u.id, u.organization_id AS "organizationId", u.user_id AS "userId", u.asset_id AS "assetId", u.upload_kind AS "uploadKind",
              u.reserved_bytes AS "reservedBytes", u.status, u.expires_at AS "expiresAt", u.completed_asset_id AS "completedAssetId",
              q.id AS "reservationId", q.status AS "reservationStatus"
         FROM upload_sessions u JOIN quota_reservations q ON q.upload_id = u.id
        WHERE u.id = $1 AND u.organization_id = $2`,
      [uploadId, organizationId]
    );
    if (!result.rowCount) throw new Error("Upload session not found");
    const session = result.rows[0];
    if (session.userId !== userId && !canManage) throw new Error("Upload session does not belong to the authenticated user");
    return session;
  }

  async saveUploadPayload({ uploadId, organizationId, payload }) {
    if (!uploadId || !organizationId || !payload || typeof payload !== "object") throw new Error("Upload payload is invalid");
    if (this.containsRawKeyMaterial(payload)) throw new Error("Raw data keys must not be persisted in upload state");
    const result = await this.pool.query(
      `INSERT INTO upload_session_payloads (upload_id, organization_id, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (upload_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
       RETURNING payload`,
      [uploadId, organizationId, JSON.stringify(payload)]
    );
    return result.rows[0].payload;
  }

  async loadUploadPayload(uploadId) {
    const result = await this.pool.query("SELECT payload FROM upload_session_payloads WHERE upload_id = $1", [uploadId]);
    return result.rowCount ? result.rows[0].payload : null;
  }

  async listUploadPayloads({ uploadKind = "direct", organizationId = null } = {}) {
    const result = await this.pool.query(
      `SELECT p.payload FROM upload_session_payloads p
       JOIN upload_sessions u ON u.id = p.upload_id
       WHERE u.upload_kind = $1 AND ($2::text IS NULL OR u.organization_id = $2) ORDER BY p.updated_at DESC`,
      [uploadKind, organizationId]
    );
    return result.rows.map((row) => row.payload);
  }

  async loadDirectUploadPayloadByAssetId({ assetId, organizationId }) {
    const result = await this.pool.query(
      `SELECT p.payload FROM upload_session_payloads p
       JOIN upload_sessions u ON u.id = p.upload_id
       WHERE u.asset_id = $1 AND u.organization_id = $2 AND u.upload_kind = 'direct'`,
      [assetId, organizationId]
    );
    return result.rowCount ? result.rows[0].payload : null;
  }

  async removeUploadPayload(uploadId) {
    await this.pool.query("DELETE FROM upload_session_payloads WHERE upload_id = $1", [uploadId]);
  }

  async listPendingOrphanedPublisherBlobs(limit = 100) {
    const result = await this.pool.query(
      `SELECT blob_id AS "blobId", organization_id AS "organizationId", upload_id AS "uploadId", reason
         FROM orphaned_publisher_blobs WHERE cleaned_at IS NULL
        ORDER BY discovered_at ASC LIMIT $1`,
      [Math.max(1, Math.min(Number(limit) || 100, 1000))]
    );
    return result.rows;
  }

  async markOrphanedPublisherBlobCleaned(blobId) {
    await this.pool.query("UPDATE orphaned_publisher_blobs SET cleaned_at = now() WHERE blob_id = $1 AND cleaned_at IS NULL", [blobId]);
  }

  containsRawKeyMaterial(value) {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some((entry) => this.containsRawKeyMaterial(entry));
    if (["key", "keyHex", "privateKey", "recoveryPrivateKey"].some((field) => Object.prototype.hasOwnProperty.call(value, field))) return true;
    return Object.values(value).some((entry) => entry && typeof entry === "object" && this.containsRawKeyMaterial(entry));
  }

  async completeUpload({ uploadId, organizationId, userId, canManage = false, providerAssetId }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const session = await this.lockUploadForAccess(client, { uploadId, organizationId, userId, canManage });
      if (session.status === "completed") {
        await client.query("COMMIT");
        return { assetId: session.asset_id, providerAssetId: session.completed_asset_id, alreadyCompleted: true };
      }
      if (!["uploading", "assembling"].includes(session.status)) throw new Error(`Upload cannot be completed in '${session.status}' state`);
      const reservation = await client.query("SELECT id, bytes, status FROM quota_reservations WHERE upload_id = $1 FOR UPDATE", [uploadId]);
      if (!reservation.rowCount || reservation.rows[0].status !== "active") throw new Error("Active upload quota reservation not found");
      const bytes = Number(reservation.rows[0].bytes);
      const completedAssetId = String(providerAssetId || session.asset_id);
      await client.query("UPDATE upload_sessions SET status = 'completed', completed_asset_id = $2, completed_at = now(), updated_at = now() WHERE id = $1", [uploadId, completedAssetId]);
      await client.query("UPDATE managed_assets SET status = 'active', provider_asset_id = $2, finalized_at = now() WHERE id = $1", [session.asset_id, completedAssetId]);
      await client.query("UPDATE quota_reservations SET status = 'committed', finalized_at = now() WHERE id = $1", [reservation.rows[0].id]);
      await client.query(
        `UPDATE tenant_storage_usage SET reserved_bytes = GREATEST(0, reserved_bytes - $2), used_bytes = used_bytes + $2, updated_at = now()
          WHERE organization_id = $1`,
        [organizationId, bytes]
      );
      await this.insertUploadAudit(client, { organizationId, userId, uploadId, assetId: session.asset_id, eventType: "upload.completed", metadata: { providerAssetId: completedAssetId } });
      await client.query("COMMIT");
      return { assetId: session.asset_id, providerAssetId: completedAssetId, alreadyCompleted: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async abortUpload({ uploadId, organizationId, userId, canManage = false, reason = "user" }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const session = await this.lockUploadForAccess(client, { uploadId, organizationId, userId, canManage });
      if (session.status === "completed") {
        await client.query("COMMIT");
        return { assetId: session.asset_id, alreadyCompleted: true, alreadyAborted: false };
      }
      if (["aborted", "expired", "failed"].includes(session.status)) {
        await client.query("COMMIT");
        return { assetId: session.asset_id, alreadyCompleted: false, alreadyAborted: true };
      }
      await this.releaseLockedUpload(client, session, reason, userId);
      await client.query("COMMIT");
      return { assetId: session.asset_id, alreadyCompleted: false, alreadyAborted: false };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async pruneExpiredUploadSessions() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const expired = await client.query(
        `SELECT id, organization_id, user_id, asset_id, status FROM upload_sessions
          WHERE expires_at <= now() AND status IN ('uploading', 'assembling') FOR UPDATE SKIP LOCKED`
      );
      for (const session of expired.rows) await this.releaseLockedUpload(client, session, "expired", null);
      await client.query("COMMIT");
      return expired.rowCount;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async lockUploadForAccess(client, { uploadId, organizationId, userId, canManage }) {
    const result = await client.query(
      "SELECT id, organization_id, user_id, asset_id, status FROM upload_sessions WHERE id = $1 AND organization_id = $2 FOR UPDATE",
      [uploadId, organizationId]
    );
    if (!result.rowCount) throw new Error("Upload session not found");
    const session = result.rows[0];
    if (session.user_id !== userId && !canManage) throw new Error("Upload session does not belong to the authenticated user");
    return session;
  }

  async releaseLockedUpload(client, session, reason, actorUserId) {
    const payload = await client.query("SELECT payload FROM upload_session_payloads WHERE upload_id = $1 FOR UPDATE", [session.id]);
    const segments = payload.rows[0]?.payload?.segments;
    if (Array.isArray(segments)) {
      for (const segment of segments) {
        if (typeof segment?.blobId !== "string" || !/^[A-Za-z0-9_-]{16,256}$/.test(segment.blobId)) continue;
        await client.query(
          `INSERT INTO orphaned_publisher_blobs (blob_id, organization_id, upload_id, reason)
           VALUES ($1, $2, $3, $4) ON CONFLICT (blob_id) DO NOTHING`,
          [segment.blobId, session.organization_id, session.id, reason]
        );
      }
    }
    const reservation = await client.query("SELECT id, bytes, status FROM quota_reservations WHERE upload_id = $1 FOR UPDATE", [session.id]);
    if (reservation.rowCount && reservation.rows[0].status === "active") {
      const bytes = Number(reservation.rows[0].bytes);
      await client.query("UPDATE quota_reservations SET status = 'released', finalized_at = now() WHERE id = $1", [reservation.rows[0].id]);
      await client.query("UPDATE tenant_storage_usage SET reserved_bytes = GREATEST(0, reserved_bytes - $2), updated_at = now() WHERE organization_id = $1", [session.organization_id, bytes]);
    }
    const status = reason === "expired" ? "expired" : reason === "failed" ? "failed" : "aborted";
    await client.query("UPDATE upload_sessions SET status = $2, updated_at = now() WHERE id = $1", [session.id, status]);
    await client.query("UPDATE managed_assets SET status = $2 WHERE id = $1", [session.asset_id, status]);
    await this.insertUploadAudit(client, { organizationId: session.organization_id, userId: actorUserId, uploadId: session.id, assetId: session.asset_id, eventType: `upload.${status}`, metadata: { reason } });
  }

  async insertUploadAudit(client, { organizationId, userId = null, uploadId = null, assetId = null, eventType, metadata = {} }) {
    await client.query(
      `INSERT INTO upload_audit_events (organization_id, user_id, upload_id, asset_id, event_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [organizationId, userId, uploadId, assetId, eventType, JSON.stringify(metadata)]
    );
  }

  async listOrganizations(userId) {
    const result = await this.pool.query(
      `SELECT o.id AS "orgId", o.name, m.role, t.space_id AS "spaceId", t.bucket_id AS "bucketId",
              t.seal_policy_id AS "sealPolicyId", t.quota_bytes AS "quotaBytes"
         FROM organizations o
         JOIN memberships m ON m.organization_id = o.id
         JOIN tenant_storage_contexts t ON t.organization_id = o.id AND t.active = true
        WHERE m.user_id = $1
        ORDER BY o.name ASC`,
      [userId]
    );
    return result.rows;
  }

  async getOrganizationForUser({ organizationId, userId }) {
    const result = await this.pool.query(
      `SELECT o.id AS "orgId", o.name, m.role, t.space_id AS "spaceId", t.bucket_id AS "bucketId",
              t.seal_policy_id AS "sealPolicyId", t.quota_bytes AS "quotaBytes"
         FROM organizations o
         JOIN memberships m ON m.organization_id = o.id AND m.user_id = $2
         JOIN tenant_storage_contexts t ON t.organization_id = o.id AND t.active = true
        WHERE o.id = $1`,
      [organizationId, userId]
    );
    return result.rows[0] || null;
  }

  async addMembership({ organizationId, address, role }) {
    if (!validRoles.has(role)) throw new Error("Invalid organization role");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const userId = crypto.randomUUID();
      await client.query(
        "INSERT INTO users (id, solana_address) VALUES ($1, $2) ON CONFLICT (solana_address) DO NOTHING",
        [userId, address]
      );
      const user = await client.query("SELECT id FROM users WHERE solana_address = $1", [address]);
      await client.query(
        `INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [organizationId, user.rows[0].id, role]
      );
      await client.query("COMMIT");
      return { organizationId, memberAddress: address, role };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async removeMembership({ organizationId, address }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const membership = await client.query(
        `SELECT m.user_id, m.role FROM memberships m JOIN users u ON u.id = m.user_id
          WHERE m.organization_id = $1 AND u.solana_address = $2 FOR UPDATE`,
        [organizationId, address]
      );
      if (!membership.rowCount) throw new Error("Organization member not found");
      if (membership.rows[0].role === "owner") throw new Error("Cannot remove Organization Owner");
      const userId = membership.rows[0].user_id;
      const affected = await client.query(
        "SELECT DISTINCT asset_id FROM asset_key_envelopes WHERE organization_id = $1 AND recipient_user_id = $2",
        [organizationId, userId]
      );
      for (const { asset_id: assetId } of affected.rows) {
        await client.query(
          `INSERT INTO key_rotation_tasks (id, organization_id, asset_id, revoked_user_id)
           VALUES ($1, $2, $3, $4) ON CONFLICT (organization_id, asset_id, revoked_user_id)
           DO UPDATE SET status = 'pending', replacement_asset_id = NULL, completed_at = NULL`,
          [crypto.randomUUID(), organizationId, assetId, userId]
        );
      }
      await client.query("DELETE FROM asset_key_envelopes WHERE organization_id = $1 AND recipient_user_id = $2", [organizationId, userId]);
      await client.query("DELETE FROM memberships WHERE organization_id = $1 AND user_id = $2", [organizationId, userId]);
      await client.query("COMMIT");
      return { revokedEnvelopeAssetIds: affected.rows.map((row) => row.asset_id) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listPendingKeyRotations({ organizationId, ownerUserId }) {
    const result = await this.pool.query(
      `SELECT r.id, r.asset_id AS "assetId", u.solana_address AS "revokedAddress", r.created_at AS "createdAt"
       FROM key_rotation_tasks r
       JOIN key_envelope_assets a ON a.organization_id = r.organization_id AND a.asset_id = r.asset_id
       JOIN users u ON u.id = r.revoked_user_id
       WHERE r.organization_id = $1 AND a.owner_user_id = $2 AND r.status = 'pending'
       ORDER BY r.created_at ASC`,
      [organizationId, ownerUserId]
    );
    return result.rows;
  }

  async validateKeyRotation({ organizationId, rotationId, ownerUserId, replacementAssetId }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const task = await client.query(
        `SELECT r.asset_id, r.status FROM key_rotation_tasks r
         JOIN key_envelope_assets a ON a.organization_id = r.organization_id AND a.asset_id = r.asset_id
         WHERE r.id = $1 AND r.organization_id = $2 AND a.owner_user_id = $3 FOR UPDATE`,
        [rotationId, organizationId, ownerUserId]
      );
      if (!task.rowCount || task.rows[0].status !== "pending") throw new Error("Pending key rotation not found");
      const replacement = await client.query(
        "SELECT owner_user_id FROM key_envelope_assets WHERE organization_id = $1 AND asset_id = $2",
        [organizationId, replacementAssetId]
      );
      if (!replacement.rowCount || replacement.rows[0].owner_user_id !== ownerUserId) throw new Error("Replacement asset is not owned by the current user");
      const expected = await client.query("SELECT user_id FROM memberships WHERE organization_id = $1", [organizationId]);
      const protectedRecipients = await client.query(
        `SELECT DISTINCT recipient_user_id FROM asset_key_envelopes
         WHERE organization_id = $1 AND asset_id = $2 AND recipient_type = 'user'`,
        [organizationId, replacementAssetId]
      );
      const recipientIds = new Set(protectedRecipients.rows.map((row) => row.recipient_user_id));
      if (expected.rows.some((row) => !recipientIds.has(row.user_id))) throw new Error("Replacement asset is missing an envelope for an active organization member");
      await client.query("COMMIT");
      return { sourceAssetId: task.rows[0].asset_id, replacementAssetId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async finalizeKeyRotation({ organizationId, rotationId, ownerUserId, replacementAssetId, sourceAssetId }) {
    const result = await this.pool.query(
      `UPDATE key_rotation_tasks r SET status = 'completed', replacement_asset_id = $1, completed_at = now()
       FROM key_envelope_assets a
       WHERE r.id = $2 AND r.organization_id = $3 AND r.status = 'pending'
         AND r.asset_id = $4 AND a.organization_id = r.organization_id AND a.asset_id = r.asset_id AND a.owner_user_id = $5
       RETURNING r.asset_id`,
      [replacementAssetId, rotationId, organizationId, sourceAssetId, ownerUserId]
    );
    if (!result.rowCount) throw new Error("Pending key rotation could not be finalized");
    await this.deleteKeyEnvelopeAsset({ organizationId, assetId: sourceAssetId });
    return { sourceAssetId, replacementAssetId };
  }

  async registerKeyIdentity({ userId, payload = {} }) {
    const { publicKey, recoveryPublicKey = null } = payload;
    if (Object.prototype.hasOwnProperty.call(payload, "privateKey") || Object.prototype.hasOwnProperty.call(payload, "recoveryPrivateKey")) {
      throw new Error("Private keys must not be sent to the server");
    }
    if (!isP256PublicJwk(publicKey)) throw new Error("A P-256 public encryption key is required");
    if (recoveryPublicKey !== null && !isP256PublicJwk(recoveryPublicKey)) throw new Error("Recovery key must be a P-256 public encryption key");
    const result = await this.pool.query(
      `INSERT INTO user_key_identities (user_id, public_key, recovery_public_key)
       VALUES ($1, $2::jsonb, $3::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET public_key = EXCLUDED.public_key, recovery_public_key = EXCLUDED.recovery_public_key, updated_at = now()
       RETURNING public_key AS "publicKey", recovery_public_key AS "recoveryPublicKey", updated_at AS "updatedAt"`,
      [userId, JSON.stringify(publicKey), recoveryPublicKey ? JSON.stringify(recoveryPublicKey) : null]
    );
    return result.rows[0];
  }

  async listOrganizationKeyRecipients({ organizationId }) {
    const result = await this.pool.query(
      `SELECT u.solana_address AS "address", m.role, i.public_key AS "publicKey", i.recovery_public_key AS "recoveryPublicKey"
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       JOIN user_key_identities i ON i.user_id = u.id
       WHERE m.organization_id = $1
       ORDER BY u.solana_address`,
      [organizationId]
    );
    return result.rows.map((row) => ({
      member: row.address,
      role: row.role,
      identity: {
        address: row.address,
        publicKey: row.publicKey,
        recoveryPublicKey: row.recoveryPublicKey
      }
    }));
  }

  async getOrganizationKeyRecipient({ organizationId, address }) {
    const result = await this.pool.query(
      `SELECT u.solana_address AS "address", m.role, i.public_key AS "publicKey", i.recovery_public_key AS "recoveryPublicKey"
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       JOIN user_key_identities i ON i.user_id = u.id
       WHERE m.organization_id = $1 AND u.solana_address = $2`,
      [organizationId, address]
    );
    return result.rows[0] || null;
  }

  async putKeyEnvelopes({ organizationId, assetId, ownerUserId, envelopes }) {
    if (!Array.isArray(envelopes) || envelopes.length < 1 || envelopes.length > MAX_ENVELOPES_PER_ASSET) {
      throw new Error(`envelopes must contain between 1 and ${MAX_ENVELOPES_PER_ASSET} entries`);
    }
    const normalized = envelopes.map((entry) => this.normalizeKeyEnvelope(entry, organizationId));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO key_envelope_assets (organization_id, asset_id, owner_user_id)
         VALUES ($1, $2, $3) ON CONFLICT (organization_id, asset_id) DO NOTHING`,
        [organizationId, assetId, ownerUserId]
      );
      const asset = await client.query("SELECT owner_user_id FROM key_envelope_assets WHERE organization_id = $1 AND asset_id = $2", [organizationId, assetId]);
      if (!asset.rowCount || asset.rows[0].owner_user_id !== ownerUserId) throw new Error("Only the asset envelope owner can change key recipients");

      const addresses = [...new Set(normalized.map((entry) => entry.recipientAddress))];
      const recipients = await client.query(
        `SELECT u.id, u.solana_address FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = $1 AND u.solana_address = ANY($2::text[])`,
        [organizationId, addresses]
      );
      const recipientIds = new Map(recipients.rows.map((row) => [row.solana_address, row.id]));
      if (recipientIds.size !== addresses.length) throw new Error("Envelope recipient is not an organization member");

      for (const entry of normalized) {
        await client.query(
          `INSERT INTO asset_key_envelopes (id, organization_id, asset_id, recipient_user_id, recipient_type, algorithm, ephemeral_public_key, iv, ciphertext)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
           ON CONFLICT (organization_id, asset_id, recipient_user_id, recipient_type)
           DO UPDATE SET algorithm = EXCLUDED.algorithm, ephemeral_public_key = EXCLUDED.ephemeral_public_key, iv = EXCLUDED.iv, ciphertext = EXCLUDED.ciphertext, updated_at = now()`,
          [crypto.randomUUID(), organizationId, assetId, recipientIds.get(entry.recipientAddress), entry.recipientType, entry.algorithm, JSON.stringify(entry.ephemeralPublicKey), entry.iv, entry.ciphertext]
        );
      }
      await client.query("COMMIT");
      return { assetId, envelopeCount: normalized.length };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async envelopesForRecipient({ organizationId, assetId, recipientUserId }) {
    const result = await this.pool.query(
      `SELECT owner.solana_address AS "ownerAddress", recipient.solana_address AS "recipientAddress",
              e.recipient_type AS "recipientType", e.algorithm,
              e.ephemeral_public_key AS "ephemeralPublicKey", e.iv, e.ciphertext, e.updated_at AS "updatedAt"
       FROM key_envelope_assets a
       JOIN users owner ON owner.id = a.owner_user_id
       JOIN asset_key_envelopes e ON e.organization_id = a.organization_id AND e.asset_id = a.asset_id
       JOIN users recipient ON recipient.id = e.recipient_user_id
       WHERE a.organization_id = $1 AND a.asset_id = $2 AND e.recipient_user_id = $3`,
      [organizationId, assetId, recipientUserId]
    );
    if (!result.rowCount) return null;
    return {
      assetId,
      ownerAddress: result.rows[0].ownerAddress,
      updatedAt: result.rows[0].updatedAt,
      envelopes: result.rows.map(({ ownerAddress, ...envelope }) => ({ ...envelope, organizationId }))
    };
  }

  async deleteKeyEnvelopeAsset({ organizationId, assetId }) {
    const result = await this.pool.query("DELETE FROM key_envelope_assets WHERE organization_id = $1 AND asset_id = $2", [organizationId, assetId]);
    return result.rowCount > 0;
  }

  async createFolder({ organizationId, actorUserId, name, parentId = null }) {
    const cleanName = this.catalogText(name, 128, "Folder name is required");
    if (parentId) await this.assertFolder({ organizationId, folderId: parentId });
    try {
      const result = await this.pool.query(
        `INSERT INTO asset_folders (id, organization_id, parent_id, name, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, parent_id AS "parentId", name, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [crypto.randomUUID(), organizationId, parentId, cleanName, actorUserId]
      );
      await this.audit({ organizationId, actorUserId, eventType: "folder.created", details: { folderId: result.rows[0].id, parentId, name: cleanName } });
      return result.rows[0];
    } catch (error) {
      if (error.code === "23505") throw new Error("A folder with this name already exists at this location");
      throw error;
    }
  }

  async listFolders({ organizationId }) {
    const result = await this.pool.query(
      `SELECT id, parent_id AS "parentId", name, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM asset_folders WHERE organization_id = $1 ORDER BY name ASC`, [organizationId]
    );
    return result.rows;
  }

  async renameFolder({ organizationId, actorUserId, folderId, name }) {
    const cleanName = this.catalogText(name, 128, "Folder name is required");
    try {
      const result = await this.pool.query(`UPDATE asset_folders SET name=$3, updated_at=now() WHERE organization_id=$1 AND id=$2
        RETURNING id, parent_id AS "parentId", name, created_at AS "createdAt", updated_at AS "updatedAt"`, [organizationId, folderId, cleanName]);
      if (!result.rowCount) throw new Error("Folder not found in the active organization");
      await this.audit({ organizationId, actorUserId, eventType: "folder.renamed", details: { folderId, name: cleanName } });
      return result.rows[0];
    } catch (error) { if (error.code === "23505") throw new Error("A folder with this name already exists at this location"); throw error; }
  }

  async deleteFolder({ organizationId, actorUserId, folderId }) {
    const children = await this.pool.query("SELECT 1 FROM asset_folders WHERE organization_id=$1 AND parent_id=$2 LIMIT 1", [organizationId, folderId]);
    const assets = await this.pool.query("SELECT 1 FROM catalog_assets WHERE organization_id=$1 AND folder_id=$2 AND status='active' LIMIT 1", [organizationId, folderId]);
    if (children.rowCount || assets.rowCount) throw new Error("Move or delete all child folders and assets before deleting this folder");
    const result = await this.pool.query("DELETE FROM asset_folders WHERE organization_id=$1 AND id=$2 RETURNING id", [organizationId, folderId]);
    if (!result.rowCount) throw new Error("Folder not found in the active organization");
    await this.audit({ organizationId, actorUserId, eventType: "folder.deleted", details: { folderId } });
  }

  async registerAsset({ organizationId, actorUserId, assetId, name, contentType, byteSize, description = "", tags = [], storageKind = "walrus", folderId = null }) {
    if (!assetId || typeof assetId !== "string") throw new Error("A valid asset ID is required");
    if (folderId) await this.assertFolder({ organizationId, folderId });
    const asset = this.normalizeCatalogAsset({ name, contentType, byteSize, description, tags, storageKind, folderId });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO catalog_assets (organization_id, asset_id, owner_user_id, folder_id, name, content_type, byte_size, description, tags, storage_kind)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
         ON CONFLICT (organization_id, asset_id) DO UPDATE SET name=EXCLUDED.name, content_type=EXCLUDED.content_type, byte_size=EXCLUDED.byte_size,
           description=EXCLUDED.description, tags=EXCLUDED.tags, folder_id=EXCLUDED.folder_id, updated_at=now()
         RETURNING *`, [organizationId, assetId, actorUserId, asset.folderId, asset.name, asset.contentType, asset.byteSize, asset.description, JSON.stringify(asset.tags), asset.storageKind]
      );
      const row = inserted.rows[0];
      await client.query(
        `INSERT INTO asset_versions (organization_id, asset_id, version, name, content_type, byte_size, description, tags, changed_by, change_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'uploaded') ON CONFLICT DO NOTHING`,
        [organizationId, assetId, row.current_version, row.name, row.content_type, row.byte_size, row.description, JSON.stringify(row.tags), actorUserId]
      );
      await this.audit({ client, organizationId, assetId, actorUserId, eventType: "asset.created", details: { storageKind: asset.storageKind } });
      await client.query("COMMIT");
      return this.catalogRow(row);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async listCatalogAssets({ organizationId, folderId = undefined, limit = 50, cursor = null }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const decoded = this.decodeCursor(cursor);
    const params = [organizationId];
    let where = "organization_id = $1 AND status = 'active'";
    if (folderId !== undefined) { params.push(folderId || null); where += ` AND folder_id IS NOT DISTINCT FROM $${params.length}`; }
    if (decoded) { params.push(decoded.createdAt, decoded.assetId); where += ` AND (created_at, asset_id) < ($${params.length - 1}::timestamptz, $${params.length})`; }
    params.push(safeLimit + 1);
    const result = await this.pool.query(`SELECT * FROM catalog_assets WHERE ${where} ORDER BY created_at DESC, asset_id DESC LIMIT $${params.length}`, params);
    const rows = result.rows.slice(0, safeLimit).map((row) => this.catalogRow(row));
    const tail = rows.at(-1);
    return { assets: rows, nextCursor: result.rows.length > safeLimit && tail ? this.encodeCursor(tail) : null };
  }

  async getCatalogAsset({ organizationId, assetId }) {
    const result = await this.pool.query("SELECT * FROM catalog_assets WHERE organization_id = $1 AND asset_id = $2 AND status = 'active'", [organizationId, assetId]);
    return result.rowCount ? this.catalogRow(result.rows[0]) : null;
  }

  async updateCatalogAsset({ organizationId, assetId, actorUserId, changes }) {
    const current = await this.getCatalogAsset({ organizationId, assetId });
    if (!current) throw new Error("Catalog asset not found");
    const next = this.normalizeCatalogAsset({
      name: changes.name === undefined ? current.name : changes.name,
      contentType: current.contentType,
      byteSize: current.size,
      description: changes.description === undefined ? current.description : changes.description,
      tags: changes.tags === undefined ? current.tags : changes.tags,
      storageKind: current.storageKind,
      folderId: changes.folderId === undefined ? current.folderId : changes.folderId
    });
    if (next.folderId) await this.assertFolder({ organizationId, folderId: next.folderId });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE catalog_assets SET name=$3, description=$4, tags=$5::jsonb, folder_id=$6, current_version=current_version+1, updated_at=now()
         WHERE organization_id=$1 AND asset_id=$2 AND status='active' RETURNING *`,
        [organizationId, assetId, next.name, next.description, JSON.stringify(next.tags), next.folderId]
      );
      const row = result.rows[0];
      await client.query(`INSERT INTO asset_versions (organization_id,asset_id,version,name,content_type,byte_size,description,tags,changed_by,change_reason)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'metadata.updated')`, [organizationId, assetId, row.current_version, row.name, row.content_type, row.byte_size, row.description, JSON.stringify(row.tags), actorUserId]);
      await this.audit({ client, organizationId, assetId, actorUserId, eventType: "asset.metadata_updated", details: { version: row.current_version } });
      await client.query("COMMIT");
      return this.catalogRow(row);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async deleteCatalogAsset({ organizationId, assetId, actorUserId }) {
    const result = await this.pool.query(`UPDATE catalog_assets SET status='deleted', deleted_at=now(), updated_at=now()
      WHERE organization_id=$1 AND asset_id=$2 AND status='active' RETURNING asset_id`, [organizationId, assetId]);
    if (!result.rowCount) throw new Error("Catalog asset not found");
    await this.audit({ organizationId, assetId, actorUserId, eventType: "asset.deleted" });
  }

  async listAssetVersions({ organizationId, assetId }) {
    const result = await this.pool.query(`SELECT version, name, content_type AS "contentType", byte_size AS "byteSize", description, tags,
      change_reason AS "changeReason", created_at AS "createdAt" FROM asset_versions WHERE organization_id=$1 AND asset_id=$2 ORDER BY version DESC`, [organizationId, assetId]);
    return result.rows;
  }

  async listAssetAudit({ organizationId, assetId, limit = 100 }) {
    const result = await this.pool.query(`SELECT e.id, e.asset_id AS "assetId", e.event_type AS "eventType", e.details, u.solana_address AS "actorAddress", e.created_at AS "createdAt"
      FROM asset_audit_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND e.asset_id=$2 ORDER BY e.created_at DESC LIMIT $3`, [organizationId, assetId, Math.min(Math.max(Number(limit) || 100, 1), 200)]);
    return result.rows;
  }

  async assertFolder({ organizationId, folderId }) {
    const result = await this.pool.query("SELECT 1 FROM asset_folders WHERE organization_id=$1 AND id=$2", [organizationId, folderId]);
    if (!result.rowCount) throw new Error("Folder not found in the active organization");
  }
  async audit({ client = this.pool, organizationId, assetId = null, actorUserId = null, eventType, details = {} }) {
    await client.query("INSERT INTO asset_audit_events (id,organization_id,asset_id,actor_user_id,event_type,details) VALUES ($1,$2,$3,$4,$5,$6::jsonb)", [crypto.randomUUID(), organizationId, assetId, actorUserId, eventType, JSON.stringify(details)]);
  }
  catalogText(value, max, message) { const text = typeof value === "string" ? value.trim() : ""; if (!text || text.length > max) throw new Error(message); return text; }
  normalizeCatalogAsset({ name, contentType, byteSize, description, tags, storageKind, folderId }) {
    if (!['walrus', 'direct'].includes(storageKind)) throw new Error("Invalid asset storage kind");
    const size = Number(byteSize); if (!Number.isSafeInteger(size) || size < 0) throw new Error("Invalid asset size");
    return { name: this.catalogText(name, 255, "Asset name is required"), contentType: this.catalogText(contentType || "application/octet-stream", 255, "Content type is required"), byteSize: size,
      description: typeof description === "string" ? description.slice(0, 1024) : "", tags: Array.isArray(tags) ? tags.slice(0, 30).map((tag) => String(tag).slice(0, 64)) : [], storageKind, folderId: folderId || null };
  }
  catalogRow(row) { return { id: row.asset_id, name: row.name, contentType: row.content_type, size: Number(row.byte_size), description: row.description, tags: row.tags, folderId: row.folder_id, storageKind: row.storage_kind, ownerUserId: row.owner_user_id, version: row.current_version, createdAt: row.created_at, updatedAt: row.updated_at }; }
  encodeCursor(row) { return Buffer.from(JSON.stringify({ createdAt: row.createdAt || row.created_at, assetId: row.id || row.asset_id })).toString("base64url"); }
  decodeCursor(cursor) { if (!cursor) return null; try { const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); if (!value.createdAt || !value.assetId) throw new Error(); return value; } catch { throw new Error("Invalid pagination cursor"); } }

  normalizeKeyEnvelope(entry, organizationId) {
    if (!entry || typeof entry !== "object") throw new Error("Invalid key envelope");
    if (Object.prototype.hasOwnProperty.call(entry, "key") || Object.prototype.hasOwnProperty.call(entry, "privateKey")) throw new Error("Raw or private keys must not be sent to the server");
    if (!/^(user|recovery)$/.test(entry.recipientType || "")) throw new Error("recipientType must be 'user' or 'recovery'");
    if (typeof entry.recipientAddress !== "string" || entry.recipientAddress.length < 32 || entry.recipientAddress.length > 64) throw new Error("Invalid envelope recipient");
    if (entry.organizationId && entry.organizationId !== organizationId) throw new Error("Envelope organization does not match the active tenant");
    if (entry.algorithm !== "ECDH-P256/AES-256-GCM") throw new Error("Unsupported key-envelope algorithm");
    if (!isP256PublicJwk(entry.ephemeralPublicKey)) throw new Error("Invalid ephemeral public key");
    if (typeof entry.iv !== "string" || !/^[a-f0-9]{24}$/i.test(entry.iv)) throw new Error("Invalid envelope IV");
    if (typeof entry.ciphertext !== "string" || !/^[a-f0-9]{64,512}$/i.test(entry.ciphertext)) throw new Error("Invalid encrypted key envelope");
    return { ...entry, organizationId, iv: entry.iv.toLowerCase(), ciphertext: entry.ciphertext.toLowerCase() };
  }
}
