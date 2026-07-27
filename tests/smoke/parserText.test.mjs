import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareExtractedText, hasSufficientText, MIN_EXTRACTED_CHARS } from "../../modules/cvFileParser.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("prepareExtractedText + soglia minima", function () {
  const raw = fs.readFileSync(path.join(root, "tests/fixtures/synthetic_cv.txt"), "utf8");
  const text = prepareExtractedText(raw);
  assert.ok(text.length >= MIN_EXTRACTED_CHARS);
  assert.equal(hasSufficientText(text), true);
});

test("testo troppo corto rifiutato", function () {
  assert.equal(hasSufficientText("ciao"), false);
});
