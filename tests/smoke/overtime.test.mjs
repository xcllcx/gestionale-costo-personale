import test from "node:test";
import assert from "node:assert/strict";
import { loadLegacyFormulas } from "../helpers/loadLegacyFormulas.mjs";

const formulas = loadLegacyFormulas();

const calc = {
  netto: 2500,
  prezzoFinale: 7499.65,
  rate26: 7499.65 / 26,
  rate30: 7499.65 / 30
};

test("overtime tecnico working base", function () {
  const r = formulas.calcolaOvertimeTecnico(calc, "working", 30, 10, 1);
  assert.ok(Number.isFinite(r.costoOrario));
  assert.ok(r.costoOrario > 0);
  assert.ok(Math.abs(r.costoOrario - 9.615384) < 0.01);
});

test("overtime cliente working +15%", function () {
  const r = formulas.calcolaOvertimeCliente(calc, "working", 30, 10, 1.15);
  assert.ok(Number.isFinite(r.prezzoOrario));
  assert.ok(r.prezzoOrario > 0);
});

test("overtime calendar days", function () {
  const t = formulas.calcolaOvertimeTecnico(calc, "calendar", 30, 10, 1);
  const c = formulas.calcolaOvertimeCliente(calc, "calendar", 30, 10, 1);
  assert.ok(Number.isFinite(t.costoOrario));
  assert.ok(Number.isFinite(c.prezzoOrario));
});

test("getEquivalent26Rate", function () {
  const eq = formulas.getEquivalent26Rate(100, 30);
  assert.ok(Number.isFinite(eq));
  assert.ok(eq > 0);
});
