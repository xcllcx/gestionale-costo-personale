/**
 * Smoke: modalità Browser AI su localhost / GitHub Pages / host non autorizzati.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureAnalysis = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../fixtures/synthetic_cv_analysis.json"),
    "utf8"
  )
);

/** @type {object|undefined} */
let previousWindow;
/** @type {Storage|undefined} */
let previousLocalStorage;
/** @type {Map<string,string>} */
let store;

function mockStorage() {
  store = new Map();
  return {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(String(k), String(v));
    },
    removeItem(k) {
      store.delete(String(k));
    },
    clear() {
      store.clear();
    }
  };
}

function setHost(hostname, protocol) {
  globalThis.window = {
    location: {
      protocol: protocol || "https:",
      hostname: hostname
    }
  };
  globalThis.localStorage = mockStorage();
}

async function loadAi() {
  // Bust cache so module re-evaluates? Node caches ESM — functions read window live, OK.
  return import("../../settings/aiSettings.js");
}

beforeEach(() => {
  previousWindow = globalThis.window;
  previousLocalStorage = globalThis.localStorage;
});

afterEach(() => {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  if (previousLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousLocalStorage;
});

describe("isBrowserAiAllowed", () => {
  it("consentita su localhost", async () => {
    setHost("localhost", "http:");
    const ai = await loadAi();
    assert.equal(ai.isBrowserAiAllowed(), true);
    assert.equal(ai.isLocalDevHost(), true);
  });

  it("consentita su *.github.io", async () => {
    setHost("xcllcx.github.io", "https:");
    const ai = await loadAi();
    assert.equal(ai.isGitHubPages(), true);
    assert.equal(ai.isBrowserAiAllowed(), true);
  });

  it("non consentita su dominio non autorizzato", async () => {
    setHost("example.com", "https:");
    const ai = await loadAi();
    assert.equal(ai.isBrowserAiAllowed(), false);
  });
});

describe("readiness Browser / Secure", () => {
  it("Secure su Pages non pronta senza backend", async () => {
    setHost("xcllcx.github.io", "https:");
    const ai = await loadAi();
    ai.saveAiSettings({ connectionMode: ai.AI_MODE_SECURE, model: "gpt-5.5" });
    ai.applyStaticHostBackendState();
    const r = ai.getAiConfigReadiness();
    assert.equal(r.ok, false);
    assert.equal(r.reason, "static_host");
  });

  it("Browser su Pages non pronta senza API key", async () => {
    setHost("xcllcx.github.io", "https:");
    const ai = await loadAi();
    ai.saveAiSettings({
      connectionMode: ai.AI_MODE_LOCAL,
      model: "gpt-5.5",
      clearApiKey: true
    });
    const r = ai.getAiConfigReadiness();
    assert.equal(r.ok, false);
    assert.equal(r.reason, "missing_key");
    assert.match(r.message, /API key/i);
  });

  it("Browser su Pages pronta con configurazione valida", async () => {
    setHost("xcllcx.github.io", "https:");
    const ai = await loadAi();
    ai.saveAiSettings({
      connectionMode: ai.AI_MODE_LOCAL,
      model: "gpt-5.5",
      apiKey: "sk-test-not-a-real-key",
      persistApiKey: false
    });
    const r = ai.getAiConfigReadiness();
    assert.equal(r.ok, true);
    // Non deve aver scritto la key nei log — verifichiamo solo assenza in storage se non persist
    assert.equal(localStorage.getItem("gestionale.cvManager.apiKey"), null);
    assert.ok(ai.getLocalApiKey().startsWith("sk-test"));
  });

  it("nessun health di rete automatico su Pages", async () => {
    setHost("xcllcx.github.io", "https:");
    const ai = await loadAi();
    let fetchCalled = false;
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async function () {
      fetchCalled = true;
      throw new Error("should not fetch");
    };
    try {
      const h = await ai.checkBackendHealth();
      assert.equal(h.status, "static_host");
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});

describe("openAiClient errori Browser", () => {
  it("401 → messaggio key non valida; nessun log della key", async () => {
    setHost("xcllcx.github.io", "https:");
    const ai = await loadAi();
    ai.saveAiSettings({
      connectionMode: ai.AI_MODE_LOCAL,
      apiKey: "sk-secret-should-not-appear",
      persistApiKey: false,
      model: "gpt-5.5"
    });

    const logs = [];
    const origWarn = console.warn;
    const origLog = console.log;
    console.warn = function () {
      logs.push(Array.from(arguments).join(" "));
    };
    console.log = function () {
      logs.push(Array.from(arguments).join(" "));
    };

    const prevFetch = globalThis.fetch;
    globalThis.fetch = async function () {
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "bad" } })
      };
    };

    try {
      const { analyzeCvWithAI, AI_ERROR_MESSAGES } = await import(
        "../../modules/openAiClient.js"
      );
      await assert.rejects(
        () =>
          analyzeCvWithAI("Curriculum sintetico di prova con testo sufficiente.", {
            connectionMode: "localDev",
            timeoutMs: 2000
          }),
        (err) => {
          assert.equal(err.code, "auth");
          assert.equal(err.message, AI_ERROR_MESSAGES.auth);
          assert.ok(!String(err.message).includes("sk-secret"));
          return true;
        }
      );
      assert.ok(logs.every((l) => !l.includes("sk-secret-should-not-appear")));
    } finally {
      globalThis.fetch = prevFetch;
      console.warn = origWarn;
      console.log = origLog;
    }
  });

  it("429 → limite API", async () => {
    setHost("xcllcx.github.io", "https:");
    const ai = await loadAi();
    ai.saveAiSettings({
      connectionMode: ai.AI_MODE_LOCAL,
      apiKey: "sk-test",
      persistApiKey: false,
      model: "gpt-5.5"
    });
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async function () {
      return { ok: false, status: 429, json: async () => ({}) };
    };
    try {
      const { analyzeCvWithAI, AI_ERROR_MESSAGES } = await import(
        "../../modules/openAiClient.js"
      );
      await assert.rejects(
        () =>
          analyzeCvWithAI("Curriculum sintetico di prova con testo sufficiente.", {
            connectionMode: "localDev"
          }),
        (err) => {
          assert.equal(err.code, "rate_limit");
          assert.equal(err.message, AI_ERROR_MESSAGES.rate_limit);
          return true;
        }
      );
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it("timeout gestito con AbortController", async () => {
    setHost("localhost", "http:");
    const ai = await loadAi();
    ai.saveAiSettings({
      connectionMode: ai.AI_MODE_LOCAL,
      apiKey: "sk-test",
      persistApiKey: false,
      model: "gpt-5.5"
    });
    const prevFetch = globalThis.fetch;
    globalThis.fetch = function (_url, init) {
      return new Promise(function (_resolve, reject) {
        if (init && init.signal) {
          init.signal.addEventListener("abort", function () {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    };
    try {
      const { analyzeCvWithAI } = await import("../../modules/openAiClient.js");
      await assert.rejects(
        () =>
          analyzeCvWithAI("Curriculum sintetico di prova con testo sufficiente.", {
            connectionMode: "localDev",
            timeoutMs: 30
          }),
        (err) => err && err.code === "timeout"
      );
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});

describe("Word path invariato con JSON mock", () => {
  it("post-process + schema su fixture sintetica", async () => {
    const { validateCvAnalysis } = await import("../../modules/cvSchema.js");
    const { postProcessCvAnalysis } = await import("../../modules/cvPostProcess.js");
    const validated = validateCvAnalysis(fixtureAnalysis);
    assert.equal(validated.ok, true);
    const processed = postProcessCvAnalysis(validated.value);
    assert.ok(processed.primaryInformation);
    assert.ok(Array.isArray(processed.experience));
    assert.ok(processed.experience.length >= 1);
  });
});
