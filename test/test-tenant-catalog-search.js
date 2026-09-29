import assert from "node:assert/strict";
import { AuthTenantStore } from "../server/auth-tenant-store.js";

const store = Object.create(AuthTenantStore.prototype);
let captured = null;
store.pool = {
  query: async (sql, params) => {
    captured = { sql, params };
    return { rows: [] };
  }
};

const result = await store.listCatalogAssets({
  organizationId: "tenant-a", query: "quarterly invoice", tag: "finance", folderId: "folder-a",
  contentType: "application/pdf", ownerAddress: "alice", createdAfter: "2026-01-01",
  createdBefore: "2026-12-31", minSize: 20, maxSize: 200, limit: 20
});
assert.deepEqual(result, { assets: [], nextCursor: null });
assert.match(captured.sql, /a\.organization_id = \$1/);
assert.match(captured.sql, /websearch_to_tsquery/);
assert.match(captured.sql, /owner\.solana_address/);
assert.equal(captured.params[0], "tenant-a");
assert.ok(!captured.params.includes("tenant-b"));
await assert.rejects(() => store.listCatalogAssets({ organizationId: "tenant-a", minSize: 10, maxSize: 1 }), /minSize cannot exceed/);
await assert.rejects(() => store.listCatalogAssets({ organizationId: "tenant-a", createdAfter: "not-a-date" }), /ISO-8601/);
console.log("Tenant catalog search query checks passed.");
