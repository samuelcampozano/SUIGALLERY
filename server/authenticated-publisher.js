import crypto from "node:crypto";

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

/**
 * Mints one-time, size-bound JWTs for a self-hosted Walrus authenticated publisher.
 * The browser receives a token but never receives the signing secret or publisher wallet.
 */
export class AuthenticatedPublisher {
  constructor({ url = process.env.NODUS_PUBLISHER_URL, jwtSecret = process.env.NODUS_PUBLISHER_JWT_SECRET, tokenTtlSeconds = Number(process.env.NODUS_PUBLISHER_TOKEN_TTL_SECONDS || 600) } = {}) {
    this.url = url?.replace(/\/+$/, "") || null;
    this.jwtSecret = jwtSecret || null;
    this.tokenTtlSeconds = tokenTtlSeconds;
  }

  isConfigured() {
    return Boolean(this.url && this.jwtSecret && this.tokenTtlSeconds > 0);
  }

  authorize({ uploadId, segment, epochs, sendObjectTo = null }) {
    if (!this.isConfigured()) throw new Error("Authenticated publisher is not configured");
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iat: now,
      exp: now + this.tokenTtlSeconds,
      jti: crypto.randomUUID(),
      size: segment.ciphertextSize,
      epochs,
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
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      expiresAt: new Date((now + this.tokenTtlSeconds) * 1000).toISOString(),
      segmentIndex: segment.index,
      ciphertextSize: segment.ciphertextSize
    };
  }

  signHs256(claims) {
    const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = base64Url(JSON.stringify(claims));
    const input = `${header}.${payload}`;
    const signature = crypto.createHmac("sha256", this.jwtSecret).update(input).digest("base64url");
    return `${input}.${signature}`;
  }
}
