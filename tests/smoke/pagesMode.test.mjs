/**
 * Smoke: modalità GitHub Pages / host statico senza backend AI.
 * Simula window.location su *.github.io senza effettuare fetch.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("GitHub Pages static mode", () => {
  it("rileva Pages e non considera AI ready", async () => {
    const previous = globalThis.window;
    globalThis.window = {
      location: {
        protocol: "https:",
        hostname: "xcllcx.github.io"
      }
    };
    try {
      const ai = await import("../../settings/aiSettings.js");
      assert.equal(ai.isGitHubPages(), true);
      assert.equal(ai.isStaticHostWithoutBackend(), true);
      assert.equal(ai.isPublicDeploy(), true);

      const health = ai.applyStaticHostBackendState();
      assert.equal(health.status, "static_host");
      assert.match(health.message, /versione locale/i);

      const readiness = ai.getAiConfigReadiness();
      assert.equal(readiness.ok, false);
      assert.equal(readiness.reason, "static_host");
      assert.equal(readiness.message, ai.STATIC_HOST_AI_MESSAGE);

      const afterCheck = await ai.checkBackendHealth();
      assert.equal(afterCheck.status, "static_host");
    } finally {
      if (previous === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previous;
      }
    }
  });
});
