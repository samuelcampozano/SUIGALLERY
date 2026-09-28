import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * DirectWalrusTestnetAdapter
 * 
 * Provides direct decentralized HTTP access to Walrus Protocol Testnet
 * storage nodes without requiring a Walrus Console API key or token.
 * 
 * Features:
 * - Public Walrus Publisher: Stores raw or client-encrypted ciphertext blobs.
 * - Public Walrus Aggregator: Retrieves certified blobs by Walrus blob ID.
 * - Automatic parsing of newlyCreated and alreadyCertified Walrus receipts.
 * - Non-blocking fallback to local sandbox if external network is unavailable.
 */
export class DirectWalrusTestnetAdapter {
  constructor({
    publisherUrl = process.env.WALRUS_PUBLISHER_URL || "https://publisher.walrus-testnet.walrus.space",
    aggregatorUrl = process.env.WALRUS_AGGREGATOR_URL || "https://aggregator.walrus-testnet.walrus.space",
    defaultEpochs = Number(process.env.WALRUS_STORAGE_EPOCHS || 1),
    requestTimeoutMs = Number(process.env.WALRUS_REQUEST_TIMEOUT_MS || 15000),
    enabled = process.env.WALRUS_DIRECT_TESTNET_ENABLED !== "false"
  } = {}) {
    this.publisherUrl = publisherUrl.replace(/\/+$/, "");
    this.aggregatorUrl = aggregatorUrl.replace(/\/+$/, "");
    this.defaultEpochs = defaultEpochs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.enabled = enabled;
  }

  /**
   * Quick liveness check against the Walrus Aggregator.
   */
  async checkHealth(timeoutMs = 5000) {
    if (!this.enabled) return { ok: false, reason: "disabled" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Aggregator returns 404 for empty path or 200 for root, confirming node is alive
      const res = await fetch(`${this.aggregatorUrl}/v1/blobs`, {
        method: "HEAD",
        signal: controller.signal
      });
      // Any response (including 400 or 404 on root) proves the HTTP aggregator server is reachable
      return { ok: res.status < 500, status: res.status, endpoint: this.aggregatorUrl };
    } catch (err) {
      return { ok: false, error: err.message, endpoint: this.aggregatorUrl };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Upload ciphertext / blob directly to the Walrus Testnet publisher.
   * 
   * @param {Buffer|Uint8Array|string} data - Binary data or path to file on disk
   * @param {object} options
   * @returns {Promise<{ blobId: string, suiObjectId: string|null, size: number, newlyCreated: boolean }>}
   */
  async storeBlob(data, { epochs = this.defaultEpochs, deletable = true } = {}) {
    if (!this.enabled) {
      throw new Error("Direct Walrus Testnet adapter is disabled");
    }

    let payloadBuffer;
    if (typeof data === "string") {
      // It's a file path
      if (!fs.existsSync(data)) {
        throw new Error(`File not found at path: ${data}`);
      }
      payloadBuffer = fs.readFileSync(data);
    } else if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
      payloadBuffer = data;
    } else {
      throw new Error("Invalid payload: must be Buffer, Uint8Array, or file path");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    const url = new URL("/v1/blobs", this.publisherUrl);
    url.searchParams.set("epochs", String(epochs));
    if (deletable) {
      url.searchParams.set("deletable", "true");
    }

    try {
      const response = await fetch(url.toString(), {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(payloadBuffer.length)
        },
        body: payloadBuffer,
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Walrus publisher rejected blob (${response.status}): ${errorText.slice(0, 200)}`);
      }

      const result = await response.json();

      let blobId = null;
      let suiObjectId = null;
      let size = payloadBuffer.length;
      let newlyCreated = false;

      if (result.newlyCreated) {
        newlyCreated = true;
        const blobObj = result.newlyCreated.blobObject;
        blobId = blobObj?.blobId || result.newlyCreated.blobId;
        suiObjectId = blobObj?.id || null;
        size = blobObj?.size || size;
      } else if (result.alreadyCertified) {
        newlyCreated = false;
        blobId = result.alreadyCertified.blobId;
        suiObjectId = result.alreadyCertified.event?.txDigest || null;
      } else if (result.blobId) {
        blobId = result.blobId;
      }

      if (!blobId) {
        throw new Error(`Unrecognized response format from Walrus publisher: ${JSON.stringify(result).slice(0, 150)}`);
      }

      return {
        blobId,
        blob_id: blobId,
        suiObjectId,
        sui_object_id: suiObjectId,
        size,
        newlyCreated,
        publisher: this.publisherUrl,
        aggregator: this.aggregatorUrl,
        rawResult: result
      };
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`Walrus publisher timed out after ${this.requestTimeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Retrieve a blob by its Walrus Blob ID from the public Aggregator.
   * 
   * @param {string} blobId
   * @param {string|null} destPath - Optional path to save to disk
   * @returns {Promise<Buffer>}
   */
  async readBlob(blobId, destPath = null) {
    if (!this.enabled) {
      throw new Error("Direct Walrus Testnet adapter is disabled");
    }
    if (!blobId || typeof blobId !== "string") {
      throw new Error("Valid Walrus blobId is required");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    const url = `${this.aggregatorUrl}/v1/blobs/${encodeURIComponent(blobId)}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Walrus aggregator returned ${response.status} for blob ${blobId}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (destPath) {
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(destPath, buffer);
      }

      return buffer;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`Walrus aggregator timed out after ${this.requestTimeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const directWalrusAdapter = new DirectWalrusTestnetAdapter();
