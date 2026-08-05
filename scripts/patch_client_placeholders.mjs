/**
 * Sostituisce il blocco cliente a puntini con placeholder protetti,
 * preservando i paragrafi/run/stili del template.
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
  return para
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\u00a0/g, " ")
    .replace(/\./g, ".")
    .trim();
}

function replaceParaText(para, newText) {
  const pPr = (para.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/) || [])[0] || "";
  const open = (para.match(/^<w:p\b[^>]*>/) || ["<w:p>"])[0];
  // riusa rPr del primo run se presente
  const rPr = (para.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/) || [])[0] || "";
  const esc = String(newText)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return (
    open +
    pPr +
    "<w:r>" +
    rPr +
    '<w:t xml:space="preserve">' +
    esc +
    "</w:t></w:r></w:p>"
  );
}

const PizZip = loadPizZip();
const tplPath = path.join(
  root,
  "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE.docx"
);
const zip = new PizZip(fs.readFileSync(tplPath));
let xml = zip.file("word/document.xml").asText();

let nameDone = false;
let addr1Done = false;
let addr2Done = false;
let attentionDone = false;
let dearDone = false;

xml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, function (para) {
  if (/w:drawing|w:sectPr|w:br[^>]*w:type="page"/i.test(para)) return para;
  const plain = paraPlain(para);

  // Blocco Spett. / indirizzi (puntini)
  if (!nameDone && /^Spett\./i.test(plain) && /\.{5,}/.test(plain)) {
    nameDone = true;
    return replaceParaText(para, "{{CLIENT_NAME}}");
  }
  if (nameDone && !addr1Done && /^[\.\s…]+$/.test(plain.replace(/[^\.\s…]/g, "")) && plain.length > 5) {
    addr1Done = true;
    return replaceParaText(para, "{{CLIENT_ADDRESS_1}}");
  }
  if (addr1Done && !addr2Done && /^[\.\s…]+$/.test(plain.replace(/[^\.\s…]/g, "")) && plain.length > 5) {
    addr2Done = true;
    return replaceParaText(para, "{{CLIENT_ADDRESS_2}}");
  }

  if (!attentionDone && /Attention to:/i.test(plain)) {
    attentionDone = true;
    return replaceParaText(
      para,
      "Attention to: {{CONTACT_TITLE}} {{CONTACT_NAME}}"
    );
  }

  if (!dearDone && /^Dear\b/i.test(plain)) {
    dearDone = true;
    return replaceParaText(
      para,
      "Dear {{CONTACT_TITLE}} {{CONTACT_NAME}},"
    );
  }

  return para;
});

zip.file("word/document.xml", xml);
fs.writeFileSync(
  tplPath,
  Buffer.from(zip.generate({ type: "uint8array", compression: "DEFLATE" }))
);

const check = new PizZip(fs.readFileSync(tplPath))
  .file("word/document.xml")
  .asText();
for (const k of [
  "CLIENT_NAME",
  "CLIENT_ADDRESS_1",
  "CLIENT_ADDRESS_2",
  "CONTACT_TITLE",
  "CONTACT_NAME"
]) {
  if (!check.includes("{{" + k + "}}")) {
    console.error("MISSING", k, {
      nameDone,
      addr1Done,
      addr2Done,
      attentionDone,
      dearDone
    });
    process.exit(1);
  }
}
console.log("patched client placeholders OK", {
  nameDone,
  addr1Done,
  addr2Done,
  attentionDone,
  dearDone
});
