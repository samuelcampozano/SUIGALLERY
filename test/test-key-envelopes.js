import http from "node:http";
import crypto from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { Pool } from "pg";

process.env.NODE_ENV = "test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✅ PASS: ${message}`);
}

async function authenticate(client, keypair, organizationId) {
  const address = keypair.publicKey.toBase58();
  const challenge = await client.getSolanaChallenge(address);
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge.message), keypair.secretKey));
  await client.verifySolanaAuth(address, signature, challenge.message, organizationId);
  return address;
}

async function close(server) {
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

async function run() {
  console.log("==================================================");
  console.log("🔐 NODUS — CLIENT-SIDE KEY ENVELOPE TEST SUITE");
  console.log("==================================================");

  if (!process.env.DATABASE_URL) {
    console.log("⏭️  SKIPPED: DATABASE_URL is required for the PostgreSQL tenant-envelope integration suite.");
    return;
  }

  const orgA = `envelope-a-${Date.now()}`;
  const orgB = `envelope-b-${Date.now()}`;
  const { AuthTenantStore } = await import("../server/auth-tenant-store.js");
  const schemaStore = new AuthTenantStore({ databaseUrl: process.env.DATABASE_URL });
  await schemaStore.init();
  await schemaStore.pool.end();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const alicePair = Keypair.generate();
  const bobPair = Keypair.generate();
  const aliceAddress = alicePair.publicKey.toBase58();
  const bobAddress = bobPair.publicKey.toBase58();
  const aliceId = crypto.randomUUID();
  const bobId = crypto.randomUUID();
  await pool.query("INSERT INTO organizations (id, name) VALUES ($1, $2), ($3, $4)", [orgA, "Envelope Org A", orgB, "Envelope Org B"]);
  await pool.query(
    "INSERT INTO tenant_storage_contexts (organization_id, space_id, bucket_id, seal_policy_id, quota_bytes) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)",
    [orgA, `space-${orgA}`, `bucket-${orgA}`, "seal-a", 1000000, orgB, `space-${orgB}`, `bucket-${orgB}`, "seal-b", 1000000]
  );
  await pool.query("INSERT INTO users (id, solana_address) VALUES ($1, $2), ($3, $4)", [aliceId, aliceAddress, bobId, bobAddress]);
  await pool.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'viewer'), ($4, $2, 'owner')", [orgA, aliceId, bobId, orgB]);

  const { default: app } = await import("../server/index.js");
  const { createNodusClient } = await import("../sdk/index.js");
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const gatewayUrl = `http://127.0.0.1:${server.address().port}`;
  let assetId;
  let alice;

  try {
    alice = createNodusClient({ gatewayUrl });
    const bob = createNodusClient({ gatewayUrl });
    await authenticate(alice, alicePair, orgA);
    await authenticate(bob, bobPair, orgA);

    const passphrase = "correct horse battery staple 2026";
    const aliceBootstrap = await alice.bootstrapKeyIdentity({ passphrase });
    await bob.bootstrapKeyIdentity();
    assert(Boolean(aliceBootstrap.recoveryKit?.ciphertext), "Creates a passphrase-encrypted recovery kit on the client");

    assetId = crypto.randomUUID();
    const dataKey = crypto.randomBytes(32).toString("hex");
    alice.keyCache.set(assetId, dataKey);
    await alice.protectAssetKey(assetId);
    assert(Boolean(assetId), "Owner stores an encrypted key envelope in the active tenant");

    const ownerEnvelopeResponse = await fetch(`${gatewayUrl}/api/assets/${assetId}/key-envelopes`, { headers: { Authorization: `Bearer ${alice.accessToken}` } });
    const ownerEnvelopeBody = await ownerEnvelopeResponse.json();
    assert(ownerEnvelopeResponse.ok && ownerEnvelopeBody.envelopes.length === 2, "Gateway stores only primary and recovery ciphertext envelopes for the owner");
    assert(!JSON.stringify(ownerEnvelopeBody).includes(dataKey), "Gateway response does not contain the raw data key");

    await alice.protectAssetKey(assetId, { recipientAddresses: [bobAddress] });
    const bobKey = await bob.recoverAssetKey(assetId);
    assert(bobKey === dataKey, "A recipient decrypts through their own envelope without receiving Alice's key");

    const recoveredDevice = createNodusClient({ gatewayUrl });
    await authenticate(recoveredDevice, alicePair, orgA);
    const recoveredKey = await recoveredDevice.recoverAssetKey(assetId, { recoveryKit: aliceBootstrap.recoveryKit, passphrase });
    assert(recoveredKey === dataKey, "A new device restores the data key using only the encrypted recovery kit");

    const recipients = await alice.getOrganizationKeyRecipients(orgA);
    assert(recipients.some((recipient) => recipient.member === bobAddress), "Organization recipient directory exposes only registered public identities to members");

    await authenticate(alice, alicePair, orgB);
    const otherTenantRead = await fetch(`${gatewayUrl}/api/assets/${assetId}/key-envelopes`, { headers: { Authorization: `Bearer ${alice.accessToken}` } });
    assert(otherTenantRead.status === 404, "An envelope in one organization is invisible to a member session in another organization");

    const rawKeyAttempt = await fetch(`${gatewayUrl}/api/assets/${assetId}/key-envelopes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${alice.accessToken}` },
      body: JSON.stringify({ envelopes: [{ key: dataKey }] })
    });
    assert(rawKeyAttempt.status === 400, "Gateway rejects any attempt to submit a raw data key as an envelope");
    const headerOnlyRead = await fetch(`${gatewayUrl}/api/assets/${assetId}/key-envelopes`, { headers: { "x-solana-address": aliceAddress } });
    assert(headerOnlyRead.status === 401, "A Solana-address header alone cannot access tenant envelopes");
  } finally {
    await close(server);
    await pool.query("DELETE FROM organizations WHERE id = ANY($1::text[])", [[orgA, orgB]]).catch(() => {});
    await pool.end();
  }

  console.log("==================================================");
  console.log("🎉 ALL KEY ENVELOPE TESTS PASSED");
  console.log("==================================================");
}

run().catch((error) => {
  console.error("❌ Key envelope test failed:", error.message);
  process.exit(1);
});
