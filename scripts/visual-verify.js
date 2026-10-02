import { spawn } from "node:child_process";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const SCREENSHOT_DIR = path.resolve("public/test-screenshots");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result?.value;
  }

  async screenshot(filename) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const buffer = Buffer.from(res.data, "base64");
    const filepath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(filepath, buffer);
    console.log(`  📸 Saved screenshot: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return filepath;
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  console.log("==================================================");
  console.log("👁️ VISUAL & REAL-BROWSER UI VERIFICATION");
  console.log("==================================================");

  // 1. Launch Headless Chrome
  console.log("🚀 Launching Headless Chrome on port 9222...");
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1280,900",
      "http://localhost:3000"
    ],
    { stdio: "ignore" }
  );

  let cdp = null;

  try {
    // Wait for Chrome remote debugging to be ready
    let wsUrl = null;
    for (let i = 0; i < 20; i++) {
      await delay(500);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        const list = await res.json();
        if (list.length > 0 && list[0].webSocketDebuggerUrl) {
          wsUrl = list[0].webSocketDebuggerUrl;
          break;
        }
      } catch (e) {
        // keep polling
      }
    }

    if (!wsUrl) throw new Error("Could not connect to Chrome DevTools Protocol");
    console.log("🔌 Connected to Chrome DevTools Protocol:", wsUrl);

    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    // Wait for initial load
    await delay(1500);

    // 1. Capture Homepage
    console.log("\n[Step 1] Capturing Nodus Homepage...");
    await cdp.screenshot("01_homepage.png");

    // 2. Open Main Auth Modal
    console.log("\n[Step 2] Opening Main Authentication Modal...");
    await cdp.eval(`document.getElementById("loginTriggerBtn")?.click()`);
    await delay(600);
    await cdp.screenshot("02_main_auth_modal.png");

    // 3. Open Google zkLogin Modal
    console.log("\n[Step 3] Opening Google zkLogin Interactive Dialog...");
    await cdp.eval(`document.getElementById("googleZkLoginBtn")?.click()`);
    await delay(600);
    await cdp.screenshot("03_google_zklogin_modal.png");

    // 4. Test Instant zkLogin Persona
    console.log("\n[Step 4] Clicking Persona 'Alex Sovereign' to execute zkLogin...");
    await cdp.eval(`document.getElementById("personaAlexBtn")?.click()`);
    await delay(1000);
    await cdp.screenshot("04_dashboard_logged_in.png");

    // 5. Open Vault Profile Modal
    console.log("\n[Step 5] Opening Sovereign Account & Vault Modal...");
    await cdp.eval(`document.getElementById("vaultPill")?.click()`);
    await delay(600);
    await cdp.screenshot("05_vault_profile_modal.png");

    // 6. Sign Out
    console.log("\n[Step 6] Signing Out...");
    await cdp.eval(`document.getElementById("signOutBtn")?.click()`);
    await delay(600);

    // 7. Open Sui / Slush Wallet Selector Modal
    console.log("\n[Step 7] Opening Sui & Slush Multi-Wallet Selector...");
    await cdp.eval(`document.getElementById("loginTriggerBtn")?.click()`);
    await delay(400);
    await cdp.eval(`document.getElementById("connectSuiWalletBtn")?.click()`);
    await delay(600);
    await cdp.screenshot("06_wallet_selector_modal.png");
    await cdp.eval(`document.getElementById("walletSelectorModalClose")?.click()`);
    await delay(300);

    // 8. Open Sovereign Seed Phrase (BIP-39) Modal
    console.log("\n[Step 8] Opening Sovereign Seed Phrase Generator Modal...");
    await cdp.eval(`document.getElementById("seedPhraseBtn")?.click()`);
    await delay(800);
    await cdp.screenshot("07_seed_phrase_generator.png");

    // 9. Switch to Import Tab and Test Phrase Validation
    console.log("\n[Step 9] Testing Import Tab with live 12-word validation...");
    await cdp.eval(`
      document.getElementById("tabImportSeed")?.click();
      const ta = document.getElementById("importSeedInput");
      if (ta) {
        ta.value = "abandon ability able about above absent absorb abstract absurd abuse access accident";
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }
    `);
    await delay(600);
    await cdp.screenshot("08_seed_phrase_import.png");

    console.log("\n==================================================");
    console.log("🎉 ALL VISUAL UI SCREENSHOTS CAPTURED SUCCESSFULLY!");
    console.log("==================================================");
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill();
  }
}

main().catch((err) => {
  console.error("Visual test error:", err);
  process.exit(1);
});
