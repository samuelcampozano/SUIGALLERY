import crypto from "node:crypto";

function text(value, field) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 512) throw new Error(`${field} is required`);
  return value.trim();
}

function context(value) {
  return {
    spaceId: text(value?.spaceId, "storage.spaceId"),
    bucketId: text(value?.bucketId, "storage.bucketId"),
    sealPolicyId: text(value?.sealPolicyId, "storage.sealPolicyId")
  };
}

/**
 * Adapter for the infrastructure account that creates tenant storage resources.
 * Nodus never fabricates Walrus identifiers: production either receives an
 * already-created context or delegates creation to this HTTPS endpoint.
 */
export class TenantProvisioner {
  constructor({ endpoint = process.env.NODUS_TENANT_PROVISIONER_URL, token = process.env.NODUS_TENANT_PROVISIONER_TOKEN } = {}) {
    this.endpoint = endpoint || null;
    this.token = token || null;
  }

  async provision({ organizationId, name, quotaBytes, idempotencyKey, storage }) {
    if (storage) return { ...context(storage), source: "operator-supplied" };
    if (!this.endpoint) throw new Error("No tenant storage provisioner is configured; supply an existing storage context or configure NODUS_TENANT_PROVISIONER_URL");
    const url = new URL(this.endpoint);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Tenant storage provisioner must use HTTPS in production");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      body: JSON.stringify({ organizationId, name, quotaBytes })
    });
    if (!response.ok) throw new Error(`Tenant storage provisioner failed: HTTP ${response.status}`);
    return { ...context(await response.json()), source: "managed-provisioner" };
  }

  static idempotencyKey(value) {
    if (typeof value === "string" && /^[A-Za-z0-9._:-]{16,200}$/.test(value)) return value;
    return crypto.randomUUID();
  }
}
