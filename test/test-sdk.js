/**
 * @fileoverview Automated Test Suite for Nodus Developer SDK (@nodus/sdk)
 * Validates SDK initialization, client-side AES-GCM encryption, Walrus storage,
 * bit-for-bit retrieval, zero-knowledge local search, and crypto-shredding.
 */

process.env.NODE_ENV = "test";
import http from "node:http";
import assert from "node:assert";
import app from "../server/index.js";
import { NodusClient, createNodusClient, NodusCrypto } from "../sdk/index.js";

async function runSdkTests() {
  console.log("==================================================");
  console.log("📦 NODUS DEVELOPER SDK (@nodus/sdk) TEST SUITE");
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
  const gatewayUrl = `http://127.0.0.1:${port}`;
  console.log(`🚀 Ephemeral test server listening on ${gatewayUrl}\n`);

  try {
    const client = createNodusClient({ gatewayUrl });

    // ----------------------------------------------------
    // TEST GROUP 1: Client Initialization & Gateway Status
    // ----------------------------------------------------
    console.log("[TEST 1] Client Initialization & Gateway Status");
    testAssert(client instanceof NodusClient, "createNodusClient returns NodusClient instance");
    testAssert(client.gatewayUrl === gatewayUrl, "Gateway URL configured correctly");

    const status = await client.getStatus();
    testAssert(status.success === true, "client.getStatus() returns success: true");
    testAssert(status.space && typeof status.space.storage_cap_bytes === "number", "Exposes space quota allocation");
    testAssert(status.bucket && status.bucket.seal_policy_id, "Exposes on-chain Seal threshold policy");

    // ----------------------------------------------------
    // TEST GROUP 2: Low-Level Crypto Primitives
    // ----------------------------------------------------
    console.log("\n[TEST 2] Low-Level WebCrypto Envelope Primitives");
    const testSecret = new TextEncoder().encode("Nodus Sovereign Cloud Confidential Payload 2026");
    const encRes = await NodusCrypto.encryptBuffer(testSecret);
    testAssert(encRes.ciphertext instanceof Uint8Array, "Generates Uint8Array ciphertext");
    testAssert(encRes.keyHex.length === 64, "Exports 256-bit AES key as 64-char hex");
    testAssert(encRes.ivHex.length === 24, "Exports 96-bit IV as 24-char hex");

    const decryptedSecret = await NodusCrypto.decryptBuffer(encRes.ciphertext, encRes.keyHex, encRes.ivHex);
    const decryptedText = new TextDecoder().decode(decryptedSecret);
    testAssert(decryptedText === "Nodus Sovereign Cloud Confidential Payload 2026", "WebCrypto roundtrip recovers plaintext bit-for-bit");

    // ----------------------------------------------------
    // TEST GROUP 3: Storing Generic Documents via client.put()
    // ----------------------------------------------------
    console.log("\n[TEST 3] Ingesting Generic Assets via client.put()");
    // Document 1: PDF Report
    const syntheticPdfContent = "%PDF-1.4\n1 0 obj\n<< /Title (Top Secret Audit) /Author (Nodus Sovereign) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
    const doc1 = await client.put(syntheticPdfContent, {
      name: "confidential_audit_report.pdf",
      type: "application/pdf",
      description: "Q3 Cryptographic Security Audit",
      tags: ["audit", "compliance", "nodus"]
    });

    testAssert(doc1.success === true, "client.put() succeeds for PDF document");
    testAssert(Boolean(doc1.id), `Generated asset ID: ${doc1.id}`);
    testAssert(Boolean(doc1.blob_id), `Anchored on Walrus Blob: ${doc1.blob_id}`);
    testAssert(doc1.encrypted === true, "Asset was encrypted client-side before transport");
    testAssert(Boolean(doc1.key && doc1.iv), "Returns cryptographic key envelope (IV + Key)");

    // Document 2: Word Document (Financials)
    const syntheticDocxContent = "PK\x03\x04[Content_Types].xml (Simulated Word Document with Financial Tables)";
    const doc2 = await client.put(syntheticDocxContent, {
      name: "quarterly_financials_2026.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      description: "Executive Financial Projections",
      tags: ["finance", "executive", "q3"]
    });
    testAssert(doc2.success === true, "client.put() succeeds for DOCX document");

    // ----------------------------------------------------
    // TEST GROUP 4: Bit-for-Bit Decrypted Retrieval via client.get()
    // ----------------------------------------------------
    console.log("\n[TEST 4] Retrieving & Decrypting Asset via client.get()");
    const retrieved1 = await client.get(doc1.id);
    testAssert(retrieved1.encrypted === true, "Identified as encrypted asset stream");
    testAssert(retrieved1.type === "application/pdf", `Original MIME type preserved: ${retrieved1.type}`);
    testAssert(retrieved1.name === "confidential_audit_report.pdf", `Original name preserved: ${retrieved1.name}`);

    const retrievedText = new TextDecoder().decode(retrieved1.data);
    testAssert(retrievedText === syntheticPdfContent, "Decrypted binary content matches original PDF bit-for-bit");

    // ----------------------------------------------------
    // TEST GROUP 5: Zero-Knowledge Client-Side Search
    // ----------------------------------------------------
    console.log("\n[TEST 5] Zero-Knowledge Private Client-Side Search");
    // Search by title keyword
    const searchReport = await client.search("audit");
    testAssert(searchReport.length >= 1, "Finds document by keyword 'audit'");
    testAssert(searchReport[0].name.includes("audit"), "Top match contains searched keyword");

    // Search by tag
    const searchFinance = await client.search("finance");
    testAssert(searchFinance.length >= 1, "Finds document by tag 'finance'");
    testAssert(searchFinance[0].name.includes("financials"), "Matched correct financial document");

    // Search with type filter
    const searchPdfOnly = await client.search("", { type: "application/pdf" });
    testAssert(searchPdfOnly.length >= 1, "Filters search results by MIME type 'application/pdf'");
    testAssert(searchPdfOnly.every((d) => (d.original_type || d.content_type) === "application/pdf"), "All filtered results match PDF MIME type");

    // ----------------------------------------------------
    // TEST GROUP 6: Asset Catalog Listing & Filtering
    // ----------------------------------------------------
    console.log("\n[TEST 6] Asset Catalog Listing via client.list()");
    const allAssets = await client.list();
    testAssert(Array.isArray(allAssets) && allAssets.length >= 2, `Lists all anchored assets (${allAssets.length} found)`);

    const taggedAudit = await client.list({ tag: "audit" });
    testAssert(taggedAudit.length >= 1, "Filters catalog by tag 'audit'");

    // ----------------------------------------------------
    // TEST GROUP 7: Verifiable Crypto-Shredding via client.delete()
    // ----------------------------------------------------
    console.log("\n[TEST 7] Verifiable Crypto-Shredding via client.delete()");
    const deleteRes = await client.delete(doc1.id);
    testAssert(deleteRes.success === true && deleteRes.deleted === true, "client.delete() returns success: true");

    let postDeleteFailed = false;
    try {
      await client.get(doc1.id);
    } catch {
      postDeleteFailed = true;
    }
    testAssert(postDeleteFailed, "Post-shred client.get() is blocked (crypto-shredded)");

    // Search index automatically pruned
    const searchPostDelete = await client.search("audit");
    testAssert(searchPostDelete.every((d) => d.id !== doc1.id), "Deleted asset was purged from local search index");

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

runSdkTests().catch((err) => {
  console.error("SDK Test runner fatal error:", err);
  process.exit(1);
});
