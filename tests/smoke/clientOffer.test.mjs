/**
 * Test Offerta Cliente — refactor template + UI semplificata + Math.ceil
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import {
  createDefaultClientOfferState,
  resetClientOfferState,
  CLIENT_OFFER_TEMPLATE_KEY,
  allocateNextSequenceNumber,
  getLastSequenceNumber,
  setLastSequenceNumber,
  peekNextSequenceNumber,
  resetSequenceForTests,
  DEFAULT_LAST_SEQUENCE_NUMBER
} from "../../modules/clientOffer/state.js";
import {
  importFromModules,
  importFromCost,
  importFromDraft,
  applyManualPatch
} from "../../modules/clientOffer/import.js";
import {
  ceilEuro,
  formatEuroCeil,
  formatEuroAmount,
  formatEuroIt,
  computeDailyPocketMoney,
  computeOfferDailyRate,
  computeOfferMarginStatus,
  proposeRemunerationFromCost,
  resolveOfferRateByType,
  deriveWorkingRateFromCalendar,
  applyResolvedOfferRate,
  buildOvertimeHolidayRow,
  buildOvertimeStandard,
  buildPocketRow,
  buildTemplateData,
  buildRotationBlock,
  adaptTemplateDataToXml,
  buildWorkingHours,
  buildDailyRateLine,
  buildDailyRateValue,
  buildSummary,
  sanitizeWindowsFileName,
  suggestProposalNumber,
  buildProposalNumber,
  syncAutoProposalNaming,
  normalizeOfferNamePart,
  normalizeRotationData,
  buildRotationOutput,
  buildLogisticsRows,
  parseMoneyInput,
  migrateLegacyProposalNaming,
  formatLetterDate,
  formatOfferDateDisplay,
  validateOfferForWord,
  valueOrPlaceholder,
  resolveContactFields,
  PRESERVED_CLIENT_PLACEHOLDERS,
  wordXmlPlainText
} from "../../modules/clientOffer/transform.js";

test("MARGIN1. Calendar: ricavo mensile e margine sopra soglia", function () {
  const s = createDefaultClientOfferState();
  s.remuneration.rateType = "calendar";
  s.remuneration.offerDailyRate = 600;
  s.remuneration.pocketMode = "na";
  const result = computeOfferMarginStatus(s, {
    totaleCosto: 13000,
    marginePerc: 30
  });
  assert.equal(result.revenue, 18000);
  assert.equal(result.marginAmount, 5000);
  assert.ok(Math.abs(result.marginPercent - 38.461538) < 0.001);
  assert.equal(result.meetsTarget, true);
});

test("MARGIN2. Working + pocket calendar + logistica separata", function () {
  const s = createDefaultClientOfferState();
  s.remuneration.rateType = "working";
  s.remuneration.offerDailyRate = 500;
  s.remuneration.workingDays = 26;
  s.remuneration.dailyPocketMoney = 50;
  s.remuneration.pocketMode = "separate";
  s.accommodation.mode = "our_lump";
  s.accommodation.lumpSum = 1000;
  s.transportation.mode = "our_lump";
  s.transportation.lumpSum = 500;
  const result = computeOfferMarginStatus(s, {
    totaleCosto: 14000,
    marginePerc: 30
  });
  assert.equal(result.baseRevenue, 13000);
  assert.equal(result.pocketRevenue, 1500);
  assert.equal(result.logisticsRevenue, 1500);
  assert.equal(result.revenue, 16000);
  assert.equal(result.marginAmount, 2000);
  assert.equal(result.meetsTarget, false);
});

test("MARGIN3. Combined lump sum non viene contato due volte", function () {
  const s = createDefaultClientOfferState();
  s.remuneration.rateType = "lumpSum";
  s.remuneration.monthlyLumpSumRate = 15000;
  s.remuneration.pocketMode = "na";
  s.logistics.combinedLumpSum = true;
  s.logistics.combinedLumpSumAmount = 2000;
  s.accommodation.mode = "our_lump";
  s.accommodation.lumpSum = 1000;
  s.transportation.mode = "our_lump";
  s.transportation.lumpSum = 1000;
  const result = computeOfferMarginStatus(s, {
    totaleCosto: 15000,
    marginePerc: 10
  });
  assert.equal(result.revenue, 17000);
  assert.equal(result.logisticsRevenue, 2000);
  assert.equal(result.meetsTarget, true);
});
import {
  cleanupEmptyOptionalParagraphs,
  missingPlaceholdersInXml,
  OPTIONAL_ROW_KEYS,
  REQUIRED_PLACEHOLDERS,
  listUnresolvedNonClientPlaceholders,
  ensureOfferDocumentLayout,
  ensureRotationTextPresent,
  fetchDefaultTemplateBuffer,
  resolveOfferDownloadFileName
} from "../../modules/clientOffer/wordGenerator.js";
import {
  getOrdinalParts,
  applyOrdinalSuperscripts,
  applyRemunerationLabelBold,
  applyTemplateBFormatting,
  extractLayoutMetrics
} from "../../modules/clientOffer/formatOfferDocx.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function mockApp(partial) {
  return {
    draft: { project: {}, rotation: {}, ...(partial.draft || {}) },
    calculation: partial.calculation || null,
    overtime: partial.overtime || null,
    cvManager: { analysis: "keep" },
    clientOffer: createDefaultClientOfferState()
  };
}

function loadPizZip() {
  const code = fs.readFileSync(path.join(root, "lib/docxtemplater/pizzip.js"), "utf8");
  const ctx = { module: { exports: {} }, exports: {}, window: {}, self: {}, console };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(code + "\nthis.PizZip = this.PizZip || module.exports;", ctx);
  return ctx.PizZip || ctx.module.exports;
}

test("1. importazione automatica non sovrascrive campi già compilati", function () {
  const app = mockApp({
    draft: { project: { posizione: "From Draft", localita: "Milan" } },
    calculation: { rate30: 645, pocketMoney: 1000 }
  });
  app.clientOffer.service.position = "Manual Position";
  app.clientOffer.manualLocks["service.position"] = true;
  const r = importFromModules(app, app.clientOffer, { force: false });
  assert.equal(app.clientOffer.service.position, "Manual Position");
  assert.ok(r.ok);
});

test("2. un solo pulsante aggiornamento + download in HTML", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /btnCoUpdateModules/);
  assert.match(html, /Aggiorna dati dai moduli/);
  assert.match(html, /Scarica offerta Word/);
  assert.equal((html.match(/btnCoDownloadWord/g) || []).length, 1);
});

test("3. nessun doppio Genera/Scarica in barra superiore", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotMatch(html, /btnCoGenerateWord/);
  assert.doesNotMatch(html, /btnCoImportDraft/);
  assert.doesNotMatch(html, /btnCoImportCost/);
  assert.doesNotMatch(html, /btnCoImportOvertime/);
});

test("4. download diretto — API generateClientOfferDocx esportata", function () {
  const idx = fs.readFileSync(
    path.join(root, "modules/clientOffer/index.js"),
    "utf8"
  );
  assert.match(idx, /generateClientOfferDocx/);
  const ui = fs.readFileSync(path.join(root, "modules/clientOffer/clientOfferUi.js"), "utf8");
  assert.match(ui, /downloadOffer/);
  assert.match(ui, /generateClientOfferDocx/);
});

test("5. sezione Cliente opzionale presente (placeholder se vuota)", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="coClientName"/);
  assert.match(html, /Cliente \(opzionale\)/i);
});

test("6. Scope custom assente", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotMatch(html, /coScopeCustom|Scope personalizzato/i);
});

test("7. Meals assente", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotMatch(html, /coMeals|id=\"coMeals\"/);
});

test("8. Clausole standard assenti dall'UI", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.doesNotMatch(html, /coClauseInvoicing|Modifica clausole standard/);
});

test("9. campi lump sum nascosti con classe hidden quando non our_lump", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="coAccLumpWrap"[^>]*class="[^"]*hidden|class="[^"]*hidden[^"]*" id="coAccLumpWrap/);
  assert.match(html, /updateClientOfferConditionalFields|coAccLumpWrap/);
  const ui = fs.readFileSync(path.join(root, "modules/clientOffer/clientOfferUi.js"), "utf8");
  assert.match(ui, /coAccLumpWrap[\s\S]*our_lump/);
});

test("10. campi custom nascosti di default", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /coAccCustomWrap/);
  assert.match(html, /coTravelCustomWrap/);
});

test("11. own car km wrap nascosto di default in markup + toggle UI", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /coOwnCarKmWrap/);
  const ui = fs.readFileSync(path.join(root, "modules/clientOffer/clientOfferUi.js"), "utf8");
  assert.match(ui, /coOwnCarKmWrap/);
});

test("12. rotation N/A nasconde 90/15 nei valori e nel testo", function () {
  const block = buildRotationBlock({ mode: "na" });
  assert.match(block.title, /N\.A\./i);
  assert.equal(block.body, "Not applicable.");
  assert.doesNotMatch(block.body, /90|15/);
  assert.doesNotMatch(block.body, /every\s+days|period of\s+days/i);
  const state = createDefaultClientOfferState();
  state.rotation = { mode: "na", workDays: null, restDays: null, customText: "" };
  const data = buildTemplateData(state);
  assert.doesNotMatch(data.ROTATION_TEXT, /90/);
  assert.doesNotMatch(data.ROTATION_TEXT, /every\s+days/i);
});

test("13. riepilogo usa etichette leggibili non codici interni", function () {
  const state = createDefaultClientOfferState();
  state.accommodation.mode = "our_lump";
  state.transportation.mode = "client_reimbursed";
  const sum = buildSummary(state);
  assert.equal(sum.accommodation, "Monthly lump sum");
  assert.equal(sum.transportation, "Client charge / reimbursed");
  assert.doesNotMatch(sum.accommodation, /our_lump|client_reimbursed/);
});

test("14. Math.ceil su daily rate", function () {
  assert.equal(ceilEuro(611.6667), 612);
  assert.equal(formatEuroCeil(611.6667), "612,00");
  assert.equal(ceilEuro(615), 615);
  assert.equal(ceilEuro(615.01), 616);
});

test("15. Math.ceil su pocket money", function () {
  const daily = computeDailyPocketMoney(1000);
  assert.ok(Math.abs(daily - 1000 / 30) < 1e-9);
  assert.equal(ceilEuro(daily), 34);
  assert.equal(formatEuroCeil(daily), "34,00");
  const row = buildPocketRow({
    pocketMode: "separate",
    dailyPocketMoney: daily
  });
  assert.match(row, /34,00/);
});

test("16. Math.ceil su overtime", function () {
  assert.equal(ceilEuro(88.7643), 89);
  const line = buildOvertimeStandard({
    mode: "manual",
    mondaySaturdayRate: 88.7643,
    mondaySaturdayMultiplier: 1.25,
    weeklyThreshold: 60
  });
  assert.match(line, /Euro 89,00\/hh/);
  assert.equal((line.match(/Overtime:/g) || []).length, 1);
  assert.match(line, /shall be paid on the following Hourly Rate:\nEuro/);
});

test("17. zero overtime holiday non genera Euro 0,00/hh", function () {
  assert.equal(
    buildOvertimeHolidayRow({
      mode: "manual",
      sundayHolidayRate: 0,
      sundayHolidayMultiplier: 1.5
    }),
    ""
  );
  assert.equal(
    buildOvertimeHolidayRow({
      mode: "manual",
      sundayHolidayRate: null
    }),
    ""
  );
});

test("18. template B aziendale presente (chiave v4, no fallback A)", function () {
  assert.equal(CLIENT_OFFER_TEMPLATE_KEY, "gestionale.clientOffer.template.v4");
  const tpl = path.join(
    root,
    "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE.docx"
  );
  const tplB = path.join(
    root,
    "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE_B.docx"
  );
  assert.ok(fs.existsSync(tpl));
  assert.ok(fs.existsSync(tplB));
  assert.ok(fs.statSync(tpl).size > 1000);
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const coView = (html.match(
    /id="viewClientOffer"[\s\S]*?(?=<div id="view|\n\s*<\/main>|$)/
  ) || [""])[0];
  assert.doesNotMatch(
    coView,
    /btnCoTemplateDefault|Usa template predefinito|btnCoTemplateDefault/
  );
  assert.match(coView, /id="btnCoDownloadWord"/);
  assert.match(coView, /Caricare il template aziendale|template aziendale/i);
  const ui = fs.readFileSync(
    path.join(root, "modules/clientOffer/clientOfferUi.js"),
    "utf8"
  );
  assert.doesNotMatch(ui, /ensureDefaultTemplate/);
  assert.match(
    ui,
    /Template Offerta Cliente non disponibile\. Caricare il template aziendale\./
  );
  const wg = fs.readFileSync(
    path.join(root, "modules/clientOffer/wordGenerator.js"),
    "utf8"
  );
  assert.match(wg, /applyTemplateBFormatting/);
  assert.match(
    wg,
    /Template Offerta Cliente non disponibile\. Caricare il template aziendale\./
  );
});

test("REV04. ordine tab nav solo visivo (IDs invariati)", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const nav = (html.match(/<nav class="app-nav"[\s\S]*?<\/nav>/) || [""])[0];
  const order = Array.from(nav.matchAll(/data-view="([^"]+)"/g)).map(function (
    m
  ) {
    return m[1];
  });
  assert.deepEqual(order, [
    "costo",
    "overtime",
    "draft",
    "clientOffer",
    "cvManager"
  ]);
  assert.match(nav, /id="tabClientOffer"/);
  assert.match(nav, /id="tabCvManager"/);
  assert.match(html, /id="viewClientOffer"/);
  assert.match(html, /id="viewCvManager"/);
  // pannelli restano raggiungibili per data-view (ordine DOM view non vincolante)
  assert.ok(html.indexOf('id="tabClientOffer"') < html.indexOf('id="tabCvManager"'));
});

/** Fill {{KEY}} in document.xml via PizZip (Node-safe; browser usa docxtemplater). */
function fillTemplateXml(buf, data) {
  const PizZip = loadPizZip();
  const zip = new PizZip(buf);
  const preFillXml = zip.file("word/document.xml").asText();
  let xml = preFillXml;
  Object.keys(data).forEach(function (key) {
    const token = "{{" + key + "}}";
    const value = data[key] == null ? "" : String(data[key]);
    // escape XML special chars in values
    const esc = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    xml = xml.split(token).join(esc);
  });
  zip.file("word/document.xml", xml);
  const cleaned = cleanupEmptyOptionalParagraphs(zip, preFillXml);
  let outXml = cleaned.file("word/document.xml").asText();
  if (
    data &&
    data.ROTATION_TEXT &&
    !/Our Staff is allowed to return to the Home Office/i.test(outXml) &&
    !/standard rest period of\s+[\d…]/i.test(outXml.replace(/<[^>]+>/g, ""))
  ) {
    outXml = ensureRotationTextPresent(
      outXml,
      data.ROTATION_TITLE || "REST PERIOD AND RETURN TO THE HOME",
      data.ROTATION_TEXT
    );
    cleaned.file("word/document.xml", outXml);
  }
  return cleaned;
}

test("19. placeholder sostituiti nel template fill", function () {
  const tplPath = path.join(
    root,
    "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE.docx"
  );
  const buf = fs.readFileSync(tplPath);
  const PizZip = loadPizZip();
  const xml = new PizZip(buf).file("word/document.xml").asText();
  const missing = missingPlaceholdersInXml(xml);
  assert.equal(missing.length, 0, "missing: " + missing.join(","));
  assert.ok(xml.includes("{{DAILY_RATE_TEXT}}"));
  assert.ok(xml.includes("{{ROTATION_WORK_DAYS}}"));
  assert.ok(xml.includes("{{ROTATION_REST_DAYS}}"));
  const tplPlain = xml.replace(/<[^>]+>/g, "");
  assert.match(tplPlain, /Milan,\s*\{\{OFFER_DATE\}\}/);
  // Template B: nessun page break forzato nel file sorgente
  assert.ok((xml.match(/w:type="page"/g) || []).length === 0);

  const state = createDefaultClientOfferState();
  state.offer.subject = "Electrical Supervisor";
  state.offer.location = "Milan";
  state.offer.proposalNumber = "OFF_TEST";
  state.service.position = "Electrical Supervisor";
  state.service.assignedCandidate = "Donato M";
  state.remuneration.offerDailyRate = 611.6667;
  state.remuneration.workingHoursPerDay = 10;
  state.remuneration.workingDaysPerWeek = 6;
  state.remuneration.dailyPocketMoney = 33.3333;
  state.remuneration.pocketMode = "separate";
  state.overtime.mondaySaturdayRate = 88.7643;
  state.overtime.sundayHolidayRate = 0;
  state.accommodation.mode = "our_lump";
  state.accommodation.lumpSum = 2000;
  state.transportation.mode = "client_reimbursed";
  state.logistics.ownCarEnabled = true;
  state.logistics.ownCarKmRate = 0.5;
  state.rotation.mode = "na";
  state.dates.startMode = "within";
  state.dates.endMode = "within";
  state.dates.startDate = "2026-08-01";
  state.dates.endDate = "2027-02-01";

  const data = adaptTemplateDataToXml(buildTemplateData(state), xml);
  assert.match(buildTemplateData(state).DAILY_RATE_TEXT, /Euro 612,00/);
  assert.match(data.WORKING_HOURS_TEXT || "10 hours/day", /Monday to Saturday|10 hours/);
  assert.equal(data.OFFER_DATE.indexOf("Milan"), -1);
  const outZip = fillTemplateXml(buf, data);
  let outXml = outZip.file("word/document.xml").asText();
  outXml = applyTemplateBFormatting(outXml);
  outZip.file("word/document.xml", outXml);
  const outPlain = outXml.replace(/<[^>]+>/g, "");
  assert.match(outPlain, /Electrical Supervisor/);
  assert.match(outPlain, /Daily Rate at site: Euro 612,00/);
  assert.match(outPlain, /Working hours: 10 hours\/day from Monday to Saturday/);
  assert.match(outPlain, /Euro 34,00/);
  assert.match(outPlain, /Euro 89,00\/hh/);
  assert.doesNotMatch(outPlain, /Euro 0,00\/hh/);
  assert.doesNotMatch(outPlain, /Within\s+Within/i);
  assert.doesNotMatch(outPlain, /Milan,\s*Milan,/i);
  assert.doesNotMatch(outPlain, /every\s+days/i);
  // Placeholder cliente intenzionali ammessi; altri no
  assert.equal(listUnresolvedNonClientPlaceholders(outXml).length, 0);
  assert.match(outXml, /\{\{CLIENT_NAME\}\}/);
  assert.doesNotMatch(outPlain, /\bundefined\b|\bNaN\b/);
  assert.equal(
    (outPlain.match(/Overtime:\s*The work exceeding/gi) || []).length,
    1
  );

  const outDir = path.join(root, "output_test", "client_offer");
  fs.mkdirSync(outDir, { recursive: true });
  const outBuf = Buffer.from(outZip.generate({ type: "uint8array" }));
  fs.writeFileSync(
    path.join(outDir, "TEST_REFACTOR_ELECTRICAL_SUPERVISOR.docx"),
    outBuf
  );
});

test("20. header/footer/immagini preservati dopo fill", function () {
  const buf = fs.readFileSync(
    path.join(root, "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE.docx")
  );
  const PizZip = loadPizZip();
  const before = new PizZip(buf);
  const mediaBefore = before
    .file(/word\/media\//)
    .map(function (f) {
      return f.name;
    })
    .sort();
  assert.ok(mediaBefore.length >= 1);
  assert.ok(before.file("word/header1.xml") || before.file("word/footer1.xml"));

  const state = createDefaultClientOfferState();
  state.offer.subject = "Test";
  state.service.position = "Test";
  state.remuneration.offerDailyRate = 100;
  const after = fillTemplateXml(buf, buildTemplateData(state));
  const mediaAfter = after
    .file(/word\/media\//)
    .map(function (f) {
      return f.name;
    })
    .sort();
  assert.equal(JSON.stringify(mediaAfter), JSON.stringify(mediaBefore));
  assert.ok(after.file("word/footer1.xml") || after.file("word/header1.xml"));
});test("21. nessuna regressione moduli esistenti", function () {
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  assert.match(script, /function calcolaItalia/);
  assert.match(script, /function calcolaOvertimeCliente/);
  assert.match(script, /DRAFT_TEMPLATES/);
  assert.match(script, /clientOffer\/index\.js/);
  assert.match(script, /modules\/cvManager\.js/);
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /viewCvManager/);
  assert.match(html, /viewClientOffer/);
});

test("force update sovrascrive; formula rate 645-1000/30", function () {
  const app = mockApp({
    calculation: { rate30: 645, rate26: 700, pocketMoney: 1000 }
  });
  app.clientOffer.remuneration.offerDailyRate = 1;
  importFromModules(app, app.clientOffer, { force: true });
  const rem = app.clientOffer.remuneration;
  assert.equal(rem.selectedClientRate, 645);
  assert.ok(Math.abs(rem.dailyPocketMoney - 1000 / 30) < 1e-9);
  assert.ok(Math.abs(rem.offerDailyRate - (645 - 1000 / 30)) < 1e-9);
  assert.equal(ceilEuro(rem.offerDailyRate), 612);
  assert.equal(ceilEuro(rem.dailyPocketMoney), 34);
});

test("OPTIONAL_ROW_KEYS definiti", function () {
  assert.ok(OPTIONAL_ROW_KEYS.includes("OVERTIME_HOLIDAY_ROW"));
  assert.ok(OPTIONAL_ROW_KEYS.includes("POCKET_MONEY_ROW"));
});

test("nome file Windows-safe", function () {
  const name = sanitizeWindowsFileName('OFF<>:"/\\|?*x.docx');
  assert.doesNotMatch(name, /[<>:"/\\|?*]/);
});

test("modifica manuale dopo import preservata senza force", function () {
  const app = mockApp({
    calculation: { rate30: 550, pocketMoney: 1500 }
  });
  importFromCost(app, app.clientOffer, { force: true });
  applyManualPatch(app.clientOffer, { remuneration: { offerDailyRate: 510 } });
  app.clientOffer.manualLocks.remuneration = true;
  importFromCost(app, app.clientOffer, { force: false });
  assert.equal(app.clientOffer.remuneration.offerDailyRate, 510);
});

test("HF1. Proposal Number completo POSITION_LOCATION_CLIENT", function () {
  const pn = buildProposalNumber({
    sequenceNumber: 240,
    position: "Piping Supervisor",
    location: "Milano",
    clientName: "Ansaldo Energia SPA"
  });
  assert.equal(
    pn,
    "OFF_240LC_PIPING SUPERVISOR_MILANO_ANSALDO ENERGIA SPA"
  );
  assert.equal(
    suggestProposalNumber({
      seq: "240",
      subject: "Piping Supervisor",
      location: "Milano",
      clientName: "Ansaldo Energia SPA"
    }),
    pn
  );
});

test("HF2. Nome file completo .docx senza troncamento", function () {
  const pn = "OFF_240LC_PIPING SUPERVISOR_MILANO_ANSALDO ENERGIA SPA";
  const name = sanitizeWindowsFileName(pn);
  assert.equal(
    name,
    "OFF_240LC_PIPING SUPERVISOR_MILANO_ANSALDO ENERGIA SPA.docx"
  );
  assert.match(name, /PIPING SUPERVISOR/);
  assert.match(name, /ANSALDO ENERGIA SPA/);
});

test("HF3. Daily Rate e Working Hours da stato", function () {
  const rem = {
    offerDailyRate: 611.6667,
    rateType: "calendar",
    workingHoursPerDay: 10,
    workingDaysPerWeek: 6
  };
  assert.match(buildDailyRateLine(rem), /Euro 612,00 \/calendar day/);
  assert.match(
    buildWorkingHours(rem),
    /Working hours: 10 hours\/day from Monday to Saturday/
  );
  assert.match(
    buildWorkingHours({ ...rem, workingDaysPerWeek: 5 }),
    /Monday to Friday/
  );
  assert.match(
    buildWorkingHours({ ...rem, workingDaysPerWeek: 7 }),
    /Monday to Sunday/
  );
});

test("HF4. Validazione blocca Daily Rate / Working Hours vuoti", function () {
  const state = createDefaultClientOfferState();
  state.offer.subject = "X";
  state.offer.location = "Y";
  state.offer.proposalNumber = "OFF_1";
  state.service.position = "Z";
  state.service.assignedCandidate = "C";
  state.remuneration.offerDailyRate = null;
  state.remuneration.workingHoursPerDay = 10;
  let v = validateOfferForWord(state);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /Daily Rate non disponibile/i.test(e)));

  state.remuneration.offerDailyRate = 600;
  state.remuneration.workingHoursPerDay = 0;
  v = validateOfferForWord(state);
  assert.ok(v.errors.some((e) => /Working Hours non disponibili/i.test(e)));
});

test("HF5. Nessun Within Within / Milan Milan / holiday vuoto rimosso", function () {
  assert.equal(formatLetterDate("2026-07-31"), "31st July 2026");
  assert.equal(
    formatOfferDateDisplay("2026-08-01", "within", "Within August 2026"),
    "Within August 2026"
  );
  assert.equal(
    formatOfferDateDisplay(null, "manual", "Within Within August 2026"),
    "Within August 2026"
  );

  const state = createDefaultClientOfferState();
  state.offer.date = "2026-07-31";
  state.offer.subject = "I&C Supervisor";
  state.offer.location = "Francia";
  state.offer.proposalNumber = suggestProposalNumber({
    seq: "234",
    subject: "I&C Supervisor",
    location: "Francia",
    clientName: ""
  });
  state.service.position = "I&C Supervisor";
  state.service.assignedCandidate = "Francesco Ruggiero";
  state.remuneration.offerDailyRate = 611.6667;
  state.remuneration.rateType = "calendar";
  state.remuneration.workingHoursPerDay = 10;
  state.remuneration.workingDaysPerWeek = 6;
  state.overtime.mode = "manual";
  state.overtime.mondaySaturdayRate = 68;
  state.overtime.mondaySaturdayMultiplier = 1.25;
  state.overtime.sundayHolidayRate = null;
  state.rotation.mode = "na";
  state.dates.startMode = "within";
  state.dates.startDate = "2026-08-01";
  state.dates.endMode = "within";
  state.dates.endDate = "2027-02-01";

  const buf = fs.readFileSync(
    path.join(root, "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE_B.docx")
  );
  const tplXml = new (loadPizZip())(buf).file("word/document.xml").asText();
  const data = adaptTemplateDataToXml(buildTemplateData(state), tplXml);
  assert.equal(
    data.PROPOSAL_NUMBER,
    "OFF_234LC_I&C SUPERVISOR_FRANCIA_{{CLIENT_NAME}}"
  );
  assert.equal(data.OFFER_DATE, "31st July 2026");
  // Template B ha già "Within" statico → adapt lascia solo mese/anno
  assert.equal(data.START_DATE, "August 2026");
  assert.equal(data.END_DATE, "February 2027");
  assert.equal(data.OVERTIME_HOLIDAY_ROW, "");
  assert.match(data.ROTATION_TEXT, /^Not applicable\.?$/);

  const outZip = fillTemplateXml(buf, data);
  let outXml = outZip.file("word/document.xml").asText();
  outXml = applyTemplateBFormatting(outXml);
  outZip.file("word/document.xml", outXml);
  const outPlain = outXml.replace(/<[^>]+>/g, "");
  assert.doesNotMatch(outPlain, /Within\s+Within/i);
  assert.doesNotMatch(outPlain, /Milan,\s*Milan,/i);
  assert.doesNotMatch(outPlain, /every\s+days/i);
  assert.doesNotMatch(outPlain, /period of\s+days/i);
  assert.match(outPlain, /Daily Rate at site: Euro 612,00/);
  assert.match(outPlain, /Working hours: 10 hours\/day from Monday to Saturday/);
  assert.match(outPlain, /Euro 68,00\/hh/);
  assert.equal(
    (outPlain.match(/Overtime:\s*The work exceeding/gi) || []).length,
    1
  );
  // Template B: nessun page break forzato
  // Page break prima di TERMS (inizia pagina 2)
  assert.match(outXml, /pageBreakBefore/);
  assert.match(outXml, /w:vertAlign[^>]*w:val="superscript"/);

  const outDir = path.join(root, "output_test", "client_offer");
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = sanitizeWindowsFileName(data.PROPOSAL_NUMBER);
  fs.writeFileSync(
    path.join(outDir, fileName),
    Buffer.from(outZip.generate({ type: "uint8array" }))
  );
  assert.equal(
    fileName,
    "OFF_234LC_I&C SUPERVISOR_FRANCIA_{{CLIENT_NAME}}.docx"
  );
});

test("HF6. OPTIONAL include DAILY/WORKING; REQUIRED anagrafici", function () {
  assert.ok(OPTIONAL_ROW_KEYS.includes("DAILY_RATE_TEXT"));
  assert.ok(OPTIONAL_ROW_KEYS.includes("WORKING_HOURS_TEXT"));
  assert.ok(REQUIRED_PLACEHOLDERS.includes("SUBJECT"));
  assert.ok(!REQUIRED_PLACEHOLDERS.includes("WORKING_HOURS_TEXT"));
});

test("HF7b. Within nel template + valore → niente Within Within", function () {
  const state = createDefaultClientOfferState();
  state.offer.subject = "X";
  state.offer.location = "Y";
  state.offer.proposalNumber = "OFF_1LC_{{POSITION}}_Y_{{CLIENT_NAME}}";
  state.service.position = "Z";
  state.service.assignedCandidate = "C";
  state.remuneration.offerDailyRate = 612;
  state.remuneration.workingHoursPerDay = 10;
  state.dates.startMode = "within";
  state.dates.startDate = "2026-08-01";
  state.dates.endMode = "within";
  state.dates.endDate = "2027-02-01";

  const tplXml =
    "<w:p><w:r><w:t>start in: Within {{START_DATE}}</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>concluded in: Within {{END_DATE}}</w:t></w:r></w:p>";
  const data = adaptTemplateDataToXml(buildTemplateData(state), tplXml);
  assert.equal(data.START_DATE, "August 2026");
  assert.equal(data.END_DATE, "February 2027");
  assert.doesNotMatch(data.START_DATE, /Within/i);
});

test("HF8. placeholder cliente preservati se vuoti", function () {
  assert.equal(valueOrPlaceholder("", "CLIENT_NAME"), "{{CLIENT_NAME}}");
  assert.equal(valueOrPlaceholder("  ", "CLIENT_NAME"), "{{CLIENT_NAME}}");
  assert.equal(valueOrPlaceholder("DEMONT S.r.l.", "CLIENT_NAME"), "DEMONT S.r.l.");
  assert.ok(PRESERVED_CLIENT_PLACEHOLDERS.includes("CONTACT_NAME"));

  const state = createDefaultClientOfferState();
  state.offer.subject = "I&C Supervisor";
  state.offer.location = "Francia";
  state.offer.proposalNumber = suggestProposalNumber({
    seq: "234",
    subject: "I&C Supervisor",
    location: "Francia"
  });
  state.service.position = "I&C Supervisor";
  state.service.assignedCandidate = "Francesco Ruggiero";
  state.remuneration.offerDailyRate = 612;
  state.remuneration.workingHoursPerDay = 10;
  state.remuneration.workingDaysPerWeek = 6;
  state.overtime.mondaySaturdayRate = 68;
  state.dates.startDate = "2026-08-01";
  state.dates.endDate = "2027-02-01";
  // client tutto vuoto — non obbligatorio
  const v = validateOfferForWord(state);
  assert.equal(v.ok, true, v.errors.join("; "));

  const data = buildTemplateData(state);
  assert.equal(data.CLIENT_NAME, "{{CLIENT_NAME}}");
  assert.equal(data.CLIENT_ADDRESS_1, "{{CLIENT_ADDRESS_1}}");
  assert.equal(data.CLIENT_ADDRESS_2, "{{CLIENT_ADDRESS_2}}");
  assert.equal(data.CONTACT_TITLE, "{{CONTACT_TITLE}}");
  assert.equal(data.CONTACT_NAME, "{{CONTACT_NAME}}");

  state.client.contactTitle = "Eng.";
  const data2 = buildTemplateData(state);
  assert.equal(data2.CONTACT_TITLE, "Eng.");
  assert.equal(data2.CONTACT_NAME, "{{CONTACT_NAME}}");

  state.client.name = "DEMONT S.r.l.";
  const data3 = buildTemplateData(state);
  assert.equal(data3.CLIENT_NAME, "DEMONT S.r.l.");

  const buf = fs.readFileSync(
    path.join(root, "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE.docx")
  );
  const PizZip = loadPizZip();
  const tplXml = new PizZip(buf).file("word/document.xml").asText();
  assert.ok(tplXml.includes("{{CLIENT_NAME}}"));
  assert.ok(tplXml.includes("{{CONTACT_TITLE}}"));

  const emptyClient = createDefaultClientOfferState();
  emptyClient.offer.subject = "I&C Supervisor";
  emptyClient.offer.location = "Francia";
  emptyClient.offer.proposalNumber = suggestProposalNumber({
    seq: "234",
    subject: "I&C Supervisor",
    location: "Francia"
  });
  emptyClient.service.position = "I&C Supervisor";
  emptyClient.service.assignedCandidate = "Francesco Ruggiero";
  emptyClient.remuneration.offerDailyRate = 612;
  emptyClient.remuneration.workingHoursPerDay = 10;
  emptyClient.overtime.mondaySaturdayRate = 68;
  emptyClient.dates.startDate = "2026-08-01";
  emptyClient.dates.endDate = "2027-02-01";

  const outZip = fillTemplateXml(buf, buildTemplateData(emptyClient));
  const outXml = outZip.file("word/document.xml").asText();
  const plain = outXml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&");

  assert.match(plain, /\{\{CLIENT_NAME\}\}/);
  assert.match(plain, /\{\{CLIENT_ADDRESS_1\}\}/);
  assert.match(plain, /\{\{CLIENT_ADDRESS_2\}\}/);
  assert.match(plain, /Attention to:\s*\{\{CONTACT_TITLE\}\}\s*\{\{CONTACT_NAME\}\}/);
  // Template B: saluto con Eng. statico + CONTACT_SURNAME
  assert.match(plain, /Dear Eng\.\s*\{\{CONTACT_SURNAME\}\},/);
  assert.doesNotMatch(plain, /Dear Eng\.\s*,/);
  assert.equal(listUnresolvedNonClientPlaceholders(outXml).length, 0);

  // cleanup non elimina paragrafi solo-placeholder cliente
  const zip2 = new PizZip(buf);
  let xml2 = zip2.file("word/document.xml").asText();
  // simula dopo render con placeholder cliente ancora presenti
  cleanupEmptyOptionalParagraphs(zip2);
  const after = zip2.file("word/document.xml").asText();
  assert.ok(after.includes("{{CLIENT_NAME}}"));

  const outDir = path.join(root, "output_test", "client_offer");
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = sanitizeWindowsFileName(
    emptyClient.offer.proposalNumber
  );
  fs.writeFileSync(
    path.join(outDir, fileName),
    Buffer.from(outZip.generate({ type: "uint8array" }))
  );
  assert.equal(
    fileName,
    "OFF_234LC_I&C SUPERVISOR_FRANCIA_{{CLIENT_NAME}}.docx"
  );
  void xml2;
});

test("HF7. Working hours spezzate in XML non bloccano (falso positivo)</w:t>", function () {
  const state = createDefaultClientOfferState();
  state.offer.subject = "X";
  state.offer.location = "Y";
  state.offer.proposalNumber = "OFF_1LC_X_Y_{{CLIENT_NAME}}";
  state.service.position = "Z";
  state.service.assignedCandidate = "C";
  state.remuneration.offerDailyRate = 612;
  state.remuneration.workingHoursPerDay = 10;
  state.remuneration.workingDaysPerWeek = 6;
  state.overtime.mondaySaturdayRate = 68;
  state.dates.startDate = "2026-08-01";
  state.dates.endDate = "2027-02-01";

  // Template stile utente: prefisso statico + placeholder valore
  const tplXml =
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    "<w:p><w:r><w:t>Working hours: </w:t></w:r><w:r><w:t>{{WORKING_HOURS_TEXT}}</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Daily Rate at site: Euro </w:t></w:r><w:r><w:t>{{DAILY_RATE_TEXT}}</w:t></w:r></w:p>" +
    "</w:body></w:document>";

  const data = adaptTemplateDataToXml(buildTemplateData(state), tplXml);
  assert.equal(data.WORKING_HOURS_TEXT.indexOf("Working hours:"), -1);
  assert.match(data.WORKING_HOURS_TEXT, /^10 hours\/day/);
  assert.equal(data.DAILY_RATE_TEXT.indexOf("Daily Rate"), -1);
  assert.match(data.DAILY_RATE_TEXT, /^612,00/);

  const outXml =
    "<w:p><w:r><w:t>Working hours: </w:t></w:r><w:r><w:t>10 hours/day from Monday to Saturday (Daytime hours)</w:t></w:r></w:p>";
  const plain = wordXmlPlainText(outXml);
  assert.match(plain, /Working hours:\s*10/);
  assert.match(outXml, /Working hours:\s*<\/w:t>/);
  assert.ok(/Working hours:\s*\d+/i.test(plain));
});

/* ========== HOTFIX progressivo + rotation + layout ========== */

test("SEQ1. ultimo 239 → allocate 240, poi 241", function () {
  resetSequenceForTests(239);
  assert.equal(getLastSequenceNumber(), 239);
  assert.equal(peekNextSequenceNumber(), 240);
  assert.equal(allocateNextSequenceNumber(), 240);
  assert.equal(getLastSequenceNumber(), 240);
  assert.equal(allocateNextSequenceNumber(), 241);
  assert.equal(getLastSequenceNumber(), 241);
});

test("SEQ2. refresh/peek non incrementa; download naming non incrementa", function () {
  resetSequenceForTests(240);
  const before = getLastSequenceNumber();
  assert.equal(peekNextSequenceNumber(), 241);
  assert.equal(getLastSequenceNumber(), before);
  const state = createDefaultClientOfferState();
  state.meta.currentSequenceNumber = 240;
  state.service.position = "Piping Supervisor";
  state.offer.location = "Milano";
  state.client.name = "Ansaldo Energia SPA";
  syncAutoProposalNaming(state, { force: true });
  const pn1 = state.offer.proposalNumber;
  syncAutoProposalNaming(state, { force: true });
  assert.equal(state.offer.proposalNumber, pn1);
  assert.equal(getLastSequenceNumber(), before);
});

test("SEQ3. reset mantiene numero; nuova allocate incrementa", function () {
  resetSequenceForTests(239);
  const app = { clientOffer: createDefaultClientOfferState() };
  app.clientOffer.meta.currentSequenceNumber = 240;
  app.clientOffer.offer.proposalNumber =
    "OFF_240LC_PIPING SUPERVISOR_MILANO_ANSALDO ENERGIA SPA";
  app.clientOffer.service.position = "X";
  resetClientOfferState(app);
  assert.equal(app.clientOffer.meta.currentSequenceNumber, 240);
  assert.equal(
    app.clientOffer.offer.proposalNumber,
    "OFF_240LC_PIPING SUPERVISOR_MILANO_ANSALDO ENERGIA SPA"
  );
  assert.equal(app.clientOffer.service.position, "");
  assert.equal(getLastSequenceNumber(), 239);
  assert.equal(allocateNextSequenceNumber(), 240);
});

test("SEQ4. Proposal Number / file / placeholder mancanti / normalizzazione", function () {
  assert.equal(
    buildProposalNumber({
      sequenceNumber: 240,
      position: "Piping Supervisor",
      location: "Milano",
      clientName: "Ansaldo Energia SPA"
    }),
    "OFF_240LC_PIPING SUPERVISOR_MILANO_ANSALDO ENERGIA SPA"
  );
  assert.equal(
    buildProposalNumber({
      sequenceNumber: 240,
      position: "Piping Supervisor",
      location: "Milano",
      clientName: ""
    }),
    "OFF_240LC_PIPING SUPERVISOR_MILANO_{{CLIENT_NAME}}"
  );
  assert.equal(
    buildProposalNumber({
      sequenceNumber: 240,
      position: "",
      location: "Milano",
      clientName: ""
    }),
    "OFF_240LC_{{POSITION}}_MILANO_{{CLIENT_NAME}}"
  );
  assert.equal(
    buildProposalNumber({
      sequenceNumber: 240,
      position: "",
      location: "",
      clientName: ""
    }),
    "OFF_240LC_{{POSITION}}_{{LOCATION}}_{{CLIENT_NAME}}"
  );
  assert.equal(
    normalizeOfferNamePart("Ansaldo Energia S.p.A."),
    "ANSALDO ENERGIA S.P.A."
  );
  assert.equal(
    normalizeOfferNamePart('A<>:"/\\|?*B'),
    "AB"
  );
  assert.equal(
    sanitizeWindowsFileName(
      "OFF_240LC_PIPING SUPERVISOR_MILANO_ANSALDO ENERGIA SPA"
    ),
    "OFF_240LC_PIPING SUPERVISOR_MILANO_ANSALDO ENERGIA SPA.docx"
  );
});

test("SEQ5. flag manuale e rigenera nome automatico", function () {
  const state = createDefaultClientOfferState();
  state.meta.currentSequenceNumber = 240;
  state.service.position = "Piping Supervisor";
  state.offer.location = "Milano";
  state.client.name = "Ansaldo Energia SPA";
  syncAutoProposalNaming(state, { force: true });
  state.meta.proposalNumberManuallyEdited = true;
  state.offer.proposalNumber = "OFF_MANUAL";
  state.service.position = "Other";
  syncAutoProposalNaming(state);
  assert.equal(state.offer.proposalNumber, "OFF_MANUAL");
  syncAutoProposalNaming(state, { force: true });
  assert.equal(
    state.offer.proposalNumber,
    "OFF_240LC_OTHER_MILANO_ANSALDO ENERGIA SPA"
  );
});

test("SEQ6. import draft rotation free/90-15 e 75-15", function () {
  const app = mockApp({
    draft: {
      project: { posizione: "Piping Supervisor", localita: "Milano" },
      rotation: { mode: "free", value: "90/15" }
    }
  });
  // default offer già 90/15 — deve comunque importare/allineare
  importFromDraft(app, app.clientOffer, { force: false });
  assert.equal(app.clientOffer.rotation.mode, "defined");
  assert.equal(app.clientOffer.rotation.workDays, 90);
  assert.equal(app.clientOffer.rotation.restDays, 15);
  assert.equal(app.clientOffer.service.position, "Piping Supervisor");
  assert.equal(app.clientOffer.offer.location, "Milano");

  app.draft.rotation = { mode: "free", value: "75/15" };
  importFromDraft(app, app.clientOffer, { force: true });
  assert.equal(app.clientOffer.rotation.workDays, 75);
  assert.equal(app.clientOffer.rotation.restDays, 15);
});

test("SEQ7. rotation output 90/15, 75/15, TBD, N/A, Custom — mai solo titolo", function () {
  const r90 = buildRotationBlock({ mode: "defined", workDays: 90, restDays: 15 });
  assert.match(r90.title, /^REST PERIOD/);
  assert.doesNotMatch(r90.title, /4\.0\s+4\.0/);
  assert.match(r90.body, /every 90 days/);
  assert.match(r90.body, /rest period of 15 days/);
  assert.equal(r90.workDays, "90");
  assert.equal(r90.restDays, "15");
  assert.doesNotMatch(r90.body, /every\s+days|period of\s+days/i);

  const r75 = buildRotationBlock({ mode: "defined", workDays: 75, restDays: 15 });
  assert.match(r75.body, /every 75 days/);

  const tbd = buildRotationBlock({ mode: "tbd" });
  assert.match(tbd.title, /to be defined/i);
  assert.match(tbd.body, /every … days/);
  assert.equal(tbd.workDays, "…");
  assert.ok(tbd.body.length > 10);

  const na = buildRotationBlock({ mode: "na" });
  assert.match(na.title, /N\.A\./);
  assert.equal(na.body, "Not applicable.");

  const custom = buildRotationBlock({
    mode: "custom",
    customText: "Custom rotation text."
  });
  assert.equal(custom.body, "Custom rotation text.");
  const emptyCustom = buildRotationBlock({ mode: "custom", customText: "" });
  assert.ok(emptyCustom.body.length > 0);
});

test("SEQ8. validazione rotation incompleta blocca download", function () {
  const state = createDefaultClientOfferState();
  state.offer.subject = "X";
  state.offer.location = "Y";
  state.offer.proposalNumber = "OFF_1";
  state.service.position = "Z";
  state.service.assignedCandidate = "C";
  state.remuneration.offerDailyRate = 600;
  state.remuneration.workingHoursPerDay = 10;
  state.remuneration.workingDaysPerWeek = 6;
  state.overtime.mondaySaturdayRate = 50;
  state.dates.startDate = "2026-08-01";
  state.dates.endDate = "2027-02-01";
  state.rotation = { mode: "defined", workDays: null, restDays: null, customText: "" };
  const v = validateOfferForWord(state);
  assert.equal(v.ok, false);
  assert.ok(
    v.errors.some((e) =>
      /Rotation incompleta\. Verificare i giorni di attività e riposo/i.test(e)
    )
  );
  state.rotation.mode = "tbd";
  assert.equal(validateOfferForWord(state).ok, true);
  state.rotation.mode = "na";
  assert.equal(validateOfferForWord(state).ok, true);
});

test("SEQ9. template B: rotation days + formatting + Word prova Ansaldo", function () {
  const state = createDefaultClientOfferState();
  state.meta.currentSequenceNumber = 240;
  state.offer.date = "2026-07-31";
  state.offer.subject = "Piping Supervisor";
  state.offer.location = "Milano";
  state.service.position = "Piping Supervisor";
  state.service.assignedCandidate = "Test Candidate";
  state.client.name = "Ansaldo Energia SPA";
  state.remuneration.offerDailyRate = 612;
  state.remuneration.rateType = "calendar";
  state.remuneration.workingHoursPerDay = 10;
  state.remuneration.workingDaysPerWeek = 6;
  state.overtime.mondaySaturdayRate = 68;
  state.rotation = { mode: "defined", workDays: 90, restDays: 15, customText: "" };
  state.dates.startDate = "2026-08-01";
  state.dates.endDate = "2027-02-01";
  syncAutoProposalNaming(state, { force: true });
  assert.equal(
    state.offer.proposalNumber,
    "OFF_240LC_PIPING SUPERVISOR_MILANO_ANSALDO ENERGIA SPA"
  );

  const data = buildTemplateData(state);
  assert.match(data.ROTATION_TITLE, /^REST PERIOD/);
  assert.doesNotMatch(data.ROTATION_TITLE, /^4\.0/);
  assert.equal(data.ROTATION_WORK_DAYS, "90");
  assert.equal(data.ROTATION_REST_DAYS, "15");
  assert.match(data.ROTATION_TEXT, /every 90 days/);
  assert.match(data.DAILY_RATE_TEXT, /612/);

  const buf = fs.readFileSync(
    path.join(root, "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE_B.docx")
  );
  const PizZipB = loadPizZip();
  const tplXmlB = new PizZipB(buf).file("word/document.xml").asText();
  const adapted = adaptTemplateDataToXml(data, tplXmlB);
  const outZip = fillTemplateXml(buf, adapted);
  let outXml = outZip.file("word/document.xml").asText();
  outXml = applyTemplateBFormatting(outXml);
  outZip.file("word/document.xml", outXml);
  const plainB = outXml.replace(/<[^>]+>/g, "");

  assert.match(outXml, /pageBreakBefore/);
  assert.doesNotMatch(outXml, /4\.0\s+4\.0/);
  assert.match(plainB, /every 90 days of uninterrupted/);
  assert.match(plainB, /REST PERIOD AND RETURN TO THE HOME/);
  assert.equal(
    (plainB.match(/standard rest period of 15 days/gi) || []).length,
    1
  );
  assert.doesNotMatch(plainB, /^standard rest period of/m);
  assert.match(outXml, /w:vertAlign[^>]*w:val="superscript"/);
  assert.doesNotMatch(plainB, /Daily Rate at site: Euro Daily Rate/);
  assert.doesNotMatch(plainB, /Within\s+Within/);

  const outDir = path.join(root, "output_test", "client_offer");
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = sanitizeWindowsFileName(state.offer.proposalNumber);
  const outPath = path.join(outDir, fileName);
  fs.writeFileSync(outPath, Buffer.from(outZip.generate({ type: "uint8array" })));
  assert.equal(
    fileName,
    "OFF_240LC_PIPING SUPERVISOR_MILANO_ANSALDO ENERGIA SPA.docx"
  );
  assert.ok(fs.existsSync(outPath));
  assert.equal(DEFAULT_LAST_SEQUENCE_NUMBER, 239);
});

test("SEQ10. UI ha Nuova offerta / Usa prossimo / Rigenera / ultimo numero", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="btnCoNewOffer"/);
  assert.match(html, /id="btnCoUseNextNumber"/);
  assert.match(html, /id="btnCoRegenName"/);
  assert.match(html, /id="coLastSequenceNumber"/);
  assert.match(html, /id="coClientName"/);
  const ui = fs.readFileSync(
    path.join(root, "modules/clientOffer/clientOfferUi.js"),
    "utf8"
  );
  assert.match(ui, /allocateNextSequenceNumber/);
  assert.match(ui, /startNewOffer/);
  assert.doesNotMatch(ui, /ensureClientManualSuffix/);
});

test("FIX1. Rotation 90/15 75/15 60/10 TBD N/A Custom visibili, mai solo titolo", function () {
  for (const [work, rest] of [
    [90, 15],
    [75, 15],
    [60, 10]
  ]) {
    const out = buildRotationOutput({
      mode: "defined",
      workDays: work,
      restDays: rest
    });
    assert.match(out.title, /^REST PERIOD/);
    assert.doesNotMatch(out.title, /4\.0\s+4\.0/);
    assert.equal(out.workDays, String(work));
    assert.equal(out.restDays, String(rest));
    assert.match(out.text, new RegExp("every " + work + " days"));
    assert.match(out.text, new RegExp("rest period of " + rest + " days"));
    assert.ok(out.text.length > 20);
  }
  const tbd = buildRotationOutput({ mode: "tbd" });
  assert.match(tbd.title, /to be defined/i);
  assert.match(tbd.text, /every … days/);
  const na = buildRotationOutput({ mode: "na" });
  assert.equal(na.text, "Not applicable.");
  const custom = buildRotationOutput({
    mode: "custom",
    customText: "Custom rotation clause."
  });
  assert.equal(custom.text, "Custom rotation clause.");
  const norm = normalizeRotationData(
    { rotation: { mode: "defined", workDays: null, restDays: null } },
    { rotation: { mode: "free", value: "90/15" } }
  );
  assert.equal(norm.workDays, 90);
  assert.equal(norm.restDays, 15);
});

test("FIX2. Accommodation 1000 + Transportation 1000 = Euro 2.000,00", function () {
  assert.equal(parseMoneyInput("1.000,00"), 1000);
  assert.equal(parseMoneyInput("1000"), 1000);
  const rows = buildLogisticsRows({
    accommodation: { mode: "our_lump", lumpSum: 1000 },
    transportation: { mode: "our_lump", lumpSum: 1000 },
    logistics: {},
    remuneration: { pocketMode: "na" }
  });
  assert.match(rows.accommodation, /Local accommodation and transportation/);
  assert.match(rows.accommodation, /Euro 2\.000,00 monthly lump sum/);
  assert.equal(rows.transportation, "");

  const onlyAcc = buildLogisticsRows({
    accommodation: { mode: "our_lump", lumpSum: 1000 },
    transportation: { mode: "client_reimbursed" },
    logistics: {},
    remuneration: { pocketMode: "na" }
  });
  assert.match(onlyAcc.accommodation, /Local accommodation: Euro 1\.000,00/);
  assert.match(onlyAcc.transportation, /Local transportation: at Client charge/);

  const onlyTr = buildLogisticsRows({
    accommodation: { mode: "client_reimbursed" },
    transportation: { mode: "our_lump", lumpSum: 1000 },
    logistics: {},
    remuneration: { pocketMode: "na" }
  });
  assert.match(onlyTr.accommodation, /Local accommodation: at Client charge/);
  assert.match(onlyTr.transportation, /Local transportation: Euro 1\.000,00/);

  const bothClient = buildLogisticsRows({
    accommodation: { mode: "client_reimbursed" },
    transportation: { mode: "client_reimbursed" },
    logistics: {},
    remuneration: { pocketMode: "na" }
  });
  assert.match(
    bothClient.accommodation,
    /Local accommodation and transportation: at Client charge/
  );
  assert.equal(bothClient.transportation, "");
});

test("FIX3. Proposal Number Electrical/Milano + placeholder, no 234 fallback", function () {
  const modulesSrc = fs.readFileSync(
    path.join(root, "modules/clientOffer/clientOfferUi.js"),
    "utf8"
  );
  assert.doesNotMatch(modulesSrc, /seq:\s*["']234["']/);
  assert.doesNotMatch(modulesSrc, /"234"/);

  const state = createDefaultClientOfferState();
  state.meta.currentSequenceNumber = 240;
  state.service.position = "Electrical Supervisor";
  state.offer.location = "Milano";
  state.client.name = "";
  state.offer.proposalNumber =
    "OFF_234LC_(CLIENTE da aggiungere manualmente)";
  state.meta.proposalNumberManuallyEdited = true;
  migrateLegacyProposalNaming(state);
  assert.equal(
    state.offer.proposalNumber,
    "OFF_240LC_ELECTRICAL SUPERVISOR_MILANO_{{CLIENT_NAME}}"
  );
  assert.equal(
    sanitizeWindowsFileName(state.offer.proposalNumber),
    "OFF_240LC_ELECTRICAL SUPERVISOR_MILANO_{{CLIENT_NAME}}.docx"
  );
  assert.equal(normalizeOfferNamePart("{{CLIENT_NAME}}"), "{{CLIENT_NAME}}");
});

test("FIX4. Word prova Electrical + rotation + lump sum 2000 + spacing cliente", function () {
  const state = createDefaultClientOfferState();
  state.meta.currentSequenceNumber = 240;
  state.offer.date = "2026-07-31";
  state.offer.subject = "Electrical Supervisor";
  state.offer.location = "Milano";
  state.service.position = "Electrical Supervisor";
  state.service.assignedCandidate = "Test Candidate";
  state.client.name = "";
  state.remuneration.offerDailyRate = 612;
  state.remuneration.workingHoursPerDay = 10;
  state.remuneration.workingDaysPerWeek = 6;
  state.remuneration.dailyPocketMoney = 34;
  state.remuneration.pocketMode = "separate";
  state.overtime.mondaySaturdayRate = 68;
  state.accommodation = { mode: "our_lump", lumpSum: 1000, customText: "" };
  state.transportation = { mode: "our_lump", lumpSum: 1000, customText: "" };
  state.rotation = { mode: "defined", workDays: 90, restDays: 15, customText: "" };
  state.dates.startDate = "2026-08-01";
  state.dates.endDate = "2027-02-01";
  syncAutoProposalNaming(state, { force: true });

  const data = buildTemplateData(state);
  assert.equal(
    data.PROPOSAL_NUMBER,
    "OFF_240LC_ELECTRICAL SUPERVISOR_MILANO_{{CLIENT_NAME}}"
  );
  assert.match(data.ROTATION_TEXT, /every 90 days/);
  assert.match(data.ACCOMMODATION_ROW, /Euro 2\.000,00/);
  assert.equal(data.TRANSPORTATION_ROW, "");
  assert.match(data.DAILY_RATE_TEXT, /612/);
  assert.match(data.OVERTIME_STANDARD, /68/);
  assert.match(data.POCKET_MONEY_ROW, /34/);

  const buf = fs.readFileSync(
    path.join(root, "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE_B.docx")
  );
  const PizZip = loadPizZip();
  const tplXml = new PizZip(buf).file("word/document.xml").asText();
  const adapted = adaptTemplateDataToXml(data, tplXml);
  const outZip = fillTemplateXml(buf, adapted);
  let outXml = outZip.file("word/document.xml").asText();
  outXml = applyTemplateBFormatting(outXml);
  const plain = outXml.replace(/<[^>]+>/g, "");
  assert.match(plain, /every 90 days of uninterrupted/);
  assert.match(plain, /Euro 2\.000,00 monthly lump sum/);
  assert.match(plain, /\{\{CLIENT_NAME\}\}/);
  const metrics = extractLayoutMetrics(outXml);
  assert.ok(metrics.emptyCount >= 10, "spacer vuoti Rev2 preservati");
  assert.equal(metrics.restPeriodLines, 1);

  const outDir = path.join(root, "output_test", "client_offer");
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = sanitizeWindowsFileName(data.PROPOSAL_NUMBER);
  const outPath = path.join(outDir, fileName);
  outZip.file("word/document.xml", outXml);
  fs.writeFileSync(outPath, Buffer.from(outZip.generate({ type: "uint8array" })));
  assert.equal(
    fileName,
    "OFF_240LC_ELECTRICAL SUPERVISOR_MILANO_{{CLIENT_NAME}}.docx"
  );
});

function xmlHasBoldLabelOnly(xml, label) {
  const paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  for (const p of paras) {
    const plain = p
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain.toLowerCase().startsWith(label.toLowerCase())) continue;
    // deve esserci un run bold con la label e un run non-bold con il valore
    const hasBoldLabel =
      new RegExp(
        "<w:b\\b[^/]*/>[\\s\\S]{0,120}" +
          label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      ).test(p) ||
      new RegExp(
        label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "[\\s\\S]{0,40}</w:t></w:r>",
        "i"
      ).test(p.replace(/<w:rPr>[\s\S]*?<w:b\b[^/]*\/>[\s\S]*?<\/w:rPr>/, "§BOLD§"));
    const runs = p.match(/<w:r\b[\s\S]*?<\/w:r>/g) || [];
    let boldRun = false;
    let normalRun = false;
    for (const r of runs) {
      const t = (r.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/) || [])[1] || "";
      const text = t.replace(/&amp;/g, "&").trim();
      if (!text) continue;
      const isBold = /<w:b\b/i.test(r);
      if (text.indexOf(label.replace(/:$/, "")) >= 0 || /^[^:]+:$/.test(text)) {
        if (isBold) boldRun = true;
      } else if (!isBold && text.length > 2) {
        normalRun = true;
      }
    }
    return boldRun && (normalRun || plain.endsWith(":"));
  }
  return false;
}

test("TB1. ordinali superscript st/nd/rd/th + eccezioni 11/12/13", function () {
  assert.deepEqual(getOrdinalParts(1), { number: "1", suffix: "st" });
  assert.deepEqual(getOrdinalParts(2), { number: "2", suffix: "nd" });
  assert.deepEqual(getOrdinalParts(3), { number: "3", suffix: "rd" });
  assert.deepEqual(getOrdinalParts(4), { number: "4", suffix: "th" });
  assert.deepEqual(getOrdinalParts(21), { number: "21", suffix: "st" });
  assert.deepEqual(getOrdinalParts(22), { number: "22", suffix: "nd" });
  assert.deepEqual(getOrdinalParts(23), { number: "23", suffix: "rd" });
  assert.deepEqual(getOrdinalParts(31), { number: "31", suffix: "st" });
  assert.deepEqual(getOrdinalParts(11), { number: "11", suffix: "th" });
  assert.deepEqual(getOrdinalParts(12), { number: "12", suffix: "th" });
  assert.deepEqual(getOrdinalParts(13), { number: "13", suffix: "th" });

  for (const [day, suf] of [
    [1, "st"],
    [2, "nd"],
    [3, "rd"],
    [11, "th"],
    [12, "th"],
    [13, "th"],
    [31, "st"]
  ]) {
    const xml =
      "<w:p><w:r><w:t>Milan, " +
      day +
      suf +
      " July 2026</w:t></w:r></w:p>";
    const out = applyOrdinalSuperscripts(xml);
    assert.match(out, /w:vertAlign[^>]*w:val="superscript"/);
    assert.match(out, new RegExp(">" + day + "<"));
    assert.match(out, new RegExp(">" + suf + "<"));
    // non ricostruire con unicode fake
    assert.doesNotMatch(out, /ˢ|ⁿ|ʳ|ᵗ/);
  }
});

test("TB2. label bold Remuneration + Travelling day full bold + own car indent", function () {
  const sample =
    "<w:p><w:r><w:t>Daily Rate at site: Euro 500,00 /calendar day</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Working hours: 10 hours/day from Monday to Saturday</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Overtime: The work exceeding 60 hours/week</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>This rate is inclusive of: Salary, Private Insurances</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Local accommodation, transportation and meals: Euro 2.000,00 monthly lump sum</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Pocket money: Euro 50,00 /calendar day</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Ticket Flight (class economy): if used, directly provided by the Client</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Travel expenses (Mob-Demob): at Client charge</w:t></w:r></w:p>" +
    "<w:p><w:pPr><w:ind w:left=\"720\" w:firstLine=\"0\" /></w:pPr><w:r><w:t>Travelling day is to be considered as working day</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>In case of travelling with his own car, the cost for travel and local transportation will be: Euro 0,50/Km</w:t></w:r></w:p>";
  const out = applyTemplateBFormatting(sample);
  assert.ok(xmlHasBoldLabelOnly(out, "Daily Rate at site:"));
  assert.ok(xmlHasBoldLabelOnly(out, "Working hours:"));
  assert.ok(xmlHasBoldLabelOnly(out, "Overtime:"));
  assert.ok(xmlHasBoldLabelOnly(out, "This rate is inclusive of:"));
  assert.ok(xmlHasBoldLabelOnly(out, "Local accommodation, transportation and meals:"));
  assert.ok(xmlHasBoldLabelOnly(out, "Pocket money:"));
  assert.ok(xmlHasBoldLabelOnly(out, "Ticket Flight (class economy):"));
  assert.ok(xmlHasBoldLabelOnly(out, "Travel expenses (Mob-Demob):"));
  // Travelling day: intero bold
  const travelPara = (out.match(
    /<w:p\b[\s\S]*?Travelling day is to be considered as working day[\s\S]*?<\/w:p>/
  ) || [])[0];
  assert.ok(travelPara);
  assert.match(travelPara, /<w:b\b/);
  assert.ok((travelPara.match(/<w:r\b/g) || []).length >= 1);
  // own car rientrato
  const carPara = (out.match(
    /<w:p\b[\s\S]*?In case of travelling with his own car[\s\S]*?<\/w:p>/
  ) || [])[0];
  // Own car: il template MASTER decide i rientri (niente override codice)
  assert.ok(carPara);
});

test("TB3. spaziature cliente / Proposal / Dear + titolo 4.0 senza dup", function () {
  const xml =
    "<w:p><w:r><w:t>{{CLIENT_NAME}}</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>{{CLIENT_ADDRESS_1}}</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>{{CLIENT_ADDRESS_2}}</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Attention to: Eng. {{CONTACT_NAME}}</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Proposal N° OFF_1</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Dear Eng. Rossi,</w:t></w:r></w:p>" +
    "<w:p><w:pPr><w:ind w:left=\"0\" /></w:pPr><w:r><w:t>COMMENCEMENT AND DURATION</w:t></w:r></w:p>" +
    "<w:p><w:pPr><w:ind w:left=\"360\" /></w:pPr><w:r><w:t>Our services are expected to start in: Within August 2026</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>REST PERIOD AND RETURN TO THE HOME:</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Our Staff is allowed to return to the Home Office every 90 days of uninterrupted stay at Job Site for a standard rest period of 15 days.</w:t></w:r></w:p>";
  const out = applyTemplateBFormatting(xml);
  assert.doesNotMatch(out, /4\.0\s+4\.0/);
  const proposal = (out.match(
    /<w:p\b[\s\S]*?Proposal N[\s\S]*?<\/w:p>/
  ) || [])[0];
  assert.match(proposal, /w:after="160"/);
});

test("TB4. nessun fallback A + fetchDefaultTemplateBuffer bloccato", async function () {
  await assert.rejects(
    () => fetchDefaultTemplateBuffer(),
    /Template Offerta Cliente non disponibile\. Caricare il template aziendale\./
  );
  const layout = ensureOfferDocumentLayout(
    "<w:p><w:r><w:t>31st July 2026</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>TERMS AND CONDITIONS OF SALE</w:t></w:r></w:p>"
  );
  assert.match(layout, /w:vertAlign[^>]*superscript/);
  assert.match(layout, /pageBreakBefore/);
});

test("TB5. Word prova manuale I&C Supervision Milan 31 Jul 2026", function () {
  const state = createDefaultClientOfferState();
  state.meta.currentSequenceNumber = 241;
  state.offer.date = "2026-07-31";
  state.offer.subject = "I&C Supervision";
  state.offer.location = "Milan";
  state.service.position = "I&C Supervision";
  state.service.assignedCandidate = "Test Candidate";
  state.client.name = "Demo Client SPA";
  state.client.address1 = "Via Roma 1";
  state.client.address2 = "20100 Milano";
  state.client.contactTitle = "Eng.";
  state.client.contactName = "Rossi";
  state.remuneration.offerDailyRate = 500;
  state.remuneration.rateType = "calendar";
  state.remuneration.workingHoursPerDay = 10;
  state.remuneration.workingDaysPerWeek = 6;
  state.remuneration.dailyPocketMoney = 50;
  state.remuneration.pocketMode = "separate";
  state.overtime.mondaySaturdayRate = 80;
  state.overtime.sundayHolidayRate = 100;
  state.overtime.mode = "manual";
  state.accommodation = { mode: "our_lump", lumpSum: 2000, customText: "" };
  state.transportation = { mode: "na", lumpSum: null, customText: "" };
  state.logistics = {
    travellingDayAsWorking: true,
    ticketFlight: "standard",
    mobDemob: "standard",
    ownCarEnabled: true,
    ownCarKmRate: 0.5
  };
  state.rotation = { mode: "defined", workDays: 90, restDays: 15, customText: "" };
  state.dates.startDate = "2026-08-01";
  state.dates.endDate = "2027-02-01";
  syncAutoProposalNaming(state, { force: true });

  const buf = fs.readFileSync(
    path.join(root, "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE_B.docx")
  );
  const PizZip = loadPizZip();
  const tplXml = new PizZip(buf).file("word/document.xml").asText();
  const data = adaptTemplateDataToXml(buildTemplateData(state), tplXml);
  assert.equal(data.OFFER_DATE, "31st July 2026");
  assert.equal(data.ROTATION_WORK_DAYS, "90");
  assert.equal(data.ROTATION_REST_DAYS, "15");

  const outZip = fillTemplateXml(buf, data);
  let outXml = outZip.file("word/document.xml").asText();
  outXml = applyTemplateBFormatting(outXml);
  outZip.file("word/document.xml", outXml);
  const plain = outXml.replace(/<[^>]+>/g, "");

  assert.match(outXml, /w:vertAlign[^>]*w:val="superscript"/);
  assert.match(plain, /31st July 2026/);
  assert.match(plain, /Daily Rate at site: Euro 500,00/);
  assert.match(plain, /Euro 80,00\/hh/);
  assert.match(plain, /Euro 100,00\/hh/);
  assert.match(plain, /Euro 2\.000,00/);
  assert.match(plain, /Pocket money: Euro 50,00/);
  assert.match(plain, /every 90 days/);
  assert.match(plain, /rest period of 15 days/);
  assert.doesNotMatch(plain, /4\.0\s+4\.0/);
  assert.doesNotMatch(plain, /Within\s+Within/);
  assert.match(outXml, /pageBreakBefore/);

  const outDir = path.join(root, "output_test", "client_offer");
  fs.mkdirSync(outDir, { recursive: true });
  const fileName =
    "OFFERTA_CLIENTE_TEMPLATE_B_PROVA_IC_SUPERVISION_MILAN_20260731.docx";
  const outPath = path.join(outDir, fileName);
  fs.writeFileSync(outPath, Buffer.from(outZip.generate({ type: "uint8array" })));
  assert.ok(fs.existsSync(outPath));
  assert.ok(fs.statSync(outPath).size > 5000);
});

test("REV03. filename = sempre Proposal Number.docx", function () {
  const state = createDefaultClientOfferState();
  state.offer.proposalNumber =
    "OFF_240LC_I&C SUPERVISION_MILAN_DANIELI S.P.A";
  state.offer.fileName = "WRONG_CANDIDATE_NAME";
  state.offer.subject = "ShouldNotAppear";
  state.service.assignedCandidate = "Lorenzo Coluccelli";
  assert.equal(
    resolveOfferDownloadFileName(state),
    "OFF_240LC_I&C SUPERVISION_MILAN_DANIELI S.P.A.docx"
  );
  assert.doesNotMatch(
    resolveOfferDownloadFileName(state),
    /Coluccelli|WRONG|ShouldNotAppear/i
  );
});

test("HF-REV03. Contact Title + Name completo (mai placeholder se valorizzato)", function () {
  const a = resolveContactFields({
    contactTitle: "Eng.",
    contactName: "L.",
    contactSurname: "Coluccelli"
  });
  assert.equal(a.CONTACT_TITLE, "Eng.");
  assert.equal(a.CONTACT_NAME, "L. Coluccelli");
  assert.equal(a.CONTACT_SURNAME, "Coluccelli");

  const b = resolveContactFields({
    contactTitle: "",
    contactName: "L. Coluccelli",
    contactSurname: ""
  });
  assert.equal(b.CONTACT_TITLE, "Eng.");
  assert.equal(b.CONTACT_NAME, "L. Coluccelli");

  const empty = resolveContactFields({});
  assert.equal(empty.CONTACT_TITLE, "{{CONTACT_TITLE}}");
  assert.equal(empty.CONTACT_NAME, "{{CONTACT_NAME}}");

  const state = createDefaultClientOfferState();
  state.client.contactTitle = "Eng.";
  state.client.contactName = "L.";
  state.client.contactSurname = "Coluccelli";
  const data = buildTemplateData(state);
  assert.equal(data.CONTACT_TITLE, "Eng.");
  assert.equal(data.CONTACT_NAME, "L. Coluccelli");
  assert.doesNotMatch(data.CONTACT_TITLE, /\{\{/);
});

test("REV03. hotfix finale vs Rev2 — contact, rotation unica, spacing, font", function (t) {
  const rev2Path =
    "C:\\Users\\coluc\\Downloads\\OFF_240LC_I&C SUPERVISION_MILAN_DANIELI S.P.A_Rev2.docx";
  if (!fs.existsSync(rev2Path)) {
    t.skip("Rev2 master assente in Downloads — confronto layout saltato");
    return;
  }

  const state = createDefaultClientOfferState();
  state.meta.currentSequenceNumber = 240;
  state.offer.date = "2026-07-31";
  state.offer.subject = "I&C Supervision";
  state.offer.location = "Milan";
  state.offer.proposalNumber =
    "OFF_240LC_I&C SUPERVISION_MILAN_DANIELI S.P.A";
  state.service.position = "I&C Supervision";
  state.service.assignedCandidate = "Lorenzo Coluccelli";
  state.client.name = "DANIELI S.P.A";
  state.client.address1 = "Via Sara 21/1";
  state.client.address2 = "16039, Sestri Levante";
  state.client.contactTitle = "Eng.";
  state.client.contactName = "L.";
  state.client.contactSurname = "Coluccelli";
  state.remuneration.offerDailyRate = 500;
  state.remuneration.rateType = "calendar";
  state.remuneration.workingHoursPerDay = 10;
  state.remuneration.workingDaysPerWeek = 6;
  state.remuneration.dailyPocketMoney = 50;
  state.remuneration.pocketMode = "separate";
  state.overtime.mondaySaturdayRate = 80;
  state.overtime.sundayHolidayRate = 100;
  state.overtime.mode = "manual";
  state.accommodation = { mode: "our_lump", lumpSum: 2000, customText: "" };
  state.transportation = { mode: "na", lumpSum: null, customText: "" };
  state.logistics = {
    travellingDayAsWorking: true,
    ticketFlight: "standard",
    mobDemob: "standard",
    ownCarEnabled: true,
    ownCarKmRate: 0.5
  };
  state.rotation = {
    mode: "defined",
    workDays: 90,
    restDays: 15,
    customText: ""
  };
  state.dates.startDate = "2026-08-01";
  state.dates.endDate = "2026-10-01";

  const buf = fs.readFileSync(
    path.join(root, "templates/client_offer/OFFERTA_CLIENTE_TEMPLATE_B.docx")
  );
  const PizZip = loadPizZip();
  const tplXml = new PizZip(buf).file("word/document.xml").asText();
  const data = adaptTemplateDataToXml(buildTemplateData(state), tplXml);
  assert.equal(data.CONTACT_TITLE, "Eng.");
  assert.equal(data.CONTACT_NAME, "L. Coluccelli");

  const outZip = fillTemplateXml(buf, data);
  let outXml = outZip.file("word/document.xml").asText();
  outXml = applyTemplateBFormatting(outXml);
  const plain = outXml.replace(/<[^>]+>/g, "");

  assert.match(plain, /Attention to:\s*Eng\.\s*L\.\s*Coluccelli/);
  assert.doesNotMatch(plain, /\{\{CONTACT_TITLE\}\}/);
  assert.equal(
    (plain.match(/standard rest period of 15 days/gi) || []).length,
    1
  );
  assert.match(plain, /Our Staff is allowed to return to the Home Office every 90 days/);

  function findPara(xml, re) {
    const paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
    for (let i = 0; i < paras.length; i++) {
      const t = paras[i]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
      if (re.test(t)) return paras[i];
    }
    return "";
  }
  const subjectPara = findPara(outXml, /^SUBJECT\s*:/i);
  const locPara = findPara(outXml, /^Location\s*:/i);
  const propPara = findPara(outXml, /^Proposal N/i);
  const accPara = findPara(outXml, /^Local accommodation/i);
  assert.match(subjectPara, /w:after="160"/);
  assert.match(locPara, /w:after="160"/);
  assert.match(propPara, /w:after="160"/);
  assert.match(accPara, /w:after="160"/);

  // Font nuovi run: Calibri 12 (sz 24)
  assert.match(outXml, /w:rFonts[^>]*w:ascii="Calibri"/);
  assert.match(outXml, /w:sz w:val="24"/);

  const revXml = new PizZip(fs.readFileSync(rev2Path))
    .file("word/document.xml")
    .asText();
  const gen = extractLayoutMetrics(outXml);
  const rev = extractLayoutMetrics(revXml);
  assert.match(outXml, /pageBreakBefore/);
  const termsPara = findPara(outXml, /^TERMS AND CONDITIONS OF SALE$/i);
  assert.match(termsPara, /pageBreakBefore/);
  assert.equal(gen.restPeriodLines, 1);
  assert.equal(gen.ownCarLeft, 960);
  assert.ok(gen.titleCount >= 7);
  assert.ok(
    Math.abs(gen.paraCount - rev.paraCount) <= 30,
    "paraCount gen=" + gen.paraCount + " rev=" + rev.paraCount
  );

  const outDir = path.join(root, "output_test", "client_offer");
  fs.mkdirSync(outDir, { recursive: true });
  outZip.file("word/document.xml", outXml);
  const outName = resolveOfferDownloadFileName(state);
  fs.writeFileSync(
    path.join(outDir, outName),
    Buffer.from(outZip.generate({ type: "uint8array" }))
  );
  assert.equal(
    outName,
    "OFF_240LC_I&C SUPERVISION_MILAN_DANIELI S.P.A.docx"
  );
});

/* =============================================================================
   FIX REV04 — Working Rate / Lump Sum Monthly / formatEuroAmount
   ============================================================================= */

test("FIX1. Calendar Rate 550 → selezione Calendar = 550", function () {
  const app = mockApp({
    calculation: { rate30: 550, rate26: 550 * 30 / 26, pocketMoney: 0 }
  });
  importFromCost(app, app.clientOffer, { force: true });
  const rem = app.clientOffer.remuneration;
  rem.rateType = "calendar";
  applyResolvedOfferRate(rem);
  assert.equal(rem.importedCalendarRate, 550);
  assert.equal(rem.selectedClientRate, 550);
  const resolved = resolveOfferRateByType(rem);
  assert.equal(resolved.amount, 550);
  assert.equal(resolved.unit, "calendar day");
});

test("FIX1. Calendar 550, 30/26 → Working = 634.6153846…", function () {
  const derived = deriveWorkingRateFromCalendar(550, 30, 26);
  assert.ok(Math.abs(derived - (550 * 30) / 26) < 1e-9);
  const app = mockApp({
    calculation: { rate30: 550, pocketMoney: 0, calendarDays: 30, workingDays: 26 }
  });
  importFromCost(app, app.clientOffer, { force: true });
  const rem = app.clientOffer.remuneration;
  rem.rateType = "working";
  applyResolvedOfferRate(rem);
  assert.ok(Math.abs(rem.selectedClientRate - 634.6153846153846) < 1e-9);
  assert.ok(Math.abs(rem.offerDailyRate - 634.6153846153846) < 1e-9);
});

test("FIX1. Cambio Calendar → Working aggiorna il valore", function () {
  const rem = createDefaultClientOfferState().remuneration;
  rem.importedCalendarRate = 550;
  rem.importedWorkingRate = (550 * 30) / 26;
  rem.calendarDays = 30;
  rem.workingDays = 26;
  rem.monthlyPocketMoney = 0;
  rem.rateType = "calendar";
  applyResolvedOfferRate(rem);
  assert.equal(rem.selectedClientRate, 550);
  rem.rateType = "working";
  applyResolvedOfferRate(rem);
  assert.ok(Math.abs(rem.selectedClientRate - (550 * 30) / 26) < 1e-9);
});

test("FIX1. Cambio Working → Calendar torna al Calendar Rate", function () {
  const rem = createDefaultClientOfferState().remuneration;
  rem.importedCalendarRate = 550;
  rem.importedWorkingRate = 700;
  rem.rateType = "working";
  applyResolvedOfferRate(rem);
  assert.equal(rem.selectedClientRate, 700);
  rem.rateType = "calendar";
  applyResolvedOfferRate(rem);
  assert.equal(rem.selectedClientRate, 550);
});

test("FIX1B. Lump Sum 14500 → output mensile senza /calendar|/working", function () {
  const rem = createDefaultClientOfferState().remuneration;
  rem.rateType = "lumpSum";
  rem.monthlyLumpSumRate = 14500;
  rem.importedCalendarRate = 550;
  rem.monthlyPocketMoney = 1500;
  applyResolvedOfferRate(rem);
  const line = buildDailyRateLine(rem);
  assert.match(line, /Monthly Rate:\s*Euro 14\.500,00\/month/);
  assert.doesNotMatch(line, /calendar day/i);
  assert.doesNotMatch(line, /working day/i);
  assert.doesNotMatch(line, /Daily Rate/i);
  assert.equal(rem.offerDailyRate, null);
  // Nessuna conversione 30/26 sul monthly
  assert.equal(rem.monthlyLumpSumRate, 14500);
  assert.equal(rem.selectedClientRate, 14500);
});

test("FIX1B. Lump Sum non sottrae pocket dal monthly", function () {
  const rem = createDefaultClientOfferState().remuneration;
  rem.rateType = "lumpSum";
  rem.monthlyLumpSumRate = 14500;
  rem.monthlyPocketMoney = 1500;
  rem.dailyPocketMoney = 50;
  rem.pocketMode = "separate";
  applyResolvedOfferRate(rem);
  assert.equal(rem.monthlyLumpSumRate, 14500);
  assert.equal(rem.selectedClientRate, 14500);
  const pocket = buildPocketRow(rem);
  assert.match(pocket, /Pocket money/);
});

test("FIX1. Import non sovrascrive workingRate con calendarRate", function () {
  const app = mockApp({
    calculation: { rate30: 550, rate26: 700, pocketMoney: 0 }
  });
  importFromCost(app, app.clientOffer, { force: true });
  const rem = app.clientOffer.remuneration;
  assert.equal(rem.importedCalendarRate, 550);
  assert.equal(rem.importedWorkingRate, 700);
  assert.notEqual(rem.importedWorkingRate, rem.importedCalendarRate);
});

test("FIX1. Nessuna regressione force import calendar 645", function () {
  const app = mockApp({
    calculation: { rate30: 645, rate26: 700, pocketMoney: 1000 }
  });
  importFromModules(app, app.clientOffer, { force: true });
  const rem = app.clientOffer.remuneration;
  assert.equal(rem.rateType, "calendar");
  assert.equal(rem.selectedClientRate, 645);
  assert.ok(Math.abs(rem.offerDailyRate - (645 - 1000 / 30)) < 1e-9);
});

test("FIX2. formatEuroAmount italiano", function () {
  assert.equal(formatEuroAmount(1500), "1.500,00");
  assert.equal(formatEuroAmount(2000), "2.000,00");
  assert.equal(formatEuroAmount(50), "50,00");
  assert.equal(formatEuroAmount(12345.6), "12.345,60");
  assert.equal(formatEuroAmount("1500,00"), "1.500,00");
  assert.equal(formatEuroAmount("1.500,00"), "1.500,00");
  assert.equal(formatEuroAmount("1,500.00"), "1.500,00");
  assert.equal(formatEuroIt(0), "0,00");
});

test("FIX2. monthly / accommodation lump sum formattati", function () {
  assert.equal(formatEuroCeil(14500), "14.500,00");
  assert.equal(formatEuroAmount(1000), "1.000,00");
  const rem = {
    rateType: "lumpSum",
    monthlyLumpSumRate: 14500,
    offerDailyRate: null
  };
  assert.match(buildDailyRateValue(rem), /^14\.500,00\/month$/);
});

test("FIX2. Proposal Number / date / rotation non alterati da formatEuro", function () {
  const pn = buildProposalNumber({
    sequenceNumber: 240,
    position: "Piping Supervisor",
    location: "Milano",
    clientName: "Ansaldo"
  });
  assert.equal(pn, "OFF_240LC_PIPING SUPERVISOR_MILANO_ANSALDO");
  assert.equal(formatLetterDate("2026-08-03"), "3rd August 2026");
  const rot = buildRotationOutput({
    mode: "defined",
    workDays: 90,
    restDays: 15
  });
  assert.match(rot.text, /every 90 days/);
  assert.match(rot.text, /rest period of 15 days/);
});
