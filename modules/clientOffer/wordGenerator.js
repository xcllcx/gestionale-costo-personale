/**
 * Offerta Cliente — generazione Word da template fisso (PizZip + docxtemplater).
 * Preserva logo, firma, header, footer, margini, stili del .docx caricato.
 */

import {
  adaptTemplateDataToXml,
  applyClientManualNaming,
  applyNormalizedRotation,
  buildTemplateData,
  migrateLegacyProposalNaming,
  isPreservedClientPlaceholder,
  PRESERVED_CLIENT_PLACEHOLDERS,
  sanitizeWindowsFileName,
  validateOfferForWord,
  wordXmlPlainText
} from "./transform.js";
import { applyTemplateBFormatting } from "./formatOfferDocx.js";

export { PRESERVED_CLIENT_PLACEHOLDERS };

/** Placeholder opzionali: se vuoti, il paragrafo intero viene rimosso */
export const OPTIONAL_ROW_KEYS = Object.freeze([
  "OVERTIME_HOLIDAY_ROW",
  "OVERTIME_HOLIDAY",
  "POCKET_MONEY_ROW",
  "TRANSPORTATION_ROW",
  "ACCOMMODATION_ROW",
  "TRAVELLING_DAY_ROW",
  "TICKET_FLIGHT_ROW",
  "MOB_DEMOB_ROW",
  "OWN_CAR_ROW",
  "OVERTIME_STANDARD",
  "WORKING_HOURS_TEXT",
  "DAILY_RATE_TEXT",
  "WORKING_HOURS",
  "DAILY_RATE",
  "WORKING_HOURS_VALUE",
  "DAILY_RATE_VALUE"
]);

/** Campi anagrafici minimi; Daily/Working Hours accettano alias o testo statico nel template. */
export const REQUIRED_PLACEHOLDERS = Object.freeze([
  "OFFER_DATE",
  "SUBJECT",
  "LOCATION",
  "PROPOSAL_NUMBER",
  "POSITION",
  "CANDIDATE",
  "START_DATE",
  "END_DATE"
]);

export const DAILY_RATE_PLACEHOLDER_ALIASES = Object.freeze([
  "DAILY_RATE_TEXT",
  "DAILY_RATE",
  "DAILY_RATE_VALUE",
  "DAILY_RATE_AMOUNT"
]);

export const WORKING_HOURS_PLACEHOLDER_ALIASES = Object.freeze([
  "WORKING_HOURS_TEXT",
  "WORKING_HOURS",
  "WORKING_HOURS_VALUE"
]);

let libsPromise = null;

function loadScriptOnce(src) {
  return new Promise(function (resolve, reject) {
    const existing = document.querySelector(
      'script[data-co-word-lib="' + src + '"]'
    );
    if (existing) {
      if (existing.getAttribute("data-loaded") === "1") {
        resolve();
        return;
      }
      existing.addEventListener(
        "load",
        function () {
          existing.setAttribute("data-loaded", "1");
          resolve();
        },
        { once: true }
      );
      existing.addEventListener(
        "error",
        function () {
          reject(new Error("Lib Word non caricata: " + src));
        },
        { once: true }
      );
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.setAttribute("data-co-word-lib", src);
    script.onload = function () {
      script.setAttribute("data-loaded", "1");
      resolve();
    };
    script.onerror = function () {
      reject(new Error("Lib Word non caricata: " + src));
    };
    document.head.appendChild(script);
  });
}

function loadWordLibs() {
  if (libsPromise) return libsPromise;
  libsPromise = (async function () {
    await loadScriptOnce("lib/docxtemplater/pizzip.js");
    await loadScriptOnce("lib/docxtemplater/docxtemplater.js");
    const PizZip = window.PizZip;
    const Docxtemplater = window.docxtemplater || window.Docxtemplater;
    if (!PizZip || !Docxtemplater) {
      throw new Error("PizZip/docxtemplater non disponibili");
    }
    return { PizZip: PizZip, Docxtemplater: Docxtemplater };
  })().catch(function (err) {
    libsPromise = null;
    throw err;
  });
  return libsPromise;
}

/** Precarica PizZip/docxtemplater (es. analisi template utente). */
export function ensureWordLibs() {
  return loadWordLibs();
}

/**
 * Rimuove paragrafi rimasti vuoti dopo la sostituzione (righe opzionali).
 * Non tocca paragrafi con immagini o page break.
 * @param {object} zip - PizZip
 * @returns {object}
 */
function paragraphContainsPreservedClientPlaceholder(joined) {
  for (let i = 0; i < PRESERVED_CLIENT_PLACEHOLDERS.length; i++) {
    if (joined.indexOf("{{" + PRESERVED_CLIENT_PLACEHOLDERS[i] + "}}") >= 0) {
      return true;
    }
  }
  return false;
}

/**
 * @param {object} zip - PizZip
 * @param {string} [preFillXml] - document.xml PRIMA del fill (per riconoscere
 *   paragrafi opzionali svuotati senza cancellare gli spacer vuoti Rev2)
 * @returns {object}
 */
export function cleanupEmptyOptionalParagraphs(zip, preFillXml) {
  const path = "word/document.xml";
  let xml = zip.file(path).asText();

  // Indici paragrafi con placeholder opzionali (dal template pre-fill).
  // I paragrafi vuoti di spaziatura del template NON vanno eliminati.
  const optionalIdx = Object.create(null);
  const scanSrc = preFillXml != null ? String(preFillXml) : xml;
  let scanIdx = 0;
  scanSrc.replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    const joined = paraPlainText(para);
    for (let i = 0; i < OPTIONAL_ROW_KEYS.length; i++) {
      if (joined.indexOf("{{" + OPTIONAL_ROW_KEYS[i] + "}}") >= 0) {
        optionalIdx[scanIdx] = true;
        break;
      }
    }
    scanIdx++;
    return para;
  });

  let idx = 0;
  xml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    const myIdx = idx++;
    if (
      /w:drawing|v:imagedata|w:pict|w:br[^>]*w:type="page"|w:sectPr/i.test(para)
    ) {
      return para;
    }
    const joined = paraPlainText(para);
    if (paragraphContainsPreservedClientPlaceholder(joined)) {
      return para;
    }
    if (/REST PERIOD AND RETURN TO THE HOME/i.test(joined)) {
      return para;
    }
    // Non trattare "… for a" (split template B verso "standard rest period…")
    // come frase incompleta da cancellare.
    if (
      !/…|\.\.\.|Not applicable|to be defined/i.test(joined) &&
      (/\bevery\s+days\b/i.test(joined) ||
        /\bperiod of\s+days\b/i.test(joined) ||
        /\bevery\s+days of uninterrupted/i.test(joined))
    ) {
      return "";
    }
    if (
      /Our Staff is allowed to return to the Home Office/i.test(joined) ||
      /^Not applicable\.?$/i.test(joined) ||
      /standard rest period of/i.test(joined)
    ) {
      return para;
    }
    // Spacer vuoti Rev2: preservare; rimuovere solo optional svuotati
    if (!joined) {
      if (optionalIdx[myIdx]) return "";
      return para;
    }
    if (/^\{\{[A-Z0-9_]+\}\}$/.test(joined)) {
      const key = joined.slice(2, -2);
      if (isPreservedClientPlaceholder(key)) return para;
      return "";
    }
    return para;
  });
  const leftover = listUnresolvedNonClientPlaceholders(xml);
  if (leftover.length) {
    console.warn(
      "[clientOffer] placeholder non sostituiti:",
      leftover.join(", ")
    );
  }
  zip.file(path, xml);
  return zip;
}

/**
 * Placeholder residui escludendo quelli cliente intenzionali.
 * @param {string} xml
 * @returns {string[]}
 */
export function listUnresolvedNonClientPlaceholders(xml) {
  const all = listPlaceholdersInXml(xml);
  return all.filter(function (k) {
    return !isPreservedClientPlaceholder(k);
  });
}

/**
 * Elenco placeholder {{KEY}} presenti (anche spezzati tra run).
 * @param {string} xml
 * @returns {string[]}
 */
export function listPlaceholdersInXml(xml) {
  const plain = wordXmlPlainText(xml);
  const found = [];
  const re = /\{\{([A-Z0-9_]+)\}\}/g;
  let m;
  while ((m = re.exec(plain))) {
    if (found.indexOf(m[1]) < 0) found.push(m[1]);
  }
  return found;
}

/**
 * Ricompone {{PLACEHOLDER}} spezzati su più <w:t> nello stesso paragrafo.
 * @param {string} xml
 * @returns {string}
 */
export function repairSplitPlaceholders(xml) {
  return String(xml || "").replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    if (
      /w:drawing|v:imagedata|w:pict|w:br[^>]*w:type="page"|w:sectPr/i.test(para)
    ) {
      return para;
    }
    if (!/\{\{/.test(para) && !/\}\}/.test(para)) return para;

    const texts = [];
    const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let m;
    while ((m = re.exec(para))) {
      texts.push(
        m[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
      );
    }
    const joined = texts.join("");
    const joinedTokens = joined.match(/\{\{[A-Z0-9_]+\}\}/g) || [];
    if (!joinedTokens.length) return para;
    const intactTokens = para.match(/\{\{[A-Z0-9_]+\}\}/g) || [];
    if (intactTokens.length >= joinedTokens.length) return para;

    const pPrMatch = para.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/);
    const pPr = pPrMatch ? pPrMatch[0] : "";
    const open = para.match(/^<w:p\b[^>]*>/);
    const esc = joined
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return (
      (open ? open[0] : "<w:p>") +
      pPr +
      '<w:r><w:t xml:space="preserve">' +
      esc +
      "</w:t></w:r></w:p>"
    );
  });
}

/**
 * Scansiona XML document per placeholder anagrafici mancanti.
 * Daily Rate / Working Hours: ok se presente un alias O testo statico nel template.
 * @param {string} xml
 * @returns {string[]}
 */
export function missingPlaceholdersInXml(xml) {
  const plain = wordXmlPlainText(xml);
  const listed = listPlaceholdersInXml(xml);
  const missing = [];
  REQUIRED_PLACEHOLDERS.forEach(function (key) {
    if (listed.indexOf(key) < 0 && plain.indexOf("{{" + key + "}}") < 0) {
      missing.push(key);
    }
  });
  return missing;
}

/**
 * Il template copre Daily Rate (placeholder o testo statico già valorizzato).
 * @param {string} xml
 * @returns {boolean}
 */
export function templateCoversDailyRate(xml) {
  const listed = listPlaceholdersInXml(xml);
  if (DAILY_RATE_PLACEHOLDER_ALIASES.some(function (k) { return listed.indexOf(k) >= 0; })) {
    return true;
  }
  const plain = wordXmlPlainText(xml);
  return /Daily\s*Rate/i.test(plain);
}

/**
 * Il template copre Working Hours (placeholder o testo statico).
 * @param {string} xml
 * @returns {boolean}
 */
export function templateCoversWorkingHours(xml) {
  const listed = listPlaceholdersInXml(xml);
  if (WORKING_HOURS_PLACEHOLDER_ALIASES.some(function (k) { return listed.indexOf(k) >= 0; })) {
    return true;
  }
  const plain = wordXmlPlainText(xml);
  return /Working\s*hours/i.test(plain);
}

/**
 * Nome file download: SEMPRE Proposal Number + .docx
 * (ignora offer.fileName, candidato, subject).
 * @param {object} state
 * @returns {string}
 */
export function resolveOfferDownloadFileName(state) {
  const pn =
    state && state.offer && state.offer.proposalNumber
      ? String(state.offer.proposalNumber).trim()
      : "";
  return sanitizeWindowsFileName(pn || "OFFERTA_CLIENTE");
}

/**
 * @param {ArrayBuffer} templateBuffer
 * @param {object} state
 * @param {object} [options]
 * @returns {Promise<{ arrayBuffer: ArrayBuffer, fileName: string, data: object }>}
 */
export async function generateClientOfferDocx(templateBuffer, state, options) {
  const opts = options || {};
  if (!templateBuffer) {
    throw new Error(
      "Template Offerta Cliente non disponibile. Caricare il template aziendale."
    );
  }

  applyClientManualNaming(state);
  applyNormalizedRotation(state, opts.draft);
  migrateLegacyProposalNaming(state);

  const validation = validateOfferForWord(state);
  if (!validation.ok && !opts.skipValidation) {
    throw new Error(validation.errors.join("; "));
  }

  const { PizZip, Docxtemplater } = opts.libs || (await loadWordLibs());

  const zip = new PizZip(templateBuffer);
  let docXml = zip.file("word/document.xml").asText();
  docXml = repairSplitPlaceholders(docXml);
  zip.file("word/document.xml", docXml);
  const preFillXml = docXml;

  const coversDaily = templateCoversDailyRate(docXml);
  const coversHours = templateCoversWorkingHours(docXml);
  if (!opts.skipValidation) {
    const baseData = buildTemplateData(state, opts.draft);
    if (coversDaily && !baseData.DAILY_RATE_TEXT) {
      throw new Error(
        "Daily Rate non disponibile. Verificare i dati della remunerazione."
      );
    }
    if (coversHours && !baseData.WORKING_HOURS_TEXT) {
      // solo se il template ha un placeholder da riempire, non se è tutto statico senza {{…}}
      const listed = listPlaceholdersInXml(docXml);
      const needsFill = WORKING_HOURS_PLACEHOLDER_ALIASES.some(function (k) {
        return listed.indexOf(k) >= 0;
      });
      if (needsFill) {
        throw new Error(
          "Working Hours non disponibili. Verificare ore giornaliere e giorni settimanali."
        );
      }
    }
    if (
      !String(baseData.ROTATION_TITLE || "").trim() ||
      !String(baseData.ROTATION_TEXT || "").trim()
    ) {
      if (state.rotation && state.rotation.mode !== "hide") {
        throw new Error(
          "Rotation incompleta. Verificare i giorni di attività e riposo."
        );
      }
    }
  }

  const data = adaptTemplateDataToXml(
    buildTemplateData(state, opts.draft),
    docXml
  );
  const missing = missingPlaceholdersInXml(docXml);
  if (missing.length && opts.requirePlaceholders !== false) {
    console.warn(
      "[clientOffer] placeholder mancanti nel template:",
      missing.join(", ")
    );
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: function (part) {
      // Placeholder cliente sconosciuti/mancanti → lascia letterale, non stringa vuota
      const tag = part && (part.value || part.module || part);
      const key = typeof tag === "string" ? tag : "";
      if (key && isPreservedClientPlaceholder(key)) {
        return "{{" + key + "}}";
      }
      return "";
    }
  });
  doc.render(data);
  const outZip = cleanupEmptyOptionalParagraphs(doc.getZip(), preFillXml);
  const arrayBuffer = outZip.generate({
    type: "arraybuffer",
    compression: "DEFLATE"
  });

  const fileName = resolveOfferDownloadFileName(state);

  let outXml = new PizZip(arrayBuffer).file("word/document.xml").asText();
  outXml = sanitizeGeneratedDocumentXml(outXml);
  // Template B: non iniettare page break / titolo 4.0 duplicato.
  // Reinietta testo rotation se manca (es. NA dopo cleanup dei giorni vuoti).
  {
    const plainRot = wordXmlPlainText(outXml);
    if (
      data.ROTATION_TEXT &&
      !/Our Staff is allowed to return to the Home Office/i.test(plainRot) &&
      !/standard rest period of\s+[\d…]/i.test(plainRot) &&
      !/^Not applicable\.?$/im.test(plainRot)
    ) {
      outXml = ensureRotationTextPresent(
        outXml,
        data.ROTATION_TITLE,
        data.ROTATION_TEXT
      );
    }
  }
  // Formatting aziendale (apici, spaziature, grassetti label) — senza page break extra
  outXml = applyTemplateBFormatting(outXml);

  const outPlain = wordXmlPlainText(outXml);
  if (/\bundefined\b|\bNaN\b/.test(outPlain)) {
    throw new Error("Output Word contiene undefined/NaN");
  }
  if (/Euro 0,00\/hh/.test(outPlain)) {
    throw new Error("Output Word contiene Euro 0,00/hh");
  }

  const finalZip = new PizZip(arrayBuffer);
  finalZip.file("word/document.xml", outXml);
  const finalBuffer = finalZip.generate({
    type: "arraybuffer",
    compression: "DEFLATE"
  });

  return { arrayBuffer: finalBuffer, fileName: fileName, data: data };
}

function paraPlainText(para) {
  const texts = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m;
  while ((m = re.exec(para))) {
    texts.push(
      m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
    );
  }
  return texts.join("").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function xmlEscapeText(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Se il titolo 4.0 c'è ma manca il testo rotation, reinietta il paragrafo.
 * @param {string} xml
 * @param {string} title
 * @param {string} text
 * @returns {string}
 */
export function ensureRotationTextPresent(xml, title, text) {
  const body = String(text || "").trim();
  const ttl = String(title || "").trim();
  if (!body || !ttl) return String(xml || "");
  const plain = wordXmlPlainText(xml);
  if (
    /Our Staff is allowed to return to the Home Office/i.test(plain) ||
    /standard rest period of\s+[\d…]/i.test(plain) ||
    /^Not applicable\.?$/im.test(plain) ||
    plain.indexOf(body) >= 0
  ) {
    return String(xml || "");
  }
  // Inserisci paragrafo testo subito dopo il titolo rotation
  const escBody = xmlEscapeText(body);
  const insert =
    '<w:p><w:pPr><w:spacing w:before="0" w:after="160" /><w:keepLines /></w:pPr>' +
    "<w:r><w:rPr><w:rFonts w:ascii=\"Calibri\" w:hAnsi=\"Calibri\" />" +
    '<w:sz w:val="24" /><w:szCs w:val="24" /></w:rPr>' +
    "<w:t xml:space=\"preserve\">" +
    escBody +
    "</w:t></w:r></w:p>";
  let done = false;
  const out = String(xml || "").replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    if (done) return para;
    if (/REST PERIOD AND RETURN TO THE HOME/i.test(paraPlainText(para))) {
      done = true;
      return para + insert;
    }
    return para;
  });
  return out;
}

/**
 * Compat test/script: applica solo la pipeline formatting template B (master).
 * @param {string} xml
 * @returns {string}
 */
export function ensureOfferDocumentLayout(xml) {
  return applyTemplateBFormatting(xml);
}

/**
 * Correzioni non bloccanti su output Word (prefissi duplicati / frasi incomplete).
 * @param {string} xml
 * @returns {string}
 */
export function sanitizeGeneratedDocumentXml(xml) {
  let out = String(xml || "");
  out = out.replace(/Within(\s+)Within/gi, "Within$1");
  out = out.replace(/Milan,(\s*)Milan,/gi, "Milan,$1");

  // Dedup paragrafi "Overtime: The work exceeding…" (tiene il primo)
  let overtimeSeen = false;
  out = out.replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    if (/w:drawing|v:imagedata|w:pict|w:br[^>]*w:type="page"|w:sectPr/i.test(para)) {
      return para;
    }
    const plain = wordXmlPlainText(para);
    // Mai toccare paragrafi con placeholder cliente protetti
    if (paragraphContainsPreservedClientPlaceholder(plain)) {
      return para;
    }
    if (/Overtime:\s*The work exceeding/i.test(plain)) {
      if (overtimeSeen) return "";
      overtimeSeen = true;
    }
    // Dedup intro Sunday/Holiday incompleto senza Euro
    if (
      /Hours worked on Sundays/i.test(plain) &&
      !/Euro\s+[\d.,]+\/hh/i.test(plain)
    ) {
      return "";
    }
    return para;
  });

  // Second pass: incomplete rotation (già in cleanup, ridondante ma sicuro)
  out = out.replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    if (/w:drawing|v:imagedata|w:pict|w:br[^>]*w:type="page"|w:sectPr/i.test(para)) {
      return para;
    }
    const joined = wordXmlPlainText(para).trim();
    if (paragraphContainsPreservedClientPlaceholder(joined)) {
      return para;
    }
    if (
      joined &&
      !/…|\.\.\.|Not applicable|to be defined/i.test(joined) &&
      (/\bevery\s+days\b/i.test(joined) || /\bperiod of\s+days\b/i.test(joined))
    ) {
      return "";
    }
    return para;
  });

  return out;
}

/**
 * Blocco esplicito: nessun template A / fallback automatico.
 * Il download richiede il template aziendale caricato dall’utente.
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchDefaultTemplateBuffer() {
  throw new Error(
    "Template Offerta Cliente non disponibile. Caricare il template aziendale."
  );
}

export function downloadOfferBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1500);
}

export function arrayBufferToBlob(buffer) {
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

/** Compat: vecchia API docx.js non più usata */
export function isDocxLibAvailable() {
  return true;
}
export async function loadOfferAssets() {
  return { logo: null, sign: null };
}
