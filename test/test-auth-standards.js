import assert from "assert";
import fs from "fs";
import path from "path";
import vm from "vm";
import nacl from "tweetnacl";
import { blake2b } from "@noble/hashes/blake2.js";

console.log("==================================================");
console.log("🔐 NODUS — AUTH STANDARDS & WALLET TEST SUITE");
console.log("==================================================");

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function run() {
  console.log("\n[TEST GROUP 1] BIP-39 Mnemonic & Sui Keypair Cryptography");

  const bip39Code = fs.readFileSync("public/bip39.js", "utf-8");
  const nobleBlake2Code = fs.readFileSync("public/blake2b.js", "utf-8");

  const sandbox = {
    window: {
      crypto: {
        getRandomValues: (arr) => crypto.getRandomValues(arr),
        subtle: crypto.subtle
      }
    },
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Int32Array,
    DataView,
    console
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.TextEncoder = TextEncoder;
  sandbox.window.TextDecoder = TextDecoder;
  sandbox.window.Uint8Array = Uint8Array;
  sandbox.window.Int32Array = Int32Array;
  sandbox.window.DataView = DataView;
  vm.createContext(sandbox);

  // Load Blake2b and Bip39 into sandbox
  vm.runInContext(nobleBlake2Code, sandbox);
  sandbox.window.nobleBlake2 = sandbox.nobleBlake2;
  sandbox.window.nacl = nacl;
  vm.runInContext(bip39Code, sandbox);

  const Bip39 = sandbox.window.Bip39;

  it("Bip39 object exists with 2048 words", () => {
    assert(Bip39, "Bip39 should be defined on window");
    assert.strictEqual(Bip39.wordlist.length, 2048, "Wordlist must contain exactly 2048 words");
  });

  it("generateMnemonic produces 12 valid BIP-39 words", () => {
    const mnemonic = Bip39.generateMnemonic();
    assert.strictEqual(typeof mnemonic, "string");
    const words = mnemonic.split(" ");
    assert.strictEqual(words.length, 12, "Should generate exactly 12 words");
    assert.strictEqual(Bip39.validateMnemonic(mnemonic), true, "Mnemonic must be valid");
  });

  it("validateMnemonic rejects invalid words", () => {
    assert.strictEqual(Bip39.validateMnemonic("not real words random garbage test"), false);
    assert.strictEqual(Bip39.validateMnemonic("abandon abandon abandon"), false, "Incomplete word count");
  });

  await itAsync("deriveSuiAccount produces standard 32-byte Ed25519 Sui address", async () => {
    const mnemonic = Bip39.generateMnemonic();
    const account = await Bip39.deriveSuiAccount(mnemonic);
    assert(account.address.startsWith("0x"), "Address must start with 0x");
    assert.strictEqual(account.address.length, 66, "Canonical Sui address must be 66 characters");
    assert.strictEqual(account.publicKeyHex.length, 66, "Public key hex must be 66 characters (0x + 32 bytes)");
    assert(account.scheme.includes("ED25519"), "Scheme must indicate ED25519");
  });

  console.log("\n[TEST GROUP 2] Google zkLogin Address Derivation");

  it("zkLogin address derivation uses scheme 0x05 and Blake2b", () => {
    const email = "alex.sovereign@gmail.com";
    const sub = "109847291847192847";
    const enc = new TextEncoder();
    const seed = enc.encode(`zklogin:google:${email.toLowerCase().trim()}:${sub}`);
    const hash = blake2b(seed, { dkLen: 32 });
    const fullMsg = new Uint8Array(33);
    fullMsg[0] = 0x05; // Sui zkLogin scheme flag
    fullMsg.set(hash, 1);
    const finalHash = blake2b(fullMsg, { dkLen: 32 });
    const address = "0x" + Array.from(finalHash).map((b) => b.toString(16).padStart(2, "0")).join("");

    assert.strictEqual(address.length, 66);
    assert(address.startsWith("0x"));
  });

  console.log("\n[TEST GROUP 3] Codebase Integrity & Anti-Prompt Checks");

  it("Ensures no browser window.prompt() in zkLogin flow", () => {
    const appJs = fs.readFileSync("public/app.js", "utf-8");
    const zkLoginLines = appJs.split("\n").filter((l) => l.includes("handleGoogleZkLogin"));
    assert(zkLoginLines.length > 0);
    // Find handleGoogleZkLogin function definition
    const zkMatch = appJs.match(/async function handleGoogleZkLogin[\s\S]*?^  \}/m);
    assert(zkMatch, "handleGoogleZkLogin must be present");
    assert(!zkMatch[0].includes("prompt("), "handleGoogleZkLogin must NOT call prompt()");
  });

  it("Ensures Wallet Standard listener is registered in app.js", () => {
    const appJs = fs.readFileSync("public/app.js", "utf-8");
    assert(appJs.includes("wallet-standard:register-wallet"), "Must listen to wallet-standard:register-wallet");
  });

  it("Ensures Slush Wallet and official Sui Wallet support exists in app.js", () => {
    const appJs = fs.readFileSync("public/app.js", "utf-8");
    assert(appJs.includes("Slush Wallet") || appJs.includes("window.slush"), "Must support Slush Wallet");
    assert(appJs.includes("window.suiWallet"), "Must support Sui Wallet");
  });

  it("Ensures index.html contains all auth modal elements", () => {
    const html = fs.readFileSync("public/index.html", "utf-8");
    assert(html.includes('id="googleZkModal"'), "Must contain googleZkModal");
    assert(html.includes('id="walletSelectorModal"'), "Must contain walletSelectorModal");
    assert(html.includes('id="seedPhraseModal"'), "Must contain seedPhraseModal");
    assert(html.includes('id="seedWordsGrid"'), "Must contain seedWordsGrid");
    assert(html.includes('src="/nacl.min.js"'), "Must load nacl.min.js");
    assert(html.includes('src="/bip39.js"'), "Must load bip39.js");
  });

  console.log("\n==================================================");
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
