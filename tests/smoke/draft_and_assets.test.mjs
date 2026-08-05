import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLegacyFormulas } from "../helpers/loadLegacyFormulas.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("draft templates contengono campi essenziali", function () {
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  assert.match(script, /DRAFT_TEMPLATES/);
  assert.match(script, /Posizione/);
  assert.match(script, /Localit/);
  assert.match(script, /btnEsportaDraftWord/);
});

test("fixture sintetica testo CV non vuota", function () {
  const text = fs.readFileSync(path.join(root, "tests/fixtures/synthetic_cv.txt"), "utf8");
  assert.ok(text.trim().length > 80);
  assert.doesNotMatch(text, /@gmail\.com|codice fiscale|CF\s*[A-Z0-9]{16}/i);
});

test("PizZip disponibile per generazione shell", function () {
  const pizzipPath = path.join(root, "lib/docxtemplater/pizzip.js");
  assert.ok(fs.existsSync(pizzipPath));
  const tpl = path.join(root, "templates/cv_aziendale_template.docx");
  assert.ok(fs.existsSync(tpl));
  assert.ok(fs.statSync(tpl).size > 100);
});

test("FIX2. formatDraftItNumber italiano", function () {
  const f = loadLegacyFormulas();
  assert.equal(f.formatDraftItNumber(1500), "1.500,00");
  assert.equal(f.formatDraftItNumber(2000), "2.000,00");
  assert.equal(f.formatDraftItNumber(50), "50,00");
  assert.equal(f.formatDraftItNumber(12345.6), "12.345,60");
  assert.equal(f.formatDraftItNumber("1500,00"), "1.500,00");
  assert.equal(f.formatDraftItNumber("1.500,00"), "1.500,00");
  assert.equal(f.formatDraftEuroAmount(1500), "Euro 1.500,00");
});

test("FIX2. alloggio Draft contributo → Euro 1.500,00", function () {
  const f = loadLegacyFormulas();
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  assert.match(
    script,
    /alloggioContributo:\s*[\s\S]*?Euro \{importo\}/
  );
  assert.match(script, /formatDraftItNumber\(detRaw\)/);
  const text = f.applyDraftTemplate(
    "Contributo fino a un massimo di Euro {importo} a fronte di presentazione pezze giustificative.",
    { importo: f.formatDraftItNumber(1500) }
  );
  assert.match(text, /Euro 1\.500,00/);
  assert.doesNotMatch(text, /Euro 1500(?![.,\d])/);
});

test("FIX2. Draft non altera proposal/date/rotation/ore", function () {
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  assert.match(script, /formatDraftDateIt/);
  assert.match(script, /turnazioneDefinita/);
  assert.match(script, /orario60/);
  const f = loadLegacyFormulas();
  assert.equal(f.formatDraftItNumber("90/15"), "");
});
