/**
 * @fileoverview Automated Test Suite for Solana Identity & Anchor PDAs (Phase 3).
 * Validates Sign-In With Solana (SIWS), cryptographic Ed25519 verification,
 * deterministic Anchor PDA derivation, multi-tenant RBAC trees, and cross-chain cohesion.
 */

process.env.NODE_ENV = "test";
import http from "node:http";
import assert from "node:assert";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import app from "../server/index.js";
import {
  generateAuthChallenge,
  verifySolanaSignature,
  deriveOrgPDA,
  deriveMemberPDA,
  createOrganization,
  getOrganization,
  listUserOrganizations,
  addOrganizationMember,
  removeOrganizationMember,
  verifyOrgPermission
} from "../server/solana.js";
import { createNodusClient } from "../sdk/index.js";

async function runSolanaTests() {
  console.log("==================================================");
  console.log("☀️  NODUS — SOLANA IDENTITY & ANCHOR PDA TEST SUITE");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function testAssert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Spin up ephemeral test server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`🚀 Ephemeral test server listening on ${baseUrl}\n`);

  try {
    // ----------------------------------------------------
    // TEST GROUP 1: Solana Keypair Generation & SIWS Challenge Flow
    // ----------------------------------------------------
    console.log("[TEST 1] Sign-In With Solana (SIWS) Cryptographic Challenge");
    const aliceKeypair = Keypair.generate();
    const aliceAddress = aliceKeypair.publicKey.toBase58();

    const challengeRes = await fetch(`${baseUrl}/api/auth/solana/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: aliceAddress, domain: "nodus.cloud" })
    });
    const challengeData = await challengeRes.json();

    testAssert(challengeRes.status === 200, "Challenge endpoint returns HTTP 200");
    testAssert(challengeData.success === true, "Challenge generation returns success: true");
    testAssert(typeof challengeData.nonce === "string" && challengeData.nonce.length === 32, "Issues 32-character hexadecimal nonce");
    testAssert(challengeData.message.includes(aliceAddress), "Challenge message contains claimed Solana address");

    // ----------------------------------------------------
    // TEST GROUP 2: Cryptographic Ed25519 Signature Verification
    // ----------------------------------------------------
    console.log("\n[TEST 2] Ed25519 Signature Verification & Session Issuance");
    const messageBytes = new TextEncoder().encode(challengeData.message);
    const signatureBytes = nacl.sign.detached(messageBytes, aliceKeypair.secretKey);
    const signatureBase58 = bs58.encode(signatureBytes);

    const verifyRes = await fetch(`${baseUrl}/api/auth/solana/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: aliceAddress,
        signature: signatureBase58,
        message: challengeData.message
      })
    });
    const verifyData = await verifyRes.json();

    testAssert(verifyRes.status === 200, "Verification endpoint returns HTTP 200");
    testAssert(verifyData.success === true, "Signature verified successfully");
    testAssert(verifyData.provider === "solana" && verifyData.scheme === "ed25519", "Session tagged with provider: solana and scheme: ed25519");

    // ----------------------------------------------------
    // TEST GROUP 3: Rejection of Forged Signatures & Tampered Messages
    // ----------------------------------------------------
    console.log("\n[TEST 3] Cryptographic Defense: Rejecting Forged & Tampered Signatures");
    const bobKeypair = Keypair.generate();
    // Bob signs Alice's challenge with Bob's private key
    const forgedSignature = bs58.encode(nacl.sign.detached(messageBytes, bobKeypair.secretKey));

    const forgedRes = await fetch(`${baseUrl}/api/auth/solana/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: aliceAddress,
        signature: forgedSignature,
        message: challengeData.message
      })
    });
    testAssert(forgedRes.status === 401, "Rejects forged signature with HTTP 401 Unauthorized");

    // Tampered message with valid signature
    const tamperedMessage = challengeData.message + " (TAMPERED)";
    const tamperedRes = await fetch(`${baseUrl}/api/auth/solana/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: aliceAddress,
        signature: signatureBase58,
        message: tamperedMessage
      })
    });
    testAssert(tamperedRes.status === 401, "Rejects tampered message content with HTTP 401");

    // ----------------------------------------------------
    // TEST GROUP 4: Anchor Program Derived Address (PDA) Derivation
    // ----------------------------------------------------
    console.log("\n[TEST 4] Anchor Program Derived Address (PDA) Derivation");
    const orgId = "solana-dao-" + Date.now();
    const orgPDA1 = deriveOrgPDA(orgId);
    const orgPDA2 = deriveOrgPDA(orgId);

    testAssert(orgPDA1.pdaString === orgPDA2.pdaString, "Org PDA derivation is 100% deterministic");
    testAssert(typeof orgPDA1.bump === "number" && orgPDA1.bump >= 0 && orgPDA1.bump <= 255, `Valid canonical bump seed: ${orgPDA1.bump}`);
    testAssert(orgPDA1.pdaString.length >= 32, `Valid Base58 PDA string format (${orgPDA1.pdaString.slice(0, 12)}...)`);

    const memberPDA = deriveMemberPDA(orgPDA1.pda, aliceKeypair.publicKey);
    testAssert(Boolean(memberPDA.pdaString), `Derived Member PDA: ${memberPDA.pdaString.slice(0, 12)}...`);
    testAssert(memberPDA.pdaString !== orgPDA1.pdaString, "Org PDA and Member PDA are collision-free");

    // ----------------------------------------------------
    // TEST GROUP 5: Multi-Tenant Organization Creation & Anchor Account State
    // ----------------------------------------------------
    console.log("\n[TEST 5] Multi-Tenant Organization Creation via REST API");
    const createOrgRes = await fetch(`${baseUrl}/api/orgs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgId,
        name: "Solana Superteam DAO",
        ownerAddress: aliceAddress,
        storageCapBytes: 100 * 1024 * 1024 * 1024 // 100 GB
      })
    });
    const createOrgData = await createOrgRes.json();

    testAssert(createOrgRes.status === 200, "Create organization returns HTTP 200");
    testAssert(createOrgData.organization.pda === orgPDA1.pdaString, "On-chain Org PDA matches deterministic derivation");
    testAssert(createOrgData.organization.owner === aliceAddress, "Owner address recorded correctly");
    testAssert(createOrgData.organization.ownerMembership.role === "owner", "Creator automatically assigned Owner role");

    // Fetch organization details
    const getOrgRes = await fetch(`${baseUrl}/api/orgs/${orgId}`);
    const getOrgData = await getOrgRes.json();
    testAssert(getOrgData.organization.name === "Solana Superteam DAO", "Fetches organization metadata correctly");
    testAssert(getOrgData.organization.memberCount === 1, "Initial member count is 1 (owner)");

    // ----------------------------------------------------
    // TEST GROUP 6: Role-Based Access Control (RBAC) Tree
    // ----------------------------------------------------
    console.log("\n[TEST 6] Organization Member Invites & RBAC Role Enforcement");
    const charlieKeypair = Keypair.generate();
    const charlieAddress = charlieKeypair.publicKey.toBase58();

    // Alice (Owner) adds Charlie as Contributor
    const addMemberRes = await fetch(`${baseUrl}/api/orgs/${orgId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberAddress: charlieAddress,
        role: "contributor",
        callerAddress: aliceAddress
      })
    });
    const addMemberData = await addMemberRes.json();
    testAssert(addMemberRes.status === 200, "Owner successfully invites member as contributor");
    testAssert(addMemberData.member.role === "contributor", "Member assigned 'contributor' role");
    testAssert(Boolean(addMemberData.member.pda), `Member Anchor PDA established: ${addMemberData.member.pda.slice(0, 10)}...`);

    // Verify Charlie has contributor privileges
    testAssert(verifyOrgPermission(orgId, charlieAddress, "contributor"), "Charlie verified for contributor actions (upload)");
    testAssert(!verifyOrgPermission(orgId, charlieAddress, "admin"), "Charlie blocked from admin actions (manage members)");

    // Charlie attempts to invite Dave (Unauthorized)
    const daveKeypair = Keypair.generate();
    const unauthorizedRes = await fetch(`${baseUrl}/api/orgs/${orgId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberAddress: daveKeypair.publicKey.toBase58(),
        role: "viewer",
        callerAddress: charlieAddress
      })
    });
    testAssert(unauthorizedRes.status === 403 || unauthorizedRes.status === 400, "Non-admin member cannot invite new members (RBAC guard enforced)");

    // Alice removes Charlie
    const removeRes = await fetch(`${baseUrl}/api/orgs/${orgId}/members/${charlieAddress}`, {
      method: "DELETE",
      headers: { "x-solana-address": aliceAddress }
    });
    const removeData = await removeRes.json();
    testAssert(removeData.success === true && removeData.removed === true, "Owner successfully removes member");
    testAssert(!verifyOrgPermission(orgId, charlieAddress, "viewer"), "Removed member loses all organization permissions");

    // ----------------------------------------------------
    // TEST GROUP 7: Cross-Chain Cohesion: Solana Identity + Walrus Storage + Sui Seal
    // ----------------------------------------------------
    console.log("\n[TEST 7] Cross-Chain Cohesion: Solana Identity with Walrus & Sui Seal");
    const nodus = createNodusClient({ gatewayUrl: baseUrl });

    // Authenticate client with Solana identity
    const challenge = await nodus.getSolanaChallenge(aliceAddress);
    const clientSig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge.message), aliceKeypair.secretKey));
    const authSession = await nodus.verifySolanaAuth(aliceAddress, clientSig, challenge.message);
    testAssert(authSession.success === true, "SDK authenticates via Solana SIWS");

    // Ingest encrypted document under Solana identity
    const syntheticSolanaDoc = "SOLANA_CROSS_CHAIN_MANIFEST_V1 (Anchor PDA: " + orgPDA1.pdaString + ")";
    const uploadRes = await nodus.put(syntheticSolanaDoc, {
      name: "solana_treasury_manifest.pdf",
      type: "application/pdf",
      description: "Verifiable Cross-Chain Treasury Document",
      tags: ["solana", "cross-chain", "dao"]
    });

    testAssert(uploadRes.success === true, "Solana authenticated client uploads encrypted asset to Walrus");
    testAssert(Boolean(uploadRes.blob_id), `Blob stored on Walrus: ${uploadRes.blob_id}`);

    // Retrieve and verify bit-for-bit decrypted content
    const retrieved = await nodus.get(uploadRes.id);
    const retrievedText = new TextDecoder().decode(retrieved.data);
    testAssert(retrievedText === syntheticSolanaDoc, "Recovered decrypted payload matches bit-for-bit under Solana identity");

  } finally {
    server.close();
  }

  console.log("\n==================================================");
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSolanaTests().catch((err) => {
  console.error("Solana Test runner fatal error:", err);
  process.exit(1);
});
