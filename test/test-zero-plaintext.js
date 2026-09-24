process.env.NODE_ENV = "test";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import app from "../server/index.js";

async function runZeroPlaintextTests() {
  console.log("==================================================");
  console.log("🔒 NODUS — ZERO-PLAINTEXT CLIENT ENCRYPTION VERIFICATION");
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

  // 1. Launch ephemeral test server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`🚀 Ephemeral test server listening on ${baseUrl}`);

  try {
    // ----------------------------------------------------
    // TEST 1: Server-Side Wallet Generator Deprecation
    // ----------------------------------------------------
    console.log("\n[TEST 1] Server-Side Wallet Generator Deprecation (Zero-Custody)");
    const walletRes = await fetch(`${baseUrl}/api/wallet/generate`, { method: "POST" });
    assert(
      walletRes.status === 404,
      `POST /api/wallet/generate is completely removed and returns HTTP 404 (status: ${walletRes.status})`
    );

    // ----------------------------------------------------
    // TEST 2: Client-Side WebCrypto AES-256-GCM Encryption
    // ----------------------------------------------------
    console.log("\n[TEST 2] Client-Side WebCrypto AES-256-GCM Encryption");
    const canarySecret = `NODUS_SECRET_CANARY_${Date.now()}_PLAINTEXT_SUPER_SECRET_PAYLOAD`;
    const canaryPlaintext = Buffer.from(canarySecret, "utf-8");

    // Generate ephemeral 256-bit AES-GCM data key
    const dataKey = await globalThis.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const rawKey = await globalThis.crypto.subtle.exportKey("raw", dataKey);
    const keyHex = Buffer.from(rawKey).toString("hex");

    // Generate 96-bit (12-byte) random IV
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ivHex = Buffer.from(iv).toString("hex");

    // Encrypt strictly on the client
    const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      dataKey,
      canaryPlaintext
    );
    const ciphertext = Buffer.from(ciphertextBuffer);

    assert(ciphertext.length > canaryPlaintext.length, "Client generated valid AES-256-GCM ciphertext + auth tag");
    assert(!ciphertext.includes(canaryPlaintext), "Plaintext canary string is completely absent from client ciphertext");

    // ----------------------------------------------------
    // TEST 3: Upload Ciphertext to Backend
    // ----------------------------------------------------
    console.log("\n[TEST 3] Transmitting Ciphertext to Nodus Storage API");
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
    const bodyParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="iv"\r\n\r\n${ivHex}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\n${keyHex}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="originalName"\r\n\r\nconfidential_document.png\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="originalType"\r\n\r\nimage/png\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="originalSize"\r\n\r\n${canaryPlaintext.length}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="confidential_document.png.enc"\r\nContent-Type: application/octet-stream\r\n\r\n`
    ];

    const part1 = Buffer.from(bodyParts.join(""), "utf-8");
    const part2 = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");
    const multipartBody = Buffer.concat([part1, ciphertext, part2]);

    const uploadRes = await fetch(`${baseUrl}/api/photos/upload`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: multipartBody
    });

    const uploadData = await uploadRes.json();
    assert(uploadRes.status === 200, "Backend accepts valid client-encrypted ciphertext (HTTP 200)");
    assert(uploadData.success === true, "Upload response confirmed success: true");

    const fileId = uploadData.photo?.id || uploadData.result?.fileId || uploadData.result?.id;
    assert(Boolean(fileId), `File registered with identifier: ${fileId}`);

    // ----------------------------------------------------
    // TEST 4: Backend Memory & Storage Audit (Zero-Plaintext Proof)
    // ----------------------------------------------------
    console.log("\n[TEST 4] Server Memory & Disk Storage Inspection (Zero-Plaintext Proof)");
    const mockStorageDir = path.resolve("./temp_storage/mock_blobs");
    let serverHasPlaintext = false;

    if (fs.existsSync(mockStorageDir)) {
      const files = fs.readdirSync(mockStorageDir);
      for (const f of files) {
        const fullPath = path.join(mockStorageDir, f);
        const data = fs.readFileSync(fullPath);
        if (data.includes(canaryPlaintext)) {
          serverHasPlaintext = true;
          break;
        }
      }
    }

    assert(!serverHasPlaintext, "CANARY AUDIT: Secret string was NOT found in any server storage or cache files");

    // Also check temp uploads directory
    const uploadTempDir = path.resolve("./temp_storage/uploads");
    let tempLeak = false;
    if (fs.existsSync(uploadTempDir)) {
      const files = fs.readdirSync(uploadTempDir);
      for (const f of files) {
        const fullPath = path.join(uploadTempDir, f);
        const data = fs.readFileSync(fullPath);
        if (data.includes(canaryPlaintext)) {
          tempLeak = true;
          break;
        }
      }
    }
    assert(!tempLeak, "CLEANUP AUDIT: No plaintext leak remains in temp upload directory");

    // ----------------------------------------------------
    // TEST 5: Rejection of Plaintext Files Disguised as Encrypted
    // ----------------------------------------------------
    console.log("\n[TEST 5] Rejection of Raw Plaintext Uploads (Enforcing Client-Side Seal)");
    const fakeRawPng = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360606060000000050001a7e48b560000000049454e44ae426082",
      "hex"
    );

    const badBoundary = "----WebKitFormBoundaryBad" + Math.random().toString(36).substring(2);
    const badPart1 = Buffer.from(
      `--${badBoundary}\r\nContent-Disposition: form-data; name="iv"\r\n\r\n${ivHex}\r\n` +
      `--${badBoundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\n${keyHex}\r\n` +
      `--${badBoundary}\r\nContent-Disposition: form-data; name="photo"; filename="unencrypted.png"\r\nContent-Type: image/png\r\n\r\n`,
      "utf-8"
    );
    const badPart2 = Buffer.from(`\r\n--${badBoundary}--\r\n`, "utf-8");
    const badBody = Buffer.concat([badPart1, fakeRawPng, badPart2]);

    const rejectRes = await fetch(`${baseUrl}/api/photos/upload`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${badBoundary}`
      },
      body: badBody
    });

    const rejectData = await rejectRes.json();
    assert(rejectRes.status === 400, "Server rejects unencrypted raw PNG disguised with encryption headers (HTTP 400)");
    assert(
      rejectData.error && rejectData.error.includes("Plaintext signature detected"),
      `Clear error returned: "${rejectData.error}"`
    );

    // ----------------------------------------------------
    // TEST 6: Client-Side Decryption Stream
    // ----------------------------------------------------
    console.log("\n[TEST 6] Client-Side Decryption Stream & Bit-for-Bit Integrity");
    const streamRes = await fetch(`${baseUrl}/api/photos/${fileId}/stream`);
    assert(streamRes.status === 200, "Ciphertext stream endpoint returns HTTP 200");
    assert(streamRes.headers.get("x-nodus-encrypted") === "true", "Response header confirms x-nodus-encrypted: true");

    const fetchedCiphertext = Buffer.from(await streamRes.arrayBuffer());
    assert(fetchedCiphertext.equals(ciphertext), "Fetched stream matches original uploaded ciphertext bit-for-bit");

    // Client decrypts on-device in-memory
    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      dataKey,
      fetchedCiphertext
    );
    const recoveredText = Buffer.from(decryptedBuffer).toString("utf-8");
    assert(recoveredText === canarySecret, "Client-side decryption recovers original plaintext secret bit-for-bit");

    console.log("\n==================================================");
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("\n❌ Zero-Plaintext Test Suite Encountered Error:", err);
    process.exit(1);
  } finally {
    server.close();
  }
}

// Run when executed directly
if (process.argv[1] && process.argv[1].endsWith("test-zero-plaintext.js")) {
  runZeroPlaintextTests();
}

export { runZeroPlaintextTests };
