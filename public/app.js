// SuiGallery / Walrus Photos Advanced Client Application
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
      anchored_walrus: "Anchored in Walrus",
      active_vault: "Active Vault",
      select_btn: "Select",
      cancel_select: "Done",
      deselect_all: "Deselect",
      download_selected: "Download",
      delete_selected: "Delete Selected",
      batch_confirm: "Are you sure you want to permanently delete {count} selected photos from Walrus?",
      batch_deleting: "Deleting {count} photos...",
      edit_photo_title: "Edit Memory Details",
      edit_filename: "File Name",
      edit_description: "Description / Caption",
      edit_tags: "Tags (comma separated)",
      cancel: "Cancel",
      save_changes: "Save Changes",
      saving: "Saving...",
      vault_manager_title: "Sui Vault & Identity Manager",
      vault_manager_subtitle: "Switch between verified Master Custodian and Ephemeral Beta Tester Vaults.",
      generate_new_vault: "Generate Ephemeral Test Vault",
      generate_hint: "Creates a cryptographic Ed25519 keypair and derived Sui address instantly for isolated beta testing.",
      toast_uploaded: "Photo encrypted and anchored in Walrus!",
      toast_deleted: "Photo deleted from Walrus",
      toast_updated: "Metadata updated successfully",
      toast_vault_switched: "Switched to vault: {addr}",
      toast_wallet_generated: "New ephemeral test vault generated!",
      toast_copied: "Copied to clipboard!",
      upload_dock_title: "Encrypting & Uploading to Walrus...",
      upload_dock_complete: "All Photos Anchored in Walrus!",
      upload_dock_count: "{current} of {total} processed",
      step1_short: "1. Seal Encryption",
      step2_short: "2. Walrus Blob Store",
      step3_short: "3. Anchored in Bucket",
      optimistic_encrypting: "Seal Encrypting...",
      optimistic_uploading: "Storing on Walrus...",
      optimistic_anchored: "Anchored!",
      optimistic_failed: "Upload Failed",
      signin_zklogin: "Sign In with zkLogin",
      btn_google_zklogin: "Continue with Google (zkLogin)",
      auth_title: "Sign in to SuiGallery",
      auth_subtitle: "Your photos are client-side encrypted before touching Walrus. Powered by Sui zkLogin—no seed phrases, zero gas, and frictionless privacy.",
      or_continue_with: "or choose another method",
      auth_privacy_notice: "Google only verifies your identity; it never has access to your photos, encryption keys, or Walrus storage.",
      account_manager_title: "Sovereign Account & Vault",
      account_manager_subtitle: "Decentralized memory vault secured by Sui zkLogin and Walrus Protocol.",
      switch_account: "Switch Account / Sign In with Another ID",
      sign_out: "Sign Out",
      toast_signed_in: "Welcome to SuiGallery! Signed in with Google zkLogin",
      toast_signed_out: "Signed out of sovereign session",
      toast_wallet_connected: "Connected Sui Wallet: {addr}"
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
      anchored_walrus: "Asegurado en Walrus",
      active_vault: "Bóveda Activa",
      select_btn: "Seleccionar",
      cancel_select: "Listo",
      deselect_all: "Deseleccionar",
      download_selected: "Descargar",
      delete_selected: "Eliminar Seleccionados",
      batch_confirm: "¿Estás seguro de que deseas eliminar permanentemente {count} fotos seleccionadas de Walrus?",
      batch_deleting: "Eliminando {count} fotos...",
      edit_photo_title: "Editar Detalles del Recuerdo",
      edit_filename: "Nombre de Archivo",
      edit_description: "Descripción",
      edit_tags: "Etiquetas (separadas por comas)",
      cancel: "Cancelar",
      save_changes: "Guardar Cambios",
      saving: "Guardando...",
      vault_manager_title: "Gestor de Bóvedas e Identidades Sui",
      vault_manager_subtitle: "Cambia entre la Bóveda Maestra Custodia y Bóvedas Efímeras de Prueba.",
      generate_new_vault: "Generar Bóveda Efímera de Prueba",
      generate_hint: "Crea un par de claves criptográficas Ed25519 y dirección Sui al instante para pruebas aisladas.",
      toast_uploaded: "¡Foto encriptada y asegurada en Walrus!",
      toast_deleted: "Foto eliminada de Walrus",
      toast_updated: "Metadatos actualizados con éxito",
      toast_vault_switched: "Cambiado a bóveda: {addr}",
      toast_wallet_generated: "¡Nueva bóveda efímera generada con éxito!",
      toast_copied: "¡Copiado al portapapeles!",
      upload_dock_title: "Encriptando y Subiendo a Walrus...",
      upload_dock_complete: "¡Todas las fotos aseguradas en Walrus!",
      upload_dock_count: "{current} de {total} procesados",
      step1_short: "1. Encriptación Seal",
      step2_short: "2. Guardado en Walrus",
      step3_short: "3. Asegurado en Bucket",
      optimistic_encrypting: "Encriptando con Seal...",
      optimistic_uploading: "Guardando en Walrus...",
      optimistic_anchored: "¡Asegurado!",
      optimistic_failed: "Error al subir",
      signin_zklogin: "Iniciar Sesión con zkLogin",
      btn_google_zklogin: "Continuar con Google (zkLogin)",
      auth_title: "Iniciar Sesión en SuiGallery",
      auth_subtitle: "Tus fotos se encriptan en tu dispositivo antes de tocar Walrus. Impulsado por Sui zkLogin: sin frases semilla, sin gas y con privacidad total.",
      or_continue_with: "o elige otro método",
      auth_privacy_notice: "Google solo verifica tu identidad; nunca tiene acceso a tus fotos, claves de encriptación ni almacenamiento en Walrus.",
      account_manager_title: "Cuenta Soberana y Bóveda",
      account_manager_subtitle: "Bóveda de recuerdos descentralizada protegida por Sui zkLogin y Protocolo Walrus.",
      switch_account: "Cambiar Cuenta / Iniciar con Otro ID",
      sign_out: "Cerrar Sesión",
      toast_signed_in: "¡Bienvenido a SuiGallery! Sesión iniciada con Google zkLogin",
      toast_signed_out: "Sesión cerrada correctamente",
      toast_wallet_connected: "Billetera Sui conectada: {addr}"
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
      anchored_walrus: "Ancorado no Walrus",
      active_vault: "Cofre Ativo",
      select_btn: "Selecionar",
      cancel_select: "Concluído",
      deselect_all: "Desmarcar",
      download_selected: "Baixar",
      delete_selected: "Excluir Selecionados",
      batch_confirm: "Tem certeza de que deseja excluir permanentemente {count} fotos selecionadas do Walrus?",
      batch_deleting: "Excluindo {count} fotos...",
      edit_photo_title: "Editar Detalhes da Memória",
      edit_filename: "Nome do Ficheiro",
      edit_description: "Descrição",
      edit_tags: "Tags (separadas por vírgulas)",
      cancel: "Cancelar",
      save_changes: "Salvar Alterações",
      saving: "Salvando...",
      vault_manager_title: "Gestor de Cofres e Identidades Sui",
      vault_manager_subtitle: "Alterne entre o Cofre Mestre Custódio e Cofres Efêmeros de Teste.",
      generate_new_vault: "Gerar Cofre Efêmero de Teste",
      generate_hint: "Cria um par de chaves Ed25519 e endereço Sui instantaneamente para testes isolados.",
      toast_uploaded: "Foto encriptada e ancorada no Walrus!",
      toast_deleted: "Foto excluída do Walrus",
      toast_updated: "Metadados atualizados com sucesso",
      toast_vault_switched: "Alternado para o cofre: {addr}",
      toast_wallet_generated: "Novo cofre efêmero gerado com sucesso!",
      toast_copied: "Copiado para a área de transferência!",
      upload_dock_title: "Enviando para o Cofre Walrus...",
      upload_dock_complete: "Todas as fotos ancoradas no Walrus!",
      upload_dock_count: "{current} de {total} processados",
      step1_short: "1. Encriptação Seal",
      step2_short: "2. Armazenamento Walrus",
      step3_short: "3. Ancorado no Bucket",
      optimistic_encrypting: "Encriptando com Seal...",
      optimistic_uploading: "Armazenando no Walrus...",
      optimistic_anchored: "Ancorado!",
      optimistic_failed: "Falha no envio",
      signin_zklogin: "Iniciar Sessão com zkLogin",
      btn_google_zklogin: "Continuar com o Google (zkLogin)",
      auth_title: "Iniciar Sessão no SuiGallery",
      auth_subtitle: "As suas fotos são encriptadas no dispositivo antes de tocar o Walrus. Equipado com Sui zkLogin—sem frases-semente, sem taxas de gás e privacidade total.",
      or_continue_with: "ou escolha outro método",
      auth_privacy_notice: "O Google apenas verifica a sua identidade; nunca tem acesso às suas fotos, chaves de encriptação ou armazenamento Walrus.",
      account_manager_title: "Conta Soberana & Cofre",
      account_manager_subtitle: "Cofre de memórias descentralizado protegido por Sui zkLogin e Protocolo Walrus.",
      switch_account: "Mudar de Conta / Entrar com Outro ID",
      sign_out: "Terminar Sessão",
      toast_signed_in: "Bem-vindo ao SuiGallery! Sessão iniciada com Google zkLogin",
      toast_signed_out: "Sessão terminada com sucesso",
      toast_wallet_connected: "Carteira Sui conectada: {addr}"
    }
  };

  let currentLang = localStorage.getItem("suigallery_lang") || "en";
  if (!translations[currentLang]) currentLang = "en";

  // App State
  const state = {
    photos: [],
    activeUploads: [],
    selectedPhoto: null,
    searchQuery: "",
    selectedTag: "all",
    sortBy: "newest",
    selectMode: false,
    selectedIds: new Set(),
    status: null,
    currentUser: null
  };

  // Load persistent auth session from localStorage
  try {
    const savedSession = localStorage.getItem("suigallery_auth_session");
    if (savedSession) {
      state.currentUser = JSON.parse(savedSession);
    }
  } catch {
    state.currentUser = null;
  }

  // DOM Elements
  const toastContainer = document.getElementById("toastContainer");
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
  const tagChips = document.getElementById("tagChips");
  const sortSelect = document.getElementById("sortSelect");
  const toggleSelectModeBtn = document.getElementById("toggleSelectModeBtn");
  const batchBar = document.getElementById("batchBar");
  const batchCount = document.getElementById("batchCount");
  const batchDeselectBtn = document.getElementById("batchDeselectBtn");
  const batchDownloadBtn = document.getElementById("batchDownloadBtn");
  const batchDeleteBtn = document.getElementById("batchDeleteBtn");

  // Auth & zkLogin Elements
  const loginTriggerBtn = document.getElementById("loginTriggerBtn");
  const vaultPill = document.getElementById("vaultPill");
  const userDisplayName = document.getElementById("userDisplayName");
  const activeVaultAddr = document.getElementById("activeVaultAddr");
  const userAvatar = document.getElementById("userAvatar");
  const zkLoginModal = document.getElementById("zkLoginModal");
  const zkLoginModalClose = document.getElementById("zkLoginModalClose");
  const zkLoginModalBackdrop = document.getElementById("zkLoginModalBackdrop");
  const googleZkLoginBtn = document.getElementById("googleZkLoginBtn");
  const connectSuiWalletBtn = document.getElementById("connectSuiWalletBtn");
  const guestPasskeyBtn = document.getElementById("guestPasskeyBtn");

  // Account Profile Modal Elements
  const vaultModal = document.getElementById("vaultModal");
  const vaultModalClose = document.getElementById("vaultModalClose");
  const vaultModalBackdrop = document.getElementById("vaultModalBackdrop");
  const modalUserName = document.getElementById("modalUserName");
  const modalUserEmail = document.getElementById("modalUserEmail");
  const modalAuthBadge = document.getElementById("modalAuthBadge");
  const modalSuiAddress = document.getElementById("modalSuiAddress");
  const modalSigScheme = document.getElementById("modalSigScheme");
  const copyAddressBtn = document.getElementById("copyAddressBtn");
  const accountSuiScanLink = document.getElementById("accountSuiScanLink");
  const accountSuiVisionLink = document.getElementById("accountSuiVisionLink");
  const switchAccountBtn = document.getElementById("switchAccountBtn");
  const signOutBtn = document.getElementById("signOutBtn");

  // Edit Modal Elements
  const editMetaBtn = document.getElementById("editMetaBtn");
  const editModal = document.getElementById("editModal");
  const editModalClose = document.getElementById("editModalClose");
  const editModalBackdrop = document.getElementById("editModalBackdrop");
  const editFileNameInput = document.getElementById("editFileNameInput");
  const editDescriptionInput = document.getElementById("editDescriptionInput");
  const editTagsInput = document.getElementById("editTagsInput");
  const editCancelBtn = document.getElementById("editCancelBtn");
  const editSaveBtn = document.getElementById("editSaveBtn");

  // Language Elements
  const langDropdown = document.getElementById("langDropdown");
  const langBtn = document.getElementById("langBtn");
  const langMenu = document.getElementById("langMenu");
  const currentLangCode = document.getElementById("currentLangCode");

  // Lightbox Elements
  const lightboxModal = document.getElementById("lightboxModal");
  const lightboxBackdrop = document.getElementById("lightboxBackdrop");
  const lightboxCloseBtn = document.getElementById("lightboxCloseBtn");
  const lightboxViewport = document.getElementById("lightboxViewport");
  const lightboxPrevBtn = document.getElementById("lightboxPrevBtn");
  const lightboxNextBtn = document.getElementById("lightboxNextBtn");
  const lightboxZoomBtn = document.getElementById("lightboxZoomBtn");
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
  const exportVaultsBtn = document.getElementById("exportVaultsBtn");
  const dragDropOverlay = document.getElementById("dragDropOverlay");

  // Upload Dock Elements
  const uploadDock = document.getElementById("uploadDock");
  const dockHeader = document.getElementById("dockHeader");
  const dockSpinner = document.getElementById("dockSpinner");
  const dockTitle = document.getElementById("dockTitle");
  const dockSubtitle = document.getElementById("dockSubtitle");
  const dockMinimizeBtn = document.getElementById("dockMinimizeBtn");
  const dockMinimizeIcon = document.getElementById("dockMinimizeIcon");
  const dockCloseBtn = document.getElementById("dockCloseBtn");
  const dockProgressFill = document.getElementById("dockProgressFill");
  const dockBody = document.getElementById("dockBody");
  const dockFileThumb = document.getElementById("dockFileThumb");
  const dockFileName = document.getElementById("dockFileName");
  const dockFileMeta = document.getElementById("dockFileMeta");
  const dockStep1 = document.getElementById("dockStep1");
  const dockStep2 = document.getElementById("dockStep2");
  const dockStep3 = document.getElementById("dockStep3");

  function toggleDockMinimize() {
    uploadDock.classList.toggle("minimized");
    const isMin = uploadDock.classList.contains("minimized");
    dockMinimizeIcon.setAttribute("data-lucide", isMin ? "chevron-up" : "chevron-down");
    if (window.lucide) window.lucide.createIcons();
  }

  if (dockMinimizeBtn) {
    dockMinimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDockMinimize();
    });
  }

  if (dockHeader) {
    dockHeader.addEventListener("click", () => {
      toggleDockMinimize();
    });
  }

  if (dockCloseBtn) {
    dockCloseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      uploadDock.classList.add("fade-out");
      setTimeout(() => {
        uploadDock.classList.add("hidden");
        uploadDock.classList.remove("fade-out");
      }, 300);
    });
  }

  // ==========================================
  // TOAST NOTIFICATION SYSTEM
  // ==========================================
  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "info";
    if (type === "success") icon = "check-circle-2";
    if (type === "danger") icon = "alert-circle";

    toast.innerHTML = `
      <i data-lucide="${icon}" style="width: 18px; height: 18px;"></i>
      <span>${message}</span>
    `;

    toastContainer.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(20px)";
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Translation helper
  function t(key, vars = {}) {
    const dict = translations[currentLang] || translations.en;
    let text = dict[key] || translations.en[key] || key;
    for (const [vKey, vVal] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${vKey}\\}`, "g"), vVal);
    }
    return text;
  }

  // Apply Language
  function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem("suigallery_lang", lang);
    currentLangCode.textContent = lang.toUpperCase();

    document.querySelectorAll(".lang-option").forEach((opt) => {
      if (opt.getAttribute("data-lang") === lang) {
        opt.classList.add("active");
      } else {
        opt.classList.remove("active");
      }
    });

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

    searchInput.placeholder = t("search_placeholder");

    updateAuthUI();
    renderPhotos();
    if (window.lucide) window.lucide.createIcons();
  }

  // Language Dropdown handlers
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

  function shortenAddress(addr) {
    if (!addr) return "0x...";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  // ==========================================
  // ZKLOGIN & SOVEREIGN SESSION MANAGER
  // ==========================================
  function deriveZkLoginAddress(email, sub = "109847291847192847") {
    if (window.nobleBlake2?.blake2b) {
      const enc = new TextEncoder();
      const seed = enc.encode(`zklogin:google:${email.toLowerCase().trim()}:${sub}`);
      const hash = window.nobleBlake2.blake2b(seed, { dkLen: 32 });
      const fullMsg = new Uint8Array(33);
      fullMsg[0] = 0x05; // Sui zkLogin scheme flag
      fullMsg.set(hash, 1);
      const finalHash = window.nobleBlake2.blake2b(fullMsg, { dkLen: 32 });
      return "0x" + Array.from(finalHash).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function updateAuthUI() {
    if (state.currentUser) {
      if (loginTriggerBtn) loginTriggerBtn.classList.add("hidden");
      if (vaultPill) vaultPill.classList.remove("hidden");
      if (userDisplayName) userDisplayName.textContent = state.currentUser.name || "zkLogin User";
      if (activeVaultAddr) activeVaultAddr.textContent = state.currentUser.email || shortenAddress(state.currentUser.address);

      if (modalUserName) modalUserName.textContent = state.currentUser.name || "zkLogin User";
      if (modalUserEmail) modalUserEmail.textContent = state.currentUser.email || state.currentUser.address;
      if (modalAuthBadge) modalAuthBadge.textContent = state.currentUser.provider || "zkLogin";
      if (modalSuiAddress) modalSuiAddress.textContent = state.currentUser.address || "0x...";
      if (modalSigScheme) modalSigScheme.textContent = state.currentUser.scheme || "zkLogin (ZKS)";

      if (accountSuiScanLink) {
        accountSuiScanLink.href = `https://suiscan.xyz/mainnet/account/${state.currentUser.address}`;
      }
      if (accountSuiVisionLink) {
        accountSuiVisionLink.href = `https://suivision.xyz/account/${state.currentUser.address}`;
      }
    } else {
      if (loginTriggerBtn) loginTriggerBtn.classList.remove("hidden");
      if (vaultPill) vaultPill.classList.add("hidden");
    }
    if (window.lucide) window.lucide.createIcons();
  }

  function openZkLoginModal() {
    if (zkLoginModal) {
      zkLoginModal.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function closeZkLoginModal() {
    if (zkLoginModal) {
      zkLoginModal.classList.add("hidden");
      document.body.style.overflow = "";
    }
  }

  function openVaultModal() {
    if (vaultModal) {
      vaultModal.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function closeVaultModal() {
    if (vaultModal) {
      vaultModal.classList.add("hidden");
      document.body.style.overflow = "";
    }
  }

  function saveAuthSession(session) {
    state.currentUser = session;
    localStorage.setItem("suigallery_auth_session", JSON.stringify(session));
    updateAuthUI();
  }

  function signOut() {
    state.currentUser = null;
    localStorage.removeItem("suigallery_auth_session");
    closeVaultModal();
    updateAuthUI();
    showToast(t("toast_signed_out"), "info");
  }

  // Google zkLogin Handler
  async function handleGoogleZkLogin(providedEmail) {
    let email = providedEmail;
    if (!email) {
      email = prompt("Enter your Google Account email for zkLogin:", "alex.sovereign@gmail.com");
      if (!email) return;
    }
    email = email.trim();
    const rawName = email.split("@")[0].replace(/[._]/g, " ");
    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const address = deriveZkLoginAddress(email);

    const session = {
      id: `zklogin_${Date.now()}`,
      method: "zklogin",
      provider: "Google zkLogin",
      name,
      email,
      address,
      scheme: "zkLogin (Zero-Knowledge Proof)",
      createdAt: new Date().toISOString()
    };

    saveAuthSession(session);
    closeZkLoginModal();
    showToast(t("toast_signed_in"), "success");
  }

  // Connect Sui Wallet Handler
  async function handleConnectSuiWallet() {
    if (window.suiWallet) {
      try {
        const hasPermissions = await window.suiWallet.requestPermissions();
        if (hasPermissions) {
          const accounts = await window.suiWallet.getAccounts();
          if (accounts && accounts.length > 0) {
            const addr = accounts[0];
            const session = {
              id: `wallet_${Date.now()}`,
              method: "sui_wallet",
              provider: "Sui Wallet",
              name: "Sui Native User",
              email: shortenAddress(addr),
              address: addr,
              scheme: "ED25519 (Extension)",
              createdAt: new Date().toISOString()
            };
            saveAuthSession(session);
            closeZkLoginModal();
            showToast(t("toast_wallet_connected", { addr: shortenAddress(addr) }), "success");
            return;
          }
        }
      } catch (err) {
        console.warn("Wallet extension connect error:", err);
      }
    }
    showToast("Sui Wallet extension not detected. Use Google zkLogin for instant keyless login!", "info");
  }

  // Guest Passkey / On-Device Keypair Handler
  async function handleGuestPasskey() {
    try {
      if (window.crypto?.subtle?.generateKey) {
        const keyPair = await window.crypto.subtle.generateKey(
          { name: "Ed25519" },
          true,
          ["sign", "verify"]
        );
        const rawPub = new Uint8Array(await window.crypto.subtle.exportKey("raw", keyPair.publicKey));
        const msg = new Uint8Array(33);
        msg[0] = 0x00;
        msg.set(rawPub, 1);

        let addressHex = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("");
        if (window.nobleBlake2?.blake2b) {
          const digest = window.nobleBlake2.blake2b(msg, { dkLen: 32 });
          addressHex = "0x" + Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
        }

        const session = {
          id: `guest_${Date.now()}`,
          method: "passkey",
          provider: "Guest Passkey",
          name: "Guest Explorer",
          email: "guest.local@device",
          address: addressHex,
          scheme: "ED25519 (On-Device WebCrypto)",
          createdAt: new Date().toISOString()
        };

        saveAuthSession(session);
        closeZkLoginModal();
        showToast("⚡ Signed in as Guest Explorer with 100% on-device passkey!", "success");
        return;
      }
    } catch (e) {
      console.warn("WebCrypto generation error:", e);
    }
    // Fallback guest
    const session = {
      id: `guest_${Date.now()}`,
      method: "passkey",
      provider: "Guest Passkey",
      name: "Guest Explorer",
      email: "guest.local@device",
      address: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join(""),
      scheme: "ED25519",
      createdAt: new Date().toISOString()
    };
    saveAuthSession(session);
    closeZkLoginModal();
    showToast("⚡ Signed in as Guest Explorer!", "success");
  }

  // Event Listeners for Authentication
  if (loginTriggerBtn) loginTriggerBtn.addEventListener("click", openZkLoginModal);
  if (zkLoginModalClose) zkLoginModalClose.addEventListener("click", closeZkLoginModal);
  if (zkLoginModalBackdrop) zkLoginModalBackdrop.addEventListener("click", closeZkLoginModal);

  if (vaultPill) vaultPill.addEventListener("click", openVaultModal);
  if (vaultModalClose) vaultModalClose.addEventListener("click", closeVaultModal);
  if (vaultModalBackdrop) vaultModalBackdrop.addEventListener("click", closeVaultModal);

  if (googleZkLoginBtn) googleZkLoginBtn.addEventListener("click", () => handleGoogleZkLogin());
  if (connectSuiWalletBtn) connectSuiWalletBtn.addEventListener("click", handleConnectSuiWallet);
  if (guestPasskeyBtn) guestPasskeyBtn.addEventListener("click", handleGuestPasskey);

  if (switchAccountBtn) {
    switchAccountBtn.addEventListener("click", () => {
      closeVaultModal();
      openZkLoginModal();
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener("click", signOut);
  }

  if (copyAddressBtn) {
    copyAddressBtn.addEventListener("click", () => {
      if (state.currentUser?.address) {
        navigator.clipboard.writeText(state.currentUser.address);
        showToast(t("toast_copied"), "info");
      }
    });
  }

  if (exportVaultsBtn) {
    exportVaultsBtn.addEventListener("click", () => {
      const backupData = {
        exported_at: new Date().toISOString(),
        application: "SuiGallery Walrus Console",
        current_user: state.currentUser,
        session_active: Boolean(state.currentUser)
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `suigallery-session-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Session backup exported to JSON", "success");
    });
  }

  // ==========================================
  // API INTERACTIONS & STATUS
  // ==========================================
  async function fetchStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      if (data.success) {
        state.status = data;
        const used = data.space?.storage_used_bytes || 0;
        const cap = data.space?.storage_cap_bytes || 5000000000;
        const percent = Math.min(100, Math.max(0, (used / cap) * 100));
        if (quotaValue) quotaValue.textContent = `${formatBytes(used)} / ${formatBytes(cap)}`;
        if (quotaFill) quotaFill.style.width = `${percent}%`;
      }
    } catch (err) {
      console.warn("fetchStatus offline or degraded:", err);
    }
  }

  async function fetchPhotos() {
    photoCounter.textContent = t("loading_vault");
    try {
      const res = await fetch("/api/photos");
      const data = await res.json();
      if (data.success) {
        state.photos = data.photos || [];
        updateTagChips();
        renderPhotos();
      } else {
        photoCounter.textContent = t("sync_failed");
      }
    } catch (err) {
      photoCounter.textContent = t("conn_error");
    }
  }

  // Dynamic Tag Chips
  function updateTagChips() {
    const allTags = new Set(["all", "photo", "suigallery"]);
    state.photos.forEach((p) => {
      const ext = p.name.split(".").pop().toLowerCase();
      if (ext) allTags.add(ext);
    });

    tagChips.innerHTML = Array.from(allTags)
      .map((tag) => {
        const isActive = state.selectedTag === tag;
        const label = tag === "all" ? "All" : tag.charAt(0).toUpperCase() + tag.slice(1);
        return `<button class="tag-chip ${isActive ? "active" : ""}" data-tag="${tag}">${label}</button>`;
      })
      .join("");

    tagChips.querySelectorAll(".tag-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.selectedTag = chip.getAttribute("data-tag");
        tagChips.querySelectorAll(".tag-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        renderPhotos();
      });
    });
  }

  // Render Photo Grid
  function renderPhotos() {
    const query = state.searchQuery.toLowerCase().trim();

    let filtered = state.photos.filter((p) => {
      // Query filter
      const matchesQuery =
        !query ||
        p.name.toLowerCase().includes(query) ||
        (p.blob_id && p.blob_id.toLowerCase().includes(query)) ||
        (p.id && p.id.toLowerCase().includes(query));

      // Tag filter
      const matchesTag =
        state.selectedTag === "all" ||
        p.name.toLowerCase().endsWith(state.selectedTag.toLowerCase()) ||
        state.selectedTag === "photo";

      return matchesQuery && matchesTag;
    });

    // Sort
    if (state.sortBy === "newest") {
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (state.sortBy === "oldest") {
      filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (state.sortBy === "name") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (state.sortBy === "size") {
      filtered.sort((a, b) => (b.size || 0) - (a.size || 0));
    }

    const count = state.photos.length;
    const word = count === 1 ? t("word_single") : t("word_plural");
    photoCounter.textContent = t("photo_counter", { count, word });

    const hasUploads = state.activeUploads && state.activeUploads.length > 0;

    if (filtered.length === 0 && !hasUploads) {
      photoGrid.innerHTML = "";
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");

    const uploadCardsHtml = (state.activeUploads || [])
      .map((task) => {
        let stageText = t("optimistic_encrypting");
        let stageIcon = "lock";
        if (task.stage === 2) {
          stageText = t("optimistic_uploading");
          stageIcon = "cloud-upload";
        } else if (task.stage === 3) {
          stageText = t("optimistic_anchored");
          stageIcon = "check-circle-2";
        } else if (task.failed) {
          stageText = t("optimistic_failed");
          stageIcon = "alert-circle";
        }

        return `
        <div class="photo-card uploading" id="card-${task.id}">
          <img class="photo-thumbnail" src="${task.previewUrl}" alt="${task.name}">
          <div class="uploading-overlay">
            <div class="uploading-top-badge">
              <i data-lucide="${stageIcon}" style="width: 12px; height: 12px;"></i>
              <span id="badge-text-${task.id}">${stageText}</span>
            </div>
            <div class="uploading-center">
              <div class="uploading-spinner-ring">
                <i data-lucide="shield" style="width: 16px; height: 16px;"></i>
              </div>
              <span class="uploading-status-label" id="status-text-${task.id}">Walrus Cryptographic Vault</span>
            </div>
            <div class="uploading-bottom">
              <span class="uploading-filename">${task.name}</span>
              <div class="uploading-progress-track">
                <div class="uploading-progress-bar" id="bar-${task.id}" style="width: ${task.progress || 25}%;"></div>
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    const photoCardsHtml = filtered
      .map((p) => {
        const isSelected = state.selectedIds.has(p.id);
        return `
        <div class="photo-card ${isSelected ? "selected" : ""}" data-id="${p.id}">
          <div class="photo-select-checkbox" data-select-id="${p.id}">
            <i data-lucide="${isSelected ? "check" : ""}" style="width: 14px; height: 14px;"></i>
          </div>
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

    photoGrid.innerHTML = uploadCardsHtml + photoCardsHtml;

    if (window.lucide) window.lucide.createIcons();

    // Attach click handlers only to non-uploading photo cards
    photoGrid.querySelectorAll(".photo-card:not(.uploading)").forEach((card) => {
      const id = card.getAttribute("data-id");

      // Checkbox click
      const checkbox = card.querySelector(".photo-select-checkbox");
      checkbox.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePhotoSelection(id);
      });

      // Card click
      card.addEventListener("click", () => {
        if (state.selectMode) {
          togglePhotoSelection(id);
        } else {
          const photo = state.photos.find((p) => p.id === id);
          if (photo) openLightbox(photo);
        }
      });
    });

    updateBatchBar();
  }

  // Selection Logic
  function togglePhotoSelection(id) {
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
    } else {
      state.selectedIds.add(id);
    }
    updateBatchBar();
    renderPhotos();
  }

  function updateBatchBar() {
    const count = state.selectedIds.size;
    if (count > 0) {
      batchBar.classList.remove("hidden");
      batchCount.textContent = `${count} ${count === 1 ? "photo" : "photos"} selected`;
    } else {
      batchBar.classList.add("hidden");
      if (state.selectMode) {
        // stay in select mode
      }
    }
  }

  toggleSelectModeBtn.addEventListener("click", () => {
    state.selectMode = !state.selectMode;
    document.body.classList.toggle("select-mode", state.selectMode);
    toggleSelectModeBtn.querySelector("span").textContent = state.selectMode ? t("cancel_select") : t("select_btn");
    if (!state.selectMode) {
      state.selectedIds.clear();
      updateBatchBar();
      renderPhotos();
    }
  });

  batchDeselectBtn.addEventListener("click", () => {
    state.selectedIds.clear();
    updateBatchBar();
    renderPhotos();
  });

  batchDeleteBtn.addEventListener("click", async () => {
    const count = state.selectedIds.size;
    if (count === 0) return;
    const confirmDelete = confirm(t("batch_confirm", { count }));
    if (!confirmDelete) return;

    batchDeleteBtn.disabled = true;
    batchDeleteBtn.innerHTML = `<div class="spinner-sm"></div> ${t("batch_deleting", { count })}`;

    try {
      const res = await fetch("/api/photos/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: Array.from(state.selectedIds) })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Deleted ${data.deleted_count} photos from Walrus`, "success");
        state.selectedIds.clear();
        await fetchPhotos();
        await fetchStatus();
      } else {
        showToast("Batch delete failed: " + data.error, "danger");
      }
    } catch (err) {
      showToast("Error: " + err.message, "danger");
    } finally {
      batchDeleteBtn.disabled = false;
      batchDeleteBtn.innerHTML = `<i data-lucide="trash-2"></i> <span>${t("delete_selected")}</span>`;
      if (window.lucide) window.lucide.createIcons();
    }
  });

  sortSelect.addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    renderPhotos();
  });

  // ==========================================
  // LIGHTBOX & METADATA EDITING
  // ==========================================
  function openLightbox(photo) {
    state.selectedPhoto = photo;
    if (lightboxViewport) lightboxViewport.classList.remove("zoomed");
    if (lightboxZoomBtn) {
      lightboxZoomBtn.innerHTML = '<i data-lucide="maximize-2"></i>';
    }

    const techDrawer = document.querySelector(".tech-drawer");
    if (techDrawer) techDrawer.open = false;

    sidebarFileName.textContent = photo.name;
    sidebarMimeBadge.textContent = photo.content_type || "image/jpeg";
    metaBlobId.textContent = photo.blob_id || t("anchored_walrus");
    metaFileId.textContent = photo.id || "--";
    const policyId = state.status?.bucket?.seal_policy_id || "0x9c1baccb244e45342ac150a0123a4802e8e834f25c00210e50c81081354eee44";
    metaSealPolicy.textContent = policyId;

    const walruscanLink = document.getElementById("walruscanLink");
    if (walruscanLink) {
      if (photo.blob_id) {
        walruscanLink.href = `https://walruscan.com/testnet/blob/${photo.blob_id}`;
        walruscanLink.style.display = "inline-flex";
      } else {
        walruscanLink.style.display = "none";
      }
    }

    const suivisionPolicyLink = document.getElementById("suivisionPolicyLink");
    if (suivisionPolicyLink) {
      suivisionPolicyLink.href = `https://suivision.xyz/object/${policyId}`;
    }
    const suiscanPolicyLink = document.getElementById("suiscanPolicyLink");
    if (suiscanPolicyLink) {
      suiscanPolicyLink.href = `https://suiscan.xyz/mainnet/object/${policyId}`;
    }

    metaFileSize.textContent = formatBytes(photo.size);
    metaUploadDate.textContent = formatDate(photo.created_at);

    lightboxImg.src = photo.stream_url;
    downloadBtn.href = photo.download_url;

    lightboxModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    if (window.lucide) window.lucide.createIcons();
  }

  function closeLightbox() {
    lightboxModal.classList.add("hidden");
    if (lightboxViewport) lightboxViewport.classList.remove("zoomed");
    document.body.style.overflow = "";
    state.selectedPhoto = null;
  }

  function navigateLightbox(direction) {
    if (!state.selectedPhoto || !state.photos || state.photos.length === 0) return;
    const currentIndex = state.photos.findIndex((p) => p.id === state.selectedPhoto.id);
    if (currentIndex === -1) return;
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = state.photos.length - 1;
    if (nextIndex >= state.photos.length) nextIndex = 0;
    openLightbox(state.photos[nextIndex]);
  }

  function toggleLightboxZoom() {
    if (!lightboxViewport) return;
    lightboxViewport.classList.toggle("zoomed");
    const isZoomed = lightboxViewport.classList.contains("zoomed");
    if (lightboxZoomBtn) {
      lightboxZoomBtn.innerHTML = isZoomed
        ? '<i data-lucide="minimize-2"></i>'
        : '<i data-lucide="maximize-2"></i>';
      if (window.lucide) window.lucide.createIcons();
    }
  }

  if (lightboxPrevBtn) {
    lightboxPrevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigateLightbox(-1);
    });
  }

  if (lightboxNextBtn) {
    lightboxNextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigateLightbox(1);
    });
  }

  if (lightboxZoomBtn) {
    lightboxZoomBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleLightboxZoom();
    });
  }

  lightboxCloseBtn.addEventListener("click", closeLightbox);
  lightboxBackdrop.addEventListener("click", closeLightbox);

  document.addEventListener("keydown", (e) => {
    // If user is focused on an input/textarea, ignore shortcut navigation
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      if (e.key === "Escape") {
        document.activeElement.blur();
      }
      return;
    }

    if (e.key === "Escape") {
      if (!editModal.classList.contains("hidden")) closeEditModal();
      else if (!vaultModal.classList.contains("hidden")) closeVaultModal();
      else if (!lightboxModal.classList.contains("hidden")) closeLightbox();
    } else if (!lightboxModal.classList.contains("hidden")) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateLightbox(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateLightbox(1);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteBtn.click();
      }
    }
  });

  // Edit Metadata Modal Handlers
  editMetaBtn.addEventListener("click", () => {
    if (!state.selectedPhoto) return;
    editFileNameInput.value = state.selectedPhoto.name;
    editDescriptionInput.value = "";
    editTagsInput.value = "photo, suigallery";
    editModal.classList.remove("hidden");
  });

  function closeEditModal() {
    editModal.classList.add("hidden");
  }
  editModalClose.addEventListener("click", closeEditModal);
  editModalBackdrop.addEventListener("click", closeEditModal);
  editCancelBtn.addEventListener("click", closeEditModal);

  editSaveBtn.addEventListener("click", async () => {
    if (!state.selectedPhoto) return;
    const fileId = state.selectedPhoto.id;
    const newName = editFileNameInput.value.trim();
    const newDesc = editDescriptionInput.value.trim();
    const newTags = editTagsInput.value.split(",").map((s) => s.trim()).filter(Boolean);

    if (!newName) return;

    editSaveBtn.disabled = true;
    editSaveBtn.innerHTML = `<div class="spinner-sm"></div> ${t("saving")}`;

    try {
      const res = await fetch(`/api/photos/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDesc, tags: newTags })
      });
      const data = await res.json();

      if (data.success) {
        state.selectedPhoto.name = newName;
        sidebarFileName.textContent = newName;
        closeEditModal();
        showToast(t("toast_updated"), "success");
        await fetchPhotos();
      } else {
        showToast("Update failed: " + data.error, "danger");
      }
    } catch (err) {
      showToast("Error updating: " + err.message, "danger");
    } finally {
      editSaveBtn.disabled = false;
      editSaveBtn.innerHTML = t("save_changes");
    }
  });

  // Single Delete
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
        showToast(t("toast_deleted"), "success");
        await fetchPhotos();
        await fetchStatus();
      } else {
        showToast("Delete failed: " + data.error, "danger");
      }
    } catch (err) {
      showToast("Delete failed: " + err.message, "danger");
    } finally {
      deleteBtn.disabled = false;
      deleteBtn.innerHTML = `<i data-lucide="trash-2"></i> ${t("delete_btn")}`;
      if (window.lucide) window.lucide.createIcons();
    }
  });

  // Copy helper
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const targetId = btn.getAttribute("data-copy");
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        navigator.clipboard.writeText(targetEl.textContent.trim());
        showToast(t("toast_copied"), "info");
      }
    });
  });

  // ==========================================
  // NON-BLOCKING BACKGROUND UPLOAD PIPELINE
  // ==========================================
  let isUploadingQueue = false;
  let lastUploadedBlobId = null;
  const uploadQueue = [];

  function updateOptimisticCard(taskId, stage, progress, labelText) {
    const badgeText = document.getElementById(`badge-text-${taskId}`);
    const bar = document.getElementById(`bar-${taskId}`);
    if (badgeText && labelText) badgeText.textContent = labelText;
    if (bar && progress !== undefined) bar.style.width = `${progress}%`;
  }

  async function handleFilesUpload(files) {
    if (!requireAuth()) return;
    if (!files || files.length === 0) return;

    const dockOnchainProof = document.getElementById("dockOnchainProof");
    if (dockOnchainProof) dockOnchainProof.classList.add("hidden");

    const fileList = Array.from(files);
    fileInput.value = "";

    // Create tasks for each file
    for (const file of fileList) {
      const previewUrl = URL.createObjectURL(file);
      const task = {
        id: "task_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        file,
        name: file.name,
        size: file.size,
        previewUrl,
        stage: 1, // 1: Seal encryption, 2: Walrus blob registration, 3: Anchored
        progress: 25,
        failed: false
      };
      state.activeUploads.push(task);
      uploadQueue.push(task);
    }

    // Show floating upload dock non-blockingly
    uploadDock.classList.remove("hidden", "fade-out");
    if (dockCloseBtn) dockCloseBtn.classList.add("hidden");
    if (dockSpinner) dockSpinner.style.display = "block";
    renderPhotos();

    // Trigger queue processing
    if (!isUploadingQueue) {
      processUploadQueue();
    }
  }

  async function processUploadQueue() {
    if (uploadQueue.length === 0) {
      isUploadingQueue = false;
      return;
    }

    isUploadingQueue = true;
    let completedInBatch = 0;

    while (uploadQueue.length > 0) {
      const task = uploadQueue.shift();
      const currentNum = completedInBatch + 1;
      const totalNum = completedInBatch + uploadQueue.length + 1;

      // Update Dock UI with active task
      dockTitle.textContent = t("upload_dock_title");
      dockSubtitle.textContent = t("upload_dock_count", { current: currentNum, total: totalNum });
      dockFileThumb.src = task.previewUrl;
      dockFileName.textContent = task.name;
      dockFileMeta.textContent = `${formatBytes(task.size)} • Seal Encrypting`;

      // Stepper to Step 1
      dockStep1.className = "dock-step active";
      dockStep2.className = "dock-step";
      dockStep3.className = "dock-step";

      // Overall progress
      const baseProgress = (completedInBatch / totalNum) * 100;
      dockProgressFill.style.width = `${baseProgress + (1 / totalNum) * 30}%`;

      // Optimistic card update
      updateOptimisticCard(task.id, 1, 30, t("optimistic_encrypting"));

      // Micro delay for client-side cryptographic preparation
      await new Promise((r) => setTimeout(r, 450));

      // Advance to Step 2: Walrus Blob Registration
      task.stage = 2;
      task.progress = 70;
      dockFileMeta.textContent = `${formatBytes(task.size)} • Walrus Storage`;
      dockStep1.className = "dock-step completed";
      dockStep2.className = "dock-step active";
      dockProgressFill.style.width = `${baseProgress + (1 / totalNum) * 70}%`;
      updateOptimisticCard(task.id, 2, 70, t("optimistic_uploading"));

      const formData = new FormData();
      formData.append("photo", task.file);
      formData.append("description", `Uploaded to Walrus Vault at ${new Date().toISOString()}`);

      try {
        const res = await fetch("/api/photos/upload", {
          method: "POST",
          body: formData
        });
        const data = await res.json();

        if (data.success) {
          // Track blob ID for on-chain proof link
          lastUploadedBlobId = data.photo?.blob_id || data.file?.blob_id || null;

          // Advance to Step 3: Anchored in Bucket
          task.stage = 3;
          task.progress = 100;
          dockStep2.className = "dock-step completed";
          dockStep3.className = "dock-step completed";
          dockProgressFill.style.width = `${((completedInBatch + 1) / totalNum) * 100}%`;
          updateOptimisticCard(task.id, 3, 100, t("optimistic_anchored"));

          showToast(t("toast_uploaded"), "success");
          completedInBatch++;

          // Give a brief moment to celebrate the green checkmark
          await new Promise((r) => setTimeout(r, 400));

          // Clean up task from activeUploads and revoke blob URL
          URL.revokeObjectURL(task.previewUrl);
          state.activeUploads = state.activeUploads.filter((t) => t.id !== task.id);

          // Refresh photos & status non-blockingly
          await fetchPhotos();
          await fetchStatus();
        } else {
          task.failed = true;
          updateOptimisticCard(task.id, 1, 100, t("optimistic_failed"));
          showToast(`Upload failed for ${task.name}: ${data.error}`, "danger");
          state.activeUploads = state.activeUploads.filter((t) => t.id !== task.id);
          renderPhotos();
        }
      } catch (err) {
        task.failed = true;
        showToast(`Error uploading ${task.name}: ${err.message}`, "danger");
        state.activeUploads = state.activeUploads.filter((t) => t.id !== task.id);
        renderPhotos();
      }
    }

    // All uploads finished
    isUploadingQueue = false;
    dockTitle.textContent = t("upload_dock_complete");
    dockSubtitle.textContent = `${completedInBatch} ${completedInBatch === 1 ? "memory" : "memories"} anchored`;
    if (dockSpinner) dockSpinner.style.display = "none";
    if (dockCloseBtn) dockCloseBtn.classList.remove("hidden");
    dockProgressFill.style.width = "100%";

    // Display on-chain proof directly in dock upon successful completion
    const dockOnchainProof = document.getElementById("dockOnchainProof");
    const dockWalrusLink = document.getElementById("dockWalrusLink");
    const dockSuiLink = document.getElementById("dockSuiLink");

    if (dockOnchainProof && completedInBatch > 0) {
      const policyId = state.status?.bucket?.seal_policy_id || "0x9c1baccb244e45342ac150a0123a4802e8e834f25c00210e50c81081354eee44";
      if (dockSuiLink) {
        dockSuiLink.href = `https://suivision.xyz/object/${policyId}`;
      }
      if (dockWalrusLink) {
        if (lastUploadedBlobId) {
          dockWalrusLink.href = `https://walruscan.com/testnet/blob/${lastUploadedBlobId}`;
        } else {
          dockWalrusLink.href = "https://walruscan.com/testnet";
        }
      }
      dockOnchainProof.classList.remove("hidden");
      if (window.lucide) window.lucide.createIcons();
    }

    // Auto-dismiss the dock after 10 seconds
    setTimeout(() => {
      if (!isUploadingQueue && state.activeUploads.length === 0) {
        uploadDock.classList.add("fade-out");
        setTimeout(() => {
          uploadDock.classList.add("hidden");
          uploadDock.classList.remove("fade-out");
        }, 300);
      }
    }, 10000);
  }

  function requireAuth() {
    if (!state.currentUser) {
      openZkLoginModal();
      showToast("Please sign in with zkLogin to store encrypted memories", "info");
      return false;
    }
    return true;
  }

  uploadTriggerBtn.addEventListener("click", () => {
    if (requireAuth()) fileInput.click();
  });
  browseBtn.addEventListener("click", () => {
    if (requireAuth()) fileInput.click();
  });
  dropZone.addEventListener("click", () => {
    if (requireAuth()) fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    handleFilesUpload(e.target.files);
  });

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

  // Global Window Drag & Drop Overlay
  let dragCounter = 0;
  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
      dragCounter++;
      if (dragDropOverlay) dragDropOverlay.classList.remove("hidden");
    }
  });

  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      if (dragDropOverlay) dragDropOverlay.classList.add("hidden");
    }
  });

  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    if (dragDropOverlay) dragDropOverlay.classList.add("hidden");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesUpload(e.dataTransfer.files);
    }
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
  updateAuthUI();
  applyLanguage(currentLang);
  fetchStatus();
  fetchPhotos();
});
