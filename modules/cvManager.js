/**
 * CV Manager — coordinamento (REV03 FASE B2)
 * Flusso: template → CV → lingua → analisi AI → Word → download
 * Nessuna anteprima estesa. JSON interno. Nessuna modifica a REV02.
 */

import {
  AI_DEFAULT_MODEL,
  AI_DEFAULT_SECURE_ENDPOINT,
  AI_MODE_LOCAL,
  AI_MODE_SECURE,
  BROWSER_AI_SECURITY_HINT,
  STATIC_HOST_AI_MESSAGE,
  applyStaticHostBackendState,
  checkBackendHealth,
  getAiConfigReadiness,
  getBackendHealth,
  getLocalApiKey,
  getMaskedApiKeyHint,
  getPersistApiKeyPreference,
  isBrowserAiAllowed,
  isStaticHostWithoutBackend,
  loadAiSettings,
  saveAiSettings
} from "../settings/aiSettings.js";
import {
  detectCvFormat,
  extractTextFromCvFile,
  ERROR_DOC_UNSUPPORTED,
  ERROR_UNSUPPORTED
} from "./cvFileParser.js";
import { analyzeCvWithAI, AI_ERROR_MESSAGES } from "./openAiClient.js";
import { languageLabel } from "./cvSchema.js";
import { renderProcessingStatus } from "./cvAnalysisView.js";
import {
  downloadBlob,
  generateCvDocx,
  validateTemplatePlaceholders,
  WORD_ERROR_MESSAGES
} from "./cvWordGenerator.js";

const TEMPLATE_STORAGE_KEY = "gestionale.cvManager.template";
const TEMPLATE_ACCEPT = [".docx"];
/** Limiti upload (robustezza browser / storage) */
const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;
const MAX_CV_FILE_BYTES = 8 * 1024 * 1024;

/** @type {object|null} */
let appStateRef = null;
/** @type {boolean} */
let busy = false;
/** @type {boolean} */
let uiBound = false;

/**
 * @returns {object}
 */
export function createDefaultCvManagerState() {
  return {
    template: null,
    uploadedFile: null,
    extractedText: "",
    detectedLanguage: "unknown",
    outputLanguage: "same",
    model: AI_DEFAULT_MODEL,
    analysisStatus: "idle",
    analysis: null,
    validationErrors: [],
    lastError: null,
    generationStatus: "idle",
    generatedDocument: null,
    generatedFileName: ""
  };
}

function ensureCvManagerBranch(appState) {
  if (!appState.cvManager || typeof appState.cvManager !== "object") {
    appState.cvManager = createDefaultCvManagerState();
  }
  if (Object.prototype.hasOwnProperty.call(appState.cvManager, "apiKey")) {
    delete appState.cvManager.apiKey;
  }
  return appState.cvManager;
}

function $(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function setStatusMessage(message, isError) {
  const el = $("cvActionStatus");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
  el.classList.toggle("cv-status-error", !!isError);
  el.classList.toggle("cv-status-ok", !!message && !isError);
}

function setBusyIndicator(visible, label) {
  const el = $("cvBusyIndicator");
  if (!el) return;
  el.hidden = !visible;
  if (label) el.textContent = label;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

function getExtension(fileName) {
  const name = String(fileName || "");
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function isAllowedTemplate(file) {
  return !!file && TEMPLATE_ACCEPT.indexOf(getExtension(file.name)) !== -1;
}

function getTemplateBuffer(cv) {
  if (!cv.template) return null;
  if (cv.template.arrayBuffer) return cv.template.arrayBuffer;
  if (cv.template.base64) return base64ToArrayBuffer(cv.template.base64);
  return null;
}

function hydrateTemplateFromStorage(cv) {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) {
      cv.template = null;
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.base64 || !parsed.name) {
      cv.template = null;
      return;
    }
    const arrayBuffer = base64ToArrayBuffer(parsed.base64);
    const fillMode =
      parsed.fillMode === "placeholders" || parsed.fillMode === "shell"
        ? parsed.fillMode
        : parsed.placeholdersOk === false
          ? "shell"
          : parsed.placeholdersOk === true
            ? "placeholders"
            : "shell";
    // In memoria solo ArrayBuffer (niente copia base64 residua)
    cv.template = {
      name: parsed.name,
      type:
        parsed.type ||
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: parsed.size || arrayBuffer.byteLength || 0,
      loadedAt: parsed.loadedAt || null,
      arrayBuffer: arrayBuffer,
      placeholdersOk: fillMode === "placeholders",
      fillMode: fillMode
    };
  } catch (err) {
    console.warn("[cvManager] Template non recuperabile da localStorage.");
    cv.template = null;
  }
}

function persistTemplate(templateMeta) {
  try {
    if (!templateMeta) {
      localStorage.removeItem(TEMPLATE_STORAGE_KEY);
      return;
    }
    let base64 = templateMeta.base64 || "";
    if (!base64 && templateMeta.arrayBuffer) {
      base64 = arrayBufferToBase64(templateMeta.arrayBuffer);
    }
    if (!base64) {
      localStorage.removeItem(TEMPLATE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      TEMPLATE_STORAGE_KEY,
      JSON.stringify({
        name: templateMeta.name,
        type: templateMeta.type,
        size: templateMeta.size,
        loadedAt: templateMeta.loadedAt,
        base64: base64,
        placeholdersOk: !!templateMeta.placeholdersOk,
        fillMode: templateMeta.fillMode || (templateMeta.placeholdersOk ? "placeholders" : "shell")
      })
    );
    // Dopo persistenza: libera eventuale base64 dall'oggetto in memoria
    if (templateMeta.base64) {
      delete templateMeta.base64;
    }
  } catch (err) {
    console.warn("[cvManager] Impossibile salvare template in localStorage.");
    throw err;
  }
}

function readTemplateFile(file) {
  return new Promise(function (resolve, reject) {
    if (file && file.size > MAX_TEMPLATE_BYTES) {
      reject(Object.assign(new Error("Template troppo grande"), { code: "too_large" }));
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const buffer = reader.result;
        resolve({
          name: file.name,
          type:
            file.type ||
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: file.size,
          loadedAt: new Date().toISOString(),
          arrayBuffer: buffer
          // base64 solo al momento del persist
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = function () {
      reject(reader.error || new Error("Lettura template fallita"));
    };
    reader.readAsArrayBuffer(file);
  });
}

function renderTemplateCard(cv) {
  const hasTemplate = !!(cv.template && cv.template.name);
  const status = $("cvTemplateStatus");
  const meta = $("cvTemplateMeta");
  const btnLoad = $("btnCvCaricaTemplate");
  const btnReplace = $("btnCvSostituisciTemplate");

  if (status) {
    if (!hasTemplate) {
      status.textContent = "Nessun template caricato.";
    } else {
      status.textContent = "Template aziendale caricato e pronto all’uso.";
    }
  }
  if (meta) {
    if (hasTemplate) {
      meta.hidden = false;
      setText("cvTemplateName", cv.template.name);
      setText("cvTemplateSize", formatFileSize(cv.template.size));
    } else {
      meta.hidden = true;
    }
  }
  if (btnLoad) btnLoad.hidden = hasTemplate;
  if (btnReplace) btnReplace.hidden = !hasTemplate;
}

function renderCurriculumCard(cv) {
  const empty = $("cvFileEmpty");
  const meta = $("cvFileMeta");
  const file = cv.uploadedFile;

  if (!file) {
    if (empty) empty.hidden = false;
    if (meta) meta.hidden = true;
    return;
  }

  if (empty) empty.hidden = true;
  if (meta) meta.hidden = false;
  setText("cvFileName", file.name || "—");
  setText("cvFileType", file.format || file.type || getExtension(file.name) || "—");
  setText("cvFileSize", formatFileSize(file.size));

  let langLabel = "Non ancora analizzata";
  if (cv.analysis) {
    langLabel = languageLabel(cv.detectedLanguage);
  }
  setText("cvFileLanguage", langLabel);
}

function renderOutputLanguage(cv) {
  const value = cv.outputLanguage || "same";
  document.querySelectorAll('input[name="cvOutputLanguage"]').forEach(function (radio) {
    radio.checked = radio.value === value;
  });
}

function renderAiSettings(opts) {
  const options = opts || {};
  const settings = loadAiSettings();
  const browserAllowed = isBrowserAiAllowed();
  const browserMode = settings.connectionMode === AI_MODE_LOCAL && browserAllowed;

  const modeSecure = $("cvModeSecure");
  const modeLocal = $("cvModeLocal");
  const localBlock = $("cvLocalDevBlock");
  const endpointInput = $("cvSecureEndpoint");
  const endpointField = endpointInput ? endpointInput.closest(".field") : null;
  const modelInput = $("cvModel");
  const apiInput = $("cvApiKey");
  const hint = $("cvApiKeyHint");
  const toggleBtn = $("btnCvToggleApiKey");
  const localWarning = $("cvLocalDevWarning");
  const persistChk = $("cvDontPersistApiKey");
  const clearBtn = $("btnCvClearApiKey");

  if (modeSecure) modeSecure.checked = !browserMode;
  if (modeLocal) {
    modeLocal.disabled = !browserAllowed || !!busy;
    modeLocal.checked = browserMode;
  }
  if (localBlock) {
    localBlock.hidden = !browserMode;
  }
  if (localWarning) {
    localWarning.hidden = !browserMode;
    if (browserMode) {
      localWarning.textContent = BROWSER_AI_SECURITY_HINT;
    }
  }
  if (endpointField) {
    endpointField.hidden = browserMode;
  }

  if (endpointInput && document.activeElement !== endpointInput) {
    endpointInput.value = settings.secureEndpoint || AI_DEFAULT_SECURE_ENDPOINT;
  }
  if (modelInput && document.activeElement !== modelInput) {
    modelInput.value = settings.model || AI_DEFAULT_MODEL;
  }

  const reveal = options.reveal === true;
  if (apiInput) {
    apiInput.type = reveal ? "text" : "password";
    if (document.activeElement !== apiInput) {
      apiInput.value = getLocalApiKey();
    }
  }
  if (persistChk) {
    persistChk.checked = !getPersistApiKeyPreference();
  }
  if (hint) {
    const masked = getMaskedApiKeyHint();
    const persist = getPersistApiKeyPreference();
    if (masked && persist) {
      hint.textContent =
        "Chiave memorizzata su questo dispositivo (mascherata): " +
        masked +
        ". Resta solo su questo browser.";
    } else if (masked && !persist) {
      hint.textContent = "Chiave presente solo in memoria di sessione (non salvata sul dispositivo).";
    } else {
      hint.textContent = "Nessuna API Key presente.";
    }
  }
  if (toggleBtn) {
    toggleBtn.textContent = reveal ? "Nascondi" : "Mostra";
    toggleBtn.setAttribute("aria-pressed", reveal ? "true" : "false");
  }
  if (clearBtn) {
    clearBtn.disabled = !!busy || !getLocalApiKey();
  }

  // Disabilita cambio modalità durante elaborazione
  if (modeSecure) modeSecure.disabled = !!busy;
  if (modeLocal) modeLocal.disabled = !browserAllowed || !!busy;

  const healthEl = $("cvBackendHealth");
  if (healthEl) {
    if (browserMode) {
      healthEl.textContent = "Modalità Browser attiva — chiamata diretta a OpenAI.";
      healthEl.className = "cv-hint cv-health cv-health-local";
    } else if (isStaticHostWithoutBackend()) {
      healthEl.textContent = STATIC_HOST_AI_MESSAGE;
      healthEl.className = "cv-hint cv-health cv-health-pages";
    } else {
      const health = getBackendHealth();
      const readiness = getAiConfigReadiness();
      healthEl.textContent =
        readiness.message ||
        health.message ||
        "Stato backend: " + health.status;
      const tone =
        health.status === "ready"
          ? "ok"
          : health.status === "checking"
            ? "pending"
            : health.status === "static_host"
              ? "pages"
              : "error";
      healthEl.className = "cv-hint cv-health cv-health-" + tone;
    }
  }

  const btnHealth = $("btnCvVerificaBackend");
  if (btnHealth) {
    // Health solo per Secure e solo dove ha senso (non su Pages statico)
    const showHealth = !browserMode && !isStaticHostWithoutBackend();
    btnHealth.hidden = !showHealth;
    btnHealth.disabled = !showHealth || !!busy;
  }
}

function updateActionButtons(cv) {
  const btnMain = $("btnCvAnalizzaGenera");
  const btnDownload = $("btnCvScarica");
  const btnNew = $("btnCvNuovo");
  const btnRegen = $("btnCvRigenera");

  const hasFile = !!(cv.uploadedFile && cv.uploadedFile.file);
  const format = hasFile ? detectCvFormat(cv.uploadedFile) : "unsupported";
  const supported = format === "docx" || format === "pdf";
  const hasTemplate = !!getTemplateBuffer(cv);
  const readiness = getAiConfigReadiness();
  const aiReady = readiness.ok;
  const canStart =
    supported && hasTemplate && aiReady && !!cv.outputLanguage && !busy;

  if (btnMain) {
    btnMain.disabled = !canStart;
    btnMain.setAttribute("aria-disabled", canStart ? "false" : "true");
  }

  // Messaggio preventivo se AI non pronta (senza attendere il click)
  const readinessEl = $("cvAiReadinessMsg");
  if (readinessEl) {
    if (!aiReady && !busy) {
      readinessEl.hidden = false;
      readinessEl.textContent = readiness.message || "Configurazione AI non pronta.";
      readinessEl.className =
        readiness.reason === "static_host"
          ? "cv-status cv-status-info"
          : "cv-status cv-status-error";
    } else if (!readinessEl.classList.contains("cv-status-ok")) {
      // Non sovrascrivere messaggi di successo recenti se readiness ok
      if (!aiReady) {
        readinessEl.hidden = true;
      } else if (!busy) {
        readinessEl.hidden = true;
        readinessEl.textContent = "";
      }
    }
  }

  const canDownload = !!(
    cv.generatedDocument &&
    cv.generationStatus === "completed" &&
    !busy
  );
  if (btnDownload) {
    btnDownload.disabled = !canDownload;
    btnDownload.setAttribute("aria-disabled", canDownload ? "false" : "true");
  }

  if (btnNew) {
    const canNew = !!(cv.uploadedFile || cv.analysis || cv.generatedDocument);
    btnNew.disabled = !canNew || busy;
  }

  if (btnRegen) {
    const canRegen = !!(cv.analysis && hasTemplate && !busy);
    btnRegen.disabled = !canRegen;
    btnRegen.hidden = !cv.analysis;
    btnRegen.setAttribute("aria-disabled", canRegen ? "false" : "true");
  }
}

function renderAll(cv, phaseMessage) {
  renderTemplateCard(cv);
  renderCurriculumCard(cv);
  renderOutputLanguage(cv);
  renderAiSettings({ reveal: false });
  renderProcessingStatus(cv, { phaseMessage: phaseMessage });
  updateActionButtons(cv);
}

async function handleTemplateFile(file, cv) {
  if (busy) return;
  if (!isAllowedTemplate(file)) {
    window.alert("Formato non consentito. Caricare un file DOCX.");
    return;
  }
  try {
    const template = await readTemplateFile(file);
    // Qualsiasi DOCX aziendale è accettato (placeholder opzionali)
    const check = await validateTemplatePlaceholders(template.arrayBuffer);
    if (!check.ok) {
      window.alert("Il file non è un DOCX valido.");
      return;
    }
    template.placeholdersOk = check.mode === "placeholders";
    template.fillMode = check.mode;
    persistTemplate(template);
    cv.template = template;
    // Template sostituito: documento generato non più valido, JSON analisi resta
    cv.generatedDocument = null;
    cv.generatedFileName = "";
    if (cv.generationStatus === "completed") {
      cv.generationStatus = "idle";
    }
    setStatusMessage("Template aziendale accettato.", false);
    renderTemplateCard(cv);
    renderProcessingStatus(cv);
    updateActionButtons(cv);
  } catch (err) {
    if (err && err.code === "too_large") {
      window.alert(
        "Template troppo grande (max " + Math.round(MAX_TEMPLATE_BYTES / (1024 * 1024)) + " MB)."
      );
      return;
    }
    window.alert(
      "Impossibile salvare il template localmente (limite storage browser o file troppo grande)."
    );
  }
}

async function handleCurriculumFile(file, cv) {
  if (busy) return;
  if (file && file.size > MAX_CV_FILE_BYTES) {
    window.alert(
      "File CV troppo grande (max " + Math.round(MAX_CV_FILE_BYTES / (1024 * 1024)) + " MB)."
    );
    return;
  }
  const format = detectCvFormat(file);
  if (format === "doc") {
    window.alert(ERROR_DOC_UNSUPPORTED);
    return;
  }
  if (format === "unsupported") {
    window.alert(ERROR_UNSUPPORTED);
    return;
  }

  cv.uploadedFile = {
    name: file.name,
    type: file.type || getExtension(file.name),
    size: file.size,
    format: format,
    file: file
  };
  cv.extractedText = "";
  cv.detectedLanguage = "unknown";
  cv.analysis = null;
  cv.validationErrors = [];
  cv.lastError = null;
  cv.generatedDocument = null;
  cv.generatedFileName = "";
  cv.generationStatus = "idle";
  cv.analysisStatus = "file_loaded";
  setStatusMessage("", false);
  renderAll(cv, "CV caricato e pronto per l’analisi.");
}

/**
 * Reset elaborazione corrente (mantiene template, AI, lingua).
 * @param {object} cv
 */
function resetCurrentCv(cv) {
  cv.uploadedFile = null;
  cv.extractedText = "";
  cv.detectedLanguage = "unknown";
  cv.analysis = null;
  cv.validationErrors = [];
  cv.lastError = null;
  cv.analysisStatus = "idle";
  cv.generationStatus = "idle";
  cv.generatedDocument = null;
  cv.generatedFileName = "";
  setStatusMessage("", false);
  setBusyIndicator(false);
  renderAll(cv, "Nessun CV ancora elaborato.");
}

/**
 * Genera DOCX dal JSON già analizzato (nessuna chiamata OpenAI).
 * @param {object} cv
 */
async function regenerateDocument(cv) {
  if (busy) return;
  if (!cv.analysis) {
    setStatusMessage(WORD_ERROR_MESSAGES.missing_json, true);
    return;
  }
  const buffer = getTemplateBuffer(cv);
  if (!buffer) {
    setStatusMessage(WORD_ERROR_MESSAGES.missing_template, true);
    return;
  }

  busy = true;
  cv.lastError = null;
  setBusyIndicator(true, "Preparazione del documento aziendale...");
  updateActionButtons(cv);

  try {
    await regenerateDocumentInner(cv);
  } catch (err) {
    cv.generationStatus = "error";
    const msg = (err && err.userMessage) || WORD_ERROR_MESSAGES.generation_failed;
    cv.lastError = msg;
    setStatusMessage(msg, true);
  } finally {
    busy = false;
    setBusyIndicator(false);
    renderAll(cv);
  }
}

/**
 * Pipeline completa: estrazione → AI → validazione → Word.
 * @param {object} cv
 */
async function analyzeAndGenerate(cv) {
  if (busy) return;

  if (!getTemplateBuffer(cv)) {
    setStatusMessage(WORD_ERROR_MESSAGES.missing_template, true);
    return;
  }
  if (!cv.uploadedFile || !cv.uploadedFile.file) {
    setStatusMessage("Caricare un curriculum DOCX o PDF.", true);
    return;
  }
  const readiness = getAiConfigReadiness();
  if (!readiness.ok) {
    setStatusMessage(readiness.message || AI_ERROR_MESSAGES.missing_key, true);
    return;
  }

  busy = true;
  cv.lastError = null;
  updateActionButtons(cv);

  try {
    // 1) Estrazione (se necessario)
    if (!cv.extractedText || !cv.extractedText.trim()) {
      cv.analysisStatus = "extracting";
      setBusyIndicator(true, "Estrazione del contenuto...");
      setStatusMessage("Estrazione del contenuto...", false);
      renderProcessingStatus(cv, { phaseMessage: "Estrazione del contenuto..." });

      const extracted = await extractTextFromCvFile(cv.uploadedFile.file);
      cv.extractedText = extracted.text;
      cv.analysisStatus = "extracted";
    }

    // 2) Analisi AI (salta se JSON già valido e lingua invariata)
    // Sempre nuova analisi se analysis assente
    if (!cv.analysis) {
      cv.analysisStatus = "analyzing";
      setBusyIndicator(true, "Analisi delle esperienze...");
      setStatusMessage("Analisi del CV in corso...", false);
      renderProcessingStatus(cv, { phaseMessage: "Analisi del CV in corso..." });

      const settings = loadAiSettings();
      cv.model = settings.model;

      const result = await analyzeCvWithAI(cv.extractedText, {
        outputLanguage: cv.outputLanguage || "same",
        model: settings.model,
        connectionMode: settings.connectionMode,
        secureEndpoint: settings.secureEndpoint
      });

      cv.analysisStatus = "validating";
      renderProcessingStatus(cv, { phaseMessage: "Validazione dei dati..." });

      cv.analysis = result.analysis;
      cv.detectedLanguage = result.analysis.sourceLanguage || "unknown";
      cv.analysisStatus = "ready";
      cv.validationErrors = [];
    }

    // 3) Generazione Word
    await regenerateDocumentInner(cv);
  } catch (err) {
    const code = err && err.code;
    if (code === "PDF_SCAN" || code === "DOC_UNSUPPORTED" || code === "UNSUPPORTED" || code === "INSUFFICIENT_TEXT" || code === "UNREADABLE") {
      cv.analysisStatus = "error_extraction";
    } else if (code === "invalid_json" || code === "empty") {
      cv.analysisStatus = "error_validation";
      cv.validationErrors = [(err && err.userMessage) || AI_ERROR_MESSAGES.invalid_json];
    } else if (code === "missing_template" || code === "invalid_template" || code === "generation_failed") {
      cv.generationStatus = "error";
    } else {
      cv.analysisStatus = "error_api";
    }
    const msg =
      (err && err.userMessage) ||
      AI_ERROR_MESSAGES.generic;
    cv.lastError = msg;
    setStatusMessage(msg, true);
  } finally {
    busy = false;
    setBusyIndicator(false);
    renderAll(cv);
  }
}

/**
 * Generazione interna (già dentro busy lock del chiamante, oppure standalone).
 * @param {object} cv
 */
async function regenerateDocumentInner(cv) {
  const buffer = getTemplateBuffer(cv);
  if (!buffer) throw Object.assign(new Error(WORD_ERROR_MESSAGES.missing_template), {
    code: "missing_template",
    userMessage: WORD_ERROR_MESSAGES.missing_template
  });
  if (!cv.analysis) throw Object.assign(new Error(WORD_ERROR_MESSAGES.missing_json), {
    code: "missing_json",
    userMessage: WORD_ERROR_MESSAGES.missing_json
  });

  cv.generationStatus = "generating";
  setBusyIndicator(true, "Preparazione del documento aziendale...");
  setStatusMessage("Preparazione del documento aziendale...", false);
  renderProcessingStatus(cv, { phaseMessage: "Preparazione del documento aziendale..." });

  const result = await generateCvDocx({
    templateBuffer: buffer,
    analysis: cv.analysis,
    fillMode: cv.template && cv.template.fillMode
  });
  cv.generatedDocument = result.blob;
  cv.generatedFileName = result.fileName;
  cv.generationStatus = "completed";
  setStatusMessage("CV aziendale generato correttamente.", false);
  // Download immediato + pulsante Scarica disponibile
  try {
    downloadBlob(result.blob, result.fileName);
  } catch (err) {
    // Il documento resta disponibile per scaricare manualmente
    setStatusMessage(
      "Documento pronto. Usa «Scarica CV Aziendale» se il download non è partito.",
      false
    );
  }
}

function downloadGenerated(cv) {
  if (busy) return;
  if (!cv.generatedDocument) {
    setStatusMessage(WORD_ERROR_MESSAGES.download_failed, true);
    return;
  }
  try {
    downloadBlob(cv.generatedDocument, cv.generatedFileName || "CV_Aziendale.docx");
  } catch (err) {
    setStatusMessage(
      (err && err.userMessage) || WORD_ERROR_MESSAGES.download_failed,
      true
    );
  }
}

function bindUi(cv) {
  if (uiBound) return;
  uiBound = true;

  const inputTemplate = $("cvTemplateInput");
  const inputCv = $("cvFileInput");
  let apiKeyRevealed = false;

  function openTemplatePicker() {
    if (busy) return;
    if (inputTemplate) {
      inputTemplate.value = "";
      inputTemplate.click();
    }
  }

  const btnLoad = $("btnCvCaricaTemplate");
  const btnReplace = $("btnCvSostituisciTemplate");
  if (btnLoad) btnLoad.addEventListener("click", openTemplatePicker);
  if (btnReplace) btnReplace.addEventListener("click", openTemplatePicker);
  if (inputTemplate) {
    inputTemplate.addEventListener("change", function () {
      if (busy) return;
      const file = inputTemplate.files && inputTemplate.files[0];
      if (file) handleTemplateFile(file, cv);
    });
  }

  const btnUploadCv = $("btnCvCaricaCurriculum");
  if (btnUploadCv && inputCv) {
    btnUploadCv.addEventListener("click", function () {
      if (busy) return;
      inputCv.value = "";
      inputCv.click();
    });
  }
  if (inputCv) {
    inputCv.addEventListener("change", function () {
      if (busy) return;
      const file = inputCv.files && inputCv.files[0];
      if (file) handleCurriculumFile(file, cv);
    });
  }

  document.querySelectorAll('input[name="cvOutputLanguage"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      if (!radio.checked) return;
      if (busy) {
        renderOutputLanguage(cv);
        return;
      }
      const prev = cv.outputLanguage;
      cv.outputLanguage = radio.value;
      // Cambio lingua → nuova analisi richiesta
      if (prev !== cv.outputLanguage && cv.analysis) {
        cv.analysis = null;
        cv.extractedText = cv.extractedText || "";
        cv.detectedLanguage = "unknown";
        cv.generatedDocument = null;
        cv.generatedFileName = "";
        cv.generationStatus = "idle";
        cv.analysisStatus = cv.uploadedFile ? "extracted" : "idle";
        setStatusMessage(
          "Lingua output modificata: sarà necessaria una nuova analisi.",
          false
        );
      }
      updateActionButtons(cv);
      renderProcessingStatus(cv);
      renderCurriculumCard(cv);
    });
  });

  document.querySelectorAll('input[name="cvConnectionMode"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      if (!radio.checked) return;
      if (busy) {
        renderAiSettings({ reveal: apiKeyRevealed });
        return;
      }
      const mode = radio.value === AI_MODE_LOCAL ? AI_MODE_LOCAL : AI_MODE_SECURE;
      saveAiSettings({
        connectionMode: mode,
        model: ($("cvModel") && $("cvModel").value) || cv.model,
        secureEndpoint:
          ($("cvSecureEndpoint") && $("cvSecureEndpoint").value) ||
          AI_DEFAULT_SECURE_ENDPOINT
      });
      apiKeyRevealed = false;
      renderAiSettings({ reveal: false });
      updateActionButtons(cv);
      // Health solo in Secure e solo se non host statico
      if (mode === AI_MODE_SECURE && !isStaticHostWithoutBackend()) {
        refreshBackendHealth(cv);
      }
    });
  });

  const btnSaveAi = $("btnCvSalvaAi");
  if (btnSaveAi) {
    btnSaveAi.addEventListener("click", function () {
      const apiInput = $("cvApiKey");
      const modelInput = $("cvModel");
      const endpointInput = $("cvSecureEndpoint");
      const modeLocal = $("cvModeLocal");
      const persistChk = $("cvDontPersistApiKey");
      const mode =
        modeLocal && modeLocal.checked && isBrowserAiAllowed()
          ? AI_MODE_LOCAL
          : AI_MODE_SECURE;
      const persistApiKey = !(persistChk && persistChk.checked);
      const saved = saveAiSettings({
        connectionMode: mode,
        model: modelInput ? modelInput.value.trim() : AI_DEFAULT_MODEL,
        secureEndpoint: endpointInput
          ? endpointInput.value.trim()
          : AI_DEFAULT_SECURE_ENDPOINT,
        persistApiKey: persistApiKey,
        apiKey: mode === AI_MODE_LOCAL && apiInput ? apiInput.value.trim() : undefined
      });
      cv.model = saved.model;
      apiKeyRevealed = false;
      renderAiSettings({ reveal: false });
      updateActionButtons(cv);
      const msg = $("cvAiSaveMsg");
      if (msg) {
        msg.hidden = false;
        msg.textContent = persistApiKey
          ? "Configurazione salvata su questo dispositivo."
          : "Configurazione salvata (API key solo in memoria di sessione).";
      }
    });
  }

  const btnToggle = $("btnCvToggleApiKey");
  if (btnToggle) {
    btnToggle.addEventListener("click", function () {
      apiKeyRevealed = !apiKeyRevealed;
      renderAiSettings({ reveal: apiKeyRevealed });
    });
  }

  const btnClearKey = $("btnCvClearApiKey");
  if (btnClearKey) {
    btnClearKey.addEventListener("click", function () {
      if (busy) return;
      saveAiSettings({ clearApiKey: true });
      const apiInput = $("cvApiKey");
      if (apiInput) apiInput.value = "";
      apiKeyRevealed = false;
      renderAiSettings({ reveal: false });
      updateActionButtons(cv);
    });
  }

  const btnMain = $("btnCvAnalizzaGenera");
  if (btnMain) {
    btnMain.addEventListener("click", function () {
      analyzeAndGenerate(cv);
    });
  }

  const btnDownload = $("btnCvScarica");
  if (btnDownload) {
    btnDownload.addEventListener("click", function () {
      downloadGenerated(cv);
    });
  }

  const btnNew = $("btnCvNuovo");
  if (btnNew) {
    btnNew.addEventListener("click", function () {
      if (busy) return;
      resetCurrentCv(cv);
    });
  }

  const btnRegen = $("btnCvRigenera");
  if (btnRegen) {
    btnRegen.addEventListener("click", function () {
      regenerateDocument(cv);
    });
  }

  const btnLoadDefaultTpl = $("btnCvCaricaTemplateDefault");
  if (btnLoadDefaultTpl) {
    btnLoadDefaultTpl.addEventListener("click", async function () {
      if (busy) return;
      btnLoadDefaultTpl.disabled = true;
      try {
        const res = await fetch("templates/cv_aziendale_template.docx");
        if (!res.ok) throw new Error("not found");
        const buf = await res.arrayBuffer();
        const file = new File(
          [buf],
          "cv_aziendale_template.docx",
          {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          }
        );
        await handleTemplateFile(file, cv);
      } catch (err) {
        window.alert("Template predefinito non disponibile.");
      } finally {
        btnLoadDefaultTpl.disabled = false;
      }
    });
  }

  const btnHealth = $("btnCvVerificaBackend");
  if (btnHealth) {
    btnHealth.addEventListener("click", function () {
      if (busy) return;
      refreshBackendHealth(cv);
    });
  }
}

async function refreshBackendHealth(cv) {
  renderAiSettings({ reveal: false });
  updateActionButtons(cv);
  if (isStaticHostWithoutBackend()) {
    applyStaticHostBackendState();
  } else {
    await checkBackendHealth();
  }
  renderAiSettings({ reveal: false });
  updateActionButtons(cv);
  if (cv) renderProcessingStatus(cv);
}

/**
 * @param {object} appState
 * @returns {{ cvManager: object }}
 */
export function initCvManager(appState) {
  if (!appState) {
    throw new Error("[cvManager] AppState mancante");
  }

  appStateRef = appState;
  const cv = ensureCvManagerBranch(appState);
  const defaults = createDefaultCvManagerState();
  Object.keys(defaults).forEach(function (key) {
    if (typeof cv[key] === "undefined") {
      cv[key] = defaults[key];
    }
  });

  const ai = loadAiSettings();
  cv.model = ai.model || AI_DEFAULT_MODEL;
  if (!cv.analysisStatus) cv.analysisStatus = "idle";
  if (!cv.generationStatus) cv.generationStatus = "idle";
  if (!cv.extractedText) cv.extractedText = "";
  if (!Array.isArray(cv.validationErrors)) cv.validationErrors = [];
  if (!cv.generatedFileName) cv.generatedFileName = "";

  hydrateTemplateFromStorage(cv);

  if (!$("viewCvManager")) {
    console.warn("[cvManager] Vista #viewCvManager non trovata.");
    return { cvManager: cv };
  }

  bindUi(cv);
  renderAll(cv);

  // Locale con backend: health una volta. Pages / statico: nessuno fetch a /api/*
  // (in Browser mode la readiness dipende dalla API key, non dal health).
  const settingsInit = loadAiSettings();
  if (settingsInit.connectionMode === AI_MODE_LOCAL && isBrowserAiAllowed()) {
    renderAiSettings({ reveal: false });
    updateActionButtons(cv);
  } else if (isStaticHostWithoutBackend()) {
    applyStaticHostBackendState();
    renderAiSettings({ reveal: false });
    updateActionButtons(cv);
  } else {
    refreshBackendHealth(cv).catch(function () {
      updateActionButtons(cv);
    });
  }

  return { cvManager: cv };
}

export function getCvManagerState() {
  return appStateRef && appStateRef.cvManager ? appStateRef.cvManager : null;
}
