/**
 * Hotfix locale: aggiorna OFFERTA_CLIENTE_TEMPLATE.docx
 * - placeholder DAILY_RATE_TEXT / WORKING_HOURS_TEXT
 * - Milan, {{OFFER_DATE}} (data senza "Milan" nel valore)
 * - page break prima della Rotation
 * - spacing titoli / paragrafi remunerazione
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadPizZip() {
  const code = fs.readFileSync(
    path.join(root, "lib/docxtemplater/pizzip.js"),
    "utf8"
  );
  const ctx = {
    module: { exports: {} },
    exports: {},
    window: {},
    self: {},
    console
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(
    code + "\nthis.PizZip = this.PizZip || module.exports;",
    ctx
  );
  return ctx.PizZip || ctx.module.exports;
}

function paraPlain(para) {
  const texts = [];
  // Evita match su <w:tab / <w:tc
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

function ensurePPr(para) {
  if (/<w:pPr[\s>]/.test(para)) return para;
  return para.replace(/<w:p\b([^>]*)>/, "<w:p$1><w:pPr></w:pPr>");
}

function setSpacing(para, before, after, keepNext) {
  let p = ensurePPr(para);
  p = p.replace(/<w:spacing\b[^/]*\/>/g, "");
  p = p.replace(/<w:keepNext\b[^/]*\/>/g, "");
  p = p.replace(/<w:keepLines\b[^/]*\/>/g, "");
  p = p.replace(/<w:pageBreakBefore\b[^/]*\/>/g, "");
  const bits = [];
  if (before != null || after != null) {
    let sp = "<w:spacing";
    if (before != null) sp += ' w:before="' + before + '"';
    if (after != null) sp += ' w:after="' + after + '"';
    sp += " />";
    bits.push(sp);
  }
  if (keepNext) {
    bits.push("<w:keepNext />");
    bits.push("<w:keepLines />");
  }
  p = p.replace(/<w:pPr([^>]*)>/, "<w:pPr$1>" + bits.join(""));
  return p;
}

function isSectionTitle(plain) {
  if (!plain) return false;
  if (/^\{\{ROTATION_TITLE\}\}$/i.test(plain)) return true;
  if (/REST PERIOD AND RETURN TO THE HOME/i.test(plain)) return true;
  return /^(TERMS AND CONDITIONS OF SALE|SCOPE|PERFORMANCE OF SERVICES|REMUNERATION|COMMENCEMENT AND DURATION|INVOICING|PAYMENT|ACCIDENTS AND ILLNESS|COMPETENT COURT)$/i.test(
    plain
  );
}

const BULLET_LIKE =
  /^\{\{(DAILY_RATE_TEXT|WORKING_HOURS_TEXT|OVERTIME_STANDARD|OVERTIME_HOLIDAY_ROW|ACCOMMODATION_ROW|TRANSPORTATION_ROW|POCKET_MONEY_ROW|TRAVELLING_DAY_ROW|TICKET_FLIGHT_ROW|MOB_DEMOB_ROW|OWN_CAR_ROW|ROTATION_TEXT)\}\}$/;

const PizZip = loadPizZip();
const tplPath = path.join(
  root,
  "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE.docx"
);
const zip = new PizZip(fs.readFileSync(tplPath));
let xml = zip.file("word/document.xml").asText();

// Rename placeholders
xml = xml.split("{{DAILY_RATE}}").join("{{DAILY_RATE_TEXT}}");
xml = xml.split("{{WORKING_HOURS}}").join("{{WORKING_HOURS_TEXT}}");

// Ensure letter date is "Milan, {{OFFER_DATE}}" once
xml = xml.replace(
  /(<w:t(?:\s[^>]*)?>)(\s*Milan,\s*)?\{\{OFFER_DATE\}\}/g,
  "$1Milan, {{OFFER_DATE}}"
);

// Avoid Within in template before START/END
xml = xml.replace(/Within\s*\{\{START_DATE\}\}/g, "{{START_DATE}}");
xml = xml.replace(/Within\s*\{\{END_DATE\}\}/g, "{{END_DATE}}");

// Rimuovi page break orfani già presenti prima di reinserire
xml = xml.replace(
  /<w:p\b[^>]*>\s*(?:<w:pPr\b[\s\S]*?<\/w:pPr>\s*)?<w:r\b[^>]*>\s*<w:br\b[^>]*w:type="page"[^/]*\/>\s*<\/w:r>\s*<\/w:p>/gi,
  ""
);

// Patch paragraphs: spacing + page break before rotation
let rotationBreakDone = false;
xml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
  if (/w:sectPr/i.test(para)) return para;
  const plain = paraPlain(para);
  let out = para;

  if (!rotationBreakDone && /\{\{ROTATION_TITLE\}\}/.test(plain)) {
    // Page break esplicito (paragrafo) prima del titolo 4.0 — evita doppio break
    const br = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    out = br + setSpacing(out, 480, 240, true);
    rotationBreakDone = true;
    return out;
  }

  // Spaziature blocco cliente (allineamento/tab del template restano intatti)
  if (/^\{\{CLIENT_NAME\}\}$/.test(plain)) {
    return setSpacing(out, null, 160, false); // 8pt
  }
  if (/^\{\{CLIENT_ADDRESS_1\}\}$/.test(plain)) {
    return setSpacing(out, null, 80, false); // 4pt
  }
  if (/^\{\{CLIENT_ADDRESS_2\}\}$/.test(plain)) {
    return setSpacing(out, null, 240, false); // 12pt
  }
  if (/^Attention to:/i.test(plain)) {
    return setSpacing(out, 200, 160, false); // 10pt / 8pt
  }

  if (isSectionTitle(plain)) {
    return setSpacing(out, 480, 240, true); // 24pt / 12pt
  }

  if (BULLET_LIKE.test(plain)) {
    return setSpacing(out, 40, 140, false); // ~2pt / 7pt
  }

  if (
    plain &&
    !/w:drawing|v:imagedata|w:pict/i.test(para) &&
    !/\{\{[A-Z0-9_]+\}\}/.test(plain)
  ) {
    // Reset before accidentali da run precedenti; spaceAfter 8pt
    return setSpacing(out, 0, 160, false);
  }

  return out;
});

zip.file("word/document.xml", xml);
const outBuf = Buffer.from(
  zip.generate({ type: "uint8array", compression: "DEFLATE" })
);
fs.writeFileSync(tplPath, outBuf);

const check = new PizZip(fs.readFileSync(tplPath));
const cx = check.file("word/document.xml").asText();
const need = [
  "DAILY_RATE_TEXT",
  "WORKING_HOURS_TEXT",
  "OFFER_DATE",
  "OVERTIME_STANDARD",
  "START_DATE",
  "ROTATION_TITLE",
  "ROTATION_TEXT"
];
for (const k of need) {
  if (!cx.includes("{{" + k + "}}")) {
    console.error("MISSING", k);
    process.exit(1);
  }
}
console.log("page breaks:", (cx.match(/w:type="page"/g) || []).length);
console.log("pageBreakBefore:", (cx.match(/pageBreakBefore/g) || []).length);
console.log("Milan, {{OFFER_DATE}}:", /Milan,\s*\{\{OFFER_DATE\}\}/.test(cx));
console.log("template patched OK:", tplPath);
