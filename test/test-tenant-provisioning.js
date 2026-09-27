import http from "node:http";
import { Keypair } from "@solana/web3.js";

process.env.NODE_ENV = "test";
process.env.NODUS_PROVISIONING_ADMIN_TOKEN = "test-provisioning-admin-token-32-bytes";

function assert(value, message) {
  if (!value) throw new Error(message);
  console.log(`  PASS: ${message}`);
}

async function close(server) {
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

async function run() {
  console.log("NODUS - TENANT PROVISIONING INTEGRATION TEST");
  if (!process.env.DATABASE_URL) {
    console.log("SKIPPED: DATABASE_URL is required for the PostgreSQL tenant-provisioning integration suite.");
    return;
  }
  const { AuthTenantStore } = await import("../server/auth-tenant-store.js");
  const schema = new AuthTenantStore({ databaseUrl: process.env.DATABASE_URL });
  await schema.init();
  await schema.pool.end();
  const { default: app } = await import("../server/index.js");
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const organizationId = `tenant-${Date.now()}`;
  const ownerAddress = Keypair.generate().publicKey.toBase58();
  const headers = { Authorization: `Bearer ${process.env.NODUS_PROVISIONING_ADMIN_TOKEN}`, "Content-Type": "application/json", "Idempotency-Key": `provision-${Date.now()}-key` };
  let operationId;
  try {
    const denied = await fetch(`${baseUrl}/api/admin/tenants`);
    assert(denied.status === 401, "Rejects tenant administration without the operator token");
    const create = await fetch(`${baseUrl}/api/admin/tenants`, { method: "POST", headers, body: JSON.stringify({ organizationId, name: "Provisioning Test", ownerAddress, quotaBytes: 1024 * 1024, storage: { spaceId: `space-${organizationId}`, bucketId: `bucket-${organizationId}`, sealPolicyId: "seal-test" } }) });
    const created = await create.json();
    assert(create.status === 201 && created.tenant.status === "active", "Creates owner, storage context, and an active tenant atomically");
    operationId = created.tenant.id;
    const duplicate = await fetch(`${baseUrl}/api/admin/tenants`, { method: "POST", headers, body: JSON.stringify({ organizationId, name: "Provisioning Test", ownerAddress, quotaBytes: 1024 * 1024 }) });
    const duplicateBody = await duplicate.json();
    assert(duplicate.ok && duplicateBody.duplicate && duplicateBody.tenant.id === operationId, "Idempotency key prevents duplicate tenant provisioning");
    const sessions = new AuthTenantStore({ databaseUrl: process.env.DATABASE_URL });
    const session = await sessions.createSession({ address: ownerAddress, organizationId });
    const suspend = await fetch(`${baseUrl}/api/admin/tenants/${operationId}`, { method: "PATCH", headers: { Authorization: headers.Authorization, "Content-Type": "application/json" }, body: JSON.stringify({ status: "suspended" }) });
    assert(suspend.ok, "Suspends the tenant through the operator API");
    assert(await sessions.resolve(session.token) === null, "Suspension revokes existing bearer sessions");
    const activate = await fetch(`${baseUrl}/api/admin/tenants/${operationId}`, { method: "PATCH", headers: { Authorization: headers.Authorization, "Content-Type": "application/json" }, body: JSON.stringify({ status: "active", quotaBytes: 2 * 1024 * 1024 }) });
    const activated = await activate.json();
    assert(activate.ok && activated.tenant.quotaBytes === 2 * 1024 * 1024, "Reactivates a tenant and updates its quota with audit state");
    const detail = await fetch(`${baseUrl}/api/admin/tenants/${operationId}`, { headers: { Authorization: headers.Authorization } });
    const detailBody = await detail.json();
    assert(detail.ok && detailBody.events.length >= 3, "Provides an auditable provisioning event history");
    await sessions.pool.end();
  } finally {
    await close(server);
    if (operationId) {
      const cleanup = new AuthTenantStore({ databaseUrl: process.env.DATABASE_URL });
      const operation = await cleanup.getTenantProvisioning(operationId);
      if (operation) await cleanup.pool.query("DELETE FROM organizations WHERE id=$1", [operation.organizationId]);
      await cleanup.pool.end();
    }
  }
  console.log("ALL TENANT PROVISIONING TESTS PASSED");
}

run().catch((error) => { console.error("Tenant provisioning test failed:", error.message); process.exit(1); });
