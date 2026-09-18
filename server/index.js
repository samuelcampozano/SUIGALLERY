import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { walrus, DEFAULT_SPACE_ID, DEFAULT_BUCKET_ID } from "./walrus-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const tempStorageDir = path.join(rootDir, "temp_storage");

// Ensure temp_storage directory exists
if (!fs.existsSync(tempStorageDir)) {
  fs.mkdirSync(tempStorageDir, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files
const publicDir = path.join(rootDir, "public");
app.use(express.static(publicDir));

// Configure Multer for disk uploads within allowed root
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempStorageDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `upload_${Date.now()}_${safeName}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB max
});

// Cache map for decrypted files: fileId -> local path
const decryptedCache = new Map();

// Helper to determine Content-Type
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    default:
      return "application/octet-stream";
  }
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Health & Storage Status
app.get("/api/status", async (req, res) => {
  try {
    const [ping, usage, bucket] = await Promise.all([
      walrus.ping().catch(() => ({ ok: false })),
      walrus.getStorageUsage().catch(() => null),
      walrus.getBucketDetails().catch(() => null)
    ]);

    res.json({
      success: true,
      service: "SuiGallery Walrus Backend",
      version: "1.1.0",
      status: ping.ok ? "connected" : "degraded",
      space: {
        id: DEFAULT_SPACE_ID,
        name: "Personal Space",
        storage_cap_bytes: usage?.storage_cap || 5000000000,
        storage_used_bytes: usage?.storage_used || 0,
        available_bytes: usage?.available || 5000000000,
        percent_used: usage?.percent_used || 0
      },
      bucket: {
        id: DEFAULT_BUCKET_ID,
        name: bucket?.name || "Default",
        visibility: bucket?.visibility || "private",
        seal_policy_id: bucket?.seal_policy_id || "active",
        file_count: bucket?.file_count || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. List Photos in Bucket
app.get("/api/photos", async (req, res) => {
  try {
    const rawFiles = await walrus.listPhotos();
    const photos = (Array.isArray(rawFiles) ? rawFiles : []).map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      status: file.status || "active",
      blob_id: file.blob_id || null,
      created_at: file.created_at || new Date().toISOString(),
      content_type: getContentType(file.name),
      stream_url: `/api/photos/${file.id}/stream`,
      download_url: `/api/photos/${file.id}/stream?download=true`
    }));

    // Sort newest first
    photos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      count: photos.length,
      photos
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Upload Photo (Client-Side Seal Encrypted before upload)
app.post("/api/photos/upload", upload.single("photo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No photo file uploaded" });
  }

  const localFilePath = req.file.path;
  const originalName = req.file.originalname;
  const description = req.body.description || "Uploaded via SuiGallery";

  console.log(`📸 [API] Received upload request for ${originalName} (${req.file.size} bytes)`);

  try {
    const result = await walrus.uploadPhoto({
      localPath: localFilePath,
      fileName: originalName,
      description,
      tags: ["photo", "suigallery", path.extname(originalName).replace(".", "")]
    });

    // Clean up the local temp upload file
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch {
      // ignore
    }

    res.json({
      success: true,
      message: "Photo encrypted and stored on Walrus successfully",
      result
    });
  } catch (err) {
    // Clean up on failure
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch {
      // ignore
    }
    console.error("❌ [API] Upload failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Stream / Decrypt Photo
app.get("/api/photos/:fileId/stream", async (req, res) => {
  const { fileId } = req.params;
  const shouldDownload = req.query.download === "true";

  try {
    let cachedPath = decryptedCache.get(fileId);

    // If not in cache or file was deleted, fetch and decrypt
    if (!cachedPath || !fs.existsSync(cachedPath)) {
      const destFilename = `decrypted_${fileId}_${Date.now()}.bin`;
      const destPath = path.join(tempStorageDir, destFilename);

      await walrus.downloadAndDecryptPhoto({ fileId, destPath });
      cachedPath = destPath;
      decryptedCache.set(fileId, cachedPath);
    }

    // Try to get original filename from photos list
    const files = await walrus.listPhotos();
    const matched = files.find((f) => f.id === fileId);
    const filename = matched?.name || `photo_${fileId}.jpg`;
    const contentType = getContentType(filename);

    res.setHeader("Content-Type", contentType);
    if (shouldDownload) {
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
    }

    const stream = fs.createReadStream(cachedPath);
    stream.pipe(res);
  } catch (err) {
    console.error(`❌ [API] Stream failed for fileId ${fileId}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Delete Photo
app.delete("/api/photos/:fileId", async (req, res) => {
  const { fileId } = req.params;

  try {
    await walrus.deletePhoto(fileId);

    // Clean cache
    const cachedPath = decryptedCache.get(fileId);
    if (cachedPath && fs.existsSync(cachedPath)) {
      try {
        fs.unlinkSync(cachedPath);
      } catch {
        // ignore
      }
      decryptedCache.delete(fileId);
    }

    res.json({ success: true, message: `Photo ${fileId} deleted from Walrus` });
  } catch (err) {
    console.error(`❌ [API] Delete failed for fileId ${fileId}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Update Photo Metadata (Rename, Tags, Description)
app.patch("/api/photos/:fileId", async (req, res) => {
  const { fileId } = req.params;
  const { name, description, tags } = req.body;

  try {
    const result = await walrus.updatePhoto({ fileId, name, description, tags });
    res.json({
      success: true,
      message: "Photo metadata updated successfully",
      result
    });
  } catch (err) {
    console.error(`❌ [API] Update failed for fileId ${fileId}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Batch Delete Photos
app.post("/api/photos/batch-delete", async (req, res) => {
  const { fileIds } = req.body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ success: false, error: "fileIds array required" });
  }

  const results = [];
  for (const fileId of fileIds) {
    try {
      await walrus.deletePhoto(fileId);
      const cached = decryptedCache.get(fileId);
      if (cached && fs.existsSync(cached)) {
        try { fs.unlinkSync(cached); } catch {}
        decryptedCache.delete(fileId);
      }
      results.push({ fileId, success: true });
    } catch (err) {
      results.push({ fileId, success: false, error: err.message });
    }
  }

  res.json({
    success: true,
    deleted_count: results.filter((r) => r.success).length,
    results
  });
});

// 8. Generate Ephemeral Test Vault / Sui Wallet
app.post("/api/wallet/generate", (req, res) => {
  try {
    const wallet = walrus.generateEphemeralWallet();
    res.json({
      success: true,
      wallet
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback to index.html for client routing
app.use((req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Start Server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log("====================================================");
  console.log(`🌊 SuiGallery / Walrus Photos running on:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log("====================================================");
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down server...");
  server.close(() => process.exit(0));
});
