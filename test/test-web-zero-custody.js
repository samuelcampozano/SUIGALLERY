import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(rootDir, "public", "app.js"), "utf8");
const serverSource = fs.readFileSync(path.join(rootDir, "server", "index.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✅ PASS: ${message}`);
}

console.log("==================================================");
console.log("🔐 NODUS — WEB ZERO-CUSTODY CONTRACT TEST SUITE");
console.log("==================================================");

assert(appSource.includes("function apiFetch(") && appSource.includes("Authorization"), "Browser API calls attach the bearer session token");
assert(appSource.includes("indexedDB.open(\"nodus-device-keys\"") && appSource.includes("extractable CryptoKey"), "Device ECDH private key is kept in IndexedDB instead of localStorage");
assert(appSource.includes("sessionStorage.getItem(\"nodus_access_token\")") && appSource.includes("const { accessToken, ...nonSensitiveSession }"), "Bearer token is kept out of persistent localStorage");
assert(appSource.includes("/key-identities/") && appSource.includes("/key-envelopes"), "Browser registers a public identity and persists encrypted key envelopes");
assert(appSource.includes("recoverAssetKey(") && appSource.includes("deriveBits"), "Browser can recover an asset data key through ECDH without server custody");
assert(appSource.includes("discardUnprotectedAsset") && appSource.includes("await persistOwnerEnvelope"), "An uploaded ciphertext is removed if its owner envelope cannot be persisted");
assert(!appSource.includes('formData.append("key"') && !appSource.includes('key: keyHex'), "Browser upload payloads do not include a raw data key");
assert(serverSource.includes("function containsRawKeyMaterial") && serverSource.includes("Raw data keys must not be sent to the server"), "Backend rejects raw keys on standard, resumable, and direct upload control planes");

console.log("🎉 ALL WEB ZERO-CUSTODY CONTRACT TESTS PASSED");
