/**
 * Simula download Word end-to-end (Node) e stampa problemi residui.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { createDefaultClientOfferState } from "../modules/clientOffer/state.js";
import {
  adaptTemplateDataToXml,
  buildTemplateData,
  buildProposalNumber,
  wordXmlPlainText
} from "../modules/clientOffer/transform.js";
import {
  cleanupEmptyOptionalParagraphs,
  repairSplitPlaceholders,
  listPlaceholdersInXml,
  sanitizeGeneratedDocumentXml,
  ensureRotationTextPresent,
  ensureOfferDocumentLayout
} from "../modules/clientOffer/wordGenerator.js";

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

function fill(buf, data) {
  const PizZip = loadPizZip();
  let zip = new PizZip(buf);
  let xml = repairSplitPlaceholders(zip.file("word/document.xml").asText());
  const adapted = adaptTemplateDataToXml(data, xml);
  Object.keys(adapted).forEach(function (key) {
    const token = "{{" + key + "}}";
    const value = adapted[key] == null ? "" : String(adapted[key]);
    const esc = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "</w:t><w:br/><w:t>");
    xml = xml.split(token).join(esc);
  });
  zip.file("word/document.xml", xml);
  zip = cleanupEmptyOptionalParagraphs(zip);
  let outXml = sanitizeGeneratedDocumentXml(
    zip.file("word/document.xml").asText()
  );
  outXml = ensureRotationTextPresent(
    outXml,
    adapted.ROTATION_TITLE,
    adapted.ROTATION_TEXT
  );
  outXml = ensureOfferDocumentLayout(outXml);
  zip.file("word/document.xml", outXml);
  return { zip, adapted, xml: outXml };
}

const state = createDefaultClientOfferState();
state.meta.currentSequenceNumber = 240;
state.offer.date = "2026-07-31";
state.offer.subject = "Electrical Supervisor";
state.offer.location = "Milano";
state.offer.proposalNumber = buildProposalNumber({
  sequenceNumber: 240,
  position: "Electrical Supervisor",
  location: "Milano",
  clientName: ""
});
state.service.position = "Electrical Supervisor";
state.service.assignedCandidate = "Francesco Ruggiero";
state.remuneration.offerDailyRate = 611.6667;
state.remuneration.rateType = "calendar";
state.remuneration.workingHoursPerDay = 10;
state.remuneration.workingDaysPerWeek = 6;
state.remuneration.dailyPocketMoney = 33.33;
state.remuneration.pocketMode = "separate";
state.overtime.mode = "manual";
state.overtime.mondaySaturdayRate = 68;
state.overtime.mondaySaturdayMultiplier = 1.25;
state.overtime.sundayHolidayRate = null;
state.rotation = { mode: "defined", workDays: 90, restDays: 15, customText: "" };
state.accommodation = { mode: "our_lump", lumpSum: 1000, customText: "" };
state.transportation = { mode: "our_lump", lumpSum: 1000, customText: "" };
state.dates.startMode = "within";
state.dates.startDate = "2026-08-01";
state.dates.endMode = "within";
state.dates.endDate = "2027-02-01";

const tplPath = path.join(
  root,
  "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE.docx"
);
const buf = fs.readFileSync(tplPath);
const base = buildTemplateData(state);
const { zip, adapted, xml } = fill(buf, base);
const plain = wordXmlPlainText(xml);

console.log("PROPOSAL", adapted.PROPOSAL_NUMBER);
console.log("ROTATION", adapted.ROTATION_TEXT);
console.log("ACC", adapted.ACCOMMODATION_ROW);
console.log("has every 90", /every 90 days/.test(plain));
console.log("has 2000", /Euro 2\.000,00/.test(plain));

const outDir = path.join(root, "output_test", "client_offer");
fs.mkdirSync(outDir, { recursive: true });
const outName =
  "OFF_240LC_ELECTRICAL SUPERVISOR_MILANO_{{CLIENT_NAME}}.docx";
fs.writeFileSync(
  path.join(outDir, outName),
  Buffer.from(zip.generate({ type: "uint8array" }))
);
console.log("WROTE", path.join(outDir, outName));
console.log("placeholders left", listPlaceholdersInXml(xml));
