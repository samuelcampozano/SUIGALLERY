import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
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
  }

  async getClient() {
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
    const client = await this.getClient();
    const res = await client.callTool({ name: "ping_console", arguments: {} });
    return this.parseMcpResponse(res);
  }

  async getStorageUsage() {
    const client = await this.getClient();
    const res = await client.callTool({ name: "get_storage_usage", arguments: {} });
    return this.parseMcpResponse(res);
  }

  async getBucketDetails(bucketId = DEFAULT_BUCKET_ID) {
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
    const client = await this.getClient();
    const res = await client.callTool({
      name: "list_files",
      arguments: { bucketId, limit: 100 }
    });
    const parsed = await this.parseMcpResponse(res);
    return parsed?.data || [];
  }

  async uploadPhoto({ localPath, fileName, description = "", tags = ["photo", "suigallery"] }) {
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
}

export const walrus = new WalrusClientManager();
