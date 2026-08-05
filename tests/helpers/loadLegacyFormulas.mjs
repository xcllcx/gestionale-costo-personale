/**
 * Carica funzioni pure da script.js in un sandbox Node (smoke test).
 * Non modifica il codice di produzione.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function loadLegacyFormulas() {
  const raw = fs.readFileSync(path.join(root, "script.js"), "utf8");
  // Evita bootstrap DOM / init
  const code = raw
    .replace(/document\.addEventListener\("DOMContentLoaded"[\s\S]*$/m, "")
    .replace(/if \(document\.readyState === "loading"\)[\s\S]*$/m, "");

  const sandbox = {
    console: {
      log: function () {},
      warn: function () {},
      error: function () {}
    },
    window: {},
    document: {
      getElementById: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function () {
        return null;
      },
      createElement: function () {
        return {
          style: {},
          setAttribute: function () {},
          appendChild: function () {},
          click: function () {}
        };
      },
      body: { appendChild: function () {}, removeChild: function () {} },
      addEventListener: function () {}
    },
    localStorage: {
      getItem: function () {
        return null;
      },
      setItem: function () {},
      removeItem: function () {}
    },
    URL: {
      createObjectURL: function () {
        return "blob:test";
      },
      revokeObjectURL: function () {}
    },
    Blob: function Blob() {},
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Math: Math,
    Number: Number,
    String: String,
    Array: Array,
    Object: Object,
    Date: Date,
    JSON: JSON,
    parseFloat: parseFloat,
    isNaN: isNaN,
    Infinity: Infinity
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(code, sandbox, { timeout: 5000 });

  return {
    calcolaPerModalita: sandbox.calcolaPerModalita,
    calcolaOvertimeTecnico: sandbox.calcolaOvertimeTecnico,
    calcolaOvertimeCliente: sandbox.calcolaOvertimeCliente,
    getEquivalent26Rate: sandbox.getEquivalent26Rate,
    getTechnicianMonthlyNet: sandbox.getTechnicianMonthlyNet,
    getClientDailyPocketMoney: sandbox.getClientDailyPocketMoney,
    POCKET_MONEY_CALENDAR_DAYS: sandbox.POCKET_MONEY_CALENDAR_DAYS,
    validateInput: sandbox.validateInput,
    formatDraftItNumber: sandbox.formatDraftItNumber,
    formatDraftEuroAmount: sandbox.formatDraftEuroAmount,
    parseDraftMoneyInput: sandbox.parseDraftMoneyInput,
    applyDraftTemplate: sandbox.applyDraftTemplate,
    DRAFT_TEMPLATES: sandbox.DRAFT_TEMPLATES,
    buildDraftWordRows: sandbox.buildDraftWordRows,
    AppState: sandbox.AppState
  };
}
