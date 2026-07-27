import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
