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

test("hotfix: solo pocket cambia → OT tecnico invariato; cliente cambia", function () {
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
  // Pocket escluso dalla base cliente → OT cliente deve cambiare
  assert.ok(cb.prezzoOrario < ca.prezzoOrario);
  assert.equal(cb.dailyPocketMoney, 1000 / 30);
  assert.equal(ca.dailyPocketMoney, 0);
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

test("hotfix cliente: Calendar 550 pocket 1500 → eq 634.62, base 584.62, OT 73.08", function () {
  const c = {
    rate26: 600,
    rate30: 550,
    pocketMoney: 1500,
    nettoMensile: 5000,
    netto: 6500
  };
  assert.equal(formulas.getClientDailyPocketMoney(c), 50);
  assert.equal(formulas.POCKET_MONEY_CALENDAR_DAYS, 30);
  const r = formulas.calcolaOvertimeCliente(c, "calendar", 30, 10, 1.25);
  assert.equal(r.dailyPocketMoney, 50);
  assert.ok(Math.abs(r.clientEquivalentWorkingRate - (550 * 30) / 26) < 1e-9);
  assert.ok(Math.abs(r.clientWorkingOvertimeBase - ((550 * 30) / 26 - 50)) < 1e-9);
  // 584.6153846...
  assert.ok(Math.abs(r.clientWorkingOvertimeBase - 584.6153846153846) < 1e-9);
  assert.equal(Number(r.prezzoOrario.toFixed(2)), 73.08);
});

test("hotfix cliente: Working 600 pocket 1500 → base 550, OT 68.75", function () {
  const c = {
    rate26: 600,
    rate30: 550,
    pocketMoney: 1500,
    nettoMensile: 5000,
    netto: 6500
  };
  const r = formulas.calcolaOvertimeCliente(c, "working", 30, 10, 1.25);
  assert.equal(r.dailyPocketMoney, 50);
  assert.equal(r.clientWorkingOvertimeBase, 550);
  assert.equal(r.prezzoOrarioBase, 55);
  assert.equal(r.prezzoOrario, 68.75);
});

test("hotfix cliente: pocket 0 → rate invariato (calendar convertito, working grezzo)", function () {
  const c = {
    rate26: 600,
    rate30: 550,
    pocketMoney: 0,
    nettoMensile: 5000,
    netto: 5000
  };
  const w = formulas.calcolaOvertimeCliente(c, "working", 30, 10, 1.25);
  const cal = formulas.calcolaOvertimeCliente(c, "calendar", 30, 10, 1.25);
  assert.equal(w.dailyPocketMoney, 0);
  assert.equal(w.clientWorkingOvertimeBase, 600);
  assert.equal(w.prezzoOrario, 75);
  assert.ok(Math.abs(cal.clientWorkingOvertimeBase - (550 * 30) / 26) < 1e-9);
  assert.equal(Number(cal.prezzoOrario.toFixed(2)), 79.33);
});

test("hotfix cliente: pocket sempre ÷30, mai ÷workingDays", function () {
  assert.equal(formulas.getClientDailyPocketMoney({ pocketMoney: 1500 }), 50);
  assert.equal(formulas.getClientDailyPocketMoney({ pocketMoney: 3000 }), 100);
  assert.notEqual(formulas.getClientDailyPocketMoney({ pocketMoney: 1500 }), 1500 / 26);
  const r26 = formulas.calcolaOvertimeCliente(
    { rate26: 600, rate30: 550, pocketMoney: 1500, workingDays: 26 },
    "calendar",
    30,
    10,
    1
  );
  const r20 = formulas.calcolaOvertimeCliente(
    { rate26: 600, rate30: 550, pocketMoney: 1500, workingDays: 20 },
    "calendar",
    30,
    10,
    1
  );
  // Cambiano i working days → cambia il rate convertito
  assert.ok(r20.clientEquivalentWorkingRate > r26.clientEquivalentWorkingRate);
  // Pocket giornaliero invariato
  assert.equal(r26.dailyPocketMoney, 50);
  assert.equal(r20.dailyPocketMoney, 50);
});

test("hotfix cliente: pocket 3000 calendar → daily 100, base eq−100", function () {
  const c = { rate26: 600, rate30: 550, pocketMoney: 3000 };
  assert.equal(formulas.getClientDailyPocketMoney(c), 100);
  const r = formulas.calcolaOvertimeCliente(c, "calendar", 30, 10, 1);
  assert.ok(Math.abs(r.clientWorkingOvertimeBase - ((550 * 30) / 26 - 100)) < 1e-9);
});

test("hotfix cliente: base <= 0 → errore, nessun negativo", function () {
  const c = { rate26: 40, rate30: 40, pocketMoney: 1500 };
  assert.equal(formulas.getClientDailyPocketMoney(c), 50);
  assert.throws(function () {
    formulas.calcolaOvertimeCliente(c, "working", 30, 10, 1.25);
  }, /rate cliente al netto del pocket money non è valido/i);
});

test("hotfix cliente: pocket cambia OT cliente, non OT tecnico", function () {
  const t0 = formulas.calcolaOvertimeTecnico(
    {
      netto: 5000,
      nettoMensile: 5000,
      pocketMoney: 0,
      rate26: 600,
      rate30: 550
    },
    "working",
    30,
    10,
    1.25
  );
  const t1 = formulas.calcolaOvertimeTecnico(
    {
      netto: 6500,
      nettoMensile: 5000,
      pocketMoney: 1500,
      rate26: 600,
      rate30: 550
    },
    "working",
    30,
    10,
    1.25
  );
  assert.equal(t0.costoOrario, t1.costoOrario);

  const c0 = formulas.calcolaOvertimeCliente(
    { rate26: 600, rate30: 550, pocketMoney: 0 },
    "calendar",
    30,
    10,
    1.25
  );
  const c1 = formulas.calcolaOvertimeCliente(
    { rate26: 600, rate30: 550, pocketMoney: 1500 },
    "calendar",
    30,
    10,
    1.25
  );
  assert.equal(Number(c0.prezzoOrario.toFixed(2)), 79.33);
  assert.equal(Number(c1.prezzoOrario.toFixed(2)), 73.08);
  assert.ok(Math.abs(c0.clientWorkingOvertimeBase - c1.clientWorkingOvertimeBase - 50) < 1e-9);
});
