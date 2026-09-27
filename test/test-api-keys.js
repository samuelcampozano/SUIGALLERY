import crypto from "node:crypto";
import { AuthTenantStore } from "../server/auth-tenant-store.js";

async function run() {
  if (!process.env.DATABASE_URL) { console.log("SKIPPED: DATABASE_URL is required for API-key integration tests."); return; }
  const store = new AuthTenantStore(); await store.init();
  const orgA=`keys-a-${Date.now()}`, orgB=`keys-b-${Date.now()}`, user=crypto.randomUUID(), address="11111111111111111111111111111111";
  try {
    await store.pool.query("INSERT INTO users (id,solana_address) VALUES ($1,$2) ON CONFLICT (solana_address) DO UPDATE SET solana_address=EXCLUDED.solana_address",[user,address]);
    await store.pool.query("INSERT INTO organizations (id,name) VALUES ($1,'A'),($2,'B')",[orgA,orgB]);
    await store.pool.query("INSERT INTO tenant_storage_contexts (organization_id,space_id,bucket_id,seal_policy_id,quota_bytes) VALUES ($1,'s','b','p',1000),($2,'s2','b2','p2',1000)",[orgA,orgB]);
    const made=await store.createApiKey({organizationId:orgA,actorUserId:user,name:'test',scopes:['assets:read']});
    const resolved=await store.resolveApiKey(made.key); if(!resolved||resolved.organization_id!==orgA||resolved.scopes[0]!=="assets:read")throw new Error("API key resolution or tenant isolation failed");
    if(await store.resolveApiKey("ndk_invalid"))throw new Error("Invalid API key resolved");
    await store.revokeApiKey({organizationId:orgA,apiKeyId:made.apiKey.id,actorUserId:user}); if(await store.resolveApiKey(made.key))throw new Error("Revoked API key resolved");
    console.log("API key isolation, scope, and revocation passed");
  } finally { await store.pool.query("DELETE FROM organizations WHERE id=ANY($1::text[])",[[orgA,orgB]]).catch(()=>{}); await store.pool.end(); }
}
run().catch(error=>{console.error(error.message);process.exit(1);});
