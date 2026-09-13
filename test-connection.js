#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// Attempt to load .env using Node's built-in loadEnvFile if available
try {
  if (typeof process.loadEnvFile === "function" && fs.existsSync(".env")) {
    process.loadEnvFile(".env");
  } else if (fs.existsSync(".env")) {
    // Basic fallback parser if loadEnvFile is not present
    const envContent = fs.readFileSync(".env", "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {
  console.warn("⚠️ Could not parse .env file:", e.message);
}

export async function testConnection() {
  console.log("====================================================");
  console.log("🌊 Walrus Console Connection & Health Check");
  console.log("====================================================");

  let apiKey = process.env.CONSOLE_API_KEY;
  let serviceKey = process.env.CONSOLE_SERVICE_PRIVATE_KEY;
  let ownerAddress = process.env.CONSOLE_WEB_ACCOUNT_ADDRESS;
  let keyAdminAddress = process.env.CONSOLE_KEY_ADMIN_ADDRESS;
  const baseUrl = process.env.CONSOLE_API_BASE_URL || "https://console.walrus.xyz";

  // Check if a CONSOLE_CREDENTIAL_BUNDLE was supplied
  if (process.env.CONSOLE_CREDENTIAL_BUNDLE) {
    try {
      const bundle = JSON.parse(process.env.CONSOLE_CREDENTIAL_BUNDLE);
      console.log("📦 Detected CONSOLE_CREDENTIAL_BUNDLE payload.");
      if (bundle.apiKey) apiKey = bundle.apiKey;
      if (bundle.serviceSecret) serviceKey = bundle.serviceSecret;
      if (bundle.ownerAddress) ownerAddress = bundle.ownerAddress;
      if (bundle.keyAdminAddress) keyAdminAddress = bundle.keyAdminAddress;
    } catch (err) {
      console.error("❌ Failed to parse CONSOLE_CREDENTIAL_BUNDLE as JSON:", err.message);
    }
  }

  console.log(`\nEndpoint: ${baseUrl}`);
  console.log(`API Key configured: ${apiKey ? `✅ Yes (${apiKey.slice(0, 6)}...${apiKey.slice(-4)})` : "❌ Missing"}`);
  console.log(`Service Private Key: ${serviceKey ? `✅ Present (${serviceKey.slice(0, 14)}...)` : "⚠️ Not set (Needed for file upload/download encryption)"}`);
  console.log(`Owner Address (Sui): ${ownerAddress ? `✅ Pinned (${ownerAddress.slice(0, 10)}...)` : "⚠️ Not pinned (Needed for create_bucket)"}`);

  if (!apiKey) {
    console.log("\n----------------------------------------------------");
    console.log("ℹ️  NEXT STEPS TO GET YOUR API KEY:");
    console.log("1. Open Walrus Console: https://console.walrus.xyz");
    console.log("2. Navigate to 'Integrations' -> 'New API key'");
    console.log("3. Select 'API key' (read_write with 'Create' checked)");
    console.log("4. Copy the credentials (or the CONSOLE_CREDENTIAL_BUNDLE)");
    console.log("5. Paste them into the .env file in this directory");
    console.log("----------------------------------------------------\n");
    return;
  }

  console.log("\n⏳ Testing API key against Walrus Console...");

  try {
    const response = await fetch(`${baseUrl}/api/v1/spaces`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });

    if (response.status === 200) {
      const data = await response.json();
      console.log("🎉 Connection Successful! Authentication verified.");
      console.log(`Spaces retrieved: ${Array.isArray(data) ? data.length : JSON.stringify(data)}`);
      if (Array.isArray(data)) {
        data.forEach((space, idx) => {
          console.log(`  [${idx + 1}] Space: ${space.name || space.id || "Unnamed"} (Type: ${space.type || "personal"})`);
        });
      }
    } else if (response.status === 401 || response.status === 403) {
      console.error(`❌ Authentication failed (HTTP ${response.status}). Key may be invalid or expired.`);
      const errText = await response.text();
      console.error(`Server response: ${errText}`);
    } else {
      console.warn(`⚠️ Received unexpected response (HTTP ${response.status})`);
      const errText = await response.text();
      console.warn(`Server response: ${errText}`);
    }
  } catch (err) {
    console.error(`❌ Network error while connecting to ${baseUrl}:`, err.message);
  }
}

// Run if called directly
if (process.argv[1] === new URL(import.meta.url).pathname || process.argv[1]?.endsWith("test-connection.js")) {
  testConnection();
}
