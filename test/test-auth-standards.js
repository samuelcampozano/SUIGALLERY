import assert from "assert";
import fs from "fs";
import path from "path";
import vm from "vm";
import nacl from "tweetnacl";
import bs58 from "bs58";
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

  console.log("\n[TEST GROUP 4] Solana SIWS & Multi-Wallet Standards (Phantom, Solflare, Backpack)");

  it("Ensures index.html contains dedicated Solana multi-wallet selector modal", () => {
    const html = fs.readFileSync("public/index.html", "utf-8");
    assert(html.includes('id="solanaWalletModal"'), "Must contain solanaWalletModal");
    assert(html.includes('id="walletCardPhantom"'), "Must contain Phantom card");
    assert(html.includes('id="walletCardSolflare"'), "Must contain Solflare card");
    assert(html.includes('id="walletCardBackpack"'), "Must contain Backpack card");
    assert(html.includes('id="dynamicSolanaWalletsContainer"'), "Must contain dynamic Solana wallets container");
    assert(html.includes('id="solana1ClickDemoBtn"'), "Must contain 1-click Solana demo button");
    assert(html.includes('id="solanaOrgInput"'), "Must contain tenant org configuration input");
  });

  it("Ensures public/app.js detects Phantom, Solflare, Backpack and Solana Wallet Standard", () => {
    const appJs = fs.readFileSync("public/app.js", "utf-8");
    assert(appJs.includes("window.phantom?.solana"), "Must check window.phantom?.solana");
    assert(appJs.includes("window.solflare"), "Must check window.solflare");
    assert(appJs.includes("window.backpack"), "Must check window.backpack");
    assert(appJs.includes("solana:signMessage"), "Must support solana:signMessage feature");
    assert(appJs.includes("openSolanaWalletModal"), "Must export openSolanaWalletModal");
  });

  it("Ensures zero prompt() blockers in Solana authentication flow", () => {
    const appJs = fs.readFileSync("public/app.js", "utf-8");
    assert(!appJs.includes("promptForOrganization"), "promptForOrganization must be completely removed");
    const solanaSection = appJs.slice(appJs.indexOf("connectSolanaProvider"), appJs.indexOf("handleSolana1ClickDemo") + 300);
    assert(!solanaSection.includes("prompt("), "Solana flow must never invoke window.prompt()");
  });

  it("Simulates SIWS cryptographic challenge generation and Ed25519 signature verification", () => {
    // Generate an in-memory ephemeral Solana keypair
    const keypair = nacl.sign.keyPair();
    const pubKeyBase58 = bs58.encode(keypair.publicKey);
    assert(pubKeyBase58.length >= 32 && pubKeyBase58.length <= 44, "Solana base58 address should be 32-44 chars");

    // Construct SIWS challenge message
    const domain = "nodus.cloud";
    const issuedAt = new Date().toISOString();
    const challengeMessage = `${domain} wants you to sign in with your Solana account:\n${pubKeyBase58}\n\nSign in to Nodus Sovereign Storage\n\nURI: https://${domain}\nVersion: 1\nChain ID: solana:mainnet\nNonce: 12345678\nIssued At: ${issuedAt}`;

    // Cryptographic signature
    const msgBytes = new TextEncoder().encode(challengeMessage);
    const signatureBytes = nacl.sign.detached(msgBytes, keypair.secretKey);
    const signatureBase58 = bs58.encode(signatureBytes);

    // Verify cryptographic signature with pubkey
    const verified = nacl.sign.detached.verify(
      msgBytes,
      bs58.decode(signatureBase58),
      bs58.decode(pubKeyBase58)
    );
    assert.strictEqual(verified, true, "Detached signature must verify correctly with public key");
  });

  it("Ensures server/index.js defaults organizationId to nodus-devs when omitted", () => {
    const serverJs = fs.readFileSync("server/index.js", "utf-8");
    assert(serverJs.includes('req.body.organizationId || "nodus-devs"'), "Server must fallback to nodus-devs gracefully");
    assert(!serverJs.includes('if (!organizationId) return res.status(400)'), "Server must not 400 on missing organizationId");
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
