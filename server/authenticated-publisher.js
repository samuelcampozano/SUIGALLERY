import crypto from "node:crypto";

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Mints one-time, size-bound JWTs for a self-hosted Walrus authenticated publisher.
 * The browser receives a token but never receives the signing secret or publisher wallet.
 */
export class AuthenticatedPublisher {
  constructor({ url = process.env.NODUS_PUBLISHER_URL, jwtSecret = process.env.NODUS_PUBLISHER_JWT_SECRET, receiptSecret = process.env.NODUS_PUBLISHER_RECEIPT_SECRET, tokenTtlSeconds = Number(process.env.NODUS_PUBLISHER_TOKEN_TTL_SECONDS || 600), production = process.env.NODE_ENV === "production" } = {}) {
    this.url = url?.replace(/\/+$/, "") || null;
    this.jwtSecret = jwtSecret || null;
    this.receiptSecret = receiptSecret || null;
    this.tokenTtlSeconds = tokenTtlSeconds;
    this.production = production;
  }

  isConfigured() {
    return this.configurationErrors().length === 0;
  }

  configurationErrors() {
    const errors = [];
    let parsedUrl = null;
    try { parsedUrl = new URL(this.url); } catch {}
    if (!parsedUrl || !["http:", "https:"].includes(parsedUrl.protocol)) errors.push("NODUS_PUBLISHER_URL must be an absolute HTTP(S) URL");
    if (this.production && parsedUrl?.protocol !== "https:") errors.push("NODUS_PUBLISHER_URL must use HTTPS in production");
    if (!this.jwtSecret || Buffer.byteLength(this.jwtSecret) < 32) errors.push("NODUS_PUBLISHER_JWT_SECRET must be at least 32 bytes");
    if (!this.receiptSecret || Buffer.byteLength(this.receiptSecret) < 32) errors.push("NODUS_PUBLISHER_RECEIPT_SECRET must be at least 32 bytes");
    if (this.production && this.receiptSecret === this.jwtSecret) errors.push("NODUS_PUBLISHER_RECEIPT_SECRET must differ from NODUS_PUBLISHER_JWT_SECRET in production");
    if (!Number.isInteger(this.tokenTtlSeconds) || this.tokenTtlSeconds < 30 || this.tokenTtlSeconds > 600) errors.push("NODUS_PUBLISHER_TOKEN_TTL_SECONDS must be between 30 and 600");
    return errors;
  }

  assertConfigured() {
    const errors = this.configurationErrors();
    if (errors.length) throw new Error(`Authenticated publisher configuration invalid: ${errors.join("; ")}`);
  }

  authorize({ uploadId, segment, epochs, ciphertextSha256, sendObjectTo = null }) {
    this.assertConfigured();
    if (!/^[a-f0-9]{64}$/i.test(ciphertextSha256 || "")) throw new Error("A ciphertext SHA-256 is required for publisher authorization");
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iat: now,
      exp: now + this.tokenTtlSeconds,
      jti: crypto.randomUUID(),
      size: segment.ciphertextSize,
      epochs,
      ciphertext_sha256: ciphertextSha256,
      // Custom claims are ignored by Walrus but allow our audit trail to bind a token.
      nodus_upload_id: uploadId,
      nodus_segment_index: segment.index
    };
    if (sendObjectTo) claims.send_object_to = sendObjectTo;
    const token = this.signHs256(claims);
    const endpoint = new URL("/v1/blobs", `${this.url}/`);
    endpoint.searchParams.set("epochs", String(epochs));
    endpoint.searchParams.set("deletable", "true");
    if (sendObjectTo) endpoint.searchParams.set("send_object_to", sendObjectTo);
    return {
      uploadUrl: endpoint.toString(),
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream", "X-Nodus-Ciphertext-SHA256": ciphertextSha256 },
      expiresAt: new Date((now + this.tokenTtlSeconds) * 1000).toISOString(),
      segmentIndex: segment.index,
      ciphertextSize: segment.ciphertextSize,
      ciphertextSha256,
      jti: claims.jti
    };
  }

  verifyReceipt(receipt, expected) {
    if (!receipt || typeof receipt !== "object" || !receipt.payload || typeof receipt.signature !== "string") throw new Error("A signed publisher receipt is required");
    const payload = receipt.payload;
    const encoded = base64Url(JSON.stringify(payload));
    const signature = crypto.createHmac("sha256", this.receiptSecret).update(encoded).digest("base64url");
    if (!safeEqual(signature, receipt.signature)) throw new Error("Publisher receipt signature is invalid");
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp < now || payload.exp - payload.iat > this.tokenTtlSeconds + 30) throw new Error("Publisher receipt is expired or has an invalid lifetime");
    if (payload.jti !== expected.jti || payload.nodus_upload_id !== expected.uploadId || payload.nodus_segment_index !== expected.segmentIndex) throw new Error("Publisher receipt is not bound to this upload authorization");
    if (payload.size !== expected.ciphertextSize || payload.ciphertext_sha256 !== expected.ciphertextSha256) throw new Error("Publisher receipt does not match the authorized ciphertext");
    if (!/^[A-Za-z0-9_-]{16,256}$/.test(payload.blobId || "")) throw new Error("Publisher receipt has an invalid blob ID");
    return payload;
  }

  signHs256(claims) {
    const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = base64Url(JSON.stringify(claims));
    const input = `${header}.${payload}`;
    const signature = crypto.createHmac("sha256", this.jwtSecret).update(input).digest("base64url");
    return `${input}.${signature}`;
  }
}
