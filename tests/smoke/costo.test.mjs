import test from "node:test";
import assert from "node:assert/strict";
import { loadLegacyFormulas } from "../helpers/loadLegacyFormulas.mjs";

const formulas = loadLegacyFormulas();

test("costo Italia — caso noto senza NaN", function () {
  const input = {
    netto: 2500,
    pocketMoney: 0,
    rimborsoAffitto: 0,
    rimborsoAuto: 0,
    trasferta: 1394.4,
    marginePerc: 30,
    costiStruttura: 1500,
    moltiplicatore: 2.6,
    quotaBase: 2000
  };
  const result = formulas.calcolaPerModalita("italia", input);
  assert.equal(result.mode, "italia");
  assert.ok(Number.isFinite(result.totaleCosto));
  assert.ok(Number.isFinite(result.prezzoFinale));
  assert.ok(Number.isFinite(result.margine));
  assert.ok(!Number.isNaN(result.prezzoFinale));
  // Valori attesi (stessa pipeline UI)
  assert.ok(Math.abs(result.parteTassata - 1105.6) < 0.01);
  assert.ok(Math.abs(result.costoLavoro - 2874.56) < 0.01);
  assert.ok(Math.abs(result.totaleCosto - 5768.96) < 0.01);
  assert.ok(Math.abs(result.prezzoFinale - 7499.65) < 0.02);
});

test("validateInput rifiuta netto mancante", function () {
  const v = formulas.validateInput({
    netto: 0,
    pocketMoney: 0,
    rimborsoAffitto: 0,
    rimborsoAuto: 0,
    trasferta: 1394.4,
    marginePerc: 30,
    costiStruttura: 1500,
    moltiplicatore: 2.6,
    quotaBase: 2000
  });
  assert.equal(v.ok, false);
});
