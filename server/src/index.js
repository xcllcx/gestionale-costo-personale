/**
 * Staging / API server — REV03 Release Candidate
 * Serve static + GET /api/health + POST /api/analyze-cv
 */

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, isOpenAiConfigured } from "./config.js";
import { analyzeCvServerSide, createServiceError } from "./analyzeCv.js";

const __filename = fileURLToPath(import.meta.url);
const OUTPUT_LANGS = new Set(["same", "it", "en"]);

/** @type {((cvText: string, options: object) => Promise<object>) | null} */
let analyzeImpl = analyzeCvServerSide;

/** Permette mock nei test senza toccare OpenAI. */
export function setAnalyzeImpl(fn) {
  analyzeImpl = typeof fn === "function" ? fn : analyzeCvServerSide;
}

function publicErrorMessage(code) {
  const map = {
    bad_request: "Richiesta non valida.",
    payload_too_large: "Il contenuto inviato è troppo grande.",
    not_configured: "Servizio AI non configurato sul server.",
    timeout: "La richiesta ha impiegato troppo tempo. Riprovare.",
    auth: "Autenticazione verso OpenAI non riuscita.",
    rate_limit: "Limite temporaneo raggiunto. Riprovare tra poco.",
    quota: "Credito API insufficiente o limite di utilizzo raggiunto.",
    invalid_json: "La risposta AI non rispetta il formato previsto.",
    invalid_schema: "La risposta AI non rispetta il formato previsto.",
    upstream_network: "Non è stato possibile analizzare il CV.",
    upstream_error: "Non è stato possibile analizzare il CV.",
    generic: "Non è stato possibile analizzare il CV."
  };
  return map[code] || map.generic;
}

export function createApp(options) {
  const opts = options || {};
  const app = express();
  const serveStatic = opts.serveStatic !== false;

  app.disable("x-powered-by");

  app.use(function cors(req, res, next) {
    const origin = req.headers.origin;
    const allowed = config.corsOrigins;
    if (!origin) {
      next();
      return;
    }
    if (
      !allowed.length ||
      allowed.indexOf(origin) >= 0 ||
      /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(
    express.json({
      limit: config.maxBodyBytes,
      strict: true
    })
  );

  app.get("/api/health", function (req, res) {
    const configured = isOpenAiConfigured();
    res.status(200).json({
      ok: true,
      service: "cv-analyze",
      release: config.release,
      openaiConfigured: configured,
      status: configured ? "ready" : "not_configured"
    });
  });

  app.post("/api/analyze-cv", async function (req, res) {
    const started = Date.now();
    try {
      if (!isOpenAiConfigured() && analyzeImpl === analyzeCvServerSide) {
        throw createServiceError(
          "not_configured",
          "OpenAI API key not configured on server",
          503
        );
      }

      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw createServiceError("bad_request", "JSON body required", 400);
      }

      const cvText = typeof body.cvText === "string" ? body.cvText.trim() : "";
      if (!cvText) {
        throw createServiceError("bad_request", "cvText is required", 400);
      }
      if (cvText.length > config.maxCvTextChars) {
        throw createServiceError("payload_too_large", "cvText exceeds size limit", 413);
      }

      const outputLanguage = body.outputLanguage || "same";
      if (!OUTPUT_LANGS.has(outputLanguage)) {
        throw createServiceError("bad_request", "outputLanguage invalid", 400);
      }

      const model =
        typeof body.model === "string" && body.model.trim()
          ? body.model.trim().slice(0, 80)
          : config.openaiModel;

      const analysis = await analyzeImpl(cvText, {
        outputLanguage: outputLanguage,
        model: model,
        timeoutMs: config.openaiTimeoutMs
      });

      res.status(200).json({
        analysis: analysis,
        meta: {
          durationMs: Date.now() - started,
          model: model
        }
      });
    } catch (err) {
      const status = (err && err.status) || 500;
      const code = (err && err.code) || "generic";
      console.warn("[analyze-cv]", code, status, Date.now() - started + "ms");
      res.status(status).json({
        error: {
          code: code,
          message: publicErrorMessage(code)
        }
      });
    }
  });

  app.use(function (err, req, res, next) {
    if (err && err.type === "entity.too.large") {
      res.status(413).json({
        error: { code: "payload_too_large", message: "Request body too large" }
      });
      return;
    }
    if (err instanceof SyntaxError && Object.prototype.hasOwnProperty.call(err, "body")) {
      res.status(400).json({
        error: { code: "bad_request", message: "Invalid JSON" }
      });
      return;
    }
    next(err);
  });

  if (serveStatic) {
    app.use(
      express.static(config.rootDir, {
        extensions: ["html"],
        setHeaders: function (res, filePath) {
          if (/\.(js|mjs|css)$/i.test(filePath)) {
            res.setHeader("Cache-Control", "no-cache");
          }
        }
      })
    );
  }

  return app;
}

export async function startServer() {
  const app = createApp();
  return new Promise(function (resolve) {
    const server = app.listen(config.port, config.host, function () {
      console.log(
        "[staging] http://" +
          config.host +
          ":" +
          config.port +
          "/  (" +
          config.release +
          ")"
      );
      console.log(
        "[staging] OpenAI configured: " + (isOpenAiConfigured() ? "yes" : "NO")
      );
      resolve({ app: app, server: server });
    });
  });
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  startServer().catch(function (err) {
    console.error("[staging] failed to start", err && err.message);
    process.exit(1);
  });
}
