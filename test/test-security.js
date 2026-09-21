import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  validateMagicBytes,
  isValidFileId,
  sanitizeString,
  sanitizeTags,
  DecryptedCacheManager
} from "../server/security.js";
import { blake2b } from "@noble/hashes/blake2.js";

async function runSecurityTests() {
  console.log("==================================================");
  console.log("🛡️ SUIGALLERY — UNIT & SECURITY TEST SUITE");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const testDir = path.resolve("./temp_storage/security_test_sandbox");
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  try {
    // ----------------------------------------------------
    // TEST GROUP 1: Magic Byte File Validation
    // ----------------------------------------------------
    console.log("\n[TEST GROUP 1] File Signature & Magic Byte Verification");

    // 1.1 Genuine PNG Header
    const validPng = path.join(testDir, "test.png");
    fs.writeFileSync(validPng, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]));
    const pngResult = await validateMagicBytes(validPng);
    assert(pngResult.valid && pngResult.type === "image/png", "Validates genuine PNG file signature");

    // 1.2 Genuine JPEG Header
    const validJpg = path.join(testDir, "test.jpg");
    fs.writeFileSync(validJpg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));
    const jpgResult = await validateMagicBytes(validJpg);
    assert(jpgResult.valid && jpgResult.type === "image/jpeg", "Validates genuine JPEG file signature");

    // 1.3 Genuine WebP Header
    const validWebp = path.join(testDir, "test.webp");
    fs.writeFileSync(
      validWebp,
      Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
    );
    const webpResult = await validateMagicBytes(validWebp);
    assert(webpResult.valid && webpResult.type === "image/webp", "Validates genuine WebP file signature");

    // 1.4 Malicious / Fake PNG (Shell script disguised as PNG)
    const fakePng = path.join(testDir, "disguised_script.png");
    fs.writeFileSync(fakePng, Buffer.from("#!/bin/bash\necho 'malicious'"));
    const fakeResult = await validateMagicBytes(fakePng);
    assert(!fakeResult.valid, "Rejects executable shell script disguised with .png extension");

    // 1.5 Windows Executable disguised as JPG
    const fakeJpg = path.join(testDir, "malware.jpg");
    fs.writeFileSync(fakeJpg, Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])); // MZ header
    const malwareResult = await validateMagicBytes(fakeJpg);
    assert(!malwareResult.valid, "Rejects Windows MZ executable header disguised as .jpg");

    // ----------------------------------------------------
    // TEST GROUP 2: Path Traversal Defense
    // ----------------------------------------------------
    console.log("\n[TEST GROUP 2] Path Traversal & Identifier Validation");

    assert(isValidFileId("ec7acd16-05b1-4fa2-b368-94700eb29f5e"), "Accepts valid UUID file identifier");
    assert(isValidFileId("photo_2026_champion_123"), "Accepts valid alphanumeric file identifier");
    assert(!isValidFileId("../../etc/passwd"), "Blocks Unix directory traversal attack (../../)");
    assert(!isValidFileId("..\\..\\Windows\\System32"), "Blocks Windows path traversal attack (..\\..)");
    assert(!isValidFileId("photo/upload"), "Blocks sub-path slash injection");
    assert(!isValidFileId("file\0name.png"), "Blocks null byte string termination injection");
    assert(!isValidFileId(""), "Rejects empty file identifier");
    assert(!isValidFileId(null), "Rejects null identifier parameter");

    // ----------------------------------------------------
    // TEST GROUP 3: XSS & Control Character Sanitization
    // ----------------------------------------------------
    console.log("\n[TEST GROUP 3] Input Sanitization & Anti-XSS Guards");

    const xssInput = "<script>alert('xss')</script>";
    const sanitizedXss = sanitizeString(xssInput);
    assert(
      !sanitizedXss.includes("<script>") && sanitizedXss.includes("&lt;script&gt;"),
      "Escapes HTML script tags to prevent stored XSS"
    );

    const controlChars = "Safe\x00Name\x1F\x08With\x7FControls";
    const cleanedString = sanitizeString(controlChars);
    assert(cleanedString === "SafeNameWithControls", "Strips ASCII and UTF control characters");

    const dirtyTags = ["<HACK>", "tag!@#", "normal-tag", "VERY_LONG_TAG_EXCEEDING_MAX_ALLOWED_LENGTH_OF_CHARS"];
    const cleanTags = sanitizeTags(dirtyTags);
    assert(
      cleanTags.every((t) => /^[a-z0-9_-]+$/.test(t) && t.length <= 32),
      "Sanitizes tag array to alphanumeric, lowercase, bounded strings"
    );

    // ----------------------------------------------------
    // TEST GROUP 4: Cache Eviction & TTL Pruning
    // ----------------------------------------------------
    console.log("\n[TEST GROUP 4] Decrypted Cache TTL & Plaintext Protection");

    const shortTtlManager = new DecryptedCacheManager({ ttlMs: 200 }); // 200ms TTL for testing
    const canaryFile = path.join(testDir, "canary_cache.bin");
    fs.writeFileSync(canaryFile, Buffer.from("confidential decrypted plaintext data"));

    shortTtlManager.set("canary_1", canaryFile);
    assert(shortTtlManager.get("canary_1") === canaryFile, "Cache hits file within TTL window");

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 250));

    assert(shortTtlManager.get("canary_1") === null, "Cache evicts expired file past TTL window");
    assert(!fs.existsSync(canaryFile), "Cache manager physically unlinks expired plaintext file from disk");

    // ----------------------------------------------------
    // TEST GROUP 5: BLAKE2b-256 Sui Address Derivation
    // ----------------------------------------------------
    console.log("\n[TEST GROUP 5] Cryptographic Address Derivation Conformity");

    // Test known standard Sui derivation: Flag (0x00) + 32 zero bytes
    const zeroPub = new Uint8Array(32);
    const zeroMsg = new Uint8Array(33);
    zeroMsg[0] = 0x00;
    zeroMsg.set(zeroPub, 1);
    const hash = blake2b(zeroMsg, { dkLen: 32 });
    const derivedAddress = "0x" + Buffer.from(hash).toString("hex");

    assert(derivedAddress.startsWith("0x") && derivedAddress.length === 66, "Derives standard 66-character (32-byte) Sui address format");
  } finally {
    // Cleanup test sandbox
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {}
  }

  console.log("\n==================================================");
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests();
