import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { blake2b } from "@noble/hashes/blake2.js";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Load .env if not loaded
try {
  if (typeof process.loadEnvFile === "function" && fs.existsSync(path.join(rootDir, ".env"))) {
    process.loadEnvFile(path.join(rootDir, ".env"));
  }
} catch (e) {
  console.warn("⚠️ Could not load .env file:", e.message);
}

// Config constants
export const DEFAULT_SPACE_ID = "443d9a48-7835-437f-9bb4-2716833aee06";
export const DEFAULT_BUCKET_ID = "ec7acd16-05b1-4fa2-b368-94700eb29f5e";
export const DEFAULT_SEAL_POLICY_ID = "0x9c1baccb244e45342ac150a0123a4802e8e834f25c00210e50c81081354eee44";

class WalrusClientManager {
  constructor() {
    this.client = null;
    this.transport = null;
    this.isConnecting = false;
    this.activeBucket = null;
    this.mockFiles = [
      {
        id: "demo_photo_1",
        name: "Welcome_to_SuiGallery.png",
        blob_id: "7X9jPuF1K8ZQq7VxABEnzk74d5VQ7VjohrMockBlob01",
        size: 1048576,
        content_type: "image/png",
        created_at: new Date(Date.now() - 3600000).toISOString(),
        tags: ["photo", "suigallery", "demo"],
        description: "Decentralized memory secured by Walrus Protocol & Sui Move threshold policy"
      }
    ];
  }

  isMockMode() {
    if (process.env.NODE_ENV === "test" && process.env.WALRUS_LIVE_TEST !== "true") {
      return true;
    }
    const hasKeys = Boolean(
      process.env.CONSOLE_API_KEY &&
      (process.env.CONSOLE_SERVICE_PRIVATE_KEY || process.env.CONSOLE_CREDENTIAL_BUNDLE)
    );
    return !hasKeys || process.env.WALRUS_MOCK === "true";
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
      }
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }
    } catch {}
  }

  async getClient() {
    if (this.isMockMode()) {
      return null;
    }
    if (this.client) return this.client;
    if (this.isConnecting) {
      // Wait for existing connection attempt
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.client) return this.client;
    }

    this.isConnecting = true;
    try {
      const mcpScriptPath = path.join(
        rootDir,
        "node_modules",
        "@mysten-incubation",
        "walrus-console-mcp",
        "dist",
        "console-mcp.js"
      );

      this.transport = new StdioClientTransport({
        command: "node",
        args: [mcpScriptPath],
        env: {
          ...process.env,
          CONSOLE_MCP_ALLOWED_DIRS: rootDir
        }
      });

      this.client = new Client(
        { name: "suigallery-backend", version: "1.0.0" },
        { capabilities: {} }
      );

      await this.client.connect(this.transport);
      console.log("🌊 [WalrusClient] Connected to Walrus Console MCP server successfully.");

      // Handle process exit
      this.transport.process?.on("exit", (code) => {
        console.warn(`⚠️ [WalrusClient] MCP process exited with code ${code}. Resetting client.`);
        this.client = null;
        this.transport = null;
      });

      return this.client;
    } catch (err) {
      console.error("❌ [WalrusClient] Failed to initialize MCP connection:", err);
      this.client = null;
      this.transport = null;
      throw err;
    } finally {
      this.isConnecting = false;
    }
  }

  async parseMcpResponse(result) {
    if (result.isError) {
      const errMsg = result.content?.[0]?.text || "Unknown MCP Error";
      throw new Error(errMsg);
    }
    const text = result.content?.[0]?.text;
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async ping() {
    if (this.isMockMode()) {
      return { ok: true, mode: "sandbox" };
    }
    const client = await this.getClient();
    const res = await client.callTool({ name: "ping_console", arguments: {} });
    return this.parseMcpResponse(res);
  }

  async getStorageUsage() {
    if (this.isMockMode()) {
      return {
        storage_cap: 5000000000,
        storage_used: 1048576,
        available: 4998951424,
        percent_used: 0.0002
      };
    }
    const client = await this.getClient();
    const res = await client.callTool({ name: "get_storage_usage", arguments: {} });
    return this.parseMcpResponse(res);
  }

  async getBucketDetails(bucketId = DEFAULT_BUCKET_ID) {
    if (this.isMockMode()) {
      return {
        id: bucketId,
        name: "Default (Sandbox)",
        visibility: "private",
        seal_policy_id: DEFAULT_SEAL_POLICY_ID,
        file_count: this.mockFiles.length
      };
    }
    const client = await this.getClient();
    const res = await client.callTool({
      name: "get_bucket",
      arguments: { bucketId }
    });
    const parsed = await this.parseMcpResponse(res);
    this.activeBucket = parsed?.data || parsed;
    return this.activeBucket;
  }

  async listPhotos(bucketId = DEFAULT_BUCKET_ID) {
    if (this.isMockMode()) {
      return this.mockFiles;
    }
    const client = await this.getClient();
    const res = await client.callTool({
      name: "list_files",
      arguments: { bucketId, limit: 100 }
    });
    const parsed = await this.parseMcpResponse(res);
    return parsed?.data || [];
  }

  async uploadPhoto({ localPath, fileName, description = "", tags = ["photo", "suigallery"] }) {
    if (this.isMockMode()) {
      const stat = fs.existsSync(localPath) ? fs.statSync(localPath) : { size: 65536 };
      const fileId = "sandbox_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const blobId = "mock_blob_" + Date.now();
      const newFile = {
        id: fileId,
        name: fileName,
        blob_id: blobId,
        size: stat.size,
        content_type: "image/png",
        created_at: new Date().toISOString(),
        tags: tags || ["photo", "suigallery"],
        description: description || ""
      };
      this.mockFiles.unshift(newFile);
      return { fileId, name: fileName, blobId, state: "completed", pending: false };
    }

    const client = await this.getClient();
    const bucket = await this.getBucketDetails();
    const sealPolicyId = bucket?.seal_policy_id || DEFAULT_SEAL_POLICY_ID;

    console.log(`🔒 [WalrusClient] Encrypting & Uploading ${fileName} (Seal Policy: ${sealPolicyId.slice(0, 10)}...)`);

    const res = await client.callTool({
      name: "upload_file",
      arguments: {
        bucketId: DEFAULT_BUCKET_ID,
        sealPolicyId,
        localPath,
        name: fileName,
        description,
        tags
      }
    });

    const parsed = await this.parseMcpResponse(res);
    console.log("✅ [WalrusClient] Upload completed successfully:", parsed);
    return parsed;
  }

  async downloadAndDecryptPhoto({ fileId, destPath }) {
    if (this.isMockMode()) {
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const transparentPng = Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360606060000000050001a7e48b560000000049454e44ae426082",
        "hex"
      );
      fs.writeFileSync(destPath, transparentPng);
      return { fileId, destPath, success: true };
    }

    const client = await this.getClient();
    const bucket = await this.getBucketDetails();
    const sealPolicyId = bucket?.seal_policy_id || DEFAULT_SEAL_POLICY_ID;

    console.log(`🔓 [WalrusClient] Fetching & Decrypting file ${fileId} to ${destPath}`);

    const res = await client.callTool({
      name: "download_file",
      arguments: {
        bucketId: DEFAULT_BUCKET_ID,
        fileId,
        sealPolicyId,
        destPath
      }
    });

    return this.parseMcpResponse(res);
  }

  async deletePhoto(fileId) {
    if (this.isMockMode()) {
      const idx = this.mockFiles.findIndex((f) => f.id === fileId);
      if (idx !== -1) this.mockFiles.splice(idx, 1);
      return { id: fileId, deleted: true };
    }

    const client = await this.getClient();
    console.log(`🗑️ [WalrusClient] Deleting file ${fileId} from bucket ${DEFAULT_BUCKET_ID}`);

    const res = await client.callTool({
      name: "delete_file",
      arguments: {
        bucketId: DEFAULT_BUCKET_ID,
        fileId
      }
    });

    return this.parseMcpResponse(res);
  }

  async updatePhoto({ fileId, name, description, tags }) {
    if (this.isMockMode()) {
      const file = this.mockFiles.find((f) => f.id === fileId);
      if (file) {
        if (name !== undefined) file.name = name;
        if (description !== undefined) file.description = description;
        if (tags !== undefined) file.tags = tags;
      }
      return { id: fileId, updated: true };
    }

    const client = await this.getClient();
    console.log(`✏️ [WalrusClient] Updating metadata for file ${fileId}`);

    const args = { fileId };
    if (name !== undefined) args.name = name;
    if (description !== undefined) args.description = description;
    if (tags !== undefined) args.tags = tags;

    const res = await client.callTool({
      name: "update_file",
      arguments: args
    });

    return this.parseMcpResponse(res);
  }

  generateEphemeralWallet() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const rawPub = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
    const rawPriv = privateKey.export({ type: "pkcs8", format: "der" }).subarray(-32);

    // Official Sui Address derivation: BLAKE2b-256 of [0x00, pubKeyBytes]
    const msg = Buffer.concat([Buffer.from([0x00]), rawPub]);
    const hash = blake2b(msg, { dkLen: 32 });
    const address = "0x" + Buffer.from(hash).toString("hex");

    return {
      address,
      publicKey: "0x" + rawPub.toString("hex"),
      secretKey: "suiprivkey_" + rawPriv.toString("hex").slice(0, 24) + "...",
      scheme: "ED25519",
      createdAt: new Date().toISOString(),
      balance: "5.0 SUI (Testnet)",
      role: "Ephemeral Beta Tester Vault"
    };
  }
}

export const walrus = new WalrusClientManager();
