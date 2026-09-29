import { AuthTenantStore } from "../server/auth-tenant-store.js";

async function run() {
  if (!process.env.DATABASE_URL) { console.log("SKIPPED: DATABASE_URL is required for public idempotency integration tests."); return; }
  const store=new AuthTenantStore(); await store.init(); const org=`idem-${Date.now()}`;
  try { await store.pool.query("INSERT INTO organizations (id,name) VALUES ($1,'Idempotency')",[org]);
    const first=await store.beginPublicIdempotency({organizationId:org,actorKey:'api:test',operation:'POST:asset',idempotencyKey:'idempotency-test-key',requestHash:'a'.repeat(64)}); if(first.kind!=='new')throw new Error('First request was not accepted');
    await store.completePublicIdempotency({id:first.id,status:201,body:{success:true,id:'asset-1'}});
    const replay=await store.beginPublicIdempotency({organizationId:org,actorKey:'api:test',operation:'POST:asset',idempotencyKey:'idempotency-test-key',requestHash:'a'.repeat(64)}); if(replay.kind!=='replay'||replay.body.id!=='asset-1')throw new Error('Replay did not return saved response');
    const conflict=await store.beginPublicIdempotency({organizationId:org,actorKey:'api:test',operation:'POST:asset',idempotencyKey:'idempotency-test-key',requestHash:'b'.repeat(64)}); if(conflict.kind!=='conflict')throw new Error('Differing payload did not conflict'); console.log('Public idempotency passed');
  } finally { await store.pool.query("DELETE FROM organizations WHERE id=$1",[org]).catch(()=>{}); await store.pool.end(); }
}
run().catch(error=>{console.error(error.message);process.exit(1);});
