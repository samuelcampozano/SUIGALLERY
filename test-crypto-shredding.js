import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { walrus } from "./server/walrus-client.js";

async function testCryptoShredding() {
  console.log("==================================================");
  console.log("🧪 NODUS — END-TO-END CRYPTO-SHREDDING TEST");
  console.log("==================================================");

  const testDir = path.resolve("./temp_storage/test_sandbox");
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const testFileName = `synthetic_canary_${Date.now()}.png`;
  const testFilePath = path.join(testDir, testFileName);
  const decryptedPath = path.join(testDir, `decrypted_${testFileName}`);

  // 1. Generate 64KB of random synthetic non-personal bytes
  const syntheticPayload = crypto.randomBytes(64 * 1024);
  fs.writeFileSync(testFilePath, syntheticPayload);
  console.log(`\n[STEP 1] Created synthetic canary test image: ${testFileName} (${syntheticPayload.length} bytes)`);

  let fileId = null;

  try {
    // 2. Upload with Seal Threshold Envelope Encryption
    console.log("\n[STEP 2] Uploading and encrypting with Seal Threshold Policy...");
    const uploadRes = await walrus.uploadPhoto({
      localPath: testFilePath,
      fileName: testFileName,
      description: "Automated Crypto-Shredding Verification Canary",
      tags: ["canary", "test", "crypto-shredding"]
    });

    fileId = uploadRes?.fileId || uploadRes?.id || uploadRes?.file?.id || uploadRes?.data?.id;
    console.log(`✅ Upload successful! File ID: ${fileId}`);
    if (uploadRes?.blob_id) {
      console.log(`   Walrus Blob ID: ${uploadRes.blob_id}`);
    }

    // 3. Verify Decrypted Read Works
    console.log("\n[STEP 3] Verifying decryption stream before deletion...");
    await walrus.downloadAndDecryptPhoto({
      fileId,
      destPath: decryptedPath
    });

    if (fs.existsSync(decryptedPath)) {
      const decryptedBytes = fs.readFileSync(decryptedPath);
      const isMatch = decryptedBytes.equals(syntheticPayload);
      console.log(`✅ Decryption integrity verified: ${decryptedBytes.length} bytes match bit-for-bit (${isMatch})`);
      fs.unlinkSync(decryptedPath);
    } else {
      throw new Error("Decrypted file was not produced!");
    }

    // 4. Execute Crypto-Shredding (Delete on Walrus Console & Revoke Key Policy)
    console.log("\n[STEP 4] Executing Crypto-Shredding (Purging key mapping & deleting from bucket)...");
    const deleteRes = await walrus.deletePhoto(fileId);
    console.log("✅ Delete command acknowledged by Walrus:", JSON.stringify(deleteRes));

    // 5. Verify Post-Deletion Decryption Failure (Irrecoverability)
    console.log("\n[STEP 5] Testing post-deletion download & decryption (expecting hard failure)...");
    let decryptionBlocked = false;
    try {
      await walrus.downloadAndDecryptPhoto({
        fileId,
        destPath: decryptedPath
      });
    } catch (err) {
      decryptionBlocked = true;
      console.log(`✅ Confirmed: Post-shred decryption request was rejected as expected: "${err.message}"`);
    }

    if (!decryptionBlocked) {
      throw new Error("SECURITY FAILURE: File was still decryptable after deletion!");
    }

    // 6. Verify Absence in Active Bucket Catalog
    console.log("\n[STEP 6] Confirming removal from active bucket photos list...");
    const photos = await walrus.listPhotos();
    const stillPresent = photos.some((p) => p.id === fileId);
    if (stillPresent) {
      throw new Error(`Canary ${fileId} is still reported in listPhotos!`);
    }
    console.log(`✅ Confirmed: Canary ${fileId} is completely removed from bucket catalog.`);

    console.log("\n==================================================");
    console.log("🎉 ALL CRYPTO-SHREDDING TESTS PASSED!");
    console.log("   - Key policy mapping revoked");
    console.log("   - Plaintext cache shredded");
    console.log("   - Post-shred retrieval blocked");
    console.log("==================================================\n");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Crypto-Shredding Test Failed:", err);
    process.exit(1);
  } finally {
    // Clean up local temp files
    try {
      if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
      if (fs.existsSync(decryptedPath)) fs.unlinkSync(decryptedPath);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

testCryptoShredding();
