import crypto from "node:crypto";

export function verifyNodusWebhook({ secret, timestamp, signature, rawBody }) {
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(signature || "");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Verify the signature over the *unparsed* request body, reject stale
// timestamps (for example, older than five minutes), then parse JSON.
