/**
 * Generazione CV Word da template aziendale (REV03 FASE B2 + QUALITY PASS 01)
 * Usa docxtemplater + PizZip per preservare header/footer/logo/stili del template.
 * Non dipende dalla UI. Non richiama OpenAI.
 */

import { languageLabel } from "./cvSchema.js";
import { postProcessCvAnalysis } from "./cvPostProcess.js";

export const REQUIRED_PLACEHOLDERS = Object.freeze([
  "FULL_NAME",
  "SKILL",
  "YEAR_OF_BIRTH",
  "NATIONALITY",
  "LANGUAGES",
  "ADDRESS",
  "SUMMARY",
  "EDUCATION",
  "EXPERIENCE",
  "OTHER_INFORMATION"
]);

export const WORD_ERROR_MESSAGES = Object.freeze({
  missing_template: "Caricare il template aziendale prima di generare il CV.",
  invalid_template:
    "Il file caricato non è un DOCX valido.",
  missing_json: "Analizzare il CV prima di generare il documento.",
  generation_failed:
    "Non è stato possibile generare il CV aziendale. Nessuna modifica è stata apportata al file originale.",
  download_failed:
    "Il documento è stato generato, ma il download non è riuscito. Riprovare."
});

let libsPromise = null;

/**
 * @param {string} code
 * @param {string} [detail]
 * @returns {Error}
 */
export function createWordError(code, detail) {
  let msg = WORD_ERROR_MESSAGES[code] || WORD_ERROR_MESSAGES.generation_failed;
  if (detail && code === "invalid_template") {
    msg = detail;
  }
  const err = new Error(msg);
  err.code = code;
  err.userMessage = msg;
  return err;
}

/**
 * Carica PizZip + docxtemplater solo quando serve.
 * @returns {Promise<{ PizZip: Function, Docxtemplater: Function }>}
 */
function loadWordLibs() {
  if (libsPromise) return libsPromise;

  libsPromise = (async function () {
    await loadScriptOnce("lib/docxtemplater/pizzip.js");
    await loadScriptOnce("lib/docxtemplater/docxtemplater.js");
    const PizZip = window.PizZip;
    const Docxtemplater = window.docxtemplater || window.Docxtemplater;
    if (!PizZip || !Docxtemplater) {
      throw createWordError("generation_failed");
    }
    return { PizZip: PizZip, Docxtemplater: Docxtemplater };
  })().catch(function (err) {
    libsPromise = null;
    throw err;
  });

  return libsPromise;
}

/**
 * @param {string} src
 * @returns {Promise<void>}
 */
function loadScriptOnce(src) {
  return new Promise(function (resolve, reject) {
    const existing = document.querySelector('script[data-cv-word-lib="' + src + '"]');
    if (existing) {
      if (existing.getAttribute("data-loaded") === "1") {
        resolve();
        return;
      }
      if (existing.readyState === "complete" || existing.readyState === "loaded") {
        existing.setAttribute("data-loaded", "1");
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
          reject(createWordError("generation_failed"));
        },
        { once: true }
      );
      setTimeout(function () {
        if (existing.getAttribute("data-loaded") === "1") return;
        const ready =
          (src.indexOf("pizzip") >= 0 && window.PizZip) ||
          (src.indexOf("docxtemplater") >= 0 &&
            (window.docxtemplater || window.Docxtemplater));
        if (ready) {
          existing.setAttribute("data-loaded", "1");
          resolve();
        }
      }, 0);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.setAttribute("data-cv-word-lib", src);
    script.onload = function () {
      script.setAttribute("data-loaded", "1");
      resolve();
    };
    script.onerror = function () {
      reject(createWordError("generation_failed"));
    };
    document.head.appendChild(script);
  });
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function s(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
function sanitizeFilePart(text) {
  return s(text)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nome file leggibile.
 * @param {object} analysis
 * @returns {string}
 */
export function buildCvFileName(analysis) {
  const pi = (analysis && analysis.primaryInformation) || {};
  const skill = sanitizeFilePart(pi.skill);
  const fullName = sanitizeFilePart(pi.fullName);
  const year = sanitizeFilePart(pi.yearOfBirth);
  const nat = sanitizeFilePart(pi.nationality);

  let namePart = "";
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      namePart = parts[0];
    } else {
      const first = parts[0];
      const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
      namePart = first + " " + lastInitial;
    }
  }

  const natShort = nat
    ? nat.length <= 3
      ? nat
      : nat.slice(0, 3).replace(/^./, function (c) {
          return c.toUpperCase();
        })
    : "";

  const chunks = ["CV"];
  if (skill) chunks.push(skill);
  if (namePart) chunks.push(namePart);
  if (year) chunks.push(year);
  if (natShort) chunks.push(natShort);

  if (chunks.length === 1) {
    return "CV_Aziendale.docx";
  }

  let file = chunks.join("_").replace(/_+/g, "_");
  if (file.length > 120) {
    file = file.slice(0, 120).replace(/_+$/, "");
  }
  return file + ".docx";
}

/**
 * @param {string[]} languages
 * @returns {string}
 */
export function formatLanguages(languages) {
  if (!Array.isArray(languages) || !languages.length) return "";
  return languages
    .map(function (l) {
      return s(l);
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * @param {object[]} education
 * @returns {string}
 */
export function formatEducationBlock(education) {
  if (!Array.isArray(education) || !education.length) return "";
  const blocks = [];
  education.forEach(function (item) {
    if (!item || typeof item !== "object") return;
    const lines = [];
    if (s(item.period)) lines.push(s(item.period));
    if (s(item.qualification)) lines.push(s(item.qualification));
    const instLoc = [s(item.institution), s(item.location)].filter(Boolean).join(" – ");
    if (instLoc) lines.push(instLoc);
    if (s(item.details)) lines.push(s(item.details));
    if (lines.length) blocks.push(lines.join("\n"));
  });
  return blocks.join("\n\n");
}

/**
 * Testo esperienze (placeholder mode): Periodo / Ruolo / Azienda / bullet.
 * @param {object[]} experience
 * @returns {string}
 */
export function formatExperienceBlock(experience) {
  if (!Array.isArray(experience) || !experience.length) return "";
  const blocks = [];

  experience.forEach(function (item) {
    if (!item || typeof item !== "object") return;
    const lines = [];
    if (s(item.period)) lines.push(s(item.period));
    if (s(item.position)) lines.push(s(item.position));
    if (s(item.company)) lines.push(s(item.company));
    if (s(item.client)) lines.push("Client: " + s(item.client));
    if (s(item.project)) lines.push("Project: " + s(item.project));
    if (s(item.location)) lines.push("Location: " + s(item.location));

    const desc = Array.isArray(item.description) ? item.description : [];
    desc.forEach(function (activity) {
      const a = s(activity).replace(/^[\-\u2013\u2014\u2022\*]\s*/, "");
      if (a) lines.push("• " + a);
    });

    if (lines.length) blocks.push(lines.join("\n"));
  });

  return blocks.join("\n\n");
}

/**
 * @param {object[]} other
 * @returns {string}
 */
export function formatOtherBlock(other) {
  if (!Array.isArray(other) || !other.length) return "";
  const blocks = [];
  other.forEach(function (item) {
    if (!item || typeof item !== "object") return;
    const label = s(item.label);
    const content = s(item.content);
    if (!label && !content) return;
    if (label && content) blocks.push(label + "\n" + content);
    else blocks.push(label || content);
  });
  return blocks.join("\n\n");
}

/**
 * Blocco education con sottosezioni (placeholder mode).
 * @param {object} processed
 * @returns {string}
 */
function formatEducationSectionsText(processed) {
  const sections =
    processed && processed._qp && Array.isArray(processed._qp.educationSections)
      ? processed._qp.educationSections
      : null;
  if (sections && sections.length) {
    const blocks = [];
    sections.forEach(function (sec) {
      if (!sec || !sec.items || !sec.items.length) return;
      const lines = [];
      if (s(sec.title) && s(sec.title) !== "Education") {
        lines.push(s(sec.title));
        lines.push("");
      } else if (s(sec.title) === "Education") {
        // titolo sezione già gestito dal template
      }
      let lastGroup = null;
      sec.items.forEach(function (item) {
        const group = s(item._groupLabel);
        if (group && group !== lastGroup) {
          if (lines.length) lines.push("");
          lines.push(group);
          lastGroup = group;
        }
        if (s(item.period)) lines.push(s(item.period));
        if (s(item.qualification)) lines.push(s(item.qualification));
        const instLoc = [s(item.institution), s(item.location)].filter(Boolean).join(" – ");
        if (instLoc) lines.push(instLoc);
        if (s(item.details)) lines.push("• " + s(item.details));
        lines.push("");
      });
      while (lines.length && !lines[lines.length - 1]) lines.pop();
      blocks.push(lines.join("\n"));
    });
    return blocks.join("\n\n");
  }
  return formatEducationBlock(processed && processed.education);
}

/**
 * Dati per docxtemplater (già post-processati).
 * @param {object} analysis
 * @returns {object}
 */
export function buildTemplateData(analysis) {
  const a = analysis || {};
  const pi = a.primaryInformation || {};
  return {
    FULL_NAME: s(pi.fullName),
    SKILL: s(pi.skill),
    YEAR_OF_BIRTH: s(pi.yearOfBirth),
    NATIONALITY: s(pi.nationality),
    LANGUAGES: formatLanguages(pi.languages),
    ADDRESS: s(pi.address),
    SUMMARY: s(a.summary),
    EDUCATION: formatEducationSectionsText(a),
    EXPERIENCE: formatExperienceBlock(a.experience),
    OTHER_INFORMATION: formatOtherBlock(a.otherInformation)
  };
}

/**
 * @param {string} xml
 * @returns {string[]}
 */
export function findMissingPlaceholders(xml) {
  const missing = [];
  REQUIRED_PLACEHOLDERS.forEach(function (key) {
    const marker = "{{" + key + "}}";
    if (String(xml || "").indexOf(marker) === -1) {
      missing.push(marker);
    }
  });
  return missing;
}

/**
 * Rileva modalità da XML già letto (evita doppio parse).
 * @param {string} xml
 * @returns {"placeholders"|"shell"}
 */
export function detectFillModeFromXml(xml) {
  const missing = findMissingPlaceholders(xml);
  return missing.length === 0 ? "placeholders" : "shell";
}

/**
 * Informativo: i placeholder NON sono obbligatori.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{ ok: boolean, missing: string[], mode: "placeholders"|"shell" }>}
 */
export async function validateTemplatePlaceholders(buffer) {
  try {
    const libs = await loadWordLibs();
    const zip = new libs.PizZip(buffer);
    const docXml = zip.file("word/document.xml");
    if (!docXml) {
      return {
        ok: false,
        missing: REQUIRED_PLACEHOLDERS.map(function (k) {
          return "{{" + k + "}}";
        }),
        mode: "shell"
      };
    }
    const xml = docXml.asText();
    const missing = findMissingPlaceholders(xml);
    return {
      ok: true,
      missing: missing,
      mode: missing.length === 0 ? "placeholders" : "shell"
    };
  } catch (err) {
    return { ok: false, missing: [], mode: "shell" };
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeXml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Run tipografico Times New Roman 12pt.
 * @param {string} text
 * @param {{ bold?: boolean, italic?: boolean }} opts
 * @returns {string}
 */
function wRun(text, opts) {
  const options = opts || {};
  const bold = options.bold ? "<w:b/>" : "";
  const italic = options.italic ? "<w:i/>" : "";
  return (
    "<w:r><w:rPr>" +
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>' +
    bold +
    italic +
    '<w:sz w:val="24"/><w:szCs w:val="24"/>' +
    "</w:rPr><w:t xml:space=\"preserve\">" +
    escapeXml(text) +
    "</w:t></w:r>"
  );
}

/** Riga vuota tipografica (spaziatura uniforme tra blocchi). */
function wBlankLine() {
  return (
    "<w:p><w:pPr>" +
    '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>' +
    '<w:ind w:left="0" w:firstLine="0"/>' +
    "</w:pPr><w:r><w:rPr>" +
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>' +
    '<w:sz w:val="24"/><w:szCs w:val="24"/>' +
    "</w:rPr></w:r></w:p>"
  );
}

/**
 * Paragrafo Word (colonna sinistra allineata, senza rientro extra).
 * @param {string} text
 * @param {{ heading?: boolean, bold?: boolean, italic?: boolean, before?: number, after?: number }} opts
 * @returns {string}
 */
function wParagraph(text, opts) {
  const options = opts || {};
  const content = escapeXml(text);
  if (!content && !options.heading) {
    return "";
  }
  const font = options.heading ? "Segoe UI" : "Times New Roman";
  const size = options.heading ? "26" : "24";
  const bold = options.heading || options.bold ? "<w:b/>" : "";
  const italic = options.italic ? "<w:i/>" : "";
  const before = options.before != null ? options.before : options.heading ? 160 : 0;
  const after = options.after != null ? options.after : options.heading ? 80 : 40;
  const spacing =
    '<w:spacing w:before="' + before + '" w:after="' + after + '"/>';
  const ind = '<w:ind w:left="0" w:firstLine="0"/>';
  const lines = String(text || "").split("\n");
  if (lines.length <= 1) {
    return (
      "<w:p><w:pPr>" +
      spacing +
      ind +
      "</w:pPr><w:r><w:rPr>" +
      '<w:rFonts w:ascii="' +
      font +
      '" w:hAnsi="' +
      font +
      '"/>' +
      bold +
      italic +
      '<w:sz w:val="' +
      size +
      '"/><w:szCs w:val="' +
      size +
      '"/>' +
      "</w:rPr><w:t xml:space=\"preserve\">" +
      content +
      "</w:t></w:r></w:p>"
    );
  }
  let runs = "";
  lines.forEach(function (line, idx) {
    if (idx > 0) {
      runs += "<w:r><w:br/></w:r>";
    }
    runs +=
      "<w:r><w:rPr>" +
      '<w:rFonts w:ascii="' +
      font +
      '" w:hAnsi="' +
      font +
      '"/>' +
      bold +
      italic +
      '<w:sz w:val="' +
      size +
      '"/><w:szCs w:val="' +
      size +
      '"/>' +
      "</w:rPr><w:t xml:space=\"preserve\">" +
      escapeXml(line) +
      "</w:t></w:r>";
  });
  return "<w:p><w:pPr>" + spacing + ind + "</w:pPr>" + runs + "</w:p>";
}

/**
 * Bullet con rientro uniforme (stessa colonna per tutti).
 * @param {string} text
 * @returns {string}
 */
function wBullet(text) {
  const t = s(text).replace(/^[\-\u2013\u2014\u2022\*]\s*/, "");
  if (!t) return "";
  return (
    "<w:p><w:pPr>" +
    '<w:spacing w:before="20" w:after="40"/>' +
    '<w:ind w:left="360" w:hanging="180"/>' +
    "</w:pPr>" +
    wRun("• ") +
    wRun(t) +
    "</w:p>"
  );
}

/** Posizione tab stop per i valori Primary Information (twips). */
const PRIMARY_VALUE_TAB = "2400";

/**
 * Primary Information come paragrafi + tab stop (aspetto manuale, no tabella).
 * @param {Array<[string, string]>} rows
 * @returns {string}
 */
function wPrimaryFields(rows) {
  const usable = rows.filter(function (r) {
    return s(r[1]);
  });
  if (!usable.length) return "";

  let out = "";
  usable.forEach(function (row) {
    out +=
      "<w:p><w:pPr>" +
      '<w:tabs><w:tab w:val="left" w:pos="' +
      PRIMARY_VALUE_TAB +
      '"/></w:tabs>' +
      '<w:spacing w:before="40" w:after="40"/>' +
      '<w:ind w:left="0" w:firstLine="0"/>' +
      "</w:pPr>" +
      wRun(row[0], { bold: false }) +
      "<w:r><w:tab/></w:r>" +
      wRun(row[1], { bold: false }) +
      "</w:p>";
  });
  return out + wBlankLine();
}

/**
 * Rendering education con categorie separate e riga vuota tra elementi.
 * Gerarchia: Data bold → Titolo normale → Istituto corsivo.
 * @param {object} processed
 * @param {string[]} parts
 */
function appendEducationXml(processed, parts) {
  const sections =
    processed && processed._qp && Array.isArray(processed._qp.educationSections)
      ? processed._qp.educationSections
      : [];

  function pushEduItem(item, opts) {
    const options = opts || {};
    const compact = options.compact === true;
    let wrote = false;
    if (s(item.period)) {
      parts.push(wParagraph(s(item.period), { bold: true, after: 20 }));
      wrote = true;
    }
    if (s(item.qualification)) {
      parts.push(wParagraph(s(item.qualification), { bold: false, after: 20 }));
      wrote = true;
    }
    if (s(item.institution)) {
      parts.push(wParagraph(s(item.institution), { italic: true, after: 20 }));
      wrote = true;
    }
    if (s(item.location) && !compact) {
      parts.push(wParagraph(s(item.location), { after: 20 }));
      wrote = true;
    } else if (s(item.location) && s(item.institution)) {
      // già gestito: location separata solo se non compact; in formal edu location dopo istituto
    }
    if (s(item.details)) {
      parts.push(compact ? wParagraph(s(item.details), { after: 20 }) : wBullet(s(item.details)));
      wrote = true;
    }
    if (wrote) parts.push(wBlankLine());
  }

  function pushFormalEduItem(item) {
    let wrote = false;
    if (s(item.period)) {
      parts.push(wParagraph(s(item.period), { bold: true, after: 20 }));
      wrote = true;
    }
    if (s(item.qualification)) {
      parts.push(wParagraph(s(item.qualification), { bold: false, after: 20 }));
      wrote = true;
    }
    const inst = s(item.institution);
    const loc = s(item.location);
    if (inst && loc) {
      parts.push(wParagraph(inst + " – " + loc, { italic: true, after: 20 }));
      wrote = true;
    } else if (inst) {
      parts.push(wParagraph(inst, { italic: true, after: 20 }));
      wrote = true;
    } else if (loc) {
      parts.push(wParagraph(loc, { italic: true, after: 20 }));
      wrote = true;
    }
    if (s(item.details)) {
      parts.push(wBullet(s(item.details)));
      wrote = true;
    }
    if (wrote) parts.push(wBlankLine());
  }

  if (!sections.length) {
    const edu = Array.isArray(processed.education) ? processed.education : [];
    if (!edu.length) return;
    parts.push(wParagraph("Education", { heading: true }));
    edu.forEach(function (item) {
      pushFormalEduItem(item);
    });
    return;
  }

  parts.push(wParagraph("Education", { heading: true }));
  sections.forEach(function (sec, secIdx) {
    if (!sec || !sec.items || !sec.items.length) return;
    const isLanguages = s(sec.title) === "Languages";
    const isFormal = s(sec.title) === "Education";

    if (s(sec.title) && !isFormal) {
      if (secIdx > 0) parts.push(wBlankLine());
      parts.push(
        wParagraph(s(sec.title), {
          bold: true,
          before: 120,
          after: 60
        })
      );
    }

    if (isLanguages) {
      // Sezione compatta: solo elenco, niente sotto-intestazioni duplicate
      sec.items.forEach(function (item) {
        const line = s(item.details || item.qualification);
        if (line) {
          parts.push(wParagraph(line, { after: 40 }));
        }
      });
      parts.push(wBlankLine());
      return;
    }

    let lastGroup = null;
    sec.items.forEach(function (item) {
      const group = s(item._groupLabel);
      // Evita intestazioni gruppo ridondanti rispetto al titolo sezione
      const groupIsRedundant =
        group &&
        (group.toLowerCase() === s(sec.title).toLowerCase() ||
          group.toLowerCase().indexOf(s(sec.title).toLowerCase()) >= 0 ||
          s(sec.title).toLowerCase().indexOf(group.toLowerCase().slice(0, 8)) >= 0);
      if (group && group !== lastGroup && !groupIsRedundant) {
        parts.push(wBlankLine());
        parts.push(wParagraph(group, { bold: true, before: 40, after: 40 }));
        lastGroup = group;
      } else if (group) {
        lastGroup = group;
      }
      if (isFormal) {
        pushFormalEduItem(item);
      } else {
        pushEduItem(item, { compact: false });
      }
    });
  });
}

/**
 * Corpo CV in XML (shell mode): preserva header/footer del template.
 * @param {object} analysis già post-processata
 * @returns {string}
 */
function buildCvBodyXml(analysis) {
  const a = analysis || {};
  const pi = a.primaryInformation || {};
  const parts = [];

  parts.push(wParagraph("Primary Information", { heading: true }));
  parts.push(
    wPrimaryFields([
      ["Name", s(pi.fullName)],
      ["Skill", s(pi.skill)],
      ["Year of birth", s(pi.yearOfBirth)],
      ["Nationality", s(pi.nationality)],
      ["Languages", formatLanguages(pi.languages)],
      ["Address", s(pi.address)]
    ])
  );

  if (s(a.summary)) {
    parts.push(wParagraph("Summary", { heading: true }));
    parts.push(wParagraph(s(a.summary), { before: 40, after: 140 }));
    parts.push(wBlankLine());
  }

  appendEducationXml(a, parts);

  const experience = Array.isArray(a.experience) ? a.experience : [];
  if (experience.length) {
    parts.push(wBlankLine());
    parts.push(wParagraph("Experience", { heading: true }));
    experience.forEach(function (item, idx) {
      if (!item) return;
      if (s(item.period)) {
        parts.push(wParagraph(s(item.period), { bold: true, before: idx === 0 ? 40 : 40, after: 20 }));
      }
      if (s(item.position)) {
        parts.push(wParagraph(s(item.position), { bold: false, after: 20 }));
      }
      if (s(item.company)) {
        parts.push(wParagraph(s(item.company), { after: 20 }));
      }
      if (s(item.location)) {
        parts.push(wParagraph(s(item.location), { after: 20 }));
      }
      if (s(item.client)) {
        parts.push(wParagraph("Client: " + s(item.client), { after: 20 }));
      }
      if (s(item.project)) {
        parts.push(wParagraph("Project: " + s(item.project), { after: 20 }));
      }
      const desc = Array.isArray(item.description) ? item.description : [];
      desc.forEach(function (activity) {
        parts.push(wBullet(activity));
      });
      parts.push(wBlankLine());
    });
  }

  const other = Array.isArray(a.otherInformation) ? a.otherInformation : [];
  if (other.length) {
    parts.push(wBlankLine());
    parts.push(wParagraph("Other Information", { heading: true }));
    other.forEach(function (item) {
      if (!item) return;
      if (s(item.label)) {
        parts.push(wParagraph(s(item.label), { bold: true, before: 60, after: 20 }));
      }
      if (s(item.content)) {
        parts.push(wParagraph(s(item.content), { after: 40 }));
      }
      parts.push(wBlankLine());
    });
  }

  return parts.filter(Boolean).join("");
}

/**
 * Dopo il fill placeholder: rimuove sole righe Primary con valore vuoto.
 * @param {object} zip
 * @returns {object}
 */
function cleanupPlaceholderOutput(zip) {
  const docFile = zip.file("word/document.xml");
  if (!docFile) return zip;
  let xml = docFile.asText();

  xml = xml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, function (row) {
    const texts = [];
    const re = /<w:t\b([^>]*)(?:\/>|>([\s\S]*?)<\/w:t>)/g;
    let m;
    while ((m = re.exec(row))) {
      const raw = m[2] == null ? "" : m[2];
      texts.push(
        String(raw)
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, " ")
          .trim()
      );
    }
    if (!texts.length) return row;
    const label = texts[0].replace(/:$/, "");
    const value = texts.slice(1).join("").trim();
    if (
      /^(Name|Skill|Year of birth|Nationality|Languages|Address)$/i.test(label) &&
      !value
    ) {
      return "";
    }
    // Etichette Primary: niente grassetto (allinea allo stile corpo)
    if (/^(Name|Skill|Year of birth|Nationality|Languages|Address)$/i.test(label)) {
      return row.replace(/<w:b\s*\/>/g, "").replace(/<w:b><\/w:b>/g, "");
    }
    return row;
  });

  zip.file("word/document.xml", xml);
  return zip;
}

/**
 * Compila usando i placeholder {{...}} se presenti.
 * @param {object} zip
 * @param {Function} Docxtemplater
 * @param {object} analysis
 * @returns {object} zip
 */
function fillWithPlaceholders(zip, Docxtemplater, analysis) {
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: function () {
      return "";
    }
  });
  doc.render(buildTemplateData(analysis));
  return cleanupPlaceholderOutput(doc.getZip());
}

/**
 * Fallback: mantiene header/footer/logo/stili/sectPr del template,
 * sostituisce solo il contenuto del body.
 * @param {object} zip PizZip
 * @param {object} analysis
 * @returns {object} zip
 */
function fillTemplateShell(zip, analysis) {
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw createWordError("invalid_template");
  }
  const xml = docFile.asText();
  const sectPrMatch = xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
  const sectPr = sectPrMatch ? sectPrMatch[0] : "";
  const bodyXml = buildCvBodyXml(analysis);

  if (!/<w:body[\s\S]*<\/w:body>/.test(xml)) {
    throw createWordError("generation_failed");
  }

  const newXml = xml.replace(
    /<w:body[^>]*>[\s\S]*<\/w:body>/,
    "<w:body>" + bodyXml + sectPr + "</w:body>"
  );
  zip.file("word/document.xml", newXml);
  return zip;
}

/**
 * Compila il template con l'analisi validata + post-processing locale.
 * Accetta SEMPRE un DOCX aziendale valido:
 * - con placeholder → sostituzione docxtemplater
 * - senza placeholder → shell (header/footer/logo preservati, body CV)
 * @param {{ templateBuffer: ArrayBuffer, analysis: object, fillMode?: string }} options
 * @returns {Promise<{ blob: Blob, fileName: string, arrayBuffer: ArrayBuffer, mode: string, postProcessMs?: number }>}
 */
export async function generateCvDocx(options) {
  const opts = options || {};
  if (!opts.templateBuffer) {
    throw createWordError("missing_template");
  }
  if (!opts.analysis) {
    throw createWordError("missing_json");
  }

  // Post-processing locale (ms) — non muta AppState
  const processed = postProcessCvAnalysis(opts.analysis);
  const postProcessMs =
    processed && processed._qp ? processed._qp.postProcessMs : undefined;

  const libs = await loadWordLibs();
  let zip;
  try {
    zip = new libs.PizZip(opts.templateBuffer);
  } catch (err) {
    throw createWordError("invalid_template");
  }

  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) {
    throw createWordError("invalid_template");
  }

  // Una sola lettura XML per decidere la modalità (niente doppio unzip)
  let mode = opts.fillMode === "placeholders" || opts.fillMode === "shell"
    ? opts.fillMode
    : detectFillModeFromXml(docXmlFile.asText());

  let outZip = zip;

  try {
    if (mode === "placeholders") {
      try {
        outZip = fillWithPlaceholders(zip, libs.Docxtemplater, processed);
      } catch (err) {
        console.warn("[cvWordGenerator] Placeholder non utilizzabili, uso modalità shell.");
        outZip = new libs.PizZip(opts.templateBuffer);
        outZip = fillTemplateShell(outZip, processed);
        mode = "shell";
      }
    } else {
      outZip = fillTemplateShell(zip, processed);
    }
  } catch (err) {
    if (err && err.userMessage) throw err;
    console.warn("[cvWordGenerator] Generazione fallita.");
    throw createWordError("generation_failed");
  }

  let out;
  try {
    out = outZip.generate({
      type: "arraybuffer",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      compression: "DEFLATE"
    });
  } catch (err) {
    throw createWordError("generation_failed");
  }

  const fileName = buildCvFileName(processed);
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });

  return {
    blob: blob,
    fileName: fileName,
    arrayBuffer: out,
    mode: mode,
    postProcessMs: postProcessMs
  };
}

/**
 * Avvia il download del blob.
 * @param {Blob} blob
 * @param {string} fileName
 */
export function downloadBlob(blob, fileName) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "CV_Aziendale.docx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (err) {
    throw createWordError("download_failed");
  }
}

/**
 * Riepilogo sintetico per la card stato (senza render esperienze).
 * @param {object} cv
 * @returns {object}
 */
export function buildStatusSummary(cv) {
  const analysis = cv && cv.analysis;
  const pi = analysis && analysis.primaryInformation ? analysis.primaryInformation : {};
  return {
    candidateName: s(pi.fullName),
    skill: s(pi.skill),
    sourceLanguage: languageLabel((analysis && analysis.sourceLanguage) || cv.detectedLanguage),
    outputLanguage: languageLabel(
      (analysis && analysis.outputLanguage) ||
        (cv.outputLanguage === "same"
          ? (analysis && analysis.sourceLanguage) || "unknown"
          : cv.outputLanguage)
    ),
    experienceCount: analysis && Array.isArray(analysis.experience) ? analysis.experience.length : 0,
    educationCount: analysis && Array.isArray(analysis.education) ? analysis.education.length : 0,
    warningCount: analysis && Array.isArray(analysis.warnings) ? analysis.warnings.length : 0,
    hasTemplate: !!(cv && cv.template && (cv.template.arrayBuffer || cv.template.base64)),
    fileName: cv && cv.uploadedFile ? cv.uploadedFile.name : "",
    fileFormat: cv && cv.uploadedFile ? cv.uploadedFile.format || cv.uploadedFile.type : "",
    fileSize: cv && cv.uploadedFile ? cv.uploadedFile.size : 0,
    generatedFileName: (cv && cv.generatedFileName) || ""
  };
}
