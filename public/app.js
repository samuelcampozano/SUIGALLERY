// SuiGallery / Walrus Photos Client Application
document.addEventListener("DOMContentLoaded", () => {
  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // App State
  const state = {
    photos: [],
    selectedPhoto: null,
    searchQuery: "",
    status: null
  };

  // DOM Elements
  const connectionBadge = document.getElementById("connectionBadge");
  const statusText = document.getElementById("statusText");
  const quotaValue = document.getElementById("quotaValue");
  const quotaFill = document.getElementById("quotaFill");
  const photoGrid = document.getElementById("photoGrid");
  const photoCounter = document.getElementById("photoCounter");
  const emptyState = document.getElementById("emptyState");
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const uploadTriggerBtn = document.getElementById("uploadTriggerBtn");
  const browseBtn = document.getElementById("browseBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const searchInput = document.getElementById("searchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");

  // Lightbox DOM Elements
  const lightboxModal = document.getElementById("lightboxModal");
  const lightboxBackdrop = document.getElementById("lightboxBackdrop");
  const lightboxCloseBtn = document.getElementById("lightboxCloseBtn");
  const lightboxImg = document.getElementById("lightboxImg");
  const sidebarFileName = document.getElementById("sidebarFileName");
  const sidebarMimeBadge = document.getElementById("sidebarMimeBadge");
  const metaBlobId = document.getElementById("metaBlobId");
  const metaFileId = document.getElementById("metaFileId");
  const metaSealPolicy = document.getElementById("metaSealPolicy");
  const metaFileSize = document.getElementById("metaFileSize");
  const metaUploadDate = document.getElementById("metaUploadDate");
  const downloadBtn = document.getElementById("downloadBtn");
  const deleteBtn = document.getElementById("deleteBtn");

  // Upload Progress Elements
  const uploadOverlay = document.getElementById("uploadOverlay");
  const progressTitle = document.getElementById("progressTitle");
  const progressFileInfo = document.getElementById("progressFileInfo");
  const step1 = document.getElementById("step1");
  const step2 = document.getElementById("step2");
  const step3 = document.getElementById("step3");

  // Utilities
  function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  function formatDate(isoString) {
    if (!isoString) return "Recently";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return isoString;
    }
  }

  // ==========================================
  // API INTERACTIONS
  // ==========================================

  // Fetch Status
  async function fetchStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      if (data.success) {
        state.status = data;
        connectionBadge.classList.add("connected");
        statusText.textContent = `Walrus Connected • ${data.bucket.name} Bucket`;

        // Update Quota Bar
        const used = data.space.storage_used_bytes || 0;
        const cap = data.space.storage_cap_bytes || 5000000000;
        const percent = Math.min(100, Math.max(0, (used / cap) * 100));
        quotaValue.textContent = `${formatBytes(used)} / ${formatBytes(cap)}`;
        quotaFill.style.width = `${percent}%`;
      }
    } catch (err) {
      console.warn("Could not fetch status:", err);
      connectionBadge.classList.remove("connected");
      statusText.textContent = "Offline / Reconnecting";
    }
  }

  // Fetch Photos
  async function fetchPhotos() {
    photoCounter.textContent = "Syncing memories...";
    try {
      const res = await fetch("/api/photos");
      const data = await res.json();
      if (data.success) {
        state.photos = data.photos || [];
        renderPhotos();
      } else {
        photoCounter.textContent = "Sync failed";
      }
    } catch (err) {
      console.error("Failed to load photos:", err);
      photoCounter.textContent = "Connection error";
    }
  }

  // Render Photo Grid
  function renderPhotos() {
    const query = state.searchQuery.toLowerCase().trim();
    const filtered = state.photos.filter((p) => {
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        (p.blob_id && p.blob_id.toLowerCase().includes(query)) ||
        (p.id && p.id.toLowerCase().includes(query))
      );
    });

    photoCounter.textContent = `${state.photos.length} ${state.photos.length === 1 ? "memory" : "memories"} securely preserved`;

    if (filtered.length === 0) {
      photoGrid.innerHTML = "";
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");
    photoGrid.innerHTML = filtered
      .map((p) => {
        return `
        <div class="photo-card" data-id="${p.id}">
          <img class="photo-thumbnail" src="${p.stream_url}" alt="${p.name}" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\' fill=\\'%231a2332\\'><rect width=\\'100\\' height=\\'100\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%238b949e\\' font-size=\\'12\\' text-anchor=\\'middle\\' dy=\\'.3em\\'>Encrypted Media</text></svg>'">
          <div class="photo-overlay">
            <div class="overlay-top">
              <span class="badge-seal"><i data-lucide="lock" style="width: 10px; height: 10px;"></i> Seal</span>
            </div>
            <div class="overlay-bottom">
              <span class="photo-card-name">${p.name}</span>
              <span class="photo-card-meta">${formatBytes(p.size)} • ${formatDate(p.created_at)}</span>
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Attach click handlers to open Lightbox
    photoGrid.querySelectorAll(".photo-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.getAttribute("data-id");
        const photo = state.photos.find((p) => p.id === id);
        if (photo) {
          openLightbox(photo);
        }
      });
    });
  }

  // Open Lightbox
  function openLightbox(photo) {
    state.selectedPhoto = photo;
    sidebarFileName.textContent = photo.name;
    sidebarMimeBadge.textContent = photo.content_type || "image/jpeg";
    metaBlobId.textContent = photo.blob_id || "Anchored in Walrus";
    metaFileId.textContent = photo.id;
    metaSealPolicy.textContent = state.status?.bucket?.seal_policy_id || "0x9c1baccb244e45342ac150a0123a4802e8e834f25c00210e50c81081354eee44";
    metaFileSize.textContent = formatBytes(photo.size);
    metaUploadDate.textContent = formatDate(photo.created_at);

    lightboxImg.src = photo.stream_url;
    downloadBtn.href = photo.download_url;

    lightboxModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  // Close Lightbox
  function closeLightbox() {
    lightboxModal.classList.add("hidden");
    document.body.style.overflow = "";
    state.selectedPhoto = null;
  }

  lightboxCloseBtn.addEventListener("click", closeLightbox);
  lightboxBackdrop.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !lightboxModal.classList.contains("hidden")) {
      closeLightbox();
    }
  });

  // Delete Photo Action
  deleteBtn.addEventListener("click", async () => {
    if (!state.selectedPhoto) return;
    const confirmDelete = confirm(`Are you sure you want to permanently delete "${state.selectedPhoto.name}" from Walrus?`);
    if (!confirmDelete) return;

    const fileId = state.selectedPhoto.id;
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = `<div class="spinner-sm"></div> Deleting...`;

    try {
      const res = await fetch(`/api/photos/${fileId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        closeLightbox();
        await fetchPhotos();
        await fetchStatus();
      } else {
        alert("Failed to delete: " + data.error);
      }
    } catch (err) {
      alert("Delete failed: " + err.message);
    } finally {
      deleteBtn.disabled = false;
      deleteBtn.innerHTML = `<i data-lucide="trash-2"></i> Delete from Walrus`;
      if (window.lucide) window.lucide.createIcons();
    }
  });

  // Copy to clipboard helper
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const targetId = btn.getAttribute("data-copy");
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        navigator.clipboard.writeText(targetEl.textContent.trim());
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="check" style="color: var(--accent-success)"></i>`;
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => {
          btn.innerHTML = originalHtml;
          if (window.lucide) window.lucide.createIcons();
        }, 1500);
      }
    });
  });

  // ==========================================
  // UPLOAD PIPELINE
  // ==========================================

  async function handleFilesUpload(files) {
    if (!files || files.length === 0) return;

    uploadOverlay.classList.remove("hidden");

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      progressTitle.textContent = `Processing ${i + 1} of ${files.length}...`;
      progressFileInfo.textContent = `${file.name} (${formatBytes(file.size)})`;

      // Step 1: Encrypting
      step1.className = "step active";
      step2.className = "step";
      step3.className = "step";

      await new Promise((r) => setTimeout(r, 400));

      // Step 2: Uploading to Walrus
      step1.className = "step completed";
      step2.className = "step active";

      const formData = new FormData();
      formData.append("photo", file);
      formData.append("description", `Uploaded to Walrus Vault at ${new Date().toISOString()}`);

      try {
        const res = await fetch("/api/photos/upload", {
          method: "POST",
          body: formData
        });
        const data = await res.json();

        if (data.success) {
          step2.className = "step completed";
          step3.className = "step completed";
          await new Promise((r) => setTimeout(r, 400));
        } else {
          alert(`Upload failed for ${file.name}: ${data.error}`);
        }
      } catch (err) {
        alert(`Error uploading ${file.name}: ${err.message}`);
      }
    }

    uploadOverlay.classList.add("hidden");
    fileInput.value = "";
    await fetchPhotos();
    await fetchStatus();
  }

  // Trigger file inputs
  uploadTriggerBtn.addEventListener("click", () => fileInput.click());
  browseBtn.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    handleFilesUpload(e.target.files);
  });

  // Drag and Drop
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("drag-over");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFilesUpload(files);
  });

  // Search filter
  searchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    if (state.searchQuery.length > 0) {
      clearSearchBtn.classList.remove("hidden");
    } else {
      clearSearchBtn.classList.add("hidden");
    }
    renderPhotos();
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    state.searchQuery = "";
    clearSearchBtn.classList.add("hidden");
    renderPhotos();
  });

  // Refresh
  refreshBtn.addEventListener("click", () => {
    refreshBtn.classList.add("spinning");
    Promise.all([fetchPhotos(), fetchStatus()]).finally(() => {
      refreshBtn.classList.remove("spinning");
    });
  });

  // Initial Boot
  fetchStatus();
  fetchPhotos();
});
