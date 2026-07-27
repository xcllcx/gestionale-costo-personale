import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCvAnalysis } from "../../modules/cvSchema.js";
import { postProcessCvAnalysis } from "../../modules/cvPostProcess.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, "tests/fixtures/synthetic_cv_analysis.json"), "utf8")
);

test("schema valida fixture sintetica", function () {
  const v = validateCvAnalysis(fixture);
  assert.equal(v.ok, true);
  assert.ok(v.value);
  assert.equal(v.value.primaryInformation.fullName, "Mario Rossi");
});

test("post-process non distrugge sezioni essenziali", function () {
  const processed = postProcessCvAnalysis(fixture);
  assert.ok(processed.primaryInformation);
  assert.ok(Array.isArray(processed.experience));
  assert.ok(processed.experience.length >= 1);
  assert.ok(Array.isArray(processed.education) || processed._qp);
});

test("schema rifiuta payload vuoto", function () {
  const v = validateCvAnalysis({});
  assert.equal(v.ok, false);
});
