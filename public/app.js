// SuiGallery / Walrus Photos Client Application with Multi-Language (EN, ES, PT) and Mobile Support
document.addEventListener("DOMContentLoaded", () => {
  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // ==========================================
  // INTERNATIONALIZATION (i18n) DICTIONARY
  // ==========================================
  const translations = {
    en: {
      brand_tag: "WALRUS PROTOCOL",
      status_connecting: "Connecting to Walrus...",
      status_connected: "Walrus Connected • {name} Bucket",
      status_offline: "Offline / Reconnecting",
      search_placeholder: "Search memories, tags, or file names...",
      quota_label: "Walrus Storage",
      upload_btn: "Upload Photos",
      banner_seal: "<strong>Seal Client-Side Encrypted</strong> (Private by Default)",
      banner_walrus: "<strong>Walrus 2D Red Stuff</strong> (Fountain Erasure Coded)",
      banner_sui: "<strong>Sui Object-Native</strong> (Zero-Knowledge zkLogin Ready)",
      drop_title: "Drop your photos & videos here",
      drop_subtitle: "Encrypted on your device before touching Walrus. Full-resolution, uncompressed preservation.",
      browse_btn: "Browse Files",
      progress_title: "Encrypting & Uploading to Walrus...",
      step1_text: "1. Seal Envelope Encryption",
      step2_text: "2. Walrus Blob Registration",
      step3_text: "3. Anchored in Bucket",
      timeline_title: "Timeline & Memories",
      loading_vault: "Syncing memories...",
      photo_counter: "{count} {word} securely preserved",
      word_single: "memory",
      word_plural: "memories",
      empty_title: "Your Sovereign Vault is Empty",
      empty_desc: "No photos or media stored yet in your Walrus bucket. Drag and drop any picture above to start building your decentralized Google Photos alternative.",
      meta_blob_id: "Walrus Blob ID",
      meta_file_id: "Console File ID",
      meta_seal_policy: "Seal Encryption Policy",
      meta_file_size: "File Size",
      meta_upload_date: "Captured / Uploaded",
      download_btn: "Download Original",
      delete_btn: "Delete from Walrus",
      delete_confirm: "Are you sure you want to permanently delete \"{name}\" from Walrus?",
      deleting: "Deleting...",
      sync_failed: "Sync failed",
      conn_error: "Connection error",
      anchored_walrus: "Anchored in Walrus"
    },
    es: {
      brand_tag: "PROTOCOLO WALRUS",
      status_connecting: "Conectando a Walrus...",
      status_connected: "Walrus Conectado • Bucket {name}",
      status_offline: "Desconectado / Reconectando",
      search_placeholder: "Buscar recuerdos, etiquetas o nombres...",
      quota_label: "Almacenamiento Walrus",
      upload_btn: "Subir Fotos",
      banner_seal: "<strong>Encriptado en Cliente con Seal</strong> (Privado por Defecto)",
      banner_walrus: "<strong>Walrus 2D Red Stuff</strong> (Código de Fuente Borrado)",
      banner_sui: "<strong>Objetos Nativos en Sui</strong> (Listo para zkLogin)",
      drop_title: "Arrastra tus fotos y videos aquí",
      drop_subtitle: "Encriptados en tu dispositivo antes de tocar Walrus. Preservación en resolución original sin compresión.",
      browse_btn: "Explorar Archivos",
      progress_title: "Encriptando y Subiendo a Walrus...",
      step1_text: "1. Encriptación de Sobre con Seal",
      step2_text: "2. Registro de Blob en Walrus",
      step3_text: "3. Asegurado en el Bucket",
      timeline_title: "Línea de Tiempo y Recuerdos",
      loading_vault: "Sincronizando recuerdos...",
      photo_counter: "{count} {word} preservados con seguridad",
      word_single: "recuerdo",
      word_plural: "recuerdos",
      empty_title: "Tu Bóveda Soberana está Vacía",
      empty_desc: "Aún no hay fotos ni medios guardados en tu bucket de Walrus. Arrastra y suelta cualquier imagen arriba para comenzar a construir tu alternativa descentralizada a Google Photos.",
      meta_blob_id: "ID de Blob en Walrus",
      meta_file_id: "ID de Archivo en Consola",
      meta_seal_policy: "Política de Encriptación Seal",
      meta_file_size: "Tamaño de Archivo",
      meta_upload_date: "Capturado / Subido",
      download_btn: "Descargar Original",
      delete_btn: "Eliminar de Walrus",
      delete_confirm: "¿Estás seguro de que deseas eliminar permanentemente \"{name}\" de Walrus?",
      deleting: "Eliminando...",
      sync_failed: "Error al sincronizar",
      conn_error: "Error de conexión",
      anchored_walrus: "Asegurado en Walrus"
    },
    pt: {
      brand_tag: "PROTOCOLO WALRUS",
      status_connecting: "Conectando ao Walrus...",
      status_connected: "Walrus Conectado • Bucket {name}",
      status_offline: "Offline / Reconectando",
      search_placeholder: "Pesquisar memórias, tags ou nomes...",
      quota_label: "Armazenamento Walrus",
      upload_btn: "Enviar Fotos",
      banner_seal: "<strong>Encriptado no Cliente com Seal</strong> (Privado por Padrão)",
      banner_walrus: "<strong>Walrus 2D Red Stuff</strong> (Código de Eliminação 2D)",
      banner_sui: "<strong>Objetos Nativos em Sui</strong> (Pronto para zkLogin)",
      drop_title: "Arraste as suas fotos e vídeos aqui",
      drop_subtitle: "Encriptados no seu dispositivo antes de tocar a rede Walrus. Preservação em resolução total sem compressão.",
      browse_btn: "Procurar Ficheiros",
      progress_title: "Encriptando e Enviando ao Walrus...",
      step1_text: "1. Encriptação de Envelope com Seal",
      step2_text: "2. Registro do Blob no Walrus",
      step3_text: "3. Ancorado no Bucket",
      timeline_title: "Linha do Tempo & Memórias",
      loading_vault: "Sincronizando memórias...",
      photo_counter: "{count} {word} preservadas com segurança",
      word_single: "memória",
      word_plural: "memórias",
      empty_title: "O seu Cofre Soberano está Vazio",
      empty_desc: "Ainda não há fotos ou vídeos armazenados no seu bucket do Walrus. Arraste e solte qualquer imagem acima para começar a usar a sua alternativa ao Google Photos.",
      meta_blob_id: "ID do Blob no Walrus",
      meta_file_id: "ID do Ficheiro na Consola",
      meta_seal_policy: "Política de Encriptação Seal",
      meta_file_size: "Tamanho do Ficheiro",
      meta_upload_date: "Capturado / Enviado",
      download_btn: "Baixar Original",
      delete_btn: "Excluir do Walrus",
      delete_confirm: "Tem certeza de que deseja excluir permanentemente \"{name}\" do Walrus?",
      deleting: "Excluindo...",
      sync_failed: "Falha na sincronização",
      conn_error: "Erro de conexão",
      anchored_walrus: "Ancorado no Walrus"
    }
  };

  // Current Language (default EN, or loaded from localStorage)
  let currentLang = localStorage.getItem("suigallery_lang") || "en";
  if (!translations[currentLang]) currentLang = "en";

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

  // Language Elements
  const langDropdown = document.getElementById("langDropdown");
  const langBtn = document.getElementById("langBtn");
  const langMenu = document.getElementById("langMenu");
  const currentLangCode = document.getElementById("currentLangCode");

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

  // Translation helper
  function t(key, vars = {}) {
    const dict = translations[currentLang] || translations.en;
    let text = dict[key] || translations.en[key] || key;
    for (const [vKey, vVal] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${vKey}\\}`, "g"), vVal);
    }
    return text;
  }

  // Apply Translations to DOM elements with data-i18n
  function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem("suigallery_lang", lang);
    currentLangCode.textContent = lang.toUpperCase();

    // Update active class on options
    document.querySelectorAll(".lang-option").forEach((opt) => {
      if (opt.getAttribute("data-lang") === lang) {
        opt.classList.add("active");
      } else {
        opt.classList.remove("active");
      }
    });

    // Translate all static data-i18n elements
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const translation = t(key);
      if (translation) {
        if (translation.includes("<") && translation.includes(">")) {
          el.innerHTML = translation;
        } else {
          el.textContent = translation;
        }
      }
    });

    // Update search placeholder
    searchInput.placeholder = t("search_placeholder");

    // Refresh dynamic status & counters
    if (state.status) {
      statusText.textContent = t("status_connected", { name: state.status.bucket?.name || "Default" });
    } else {
      statusText.textContent = t("status_connecting");
    }

    renderPhotos();
    if (window.lucide) window.lucide.createIcons();
  }

  // Language Dropdown Event Handlers
  langBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    langDropdown.classList.toggle("open");
    langMenu.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!langDropdown.contains(e.target)) {
      langDropdown.classList.remove("open");
      langMenu.classList.add("hidden");
    }
  });

  document.querySelectorAll(".lang-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selected = btn.getAttribute("data-lang");
      applyLanguage(selected);
      langDropdown.classList.remove("open");
      langMenu.classList.add("hidden");
    });
  });

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
      return date.toLocaleDateString(currentLang === "pt" ? "pt-BR" : currentLang === "es" ? "es-ES" : "en-US", {
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
        statusText.textContent = t("status_connected", { name: data.bucket.name });

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
      statusText.textContent = t("status_offline");
    }
  }

  // Fetch Photos
  async function fetchPhotos() {
    photoCounter.textContent = t("loading_vault");
    try {
      const res = await fetch("/api/photos");
      const data = await res.json();
      if (data.success) {
        state.photos = data.photos || [];
        renderPhotos();
      } else {
        photoCounter.textContent = t("sync_failed");
      }
    } catch (err) {
      console.error("Failed to load photos:", err);
      photoCounter.textContent = t("conn_error");
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

    const count = state.photos.length;
    const word = count === 1 ? t("word_single") : t("word_plural");
    photoCounter.textContent = t("photo_counter", { count, word });

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
    metaBlobId.textContent = photo.blob_id || t("anchored_walrus");
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
    const confirmDelete = confirm(t("delete_confirm", { name: state.selectedPhoto.name }));
    if (!confirmDelete) return;

    const fileId = state.selectedPhoto.id;
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = `<div class="spinner-sm"></div> ${t("deleting")}`;

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
      deleteBtn.innerHTML = `<i data-lucide="trash-2"></i> ${t("delete_btn")}`;
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
      progressTitle.textContent = `${t("progress_title")} (${i + 1}/${files.length})`;
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
  applyLanguage(currentLang);
  fetchStatus();
  fetchPhotos();
});
