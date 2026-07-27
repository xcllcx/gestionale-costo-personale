/**
 * Post-processing locale pre-Word (REV03 QUALITY PASS 01)
 * Nessuna chiamata OpenAI. Opera su una copia dell'analisi.
 */

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
export function collapseSpaces(text) {
  return s(text).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
export function normalizePunctuation(text) {
  let t = s(text);
  if (!t) return "";
  // Protegge abbreviazioni tipo S.p.A. / M.M. / D.Lgs.
  const protectedParts = [];
  t = t.replace(/\b[A-Za-zÀ-ÖØ-öø-ÿ](?:\.[A-Za-zÀ-ÖØ-öø-ÿ0-9]+)+\.?/g, function (m) {
    protectedParts.push(m);
    return "\uE000" + (protectedParts.length - 1) + "\uE001";
  });
  t = t.replace(/\s+([,.;:!?])/g, "$1");
  t = t.replace(/([,.;:!?])(?!\s|$)/g, "$1 ");
  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/\s+\/\s+/g, " / ");
  t = t.replace(/\s*\|\s*/g, " | ");
  protectedParts.forEach(function (part, idx) {
    t = t.replace("\uE000" + idx + "\uE001", part);
  });
  return t.trim();
}

/**
 * Nome per CV aziendale: capitalizzazione naturale + solo iniziale del cognome.
 * Es. "FRANCESCO CARBONE" → "Francesco C."
 * @param {string} fullName
 * @returns {string}
 */
export function formatPersonNameForCv(fullName) {
  const raw = s(fullName);
  if (!raw) return "";
  const parts = raw
    .split(/\s+/)
    .map(function (p) {
      return p.trim();
    })
    .filter(Boolean)
    .map(function (p) {
      // Mantiene eventuali iniziali già presenti (M., D')
      if (/^[A-Za-zÀ-ÖØ-öø-ÿ]\.$/.test(p)) return p.toUpperCase();
      if (p.indexOf("'") >= 0 || p.indexOf("’") >= 0) {
        return p
          .split(/['’]/)
          .map(function (chunk, i) {
            if (!chunk) return chunk;
            return chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase();
          })
          .join("'");
      }
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    });
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  const given = parts.slice(0, -1).join(" ");
  const surnameInitial = parts[parts.length - 1].charAt(0).toUpperCase() + ".";
  return given + " " + surnameInitial;
}

/**
 * Converte titoli TUTTO MAIUSCOLO in capitalizzazione naturale.
 * @param {string} text
 * @returns {string}
 */
export function naturalTitleCase(text) {
  const raw = s(text);
  if (!raw) return "";
  const letters = raw.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  if (letters.length < 4) return raw;
  const upper = (letters.match(/[A-ZÀ-ÖØ]/g) || []).length;
  const lower = (letters.match(/[a-zà-öø-ÿ]/g) || []).length;
  // Solo se è prevalentemente maiuscolo
  if (upper < letters.length * 0.85 || lower > letters.length * 0.2) {
    return raw;
  }
  return applyTitleCase(raw);
}

/**
 * Capitalizzazione naturale per ruoli/titoli (anche se già misti ma TUTTO MAIUSCOLO).
 * Non forza il title-case se il testo ha già minuscole significative.
 * @param {string} text
 * @returns {string}
 */
export function toNaturalCaps(text) {
  const raw = s(text);
  if (!raw) return "";
  const letters = raw.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  if (!letters.length) return raw;
  const upper = (letters.match(/[A-ZÀ-ÖØ]/g) || []).length;
  const lower = (letters.match(/[a-zà-öø-ÿ]/g) || []).length;
  // Già in capitalizzazione naturale → lascia invariato
  if (lower > 0 && upper / letters.length < 0.7) {
    return raw;
  }
  // Tutto/quasi tutto maiuscolo → naturalizza
  if (upper / letters.length >= 0.7) {
    return applyTitleCase(raw);
  }
  return raw;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function applyTitleCase(raw) {
  const small = {
    e: 1,
    ed: 1,
    di: 1,
    del: 1,
    della: 1,
    delle: 1,
    dei: 1,
    degli: 1,
    a: 1,
    al: 1,
    alla: 1,
    da: 1,
    in: 1,
    su: 1,
    per: 1,
    con: 1,
    and: 1,
    of: 1,
    the: 1,
    or: 1,
    for: 1,
    to: 1
  };
  return String(raw)
    .toLowerCase()
    .split(/(\s+|[-–—/()]+)/)
    .map(function (token, idx, arr) {
      if (!token || /^[\s\-–—/()]+$/.test(token)) return token;
      const bare = token.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "").toLowerCase();
      // Conta parole precedenti non-separatori
      let wordIdx = 0;
      for (let i = 0; i < idx; i++) {
        if (arr[i] && !/^[\s\-–—/()]+$/.test(arr[i])) wordIdx++;
      }
      if (wordIdx > 0 && small[bare]) {
        return token.toLowerCase();
      }
      // Preserva acronimi corti già noti dopo lower (es. b2 → B2 se era livello)
      if (/^[a-z]\d$/i.test(token)) {
        return token.toUpperCase();
      }
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join("");
}

const MONTHS_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre"
];
const MONTHS_EN = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
];
const MONTHS_IT_OUT = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre"
];
const MONTHS_EN_OUT = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const MONTHS_IT_SHORT = MONTHS_IT.map(function (m) {
  return m.slice(0, 3);
});
const MONTHS_EN_SHORT = MONTHS_EN.map(function (m) {
  return m.slice(0, 3);
});

/**
 * @param {string} token
 * @returns {number} 0-11 or -1
 */
function monthIndex(token) {
  const t = s(token).toLowerCase();
  if (!t) return -1;
  let i = MONTHS_IT.indexOf(t);
  if (i >= 0) return i;
  i = MONTHS_EN.indexOf(t);
  if (i >= 0) return i;
  const key = t.slice(0, 3);
  i = MONTHS_IT_SHORT.indexOf(key);
  if (i >= 0) return i;
  i = MONTHS_EN_SHORT.indexOf(key);
  return i;
}

/**
 * @param {string} part
 * @param {"it"|"en"} lang
 * @returns {string}
 */
function formatDatePart(part, lang) {
  const raw = s(part).replace(/\./g, " ").replace(/\s+/g, " ");
  if (!raw) return "";

  // Solo anno
  if (/^\d{4}$/.test(raw)) return raw;

  // mm/yyyy o mm-yyyy
  let m = raw.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const mi = Math.max(0, Math.min(11, Number(m[1]) - 1));
    return lang === "en" ? MONTHS_EN_OUT[mi] + " " + m[2] : MONTHS_IT_OUT[mi] + " " + m[2];
  }

  // yyyy-mm
  m = raw.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (m) {
    const mi = Math.max(0, Math.min(11, Number(m[2]) - 1));
    return lang === "en" ? MONTHS_EN_OUT[mi] + " " + m[1] : MONTHS_IT_OUT[mi] + " " + m[1];
  }

  // "6 Giugno 2026" / "Giugno 2026" / "June 2026"
  m = raw.match(/^(?:(\d{1,2})\s+)?([A-Za-zÀ-ÖØ-öø-ÿ]+)\s+(\d{4})$/);
  if (m) {
    const mi = monthIndex(m[2]);
    if (mi >= 0) {
      return lang === "en" ? MONTHS_EN_OUT[mi] + " " + m[3] : MONTHS_IT_OUT[mi] + " " + m[3];
    }
  }

  // "2024 Febbraio"
  m = raw.match(/^(\d{4})\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)$/);
  if (m) {
    const mi = monthIndex(m[2]);
    if (mi >= 0) {
      return lang === "en" ? MONTHS_EN_OUT[mi] + " " + m[1] : MONTHS_IT_OUT[mi] + " " + m[1];
    }
  }

  return naturalTitleCase(raw);
}

/**
 * Uniforma periodi data.
 * IT: Febbraio 2024 – Giugno 2026
 * EN: February 2024 – June 2026
 * @param {string} period
 * @param {"it"|"en"|string} lang
 * @returns {string}
 */
export function normalizePeriod(period, lang) {
  const raw = s(period)
    .replace(/[–—−]/g, "-")
    .replace(/\s+a\s+/gi, " - ")
    .replace(/\s+to\s+/gi, " - ")
    .replace(/\s+al\s+/gi, " - ");
  if (!raw) return "";

  const outLang = lang === "en" ? "en" : "it";
  const parts = raw.split(/\s*-\s*/);
  if (parts.length === 1) {
    return formatDatePart(parts[0], outLang);
  }
  const left = formatDatePart(parts[0], outLang);
  const right = formatDatePart(parts.slice(1).join(" - "), outLang);
  if (left && right) return left + " – " + right;
  return left || right || raw;
}

/**
 * Categorie EDUCATION (ordine di output).
 */
export const EDUCATION_CATEGORY_ORDER = Object.freeze([
  "Education",
  "Certifications",
  "Technical Qualifications",
  "Safety Training",
  "Software",
  "Skills",
  "Driving Licence",
  "Languages",
  "Soft Skills",
  "Training"
]);

const MOVE_TO_EDUCATION_PATTERNS = [
  { category: "Technical Qualifications", re: /\b(abilitazion[ei]|qualifiche?\s+tecnic|qualifiche?\s+e\s+abilitaz|patentin[oi]|patenti\s+professional|pes|pav|pei|nco|cabine\s+elettrich|ple|piattaform|conduzione\s+mezzi)\b/i },
  { category: "Safety Training", re: /\b(sicurezza|antincendio|primo\s+soccorso|spazi\s+confinat|dpi|prepost[oi]|emergenz|lavori\s+in\s+quota|trabattell)\b/i },
  { category: "Certifications", re: /\b(certificazion[ei]|certificate|certificat[oi]|patentino\s+nco)\b/i },
  { category: "Software", re: /\b(software|office|competenze\s+informatic|pacchetto\s+office|ms\s*office|excel|autocad|word|sap|microsoft|windows|android|browser|powerpoint|posta\s+elettronica)\b/i },
  { category: "Driving Licence", re: /\b(patenti?\s+di\s+guida|driving\s+licen[cs]e|patente\s*[abc]\d?|patente\s*am|automunit|carrelli\s+industrial|mulett|gru\s+per\s+autocarro)\b/i },
  { category: "Languages", re: /\b(lingue|linguistich|languages?|idiomas?|english|italiano|francese|tedesco|spagnolo|madrelingua|mother\s*tongue|livello\s+(a1|a2|b1|b2|c1|c2)|competenze\s+linguistich)\b/i },
  { category: "Skills", re: /\b(^skills?$|technical\s+skills|hard\s+skills)\b/i },
  { category: "Soft Skills", re: /\b(soft\s*skills?|leadership|project\s*management|coordinamento|competenze\s+managerial|gestione\s+dei\s+team)\b/i },
  { category: "Training", re: /\b(training|formazione|corsi|addestramento)\b/i },
  { category: "Education", re: /\b(istruzione|diploma|laurea|degree|istituto|university|universit[aà]|titoli?\s+di\s+studio|high\s+school|scuola\s+superiore)\b/i }
];

/**
 * @param {string} label
 * @param {string} content
 * @returns {string|null} category title or null if should stay in Other
 */
export function classifyOtherItem(label, content) {
  const lab = s(label);
  const cont = s(content);
  if (!lab && !cont) return null;

  // Privacy / authorization → Other Information
  if (/\b(autorizz|privacy|trattamento\s+dei\s+dati|gdpr|decreto\s+legislativo)\b/i.test(lab + " " + cont)) {
    return null;
  }
  // Contatti / recapiti restano in Other (non vanno in Education)
  if (/\b(contatti|contacts?|recapiti)\b/i.test(lab)) {
    return null;
  }

  // Priorità all'etichetta (evita che una parola nel contenuto sposti tutta la sezione)
  if (lab) {
    for (let i = 0; i < MOVE_TO_EDUCATION_PATTERNS.length; i++) {
      if (MOVE_TO_EDUCATION_PATTERNS[i].re.test(lab)) {
        return MOVE_TO_EDUCATION_PATTERNS[i].category;
      }
    }
  }

  const hay = (lab + " " + cont).toLowerCase();
  for (let i = 0; i < MOVE_TO_EDUCATION_PATTERNS.length; i++) {
    if (MOVE_TO_EDUCATION_PATTERNS[i].re.test(hay)) {
      return MOVE_TO_EDUCATION_PATTERNS[i].category;
    }
  }
  return null;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitContentItems(text) {
  const raw = s(text);
  if (!raw) return [];
  // Spezza su frasi che iniziano con nuova certificazione (euristica leggera)
  const chunks = raw
    .split(/(?<=\.)\s+(?=[A-ZÀ-ÖØ][A-Za-zÀ-ÖØ-öø-ÿ].{8,}?(?:\:|\())/)
    .map(function (c) {
      return normalizePunctuation(collapseSpaces(c));
    })
    .filter(Boolean);
  if (chunks.length > 1) return chunks;
  return [normalizePunctuation(collapseSpaces(raw))];
}

/**
 * @param {object} analysis
 * @returns {"it"|"en"}
 */
function resolveLang(analysis) {
  const out = s(analysis && analysis.outputLanguage).toLowerCase();
  if (out === "en") return "en";
  if (out === "it") return "it";
  const src = s(analysis && analysis.sourceLanguage).toLowerCase();
  if (src === "en") return "en";
  return "it";
}

/**
 * Pulisce e arricchisce l'analisi per la sola generazione Word.
 * Non muta l'oggetto originale.
 * @param {object} analysis
 * @returns {object}
 */
export function postProcessCvAnalysis(analysis) {
  const t0 =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  const src = analysis && typeof analysis === "object" ? analysis : {};
  const lang = resolveLang(src);

  const piSrc = src.primaryInformation || {};
  const primaryInformation = {
    fullName: formatPersonNameForCv(piSrc.fullName),
    skill: toNaturalCaps(normalizePunctuation(collapseSpaces(piSrc.skill))),
    yearOfBirth: s(piSrc.yearOfBirth),
    nationality: toNaturalCaps(normalizePunctuation(collapseSpaces(piSrc.nationality))),
    languages: Array.isArray(piSrc.languages)
      ? piSrc.languages
          .map(function (l) {
            return toNaturalCaps(normalizePunctuation(collapseSpaces(l)));
          })
          .filter(Boolean)
      : [],
    address: normalizePunctuation(collapseSpaces(piSrc.address))
  };

  const educationFormal = [];
  (Array.isArray(src.education) ? src.education : []).forEach(function (item) {
    if (!item || typeof item !== "object") return;
    const row = {
      period: normalizePeriod(item.period, lang),
      institution: toNaturalCaps(normalizePunctuation(collapseSpaces(item.institution))),
      qualification: toNaturalCaps(normalizePunctuation(collapseSpaces(item.qualification))),
      location: toNaturalCaps(normalizePunctuation(collapseSpaces(item.location))),
      details: normalizePunctuation(collapseSpaces(item.details))
    };
    if (
      row.period ||
      row.institution ||
      row.qualification ||
      row.location ||
      row.details
    ) {
      educationFormal.push(row);
    }
  });

  /** @type {Record<string, {title: string, items: object[]}>} */
  const sections = {};
  function ensureSection(title) {
    if (!sections[title]) {
      sections[title] = { title: title, items: [] };
    }
    return sections[title];
  }

  if (educationFormal.length) {
    ensureSection("Education").items = educationFormal.slice();
  }

  const otherKept = [];
  (Array.isArray(src.otherInformation) ? src.otherInformation : []).forEach(
    function (item) {
      if (!item || typeof item !== "object") return;
      const label = naturalTitleCase(normalizePunctuation(collapseSpaces(item.label)));
      const content = normalizePunctuation(collapseSpaces(item.content));
      if (!label && !content) return;

      // Contenuti misti (es. Office | Patente B): classifica ogni pezzo
      const rawPieces =
        content.indexOf("|") >= 0
          ? content
              .split("|")
              .map(function (c) {
                return normalizePunctuation(collapseSpaces(c));
              })
              .filter(Boolean)
          : content
            ? [content]
            : [""];

      rawPieces.forEach(function (piece) {
        // Blocco intero: priorità etichetta. Pezzi misti (|): priorità contenuto.
        const category =
          rawPieces.length > 1
            ? (piece && classifyOtherItem("", piece)) ||
              classifyOtherItem(label, piece)
            : classifyOtherItem(label, piece) ||
              (piece && classifyOtherItem("", piece));
        if (!category) {
          // Contatti: non stampare in Other (il CV aziendale resta pulito)
          if (/\b(contatti|contacts?|recapiti)\b/i.test(label)) {
            return;
          }
          otherKept.push({
            label: rawPieces.length > 1 ? "" : label,
            content: piece
          });
          return;
        }

        const section = ensureSection(category);
        const pieces = piece ? splitContentItems(piece) : [];
        if (!pieces.length) {
          if (label) {
            section.items.push({
              period: "",
              institution: "",
              qualification: label,
              location: "",
              details: ""
            });
          }
          return;
        }
        pieces.forEach(function (p) {
          section.items.push({
            period: "",
            institution: "",
            qualification: "",
            location: "",
            details: p,
            _groupLabel: label
          });
        });
      });
    }
  );

  // Ordina certificazioni all'interno dello STESSO gruppo etichetta (stabile)
  EDUCATION_CATEGORY_ORDER.forEach(function (title) {
    const sec = sections[title];
    if (!sec || title === "Education") return;
    sec.items.sort(function (a, b) {
      const g = s(a._groupLabel).localeCompare(s(b._groupLabel), lang === "en" ? "en" : "it", {
        sensitivity: "base"
      });
      if (g !== 0) return g;
      return s(a.details || a.qualification).localeCompare(
        s(b.details || b.qualification),
        lang === "en" ? "en" : "it",
        { sensitivity: "base" }
      );
    });
  });

  // Languages già in Primary → evita doppia sezione Languages sotto Education
  const hasPrimaryLanguages = primaryInformation.languages.length > 0;
  if (hasPrimaryLanguages && sections.Languages) {
    sections.Languages.items.forEach(function (it) {
      const detail = s(it.details || it.qualification);
      if (!detail) return;
      const already = primaryInformation.languages.some(function (l) {
        return (
          s(l).toLowerCase().indexOf(detail.toLowerCase().slice(0, 12)) >= 0 ||
          detail.toLowerCase().indexOf(s(l).toLowerCase().slice(0, 12)) >= 0
        );
      });
      if (!already && detail.length < 80) {
        primaryInformation.languages.push(toNaturalCaps(detail));
      }
    });
    delete sections.Languages;
  }

  const educationSections = EDUCATION_CATEGORY_ORDER.map(function (title) {
    return sections[title];
  }).filter(function (sec) {
    return sec && sec.items && sec.items.length;
  });

  // education flat (compatibilità schema / conteggi Word)
  const educationFlat = [];
  educationSections.forEach(function (sec) {
    sec.items.forEach(function (it) {
      educationFlat.push({
        period: it.period || "",
        institution: it.institution || "",
        qualification: it.qualification || "",
        location: it.location || "",
        details: it.details || ""
      });
    });
  });

  const experience = (Array.isArray(src.experience) ? src.experience : [])
    .map(function (item) {
      if (!item || typeof item !== "object") return null;
      const description = (Array.isArray(item.description) ? item.description : [])
        .map(function (d) {
          let t = normalizePunctuation(collapseSpaces(d));
          t = t.replace(/^[\-\u2013\u2014\u2022\*]\s*/, "");
          return t;
        })
        .filter(Boolean);
      const row = {
        period: normalizePeriod(item.period, lang),
        company: toNaturalCaps(normalizePunctuation(collapseSpaces(item.company))),
        client: toNaturalCaps(normalizePunctuation(collapseSpaces(item.client))),
        project: toNaturalCaps(normalizePunctuation(collapseSpaces(item.project))),
        position: toNaturalCaps(normalizePunctuation(collapseSpaces(item.position))),
        location: toNaturalCaps(normalizePunctuation(collapseSpaces(item.location))),
        description: description
      };
      if (
        !(
          row.period ||
          row.company ||
          row.position ||
          row.client ||
          row.project ||
          row.location ||
          row.description.length
        )
      ) {
        return null;
      }
      return row;
    })
    .filter(Boolean);

  const summary = normalizePunctuation(collapseSpaces(src.summary));

  const warnings = Array.isArray(src.warnings)
    ? src.warnings
        .map(function (w) {
          return normalizePunctuation(collapseSpaces(w));
        })
        .filter(Boolean)
    : [];

  const t1 =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();

  return {
    sourceLanguage: src.sourceLanguage || "unknown",
    outputLanguage: src.outputLanguage || "unknown",
    primaryInformation: primaryInformation,
    summary: summary,
    education: educationFlat,
    experience: experience,
    otherInformation: otherKept,
    warnings: warnings,
    _qp: {
      educationSections: educationSections,
      lang: lang,
      postProcessMs: Math.round((t1 - t0) * 100) / 100
    }
  };
}
