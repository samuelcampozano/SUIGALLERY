import crypto from "node:crypto";

export const WEBHOOK_EVENTS = new Set(["upload.completed", "upload.failed", "quota.high", "asset.deleted"]);
const MAX_ATTEMPTS = 6;

function encryptionKey(value = process.env.NODUS_WEBHOOK_ENCRYPTION_KEY) {
  if (!value) throw new Error("NODUS_WEBHOOK_ENCRYPTION_KEY is required for signed webhooks");
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("NODUS_WEBHOOK_ENCRYPTION_KEY must encode exactly 32 bytes");
  return key;
}

export function encryptWebhookSecret(secret, configuredKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(configuredKey), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64url"), iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
}

export function decryptWebhookSecret(value, configuredKey) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(configuredKey), Buffer.from(value.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function signWebhookPayload(secret, timestamp, body) {
  return `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export class WebhookDispatcher {
  constructor(store, { fetchImpl = globalThis.fetch, encryptionKey: configuredKey } = {}) {
    this.store = store;
    this.fetch = fetchImpl;
    this.encryptionKey = configuredKey;
  }

  async dispatchDue(limit = 25) {
    const deliveries = await this.store.claimDueWebhookDeliveries(limit);
    for (const delivery of deliveries) await this.dispatch(delivery);
    return deliveries.length;
  }

  async dispatch(delivery) {
    const body = JSON.stringify({ id: delivery.id, type: delivery.eventType, createdAt: delivery.createdAt, data: delivery.payload });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const secret = decryptWebhookSecret({ ciphertext: delivery.secretCiphertext, iv: delivery.secretIv, tag: delivery.secretTag }, this.encryptionKey);
    try {
      const response = await this.fetch(delivery.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Nodus-Webhooks/1.0",
          "x-nodus-event": delivery.eventType,
          "x-nodus-delivery": delivery.id,
          "x-nodus-timestamp": timestamp,
          "x-nodus-signature": signWebhookPayload(secret, timestamp, body)
        },
        body,
        signal: AbortSignal.timeout(10_000)
      });
      if (response.ok) return this.store.completeWebhookDelivery({ deliveryId: delivery.id, responseStatus: response.status });
      return this.store.failWebhookDelivery({ deliveryId: delivery.id, responseStatus: response.status, error: `HTTP ${response.status}`, maxAttempts: MAX_ATTEMPTS });
    } catch (error) {
      return this.store.failWebhookDelivery({ deliveryId: delivery.id, error: error.message || "Webhook delivery failed", maxAttempts: MAX_ATTEMPTS });
    }
  }
}
