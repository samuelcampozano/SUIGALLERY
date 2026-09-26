import http from "node:http";

process.env.NODE_ENV = "production";
process.env.NODUS_ALLOWED_ORIGINS = "https://app.nodus.example";

const { default: app } = await import("../server/index.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✅ PASS: ${message}`);
}

async function run() {
  console.log("==================================================");
  console.log("🛡️ NODUS — CORS & UNIFORM AUTH TEST SUITE");
  console.log("==================================================");
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const allowed = await fetch(`${baseUrl}/api/status`, { headers: { Origin: "https://app.nodus.example" } });
    assert(allowed.status === 200, "Allows explicitly configured browser origin");
    assert(allowed.headers.get("access-control-allow-origin") === "https://app.nodus.example", "Reflects only the configured CORS origin");

    const denied = await fetch(`${baseUrl}/api/status`, { headers: { Origin: "https://evil.example" } });
    assert(denied.status === 403, "Rejects an unconfigured browser origin");

    const spoofedOrg = await fetch(`${baseUrl}/api/orgs`, { headers: { "x-solana-address": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" } });
    assert(spoofedOrg.status === 503, "Does not authorize organization access from a spoofable address header when tenant auth is unavailable");
  } finally {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("🎉 ALL CORS & UNIFORM AUTH TESTS PASSED");
}

run().catch((error) => { console.error("❌ CORS/auth test failed:", error.message); process.exit(1); });
