import crypto from "node:crypto";
import http from "node:http";

process.env.NODE_ENV = "test";
process.env.NODUS_PUBLISHER_JWT_SECRET = "test-only-publisher-secret";
process.env.NODUS_DIRECT_PUBLISHER_TRUST_RECEIPT = "true";

const MiB = 1024 * 1024;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✅ PASS: ${message}`);
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

async function run() {
  console.log("==================================================");
  console.log("🌊 NODUS — DIRECT WALRUS PUBLISHER TEST SUITE");
  console.log("==================================================");

  const received = [];
  const publisher = http.createServer(async (req, res) => {
    if (req.method !== "PUT" || req.url?.split("?")[0] !== "/v1/blobs") {
      res.writeHead(404).end();
      return;
    }
    const authorization = req.headers.authorization || "";
    if (!authorization.startsWith("Bearer ") || authorization.split(".").length !== 3) {
      res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "missing JWT" }));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const claims = JSON.parse(Buffer.from(authorization.split(".")[1], "base64url").toString("utf8"));
    if (claims.size !== body.length || claims.epochs !== 2 || !claims.jti) {
      res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "JWT claims do not authorize this payload" }));
      return;
    }
    received.push({ size: body.length, authorization, jti: claims.jti });
    const blobId = crypto.createHash("sha256").update(body).digest("base64url");
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
      newlyCreated: { blobObject: { blobId, size: body.length } },
      authorizedSize: claims.size
    }));
  });

  const publisherUrl = await listen(publisher);
  process.env.NODUS_PUBLISHER_URL = publisherUrl;

  let appServer;
  let uploadId;
  try {
    const { default: app } = await import("../server/index.js");
    const { createNodusClient } = await import("../sdk/index.js");
    appServer = http.createServer(app);
    const gatewayUrl = await listen(appServer);
    const client = createNodusClient({ gatewayUrl });
    const data = crypto.randomBytes((2 * MiB) + 123);

    const result = await client.put(data, {
      name: "direct-publisher-test.bin",
      type: "application/octet-stream",
      directPublisher: true,
      chunkSize: MiB,
      segmentSize: 2 * MiB,
      epochs: 2,
      tags: ["test", "direct-publisher"]
    });
    uploadId = result.uploadId;

    assert(result.success && result.record?.id?.startsWith("direct_"), "Finalizes a logical asset without posting ciphertext to the Nodus API");
    assert(received.length === 2, "Publishes one direct request for each encrypted segment");
    assert(received.every((request) => request.authorization.startsWith("Bearer ")), "Sends a one-time Bearer JWT to the publisher, not a platform secret");
    assert(new Set(received.map((request) => request.jti)).size === received.length, "Binds every segment to a distinct replay-protected JWT ID");
    assert(received.reduce((sum, request) => sum + request.size, 0) === data.length + (3 * 16), "Publishes the expected independently encrypted ciphertext bytes");

    const session = await client.getDirectUpload(uploadId);
    assert(session.completedSegments.join(",") === "0,1" && session.missingSegments.length === 0, "Persists resumable segment state without staged part files");

    const manifestResponse = await fetch(`${gatewayUrl}/api/assets/direct-uploads/${uploadId}/manifest`);
    const manifestBody = await manifestResponse.json();
    assert(manifestResponse.status === 200 && manifestBody.manifest.segments.length === 2, "Exposes an ordered encrypted-segment manifest");
    assert(manifestBody.manifest.segments.every((segment) => segment.verificationState === "verified"), "Marks mock publisher receipts verified only in test mode");

    const assetsResponse = await fetch(`${gatewayUrl}/api/assets`);
    const assetsBody = await assetsResponse.json();
    assert(assetsBody.assets.some((asset) => asset.id === result.id), "Includes the finalized direct asset in the catalog");
  } finally {
    if (appServer && uploadId) {
      await fetch(`http://127.0.0.1:${appServer.address().port}/api/assets/direct-uploads/${uploadId}`, { method: "DELETE" }).catch(() => {});
    }
    if (appServer) await close(appServer);
    await close(publisher);
  }

  console.log("==================================================");
  console.log("🎉 ALL DIRECT PUBLISHER TESTS PASSED");
  console.log("==================================================");
}

run().catch((error) => {
  console.error("❌ Direct publisher test failed:", error.message);
  process.exit(1);
});
