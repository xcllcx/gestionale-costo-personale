/**
 * Chiamata OpenAI Responses API (server-side) — stesso schema/prompt del client.
 * Nessun log di CV text / risposte complete / API key.
 */

import {
  buildCvParserSystemPrompt,
  buildCvParserUserPrompt
} from "../../prompts/cv_parser_prompt.js";
import { CV_JSON_SCHEMA, validateCvAnalysis } from "../../modules/cvSchema.js";
import { config } from "./config.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [status]
 */
export function createServiceError(code, message, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status || 500;
  return err;
}

/**
 * @param {object} payload
 * @returns {string}
 */
function extractOutputText(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const chunks = [];
  const output = Array.isArray(payload.output) ? payload.output : [];
  output.forEach(function (item) {
    const content = item && Array.isArray(item.content) ? item.content : [];
    content.forEach(function (part) {
      if (!part || typeof part !== "object") return;
      if (typeof part.text === "string") chunks.push(part.text);
      else if (part.text && typeof part.text.value === "string") chunks.push(part.text.value);
      else if (typeof part.output_text === "string") chunks.push(part.output_text);
    });
  });
  return chunks.join("\n").trim();
}

/**
 * @param {string} raw
 * @returns {object}
 */
function parseJsonStrict(raw) {
  const text = String(raw || "").trim();
  if (!text) throw createServiceError("invalid_json", "Empty model output", 502);
  try {
    return JSON.parse(text);
  } catch (err) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (err2) {
        throw createServiceError("invalid_json", "Model output is not valid JSON", 502);
      }
    }
    throw createServiceError("invalid_json", "Model output is not valid JSON", 502);
  }
}

/**
 * @param {string} cvText
 * @param {{ outputLanguage?: string, model?: string, timeoutMs?: number, apiKey?: string }} options
 * @returns {Promise<object>} analysis
 */
export async function analyzeCvServerSide(cvText, options) {
  const opts = options || {};
  const apiKey = opts.apiKey || config.openaiApiKey;
  if (!apiKey) {
    throw createServiceError("not_configured", "OpenAI API key not configured on server", 503);
  }

  const outputLanguage = opts.outputLanguage || "same";
  const model = opts.model || config.openaiModel;
  const timeoutMs = opts.timeoutMs || config.openaiTimeoutMs;

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

  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, timeoutMs);

  let response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    if (err && (err.name === "AbortError" || err.code === "ABORT_ERR")) {
      throw createServiceError("timeout", "Upstream OpenAI request timed out", 504);
    }
    throw createServiceError("upstream_network", "Upstream OpenAI request failed", 502);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // Non leggere/propagare body sensibili
    if (response.status === 401 || response.status === 403) {
      throw createServiceError("auth", "Upstream authentication failed", 502);
    }
    if (response.status === 429) {
      throw createServiceError("rate_limit", "Upstream rate limit", 429);
    }
    if (response.status === 402) {
      throw createServiceError("quota", "Upstream quota exceeded", 502);
    }
    throw createServiceError("upstream_error", "Upstream OpenAI error", 502);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw createServiceError("invalid_json", "Upstream returned non-JSON", 502);
  }

  const rawText = extractOutputText(payload);
  const parsed = parseJsonStrict(rawText);
  const validated = validateCvAnalysis(parsed);
  if (!validated || !validated.ok) {
    throw createServiceError("invalid_schema", "Analysis failed schema validation", 502);
  }
  return validated.value;
}
