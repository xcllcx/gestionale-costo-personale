/**
 * Card "Stato elaborazione" compatta (REV03 FASE B2)
 * Nessun rendering di esperienze/attività/editor.
 */

import { buildStatusSummary } from "./cvWordGenerator.js";
import { languageLabel } from "./cvSchema.js";

function $(id) {
  return document.getElementById(id);
}

function formatSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

/**
 * Aggiorna la card stato elaborazione.
 * @param {object} cv
 * @param {{ phaseMessage?: string }} opts
 */
export function renderProcessingStatus(cv, opts) {
  const root = $("cvPreviewBody");
  const titleMsg = $("cvStatusHeadline");
  if (!root) return;

  const options = opts || {};
  const status = cv.analysisStatus || "idle";
  const gen = cv.generationStatus || "idle";
  const summary = buildStatusSummary(cv);

  let headline = "Nessun CV ancora elaborato.";
  if (options.phaseMessage) {
    headline = options.phaseMessage;
  } else if (cv.lastError && (status.indexOf("error") === 0 || gen === "error")) {
    headline = cv.lastError;
  } else if (gen === "generating") {
    headline = "Preparazione del documento aziendale...";
  } else if (gen === "completed" && cv.generatedDocument) {
    headline = "CV aziendale generato correttamente.";
  } else if (status === "extracting") {
    headline = "Estrazione del contenuto...";
  } else if (status === "analyzing" || status === "validating") {
    headline = status === "validating"
      ? "Validazione dei dati..."
      : "Analisi del CV in corso...";
  } else if (status === "ready" || status === "extracted") {
    if (cv.analysis) {
      headline = "CV analizzato correttamente.";
    } else if (cv.uploadedFile) {
      headline = "CV caricato e pronto per l’analisi.";
    }
  } else if (cv.uploadedFile) {
    headline = "CV caricato e pronto per l’analisi.";
  }

  if (titleMsg) titleMsg.textContent = headline;

  root.innerHTML = "";
  const box = document.createElement("div");
  box.className = "cv-status-compact";

  function addLine(label, value) {
    if (!value && value !== 0) return;
    const row = document.createElement("div");
    row.className = "cv-status-row";
    const l = document.createElement("span");
    l.className = "cv-status-label";
    l.textContent = label;
    const v = document.createElement("span");
    v.className = "cv-status-value";
    v.textContent = String(value);
    row.appendChild(l);
    row.appendChild(v);
    box.appendChild(row);
  }

  if (cv.uploadedFile) {
    addLine("File", summary.fileName || "—");
    addLine("Formato", summary.fileFormat || "—");
    addLine("Dimensione", formatSize(summary.fileSize));
  }

  if (cv.analysis) {
    if (summary.candidateName) addLine("Candidato", summary.candidateName);
    if (summary.skill) addLine("Skill / posizione", summary.skill);
    addLine("Lingua originale", summary.sourceLanguage || languageLabel("unknown"));
    addLine("Lingua output", summary.outputLanguage || "—");
    addLine("Esperienze rilevate", String(summary.experienceCount));
    addLine("Titoli di studio", String(summary.educationCount));
    if (summary.warningCount > 0) {
      addLine("Avvisi", String(summary.warningCount));
    }
  }

  addLine("Template", summary.hasTemplate ? "Caricato" : "Non caricato");

  if (gen === "completed" && summary.generatedFileName) {
    addLine("Documento", summary.generatedFileName);
  }

  if (!cv.uploadedFile && !cv.analysis) {
    const p = document.createElement("p");
    p.className = "cv-preview-empty";
    p.textContent = headline;
    root.appendChild(p);
  } else {
    root.appendChild(box);
  }

  // Download wrap: visibilità. Stato disabled dei bottoni → cvManager.updateActionButtons
  const downloadWrap = $("cvDownloadActions");
  if (downloadWrap) {
    downloadWrap.hidden = !(gen === "completed" && cv.generatedDocument);
  }
}

/** Compat: non più usato come editor */
export function renderEmptyPreview(message) {
  renderProcessingStatus(
    {
      analysisStatus: "idle",
      generationStatus: "idle",
      uploadedFile: null,
      analysis: null,
      template: null,
      lastError: null
    },
    { phaseMessage: message || "Nessun CV ancora elaborato." }
  );
}
