/**
 * Estrazione testo CV — DOCX / PDF (REV03 FASE B1)
 * Librerie caricate lazy solo quando necessarie.
 */

/** Soglia minima caratteri alfanumerici per considerare il testo utilizzabile */
export const MIN_EXTRACTED_CHARS = 80;

export const ERROR_UNSUPPORTED =
  "Formato non supportato. Utilizzare un file DOCX o PDF.";
export const ERROR_DOC_UNSUPPORTED =
  "Il formato DOC non è ancora supportato. Convertire il file in DOCX o PDF.";
export const ERROR_PDF_SCAN =
  "Il PDF non contiene testo estraibile. Utilizzare un PDF con testo selezionabile oppure un file DOCX.";
export const ERROR_UNREADABLE = "Il file non è leggibile.";

let mammothLoading = null;
let pdfjsModule = null;

/**
 * @param {string} src
 * @returns {Promise<void>}
 */
function loadScriptOnce(src) {
  return new Promise(function (resolve, reject) {
    const existing = document.querySelector('script[data-cv-lib="' + src + '"]');
    if (existing) {
      if (existing.getAttribute("data-loaded") === "1") {
        resolve();
        return;
      }
      // Script già completato senza flag (es. cache / race) → non appendere altri listener
      if (existing.src && (existing.readyState === "complete" || existing.readyState === "loaded")) {
        existing.setAttribute("data-loaded", "1");
        resolve();
        return;
      }
      function onLoad() {
        existing.setAttribute("data-loaded", "1");
        resolve();
      }
      function onError() {
        reject(new Error("Lib load failed"));
      }
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
      // Se l'evento è già passato senza readyState utile, fallback breve
      setTimeout(function () {
        if (existing.getAttribute("data-loaded") === "1") return;
        if (typeof window !== "undefined" && window.mammoth && src.indexOf("mammoth") >= 0) {
          existing.setAttribute("data-loaded", "1");
          resolve();
        }
      }, 0);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.setAttribute("data-cv-lib", src);
    script.onload = function () {
      script.setAttribute("data-loaded", "1");
      resolve();
    };
    script.onerror = function () {
      reject(new Error("Lib load failed"));
    };
    document.head.appendChild(script);
  });
}

/**
 * @returns {Promise<object>}
 */
async function getMammoth() {
  if (typeof window !== "undefined" && window.mammoth) {
    return window.mammoth;
  }
  if (!mammothLoading) {
    mammothLoading = loadScriptOnce("lib/mammoth.browser.min.js")
      .then(function () {
        if (!window.mammoth) {
          throw new Error("Mammoth non disponibile");
        }
        return window.mammoth;
      })
      .catch(function (err) {
        mammothLoading = null;
        throw err;
      });
  }
  return mammothLoading;
}

/**
 * @returns {Promise<object>}
 */
async function getPdfJs() {
  if (pdfjsModule) {
    return pdfjsModule;
  }
  const mod = await import("../lib/pdfjs/pdf.min.mjs");
  const pdfjs = mod.default || mod;
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "../lib/pdfjs/pdf.worker.min.mjs",
      import.meta.url
    ).href;
  }
  pdfjsModule = pdfjs;
  return pdfjs;
}

/**
 * @param {string} fileName
 * @returns {string}
 */
export function getFileExtension(fileName) {
  const name = String(fileName || "");
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

/**
 * @param {File|object} file
 * @returns {"docx"|"pdf"|"doc"|"unsupported"}
 */
export function detectCvFormat(file) {
  const name = (file && file.name) || "";
  const ext = getFileExtension(name);
  if (ext === ".docx") return "docx";
  if (ext === ".pdf") return "pdf";
  if (ext === ".doc") return "doc";
  const type = String((file && file.type) || "").toLowerCase();
  if (type.indexOf("wordprocessingml") >= 0) return "docx";
  if (type === "application/pdf") return "pdf";
  if (type === "application/msword") return "doc";
  return "unsupported";
}

/**
 * Normalizza il testo estratto senza distruggere contenuto professionale.
 * @param {string} text
 * @returns {string}
 */
export function prepareExtractedText(text) {
  let out = String(text || "");
  // Rimuove caratteri di controllo (eccetto \n \r \t)
  out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  // Normalizza fine riga
  out = out.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Collassa spazi orizzontali multipli, preserva newline
  out = out.replace(/[ \t]+\n/g, "\n");
  out = out.replace(/[ \t]{2,}/g, " ");
  // Collassa oltre 3 newline consecutive
  out = out.replace(/\n{4,}/g, "\n\n\n");
  return out.trim();
}

/**
 * Conta caratteri alfanumerici (proxy contenuto utile).
 * @param {string} text
 * @returns {number}
 */
export function countMeaningfulChars(text) {
  const m = String(text || "").match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]/g);
  return m ? m.length : 0;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function hasSufficientText(text) {
  return countMeaningfulChars(text) >= MIN_EXTRACTED_CHARS;
}

/**
 * @param {Error|object|string} err
 * @param {string} fallback
 * @returns {Error}
 */
function wrapError(err, fallback) {
  if (err && err.code) {
    return err;
  }
  const e = new Error(fallback);
  e.code = "UNREADABLE";
  e.userMessage = fallback;
  return e;
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractTextFromDocx(file) {
  try {
    const mammoth = await getMammoth();
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    const text = prepareExtractedText(result && result.value);
    if (!hasSufficientText(text)) {
      const err = new Error(ERROR_UNREADABLE);
      err.code = "INSUFFICIENT_TEXT";
      err.userMessage = ERROR_UNREADABLE;
      throw err;
    }
    return text;
  } catch (err) {
    if (err && err.userMessage) throw err;
    throw wrapError(err, ERROR_UNREADABLE);
  }
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractTextFromPdf(file) {
  let pdf = null;
  let loadingTask = null;
  try {
    const pdfjs = await getPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    loadingTask = pdfjs.getDocument({ data: data });
    pdf = await loadingTask.promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      try {
        const content = await page.getTextContent();
        const line = (content.items || [])
          .map(function (item) {
            return item && item.str ? item.str : "";
          })
          .join(" ");
        pages.push(line);
      } finally {
        if (page && typeof page.cleanup === "function") {
          page.cleanup();
        }
      }
    }
    const text = prepareExtractedText(pages.join("\n"));
    if (!hasSufficientText(text)) {
      const err = new Error(ERROR_PDF_SCAN);
      err.code = "PDF_SCAN";
      err.userMessage = ERROR_PDF_SCAN;
      throw err;
    }
    return text;
  } catch (err) {
    if (err && err.userMessage) throw err;
    if (err && err.code === "PDF_SCAN") throw err;
    throw wrapError(err, ERROR_UNREADABLE);
  } finally {
    try {
      if (pdf && typeof pdf.destroy === "function") {
        pdf.destroy();
      } else if (loadingTask && typeof loadingTask.destroy === "function") {
        loadingTask.destroy();
      }
    } catch (cleanupErr) {
      /* best-effort */
    }
  }
}

/**
 * Estrae testo dal CV caricato.
 * @param {File} file
 * @returns {Promise<{ text: string, format: string }>}
 */
export async function extractTextFromCvFile(file) {
  if (!file) {
    const err = new Error(ERROR_UNSUPPORTED);
    err.code = "UNSUPPORTED";
    err.userMessage = ERROR_UNSUPPORTED;
    throw err;
  }

  const format = detectCvFormat(file);
  if (format === "doc") {
    const err = new Error(ERROR_DOC_UNSUPPORTED);
    err.code = "DOC_UNSUPPORTED";
    err.userMessage = ERROR_DOC_UNSUPPORTED;
    throw err;
  }
  if (format === "unsupported") {
    const err = new Error(ERROR_UNSUPPORTED);
    err.code = "UNSUPPORTED";
    err.userMessage = ERROR_UNSUPPORTED;
    throw err;
  }

  if (format === "docx") {
    const text = await extractTextFromDocx(file);
    return { text: text, format: format };
  }

  const text = await extractTextFromPdf(file);
  return { text: text, format: format };
}
