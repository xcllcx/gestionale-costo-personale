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

test("hotfix: tecnico esclude pocket — netto 5000 pocket 0 → base 5000", function () {
  const c = {
    netto: 5000,
    nettoMensile: 5000,
    pocketMoney: 0,
    rate26: 300,
    rate30: 260,
    prezzoFinale: 7800
  };
  assert.equal(formulas.getTechnicianMonthlyNet(c), 5000);
  const r = formulas.calcolaOvertimeTecnico(c, "working", 30, 10, 1);
  assert.equal(r.technicianMonthlyNet, 5000);
  assert.ok(Math.abs(r.costoOrario - 5000 / 26 / 10) < 1e-9);
});

test("hotfix: tecnico esclude pocket — netto 5000 pocket 1000 → OT 1.25 = 24.04", function () {
  const c = {
    netto: 6000,
    nettoMensile: 5000,
    pocketMoney: 1000,
    rate26: 300,
    rate30: 260,
    prezzoFinale: 7800
  };
  assert.equal(formulas.getTechnicianMonthlyNet(c), 5000);
  const r = formulas.calcolaOvertimeTecnico(c, "working", 30, 10, 1.25);
  assert.equal(r.technicianMonthlyNet, 5000);
  const expected = (5000 / 26 / 10) * 1.25;
  assert.ok(Math.abs(r.costoOrario - expected) < 1e-9);
  assert.equal(Number(r.costoOrario.toFixed(2)), 24.04);
});

test("hotfix: tecnico esclude pocket — netto 5000 pocket 2500 → base sempre 5000", function () {
  const c = {
    netto: 7500,
    nettoMensile: 5000,
    pocketMoney: 2500,
    rate26: 300,
    rate30: 260,
    prezzoFinale: 9000
  };
  assert.equal(formulas.getTechnicianMonthlyNet(c), 5000);
  const r = formulas.calcolaOvertimeTecnico(c, "working", 30, 10, 1.25);
  assert.ok(Math.abs(r.costoOrario - (5000 / 26 / 10) * 1.25) < 1e-9);
});

test("hotfix: allowance/rimborsi non influenzano base tecnico", function () {
  const c = {
    netto: 6000,
    nettoMensile: 5000,
    pocketMoney: 1000,
    rimborsoAffitto: 800,
    rimborsoAuto: 400,
    rate26: 300,
    rate30: 260,
    prezzoFinale: 10000
  };
  assert.equal(formulas.getTechnicianMonthlyNet(c), 5000);
  const r = formulas.calcolaOvertimeTecnico(c, "working", 30, 10, 1.25);
  assert.ok(Math.abs(r.costoOrario - 24.03846153846154) < 1e-6);
});

test("hotfix: solo pocket cambia → OT tecnico invariato; cliente invariato", function () {
  const base = {
    nettoMensile: 5000,
    rate26: 300,
    rate30: 260,
    prezzoFinale: 7800
  };
  const a = formulas.calcolaOvertimeTecnico(
    Object.assign({}, base, { netto: 5000, pocketMoney: 0 }),
    "working",
    30,
    10,
    1.25
  );
  const b = formulas.calcolaOvertimeTecnico(
    Object.assign({}, base, { netto: 6000, pocketMoney: 1000 }),
    "working",
    30,
    10,
    1.25
  );
  assert.ok(Math.abs(a.costoOrario - b.costoOrario) < 1e-12);

  const ca = formulas.calcolaOvertimeCliente(
    Object.assign({}, base, { netto: 5000, pocketMoney: 0 }),
    "working",
    30,
    10,
    1.15
  );
  const cb = formulas.calcolaOvertimeCliente(
    Object.assign({}, base, { netto: 6000, pocketMoney: 1000 }),
    "working",
    30,
    10,
    1.15
  );
  assert.equal(ca.prezzoOrario, cb.prezzoOrario);
});

test("hotfix: legacy senza nettoMensile recupera netto−pocket", function () {
  const c = {
    netto: 6000,
    pocketMoney: 1000,
    rate26: 300,
    rate30: 260,
    prezzoFinale: 7800
  };
  assert.equal(formulas.getTechnicianMonthlyNet(c), 5000);
});
