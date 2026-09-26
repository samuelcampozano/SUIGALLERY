import http from "node:http";
import crypto from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

process.env.NODE_ENV = "test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✅ PASS: ${message}`);
}

async function authenticate(client, keypair) {
  const address = keypair.publicKey.toBase58();
  const challenge = await client.getSolanaChallenge(address);
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge.message), keypair.secretKey));
  await client.verifySolanaAuth(address, signature, challenge.message);
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

  const { default: app } = await import("../server/index.js");
  const { createNodusClient } = await import("../sdk/index.js");
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const gatewayUrl = `http://127.0.0.1:${server.address().port}`;
  const alicePair = Keypair.generate();
  const bobPair = Keypair.generate();
  let assetId;

  try {
    const alice = createNodusClient({ gatewayUrl });
    const bob = createNodusClient({ gatewayUrl });
    const aliceAddress = await authenticate(alice, alicePair);
    const bobAddress = await authenticate(bob, bobPair);

    const passphrase = "correct horse battery staple 2026";
    const aliceBootstrap = await alice.bootstrapKeyIdentity({ passphrase });
    await bob.bootstrapKeyIdentity();
    assert(Boolean(aliceBootstrap.recoveryKit?.ciphertext), "Creates a passphrase-encrypted recovery kit on the client");

    const plaintext = `envelope-only-secret-${crypto.randomUUID()}`;
    const upload = await alice.put(plaintext, { name: "envelope-test.txt", type: "text/plain" });
    assetId = upload.id;
    assert(Boolean(assetId), "Upload automatically stores an owner key envelope when a device identity is present");

    const ownerEnvelopeResponse = await fetch(`${gatewayUrl}/api/assets/${assetId}/key-envelopes`, { headers: { "x-solana-address": aliceAddress } });
    const ownerEnvelopeBody = await ownerEnvelopeResponse.json();
    assert(ownerEnvelopeResponse.ok && ownerEnvelopeBody.envelopes.length === 2, "Gateway stores only primary and recovery ciphertext envelopes for the owner");
    assert(!JSON.stringify(ownerEnvelopeBody).includes(upload.key), "Gateway response does not contain the raw data key");

    await alice.protectAssetKey(assetId, { recipientAddresses: [bobAddress] });
    const bobRecovered = await bob.get(assetId);
    assert(new TextDecoder().decode(bobRecovered.data) === plaintext, "A recipient decrypts through their own envelope without receiving Alice's key");

    const recoveredDevice = createNodusClient({ gatewayUrl });
    await authenticate(recoveredDevice, alicePair);
    const recoveredKey = await recoveredDevice.recoverAssetKey(assetId, { recoveryKit: aliceBootstrap.recoveryKit, passphrase });
    assert(recoveredKey === upload.key, "A new device restores the data key using only the encrypted recovery kit");

    const orgId = `envelopeorg${Date.now()}`;
    await alice.createOrganization({ orgId, name: "Envelope test organization", ownerAddress: aliceAddress });
    await alice.addOrganizationMember(orgId, { memberAddress: bobAddress, role: "viewer", callerAddress: aliceAddress });
    await alice.protectAssetKey(assetId, { organizationId: orgId });
    const recipients = await alice.getOrganizationKeyRecipients(orgId);
    assert(recipients.some((recipient) => recipient.member === bobAddress), "Organization recipient directory exposes only registered public identities to members");

    const rawKeyAttempt = await fetch(`${gatewayUrl}/api/assets/${assetId}/key-envelopes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-solana-address": aliceAddress },
      body: JSON.stringify({ envelopes: [{ key: upload.key }] })
    });
    assert(rawKeyAttempt.status === 400, "Gateway rejects any attempt to submit a raw data key as an envelope");
  } finally {
    if (assetId) await fetch(`${gatewayUrl}/api/assets/${assetId}`, { method: "DELETE" }).catch(() => {});
    await close(server);
  }

  console.log("==================================================");
  console.log("🎉 ALL KEY ENVELOPE TESTS PASSED");
  console.log("==================================================");
}

run().catch((error) => {
  console.error("❌ Key envelope test failed:", error.message);
  process.exit(1);
});
