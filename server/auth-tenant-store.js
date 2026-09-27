import crypto from "node:crypto";
import { Pool } from "pg";

const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const validRoles = new Set(["owner", "admin", "contributor", "viewer"]);

export class AuthTenantStore {
  constructor({ databaseUrl = process.env.DATABASE_URL } = {}) {
    if (!databaseUrl) throw new Error("DATABASE_URL is required for authenticated tenant mode");
    const isSsl = databaseUrl.includes("render.com") || databaseUrl.includes("sslmode=require") || process.env.NODE_ENV === "production";
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: isSsl ? { rejectUnauthorized: false } : false
    });
  }

  /**
   * Initializes PostgreSQL tables, indexes, and seeds default tenant context if missing.
   */
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

        INSERT INTO organizations (id, name) VALUES ('default', 'Default Organization') ON CONFLICT (id) DO NOTHING;
        INSERT INTO tenant_storage_contexts (organization_id, space_id, bucket_id, seal_policy_id, quota_bytes, active)
        VALUES ('default', '443d9a48-7835-437f-9bb4-2716833aee06', 'ec7acd16-05b1-4fa2-b368-94700eb29f5e', '0x9c1baccb244e45342ac150a0123a4802e8e834f25c00210e50c81081354eee44', 10737418240, true)
        ON CONFLICT (organization_id) DO NOTHING;
      `);
      console.log("🐘 [AuthTenantStore] PostgreSQL database schema verified and seeded.");
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
      let member = await client.query("SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2", [organizationId, user.rows[0].id]);
      if (!member.rowCount && (organizationId === "default" || organizationId === "nodus")) {
        await client.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'contributor') ON CONFLICT DO NOTHING", [organizationId, user.rows[0].id]);
        member = await client.query("SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2", [organizationId, user.rows[0].id]);
      }
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
    const membership = await this.pool.query(
      `SELECT m.user_id, m.role FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND u.solana_address = $2`,
      [organizationId, address]
    );
    if (!membership.rowCount) throw new Error("Organization member not found");
    if (membership.rows[0].role === "owner") throw new Error("Cannot remove Organization Owner");
    await this.pool.query("DELETE FROM memberships WHERE organization_id = $1 AND user_id = $2", [organizationId, membership.rows[0].user_id]);
    return true;
  }
}
