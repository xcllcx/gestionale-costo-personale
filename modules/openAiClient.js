/**
 * Client AI CV (REV03 FASE B1)
 * Modalità secure (default): endpoint backend /api/analyze-cv
 * Modalità localDev: chiamata diretta OpenAI Responses API (solo sviluppo locale)
 *
 * SECURITY: direct browser API access is allowed only for local development
 * and must never be deployed publicly.
 */

import {
  AI_MODE_LOCAL,
  AI_MODE_SECURE,
  getLocalApiKey,
  isPublicDeploy,
  loadAiSettings
} from "../settings/aiSettings.js";
import {
  buildCvParserSystemPrompt,
  buildCvParserUserPrompt
} from "../prompts/cv_parser_prompt.js";
import { CV_JSON_SCHEMA, validateCvAnalysis } from "./cvSchema.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_TIMEOUT_MS = 90000;

export const AI_ERROR_MESSAGES = Object.freeze({
  missing_key: "Configurare l’accesso OpenAI prima di analizzare il CV.",
  auth: "Autenticazione OpenAI non riuscita. Verificare la configurazione.",
  quota: "Credito API insufficiente o limite di utilizzo raggiunto.",
  rate_limit: "Limite temporaneo raggiunto. Riprovare tra poco.",
  timeout: "La richiesta ha impiegato troppo tempo. Riprovare.",
  invalid_json: "La risposta AI non rispetta il formato previsto. Ripetere l’analisi.",
  empty: "La risposta AI non rispetta il formato previsto. Ripetere l’analisi.",
  network: "Non è stato possibile analizzare il CV. Nessuna modifica è stata apportata.",
  generic: "Non è stato possibile analizzare il CV. Nessuna modifica è stata apportata.",
  local_forbidden:
    "La modalità locale non è disponibile in pubblicazione. Usare l’endpoint sicuro."
});

/**
 * @param {string} code
 * @param {string} [userMessage]
 * @returns {Error}
 */
export function createAiError(code, userMessage) {
  const msg = userMessage || AI_ERROR_MESSAGES[code] || AI_ERROR_MESSAGES.generic;
  const err = new Error(msg);
  err.code = code;
  err.userMessage = msg;
  return err;
}

/**
 * @param {number} status
 * @returns {Error}
 */
function mapHttpStatusToError(status) {
  if (status === 401 || status === 403) {
    return createAiError("auth");
  }
  if (status === 429) {
    return createAiError("rate_limit");
  }
  if (status === 402) {
    return createAiError("quota");
  }
  if (status === 413) {
    return createAiError("generic", "Il contenuto inviato è troppo grande.");
  }
  if (status === 503) {
    return createAiError(
      "generic",
      "Servizio AI non configurato o non disponibile sul server."
    );
  }
  if (status === 504) {
    return createAiError("timeout");
  }
  return createAiError("generic");
}

/**
 * Estrae testo JSON dalla risposta Responses API senza loggare payload sensibili.
 * @param {object} payload
 * @returns {string}
 */
function extractOutputText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  const output = Array.isArray(payload.output) ? payload.output : [];
  output.forEach(function (item) {
    const content = item && Array.isArray(item.content) ? item.content : [];
    content.forEach(function (part) {
      if (!part || typeof part !== "object") return;
      if (typeof part.text === "string") {
        chunks.push(part.text);
      } else if (part.text && typeof part.text.value === "string") {
        chunks.push(part.text.value);
      } else if (typeof part.output_text === "string") {
        chunks.push(part.output_text);
      }
    });
  });

  if (chunks.length) {
    return chunks.join("\n").trim();
  }

  if (payload.response && typeof payload.response === "object") {
    return extractOutputText(payload.response);
  }

  return "";
}

/**
 * @param {string} raw
 * @returns {object}
 */
function parseJsonStrict(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    throw createAiError("empty");
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    // Eventuale wrapping accidentale in code fence
    const fenced = text.match(/\{[\s\S]*\}/);
    if (fenced) {
      try {
        return JSON.parse(fenced[0]);
      } catch (err2) {
        throw createAiError("invalid_json");
      }
    }
    throw createAiError("invalid_json");
  }
}

/**
 * @param {string} url
 * @param {RequestInit} init
 * @param {number} ms
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, init, ms) {
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, ms);
  try {
    const opts = Object.assign({}, init || {}, { signal: controller.signal });
    return await fetch(url, opts);
  } catch (err) {
    if (err && (err.name === "AbortError" || err.code === "ABORT_ERR")) {
      throw createAiError("timeout");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {Promise} promise
 * @param {number} ms
 * @returns {Promise}
 * @deprecated Preferire fetchWithTimeout (AbortController)
 */
function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(createAiError("timeout"));
    }, ms);
    promise
      .then(function (value) {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(function (err) {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * @param {Response} response
 * @returns {Promise<object>}
 */
async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch (err) {
    return null;
  }
}

/**
 * Chiama endpoint backend sicuro (API key solo server-side).
 * @param {string} cvText
 * @param {object} options
 * @returns {Promise<object>}
 */
async function analyzeViaSecureEndpoint(cvText, options) {
  const settings = loadAiSettings();
  const endpoint = options.secureEndpoint || settings.secureEndpoint;
  const model = options.model || settings.model;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  let response;
  try {
    response = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model,
          outputLanguage: options.outputLanguage || "same",
          cvText: cvText
        })
      },
      timeoutMs
    );
  } catch (err) {
    if (err && err.code === "timeout") throw err;
    throw createAiError("network");
  }

  if (!response.ok) {
    // Preferisci messaggio strutturato dal backend senza loggare payload
    const errPayload = await readJsonSafe(response);
    if (
      errPayload &&
      errPayload.error &&
      typeof errPayload.error.message === "string" &&
      errPayload.error.message
    ) {
      throw createAiError(
        errPayload.error.code || "generic",
        errPayload.error.message
      );
    }
    throw mapHttpStatusToError(response.status);
  }

  const payload = await readJsonSafe(response);
  if (!payload) {
    throw createAiError("invalid_json");
  }

  const candidate =
    payload.analysis && typeof payload.analysis === "object"
      ? payload.analysis
      : payload;
  return candidate;
}

/**
 * SECURITY: direct browser API access is allowed only for local development
 * and must never be deployed publicly.
 *
 * @param {string} cvText
 * @param {object} options
 * @returns {Promise<object>}
 */
async function analyzeViaLocalOpenAi(cvText, options) {
  if (isPublicDeploy()) {
    throw createAiError("local_forbidden");
  }

  const apiKey = options.apiKey || getLocalApiKey();
  if (!apiKey) {
    throw createAiError("missing_key");
  }

  const settings = loadAiSettings();
  const model = options.model || settings.model;
  const outputLanguage = options.outputLanguage || "same";

  const body = {
    model: model,
    input: [
      {
        role: "system",
        content: buildCvParserSystemPrompt({ outputLanguage: outputLanguage })
      },
      {
        role: "user",
        content: buildCvParserUserPrompt(cvText, { outputLanguage: outputLanguage })
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "cv_analysis",
        strict: true,
        schema: CV_JSON_SCHEMA
      }
    }
  };

  let response;
  try {
    response = await fetchWithTimeout(
      OPENAI_RESPONSES_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey
        },
        body: JSON.stringify(body)
      },
      options.timeoutMs || DEFAULT_TIMEOUT_MS
    );
  } catch (err) {
    if (err && err.code === "timeout") throw err;
    throw createAiError("network");
  }

  // Non loggare body/headers/response con eventuali tracce chiave
  if (!response.ok) {
    // Lettura errore senza propagare dettagli sensibili
    await readJsonSafe(response);
    if (response.status === 401 || response.status === 403) {
      throw createAiError("auth");
    }
    if (response.status === 429) {
      // Distingue rate limit vs quota quando possibile senza esporre dettagli
      throw createAiError("rate_limit");
    }
    if (response.status === 402) {
      throw createAiError("quota");
    }
    throw createAiError("generic");
  }

  const payload = await readJsonSafe(response);
  const rawText = extractOutputText(payload);
  return parseJsonStrict(rawText);
}

/**
 * Analizza un CV testuale e restituisce JSON validato.
 * @param {string} cvText
 * @param {{
 *   outputLanguage?: "same"|"it"|"en",
 *   model?: string,
 *   connectionMode?: string,
 *   secureEndpoint?: string,
 *   timeoutMs?: number
 * }} options
 * @returns {Promise<{ analysis: object }>}
 */
export async function analyzeCvWithAI(cvText, options) {
  const opts = options || {};
  const text = String(cvText || "").trim();
  if (!text) {
    throw createAiError("generic", "Il testo del CV è insufficiente per l’analisi.");
  }

  const settings = loadAiSettings();
  let mode = opts.connectionMode || settings.connectionMode || AI_MODE_SECURE;
  if (mode === AI_MODE_LOCAL && isPublicDeploy()) {
    mode = AI_MODE_SECURE;
  }

  let raw;
  if (mode === AI_MODE_LOCAL) {
    raw = await analyzeViaLocalOpenAi(text, opts);
  } else {
    raw = await analyzeViaSecureEndpoint(text, opts);
  }

  const validated = validateCvAnalysis(raw);
  if (!validated.ok) {
    throw createAiError("invalid_json");
  }

  return { analysis: validated.value };
}
