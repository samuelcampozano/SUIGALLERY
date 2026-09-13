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
  let baseUrl = process.env.CONSOLE_API_BASE_URL || "https://api.console.walrus.xyz";
  if (baseUrl === "https://console.walrus.xyz") {
    baseUrl = "https://api.console.walrus.xyz";
  } else if (baseUrl === "https://testnet.console.walrus.xyz") {
    baseUrl = "https://api.testnet.console.walrus.xyz";
  }

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
      const result = await response.json();
      const spaces = Array.isArray(result) ? result : (result.data || []);
      console.log("🎉 Connection Successful! Authentication verified.");
      console.log(`\n📂 Found ${spaces.length} space(s):`);

      for (const [idx, space] of spaces.entries()) {
        const usedMb = (space.storage_used / (1024 * 1024)).toFixed(2);
        const capGb = (space.storage_cap / (1024 * 1024 * 1024)).toFixed(1);
        console.log(`\n  [${idx + 1}] Space: "${space.name || "Personal Space"}" (${space.type})`);
        console.log(`      ID: ${space.id}`);
        console.log(`      Storage: ${usedMb} MB / ${capGb} GB`);
        console.log(`      Plan: ${space.plan} | Role: ${space.role} | Buckets: ${space.bucket_count}`);

        // Fetch buckets for this space
        try {
          const bucketsRes = await fetch(`${baseUrl}/api/v1/spaces/${space.id}/buckets`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: "application/json"
            }
          });
          if (bucketsRes.status === 200) {
            const bucketData = await bucketsRes.json();
            const buckets = bucketData.buckets || bucketData.data || [];
            if (buckets.length > 0) {
              console.log(`      Buckets (${buckets.length}):`);
              for (const b of buckets) {
                console.log(`        • ${b.name || b.id} (ID: ${b.id}, Visibility: ${b.visibility || "private"})`);

                // Query files in bucket
                try {
                  const filesRes = await fetch(`${baseUrl}/api/v1/buckets/${b.id}/files`, {
                    method: "GET",
                    headers: {
                      Authorization: `Bearer ${apiKey}`,
                      Accept: "application/json"
                    }
                  });
                  if (filesRes.status === 200) {
                    const fileData = await filesRes.json();
                    const files = fileData.files || fileData.data || [];
                    if (files.length > 0) {
                      console.log(`          Files (${files.length}):`);
                      for (const f of files) {
                        console.log(`            - ${f.name} (${f.size || 0} bytes, Blob: ${f.blob_id || "n/a"})`);
                      }
                    } else {
                      console.log(`          Files: None (Bucket is empty)`);
                    }
                  }
                } catch (err) {
                  // non-fatal
                }
              }
            } else {
              console.log(`      Buckets: None yet`);
            }
          }
        } catch (e) {
          // non-fatal
        }
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
