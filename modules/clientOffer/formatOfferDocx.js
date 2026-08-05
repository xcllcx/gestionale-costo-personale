/**
 * Hotfix grafici minimi su Word XML.
 * Il template è MASTER: niente interlinea/rientri/page-break globali.
 * Solo: apici data, label bold (clonando rPr), spacing mirati, dedupe rotation.
 */

import { wordXmlPlainText } from "./transform.js";

/** 8 pt in twips */
export const SPACE_AFTER_8PT = 160;
/** Calibri 12 (half-points) */
const CALIBRI_12_RPR =
  '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" />' +
  '<w:sz w:val="24" /><w:szCs w:val="24" /></w:rPr>';

export const LINE_SPACING_115 = 276;

function paraPlain(para) {
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

function xmlEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ensurePPr(para) {
  if (/<w:pPr[\s>]/.test(para)) return para;
  return para.replace(/<w:p\b([^>]*)>/, "<w:p$1><w:pPr></w:pPr>");
}

/**
 * @param {string} para
 * @param {{ before?: number|null, after?: number|null, keepNext?: boolean, left?: number|null, firstLine?: number|null, pageBreakBefore?: boolean }} opt
 */
export function setParaFormat(para, opt) {
  const o = opt || {};
  let p = ensurePPr(para);
  if (o.before != null || o.after != null) {
    const existing = (p.match(/<w:spacing\b[^/]*\/>/) || [])[0] || "";
    const before =
      o.before != null
        ? o.before
        : (existing.match(/w:before="(\d+)"/) || [])[1];
    const after =
      o.after != null ? o.after : (existing.match(/w:after="(\d+)"/) || [])[1];
    const line = (existing.match(/w:line="(\d+)"/) || [])[1];
    const lineRule = (existing.match(/w:lineRule="([^"]+)"/) || [])[1];
    p = p.replace(/<w:spacing\b[^/]*\/>/g, "");
    let sp = "<w:spacing";
    if (before != null && before !== "") sp += ' w:before="' + before + '"';
    if (after != null && after !== "") sp += ' w:after="' + after + '"';
    if (line) sp += ' w:line="' + line + '"';
    if (lineRule) sp += ' w:lineRule="' + lineRule + '"';
    sp += " />";
    p = p.replace(/<w:pPr([^>]*)>/, "<w:pPr$1>" + sp);
  }
  if (o.keepNext && !/<w:keepNext\b/i.test(p)) {
    p = p.replace(/<w:pPr([^>]*)>/, "<w:pPr$1><w:keepNext /><w:keepLines />");
  }
  if (o.pageBreakBefore) {
    if (!/<w:pageBreakBefore\b/i.test(p)) {
      p = p.replace(/<w:pPr([^>]*)>/, "<w:pPr$1><w:pageBreakBefore />");
    }
  }
  if (o.left != null || o.firstLine != null) {
    p = p.replace(/<w:ind\b[^/]*\/>/g, "");
    let ind = "<w:ind";
    if (o.left != null) ind += ' w:left="' + o.left + '"';
    if (o.firstLine != null) ind += ' w:firstLine="' + o.firstLine + '"';
    else ind += ' w:firstLine="0"';
    ind += " />";
    p = p.replace(/<w:pPr([^>]*)>/, "<w:pPr$1>" + ind);
  }
  return p;
}

function rebuildBody(xml, paras) {
  const sect =
    (String(xml || "").match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/) || [])[0] || "";
  const bodyOpen =
    (String(xml || "").match(/<w:body[^>]*>/) || [])[0] || "<w:body>";
  const prefix = String(xml || "").split(/<w:body[^>]*>/)[0] || "";
  const suffix = String(xml || "").split(/<\/w:body>/)[1] || "";
  return prefix + bodyOpen + paras.filter(Boolean).join("") + sect + "</w:body>" + suffix;
}

/**
 * Clona rPr del run originale; garantisce Calibri 12; applica extra (bold/superscript).
 * @param {string|null} rPr
 * @param {string} [extraInner]
 */
function cloneRPr(rPr, extraInner) {
  let base = rPr && /<w:rPr[\s>]/.test(rPr) ? rPr : CALIBRI_12_RPR;
  let inner = base.replace(/^<w:rPr[^>]*>/, "").replace(/<\/w:rPr>$/, "");
  if (!/w:rFonts\b/i.test(inner)) {
    inner =
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" />' + inner;
  }
  if (!/w:sz\b/i.test(inner)) {
    inner += '<w:sz w:val="24" /><w:szCs w:val="24" />';
  }
  if (extraInner && /vertAlign/.test(extraInner)) {
    inner = inner.replace(/<w:vertAlign\b[^/]*\/>/g, "");
  }
  if (extraInner && /<w:b\b/.test(extraInner)) {
    inner = inner.replace(/<w:b\b[^/]*\/>/g, "");
    inner = inner.replace(/<w:bCs\b[^/]*\/>/g, "");
  }
  return "<w:rPr>" + inner + (extraInner || "") + "</w:rPr>";
}

function firstRunRPr(para) {
  const run = (para.match(/<w:r\b[\s\S]*?<\/w:r>/) || [])[0] || "";
  return (run.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/) || [])[0] || null;
}

function makeRun(text, rPr) {
  return (
    "<w:r>" +
    (rPr || CALIBRI_12_RPR) +
    '<w:t xml:space="preserve">' +
    xmlEscape(text) +
    "</w:t></w:r>"
  );
}

/**
 * @param {number|string} day
 * @returns {{ number: string, suffix: string }}
 */
export function getOrdinalParts(day) {
  const n = Number(day);
  if (!Number.isFinite(n) || n <= 0) {
    return { number: String(day == null ? "" : day), suffix: "" };
  }
  const j = n % 10;
  const k = n % 100;
  let suffix = "th";
  if (j === 1 && k !== 11) suffix = "st";
  else if (j === 2 && k !== 12) suffix = "nd";
  else if (j === 3 && k !== 13) suffix = "rd";
  return { number: String(n), suffix: suffix };
}

/**
 * @param {{ bold?: boolean }} [options]
 */
export function appendLabelAndValue(_paragraphIgnored, label, value, options) {
  const opts = options || {};
  const base = CALIBRI_12_RPR;
  const rPrLabel =
    opts.bold !== false ? cloneRPr(base, "<w:b /><w:bCs />") : cloneRPr(base);
  let out = makeRun(String(label || ""), rPrLabel);
  if (value != null && String(value) !== "") {
    const v = String(value);
    out += makeRun(v.charAt(0) === " " ? v : " " + v, cloneRPr(base));
  }
  return out;
}

export function applyOrdinalSuperscripts(xml) {
  return String(xml || "").replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    if (/w:drawing|w:sectPr|w:br[^>]*w:type="page"/i.test(para)) return para;
    if (/w:vertAlign[^>]*w:val="superscript"/i.test(para)) return para;

    const plain = paraPlain(para);
    const m = plain.match(/\b(\d{1,2})(st|nd|rd|th)\b/i);
    if (!m) return para;
    const parts = getOrdinalParts(Number(m[1]));
    if (!parts.suffix) return para;
    const ordRe = new RegExp(
      "\\b(" + parts.number + ")(st|nd|rd|th)\\b",
      "i"
    );

    let replaced = false;
    return para.replace(/<w:r\b[\s\S]*?<\/w:r>/g, function (run) {
      if (replaced) return run;
      if (/w:tab\b|w:br\b|w:drawing/i.test(run) && !/<w:t[\s>]/.test(run)) {
        return run;
      }
      const tm = run.match(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/);
      if (!tm) return run;
      const raw = tm[2]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      if (!ordRe.test(raw)) return run;

      const rPr = (run.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/) || [])[0] || null;
      const mm = raw.match(ordRe);
      if (!mm) return run;
      const idx = mm.index;
      const before = raw.slice(0, idx);
      const after = raw.slice(idx + mm[0].length);
      replaced = true;

      let frag = "";
      if (before) frag += makeRun(before, cloneRPr(rPr));
      frag += makeRun(parts.number, cloneRPr(rPr));
      frag += makeRun(
        parts.suffix,
        cloneRPr(rPr, '<w:vertAlign w:val="superscript" />')
      );
      if (after) frag += makeRun(after, cloneRPr(rPr));
      return frag;
    });
  });
}

const LABEL_VALUE_RE =
  /^(Daily Rate at site:|Monthly Rate:|Working hours:|Overtime:|This rate is inclusive of:|Local accommodation(?: and transportation)?(?: \/ meals)?:|Local accommodation, transportation and meals:|Local transportation:|Pocket money:|Ticket Flight(?:[^:]*)?:|Travel expenses \(Mob-Demob\):)(\s*)(.*)$/i;

export function applyRemunerationLabelBold(xml) {
  return String(xml || "").replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    if (/w:drawing|w:sectPr|w:br[^>]*w:type="page"/i.test(para)) return para;
    const plain = paraPlain(para);
    if (!plain) return para;
    const baseRPr = firstRunRPr(para);

    if (/^Travelling day is to be considered as working day\.?$/i.test(plain)) {
      const pPr = (para.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/) || [])[0] || "";
      const open = para.match(/^<w:p\b[^>]*>/)?.[0] || "<w:p>";
      return (
        open +
        pPr +
        makeRun(plain, cloneRPr(baseRPr, "<w:b /><w:bCs />")) +
        "</w:p>"
      );
    }

    const m = plain.match(LABEL_VALUE_RE);
    if (!m) return para;
    const label = m[1];
    const sep = m[2] || " ";
    const value = m[3] || "";
    const pPr = (para.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/) || [])[0] || "";
    const open = para.match(/^<w:p\b[^>]*>/)?.[0] || "<w:p>";
    let runs = makeRun(label, cloneRPr(baseRPr, "<w:b /><w:bCs />"));
    if (value) runs += makeRun(sep + value, cloneRPr(baseRPr));
    return open + pPr + runs + "</w:p>";
  });
}

/**
 * Spaziature mirate hotfix (8pt) — non tocca rientri/interlinea globali.
 */
export function applyHotfixSpacings(xml) {
  return String(xml || "").replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    if (/w:drawing|w:sectPr|w:br[^>]*w:type="page"/i.test(para)) return para;
    const plain = paraPlain(para);
    if (!plain) return para;

    if (/^SUBJECT\s*:/i.test(plain) || /^Location\s*:/i.test(plain)) {
      return setParaFormat(para, { after: SPACE_AFTER_8PT });
    }
    if (/^Proposal N/i.test(plain)) {
      return setParaFormat(para, { after: SPACE_AFTER_8PT });
    }
    if (/^Local accommodation/i.test(plain)) {
      return setParaFormat(para, { after: SPACE_AFTER_8PT });
    }
    return para;
  });
}

/**
 * TERMS AND CONDITIONS OF SALE sempre a inizio pagina 2 (dopo la firma).
 */
export function ensurePageBreakBeforeTerms(xml) {
  return String(xml || "").replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    const plain = paraPlain(para);
    if (!/^TERMS AND CONDITIONS OF SALE$/i.test(plain)) return para;
    if (/w:br[^>]*w:type="page"/i.test(para) || /pageBreakBefore/i.test(para)) {
      return para;
    }
    return setParaFormat(para, { pageBreakBefore: true });
  });
}

/**
 * Own car allineato al TESTO dei bullet (es. Travel expenses), non al pallino.
 * Remuneration bullets (numId 1 → abs 1): left=960 hanging=360 → testo a 960.
 */
export function alignOwnCarToBulletText(xml) {
  // Default: rientro testo bullet Remuneration del template B
  let textLeft = 960;
  String(xml || "").replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    const plain = paraPlain(para);
    if (/Travel expenses \(Mob-Demob\)/i.test(plain)) {
      const left = (para.match(/w:ind[^>]*w:left="(\d+)"/) || [])[1];
      if (left != null) textLeft = Number(left);
    }
    return para;
  });

  return String(xml || "").replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    if (!/In case of travelling with his own car/i.test(paraPlain(para))) {
      return para;
    }
    let p = para.replace(/<w:numPr\b[\s\S]*?<\/w:numPr>/g, "");
    p = setParaFormat(p, { left: textLeft, firstLine: 0 });
    return p;
  });
}

/**
 * Max 2 paragrafi vuoti tra Travel expenses / own car e titolo 4.0 REST PERIOD.
 */
export function trimEmptiesBeforeRotationTitle(xml) {
  const paras = String(xml || "").match(/<w:p\b[\s\S]*?<\/w:p>/g);
  if (!paras || !paras.length) return String(xml || "");

  let rotIdx = -1;
  for (let i = 0; i < paras.length; i++) {
    if (/REST PERIOD AND RETURN TO THE HOME/i.test(paraPlain(paras[i]))) {
      rotIdx = i;
      break;
    }
  }
  if (rotIdx < 0) return String(xml || "");

  let anchor = -1;
  for (let i = rotIdx - 1; i >= 0; i--) {
    const plain = paraPlain(paras[i]);
    if (
      plain &&
      (/Travel expenses \(Mob-Demob\)/i.test(plain) ||
        /In case of travelling with his own car/i.test(plain) ||
        /Ticket Flight/i.test(plain) ||
        /Travelling day is to be considered/i.test(plain))
    ) {
      anchor = i;
      break;
    }
  }
  if (anchor < 0) return String(xml || "");

  const kept = [];
  for (let i = 0; i < paras.length; i++) {
    if (i > anchor && i < rotIdx) continue;
    kept.push(paras[i]);
    if (i === anchor) {
      const middles = [];
      for (let j = anchor + 1; j < rotIdx; j++) middles.push(paras[j]);
      const nonEmpty = middles.filter(function (p) {
        return paraPlain(p);
      });
      const empties = middles
        .filter(function (p) {
          return !paraPlain(p);
        })
        .slice(0, 2);
      kept.push.apply(kept, nonEmpty.concat(empties));
    }
  }
  if (!/<w:body[^>]*>/.test(String(xml || ""))) return String(xml || "");
  return rebuildBody(xml, kept);
}

/**
 * Unisce il paragrafo spezzato "standard rest period…" nel paragrafo Staff
 * e rimuove ogni riga isolata duplicata.
 */
export function mergeRotationRestContinuation(xml) {
  const paras = String(xml || "").match(/<w:p\b[\s\S]*?<\/w:p>/g);
  if (!paras || !paras.length) return String(xml || "");

  let staffIdx = -1;
  const restIdxs = [];
  for (let i = 0; i < paras.length; i++) {
    const plain = paraPlain(paras[i]);
    if (
      staffIdx < 0 &&
      /Our Staff is allowed to return to the Home Office/i.test(plain)
    ) {
      staffIdx = i;
    }
    if (/^standard rest period of/i.test(plain)) restIdxs.push(i);
  }

  if (staffIdx >= 0 && restIdxs.length) {
    const staffPlain = paraPlain(paras[staffIdx]);
    const restPlain = paraPlain(paras[restIdxs[0]]);
    if (!/standard rest period of/i.test(staffPlain) && restPlain) {
      const open = paras[staffIdx].match(/^<w:p\b[^>]*>/)?.[0] || "<w:p>";
      const pPr =
        (paras[staffIdx].match(/<w:pPr\b[\s\S]*?<\/w:pPr>/) || [])[0] || "";
      const rPr = firstRunRPr(paras[staffIdx]);
      const sep = /a$/i.test(staffPlain) ? " " : " ";
      paras[staffIdx] =
        open +
        pPr +
        makeRun(staffPlain + sep + restPlain, cloneRPr(rPr)) +
        "</w:p>";
    }
    for (let k = 0; k < restIdxs.length; k++) {
      paras[restIdxs[k]] = null;
    }
  } else if (restIdxs.length > 1) {
    for (let k = 1; k < restIdxs.length; k++) paras[restIdxs[k]] = null;
  }

  if (!/<w:body[^>]*>/.test(String(xml || ""))) {
    return paras.filter(Boolean).join("");
  }
  return rebuildBody(xml, paras);
}

/**
 * @deprecated Usare mergeRotationRestContinuation
 */
export function dedupeRotationRestPeriod(xml) {
  return mergeRotationRestContinuation(xml);
}

/**
 * Se il rate è mensile (/month) ma il template ha ancora "Daily Rate at site",
 * rinomina la label in "Monthly Rate" (layout invariato).
 * @param {string} xml
 * @returns {string}
 */
export function rewriteDailyRateLabelForMonthly(xml) {
  return String(xml || "").replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
    const plain = paraPlain(para);
    if (!plain) return para;
    if (!/Daily Rate at site:/i.test(plain)) return para;
    if (!/\/\s*month\b/i.test(plain) && !/\/month\b/i.test(plain)) return para;
    return para.replace(/Daily Rate at site/gi, "Monthly Rate");
  });
}

/**
 * Pipeline hotfix layout (template master + post-process mirato).
 */
export function applyTemplateBFormatting(xml) {
  let out = String(xml || "");
  out = ensurePageBreakBeforeTerms(out);
  out = mergeRotationRestContinuation(out);
  out = trimEmptiesBeforeRotationTitle(out);
  out = alignOwnCarToBulletText(out);
  out = applyOrdinalSuperscripts(out);
  out = rewriteDailyRateLabelForMonthly(out);
  out = applyRemunerationLabelBold(out);
  out = applyHotfixSpacings(out);
  out = out.replace(/4\.0\s+4\.0\s+/g, "4.0 ");
  return out;
}

export function extractLayoutMetrics(xml) {
  const paras = String(xml || "").match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  let emptyCount = 0;
  let line115 = 0;
  let ownCarLeft = null;
  let rotationBodyLeft = null;
  let titleCount = 0;
  let restPeriodLines = 0;
  for (const p of paras) {
    const plain = paraPlain(p);
    if (!plain) emptyCount++;
    const line = (p.match(/w:line="(\d+)"/) || [])[1];
    if (line === String(LINE_SPACING_115)) line115++;
    if (/In case of travelling with his own car/i.test(plain)) {
      ownCarLeft = Number((p.match(/w:left="(\d+)"/) || [])[1] || 0);
    }
    if (/Our Staff is allowed to return to the Home Office/i.test(plain)) {
      rotationBodyLeft = Number((p.match(/w:left="(\d+)"/) || [])[1] || 0);
    }
    if (/standard rest period of/i.test(plain)) restPeriodLines++;
    if (
      /^(SCOPE|PERFORMANCE OF SERVICES|REMUNERATION|REST PERIOD|COMMENCEMENT AND DURATION|INVOICING|PAYMENT|ACCIDENTS AND ILLNESS|COMPETENT COURT)/i.test(
        plain
      )
    ) {
      titleCount++;
    }
  }
  return {
    paraCount: paras.length,
    emptyCount: emptyCount,
    line115Count: line115,
    pageBreaks: (String(xml || "").match(/w:type="page"/g) || []).length,
    ownCarLeft: ownCarLeft,
    rotationBodyLeft: rotationBodyLeft,
    titleCount: titleCount,
    restPeriodLines: restPeriodLines
  };
}

export { paraPlain as formatParaPlainText, wordXmlPlainText };
