import { createNodusClient } from "../sdk/index.js";
import crypto from "node:crypto";

// Use either a persistent SIWS session token or a scoped organization API key.
// API keys are passed exactly as Bearer tokens and never include an org header:
// the tenant is resolved from the key on the server.
const client = createNodusClient({
  gatewayUrl: process.env.NODUS_URL || "http://localhost:3000",
  apiKey: process.env.NODUS_API_KEY
});

const page = await client.request("/api/assets?limit=25");
console.log("assets", page.assets.map(({ id, name }) => ({ id, name })), "next cursor:", page.nextCursor);

// Every external mutation should retain the same key across a retry after a
// timeout. The server returns the original response with idempotentReplay=true.
const idempotencyKey = `example-${crypto.randomUUID()}`;
try {
  const result = await client.request("/api/assets/batch-delete", {
    method: "POST",
    body: { fileIds: ["replace-with-an-asset-id"] },
    idempotencyKey
  });
  console.log(result);
} catch (error) {
  console.error(error.status, error.message, error.payload);
}

// For uploads, `client.put(bytes, { name, idempotencyKey, directPublisher: true })`
// keeps data encryption in the client and sends ciphertext directly to Walrus.
