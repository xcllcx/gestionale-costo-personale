/**
 * Configurazione server CV analyze (REV03 RC)
 * Segreti solo da env — mai hardcoded.
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(root, ".env") });

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = Object.freeze({
  rootDir: root,
  port: intEnv("PORT", 8767),
  host: process.env.HOST || "127.0.0.1",
  openaiApiKey: String(process.env.OPENAI_API_KEY || "").trim(),
  openaiModel: String(process.env.OPENAI_MODEL || "gpt-5.5").trim() || "gpt-5.5",
  maxCvTextChars: intEnv("MAX_CV_TEXT_CHARS", 120000),
  maxBodyBytes: intEnv("MAX_BODY_BYTES", 524288),
  openaiTimeoutMs: intEnv("OPENAI_TIMEOUT_MS", 90000),
  corsOrigins: String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean),
  release: "REV03_RELEASE_CANDIDATE"
});

export function isOpenAiConfigured() {
  return !!config.openaiApiKey && config.openaiApiKey !== "sk-replace-with-your-key";
}
