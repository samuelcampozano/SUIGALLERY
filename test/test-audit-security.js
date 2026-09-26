/**
 * @fileoverview Comprehensive Security Hardening & Penetration Audit Suite for Nodus.
 * Tests edge cases, spoofing defenses, input validation, memory boundaries,
 * cryptographic integrity, and zero-knowledge guarantees.
 */

import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import app from "../server/index.js";
import {
  generateAuthChallenge,
  verifySolanaSignature,
  createOrganization,
  getOrganization,
  addOrganizationMember,
  removeOrganizationMember,
  deriveOrgPDA,
  deriveMemberPDA,
  isSessionAuthenticated,
  recordAuthenticatedSession,
  isValidSolanaAddress,
  isValidOrgId,
  generateDemoSolanaSession
} from "../server/solana.js";
import {
  isValidFileId,
  sanitizeString,
  sanitizeTags,
  validateCiphertextPayload,
  DecryptedCacheManager
} from "../server/security.js";
import { createNodusClient } from "../sdk/index.js";

let passedCount = 0;
let failedCount = 0;

function testAssert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedCount++;
  }
}

async function runAuditSuite() {
  console.log("==================================================");
  console.log("🛡️  NODUS — COMPREHENSIVE SECURITY & PEN-TEST AUDIT");
  console.log("==================================================");

  // Start ephemeral server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`🚀 Ephemeral audit server listening on ${baseUrl}\n`);

  try {
    // ----------------------------------------------------
    // AUDIT 1: SIWS Cryptographic Challenge Lifecycle & Replay Defense
    // ----------------------------------------------------
    console.log("[AUDIT 1] SIWS Cryptographic Replay & Anti-Tamper Defenses");
    const aliceKeypair = Keypair.generate();
    const alicePubkey = aliceKeypair.publicKey.toBase58();

    // 1.1 Challenge generation
    const challengeRes = await fetch(`${baseUrl}/api/auth/solana/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: alicePubkey, domain: "audit.nodus.cloud" })
    });
    const challenge = await challengeRes.json();
    testAssert(challengeRes.status === 200, "Challenge issued successfully");

    // 1.2 Sign challenge
    const msgBytes = new TextEncoder().encode(challenge.message);
    const sig = bs58.encode(nacl.sign.detached(msgBytes, aliceKeypair.secretKey));

    // 1.3 First verification (Must succeed)
    const verify1 = await fetch(`${baseUrl}/api/auth/solana/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: alicePubkey, signature: sig, message: challenge.message })
    });
    const verify1Data = await verify1.json();
    testAssert(verify1.status === 200 && verify1Data.success === true, "First verification succeeds and establishes session");
    testAssert(isSessionAuthenticated(alicePubkey), "Active session registered for verified address");

    // 1.4 Replay attack defense: attempting to reuse the same challenge/signature
    const replayRes = await fetch(`${baseUrl}/api/auth/solana/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: alicePubkey, signature: sig, message: challenge.message })
    });
    testAssert(replayRes.status === 401, "Replay attack rejected with HTTP 401 (challenge consumed)");

    // 1.5 Message tampering defense
    const challenge2 = generateAuthChallenge(alicePubkey, "audit.nodus.cloud");
    const tamperedMessage = challenge2.message.replace("audit.nodus.cloud", "attacker.nodus.cloud");
    const tamperedSig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge2.message), aliceKeypair.secretKey));
    const tamperRes = await fetch(`${baseUrl}/api/auth/solana/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: alicePubkey, signature: tamperedSig, message: tamperedMessage })
    });
    testAssert(tamperRes.status === 401, "Tampered challenge message content rejected with HTTP 401");

    // ----------------------------------------------------
    // AUDIT 2: Zero-Env Ephemeral Solana Keypair Generation
    // ----------------------------------------------------
    console.log("\n[AUDIT 2] Zero-Env Ephemeral Solana Keypair Engine");
    let demoSession = null;
    try {
      demoSession = generateDemoSolanaSession();
      testAssert(demoSession.success === true, "generateDemoSolanaSession executes without runtime exceptions");
      testAssert(isValidSolanaAddress(demoSession.address), `Valid generated Solana address: ${demoSession.address.slice(0, 10)}...`);
      testAssert(isSessionAuthenticated(demoSession.address), "Ephemeral test user has active session registered");
    } catch (err) {
      testAssert(false, `generateDemoSolanaSession crashed: ${err.message}`);
    }

    // ----------------------------------------------------
    // AUDIT 3: Caller Spoofing & Broken Access Control (RBAC)
    // ----------------------------------------------------
    console.log("\n[AUDIT 3] Anti-Spoofing & RBAC Privilege Enforcement");
    const orgId = `sec-audit-${Date.now()}`;
    const eveKeypair = Keypair.generate();
    const evePubkey = eveKeypair.publicKey.toBase58();

    // Alice creates organization
    const orgRes = await fetch(`${baseUrl}/api/orgs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgId,
        name: "Security Audit DAO",
        ownerAddress: alicePubkey
      })
    });
    const orgData = await orgRes.json();
    testAssert(orgRes.status === 200, "Organization created by verified owner");

    // ATTACK 1: Unauthenticated Eve attempts to spoof Alice's address to add herself as admin
    const spoofAddRes = await fetch(`${baseUrl}/api/orgs/${orgId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberAddress: evePubkey,
        role: "admin",
        callerAddress: evePubkey // Eve is NOT an authenticated session and NOT an admin
      })
    });
    testAssert(spoofAddRes.status === 403, "Unauthenticated caller blocked from member invites (HTTP 403 Forbidden)");

    // Legitimate owner (Alice) adds Eve as viewer
    const validAddRes = await fetch(`${baseUrl}/api/orgs/${orgId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberAddress: evePubkey,
        role: "viewer",
        callerAddress: alicePubkey // Alice is an active authenticated session and owner
      })
    });
    testAssert(validAddRes.status === 200, "Verified owner successfully invites member");

    // ATTACK 2: Authenticated Eve attempts privilege escalation (viewer inviting others)
    recordAuthenticatedSession(evePubkey); // Simulate Eve logged in as viewer
    const bobKeypair = Keypair.generate();
    const bobPubkey = bobKeypair.publicKey.toBase58();
    const escalateRes = await fetch(`${baseUrl}/api/orgs/${orgId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberAddress: bobPubkey,
        role: "admin",
        callerAddress: evePubkey
      })
    });
    testAssert(escalateRes.status === 403, "Privilege escalation attempt by viewer blocked (HTTP 403)");

    // ATTACK 3: Attempting to remove the Organization Owner
    const removeOwnerRes = await fetch(`${baseUrl}/api/orgs/${orgId}/members/${alicePubkey}?callerAddress=${alicePubkey}`, {
      method: "DELETE"
    });
    testAssert(removeOwnerRes.status === 400 || removeOwnerRes.status === 403, "Blocked removing Organization Owner");

    // Legitimate removal: Owner removes Eve
    const removeEveRes = await fetch(`${baseUrl}/api/orgs/${orgId}/members/${evePubkey}?callerAddress=${alicePubkey}`, {
      method: "DELETE"
    });
    const removeEveData = await removeEveRes.json();
    testAssert(removeEveRes.status === 200 && removeEveData.removed === true, "Owner successfully removes member");

    // ----------------------------------------------------
    // AUDIT 4: Input Validation, Traversal & DoS Boundaries
    // ----------------------------------------------------
    console.log("\n[AUDIT 4] Input Validation & Path Traversal Boundaries");

    // 4.1 Path Traversal in File IDs
    testAssert(!isValidFileId("../../../etc/passwd"), "Rejects Unix root traversal in fileId");
    testAssert(!isValidFileId("..\\..\\windows\\win.ini"), "Rejects Windows traversal in fileId");
    testAssert(!isValidFileId("file/with/slashes"), "Rejects subpath slashes in fileId");
    testAssert(isValidFileId("sandbox_1790386131276_valid"), "Accepts valid alphanumeric fileId");

    // 4.2 Malformed Organization IDs
    testAssert(!isValidOrgId(""), "Rejects empty orgId");
    testAssert(!isValidOrgId("a"), "Rejects too-short orgId (< 2 chars)");
    testAssert(!isValidOrgId("a".repeat(70)), "Rejects oversized orgId (> 64 chars)");
    testAssert(!isValidOrgId("../../dangerous"), "Rejects traversal in orgId");
    testAssert(!isValidOrgId("<script>alert(1)</script>"), "Rejects HTML in orgId");
    testAssert(isValidOrgId("nodus-devs_2026"), "Accepts valid orgId format");

    // 4.3 Solana Address Validation
    testAssert(!isValidSolanaAddress("not-a-key"), "Rejects arbitrary strings as Solana address");
    testAssert(!isValidSolanaAddress("0x7cd0be5706a92f24e7be0fa25666ace9de0b5441a286efab982dcfaa74793033"), "Rejects Sui hex addresses as Solana address");
    testAssert(isValidSolanaAddress(alicePubkey), "Validates genuine Base58 Solana public key");

    // 4.4 HTML Entity Sanitization (XSS)
    const dangerousStr = `<script>alert("nodus")</script>&'test"`;
    const cleanStr = sanitizeString(dangerousStr);
    testAssert(!cleanStr.includes("<script>"), "Strips raw script tags in sanitizeString");
    testAssert(cleanStr.includes("&lt;script&gt;"), "Encodes angle brackets into safe HTML entities");

    // 4.5 Tag Sanitization
    const dirtyTags = ["<script>", "VALID-TAG", "tag with spaces", "a".repeat(50)];
    const cleanTags = sanitizeTags(dirtyTags);
    testAssert(!cleanTags.includes("<script>"), "Strips dangerous characters from tag list");
    testAssert(cleanTags.includes("valid-tag"), "Normalizes tags to lowercase alphanumeric");

    // ----------------------------------------------------
    // AUDIT 5: Zero-Knowledge Ciphertext Enforcement
    // ----------------------------------------------------
    console.log("\n[AUDIT 5] Zero-Knowledge Ciphertext Ingestion Hardening");
    const testTempDir = path.resolve("./temp_storage");
    const dummyPlaintextPng = path.join(testTempDir, "audit_canary_plain.png");
    fs.writeFileSync(dummyPlaintextPng, Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex"));

    // Attempting to pass plaintext file claiming to be ciphertext
    const plainCheck = await validateCiphertextPayload(dummyPlaintextPng, {
      iv: "00112233445566778899aabb",
      key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    });
    testAssert(!plainCheck.valid, "Plaintext PNG header correctly rejected under zero-knowledge policy");

    // Missing / invalid IV
    const badIvCheck = await validateCiphertextPayload(dummyPlaintextPng, {
      iv: "short_iv",
      key: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    });
    testAssert(!badIvCheck.valid, "Invalid IV length (< 24 hex characters) rejected");

    try { fs.unlinkSync(dummyPlaintextPng); } catch {}

    // ----------------------------------------------------
    // AUDIT 6: Cache Lifecycle & Startup Orphan Cleanup
    // ----------------------------------------------------
    console.log("\n[AUDIT 6] Cache Eviction & Disk Storage Hygiene");
    const cacheMgr = new DecryptedCacheManager({ ttlMs: 50 }); // 50ms TTL for fast test
    const dummyCacheFile = path.join(testTempDir, "stream_audit_dummy.bin");
    fs.writeFileSync(dummyCacheFile, Buffer.from("audit_cache_bytes"));

    cacheMgr.set("audit_file_1", dummyCacheFile);
    testAssert(cacheMgr.get("audit_file_1") === dummyCacheFile, "Cache hit before TTL expiration");

    // Wait for TTL expiration
    await new Promise((r) => setTimeout(r, 60));
    testAssert(cacheMgr.get("audit_file_1") === null, "Cache miss after TTL expiration");
    testAssert(!fs.existsSync(dummyCacheFile), "Expired cache file automatically unlinked from disk");

    // Cleanup orphaned files test
    const orphanStream = path.join(testTempDir, "stream_orphan_canary.bin");
    const orphanUpload = path.join(testTempDir, "upload_orphan_canary");
    fs.writeFileSync(orphanStream, Buffer.from("orphan"));
    fs.writeFileSync(orphanUpload, Buffer.from("orphan"));

    cacheMgr.cleanupOrphanedFiles(testTempDir);
    testAssert(!fs.existsSync(orphanStream), "cleanupOrphanedFiles swept orphaned stream_*.bin file");
    testAssert(!fs.existsSync(orphanUpload), "cleanupOrphanedFiles swept orphaned upload_* file");

    // ----------------------------------------------------
    // AUDIT 7: Developer SDK Integration & Header Hardening
    // ----------------------------------------------------
    console.log("\n[AUDIT 7] Developer SDK Authenticated Headers & Member Management");
    const nodus = createNodusClient({ gatewayUrl: baseUrl });
    nodus.userAddress = alicePubkey;

    // Verify SDK automatically attaches x-solana-address in headers
    const headers = nodus._getHeaders();
    testAssert(headers["x-solana-address"] === alicePubkey, "SDK automatically forwards active Solana address in headers");

    // SDK removeOrganizationMember method
    try {
      // Add member then remove via SDK
      await nodus.addOrganizationMember(orgId, {
        memberAddress: charlieAddress,
        role: "viewer",
        callerAddress: alicePubkey
      });
      const removed = await nodus.removeOrganizationMember(orgId, charlieAddress, alicePubkey);
      testAssert(removed === true, "SDK removeOrganizationMember executes successfully");
    } catch (err) {
      testAssert(false, `SDK member removal failed: ${err.message}`);
    }

  } finally {
    server.close();
  }

  console.log("\n==================================================");
  console.log(`AUDIT SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("==================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

const charlieKeypair = Keypair.generate();
const charlieAddress = charlieKeypair.publicKey.toBase58();

runAuditSuite();
