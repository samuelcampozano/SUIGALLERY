import assert from "node:assert/strict";
import { decryptWebhookSecret, encryptWebhookSecret, signWebhookPayload, WebhookDispatcher } from "../server/webhook-dispatcher.js";

const key = Buffer.alloc(32, 7).toString("base64");
const secret = "whsec_test_secret";
const encrypted = encryptWebhookSecret(secret, key);
assert.equal(decryptWebhookSecret(encrypted, key), secret, "endpoint signing secret round-trips through encryption at rest");

const body = JSON.stringify({ id: "delivery-1", type: "asset.deleted" });
assert.equal(signWebhookPayload(secret, "1700000000", body), signWebhookPayload(secret, "1700000000", body), "signature is deterministic for canonical payload");

const events = [];
const store = {
  async claimDueWebhookDeliveries() { return [{ id: "delivery-1", eventType: "asset.deleted", payload: { assetId: "asset-1" }, createdAt: "2026-01-01T00:00:00.000Z", url: "https://receiver.example/events", secretCiphertext: encrypted.ciphertext, secretIv: encrypted.iv, secretTag: encrypted.tag }]; },
  async completeWebhookDelivery(value) { events.push({ kind: "done", ...value }); },
  async failWebhookDelivery(value) { events.push({ kind: "failed", ...value }); }
};
let captured;
const dispatcher = new WebhookDispatcher(store, { encryptionKey: key, fetchImpl: async (_url, request) => { captured = request; return { ok: true, status: 204 }; } });
assert.equal(await dispatcher.dispatchDue(), 1);
assert.equal(events[0].kind, "done");
assert.match(captured.headers["x-nodus-signature"], /^sha256=[a-f0-9]{64}$/);
assert.equal(captured.headers["x-nodus-event"], "asset.deleted");

console.log("Signed webhook unit checks passed.");
