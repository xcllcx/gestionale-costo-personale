/**
 * Prompt AI — CV parser (REV03 FASE B1)
 * Istruzioni centralizzate: divieto di invenzione, schema, traduzione.
 */

import { CV_JSON_SCHEMA } from "../modules/cvSchema.js";

export const CV_PARSER_PROMPT_VERSION = "B1.0";

/**
 * System prompt definitivo per l'analisi CV.
 * @param {{ outputLanguage: "same"|"it"|"en" }} options
 * @returns {string}
 */
export function buildCvParserSystemPrompt(options) {
  const opts = options || {};
  const outputLanguage = opts.outputLanguage || "same";

  let languageRule = "";
  if (outputLanguage === "it") {
    languageRule =
      "OUTPUT LANGUAGE: Translate all descriptive content into Italian. " +
      "Set outputLanguage to \"it\".";
  } else if (outputLanguage === "en") {
    languageRule =
      "OUTPUT LANGUAGE: Translate all descriptive content into English. " +
      "Set outputLanguage to \"en\".";
  } else {
    languageRule =
      "OUTPUT LANGUAGE: Keep the original detected language for descriptive content. " +
      "Set outputLanguage to the detected source language code (it|en|other|unknown).";
  }

  return [
    "You are a strict CV information extractor for a professional staffing company.",
    "Return ONLY one JSON object that matches the required schema exactly.",
    "Do not return markdown. Do not wrap JSON in code fences. Do not add text before or after JSON.",
    "",
    "ABSOLUTE PROHIBITIONS:",
    "- Do NOT invent experiences, companies, clients, projects, dates, durations, roles, skills, certifications, studies, languages, software, responsibilities, results, or personal data.",
    "- Do NOT infer year of birth from indirect clues.",
    "- Do NOT reconstruct missing dates or fill empty employment gaps.",
    "- Do NOT attribute activities not explicitly present in the CV.",
    "- Do NOT turn a generic activity into a specific undeclared responsibility.",
    "- Do NOT add keywords to make the CV more attractive.",
    "- Do NOT attribute experience on technologies, plants, or sectors not present.",
    "- Do NOT invent a professional summary if none exists: leave summary as empty string.",
    "- Do NOT invent sectors, availability, or international mobility.",
    "- Do NOT use null. Use empty strings or empty arrays.",
    "- Do NOT use \"N/A\" unless that exact text appears in the CV.",
    "",
    "ALLOWED OPERATIONS ONLY:",
    "- Classify and place content into schema sections.",
    "- Fix obvious grammar mistakes.",
    "- Normalize punctuation and capitalization.",
    "- Translate descriptive text when required.",
    "- Make bullet lists coherent.",
    "- Remove clear duplicates.",
    "- Preserve all professional information.",
    "- Put ambiguous items into warnings.",
    "",
    "DO NOT TRANSLATE OR ALTER:",
    "person names, company names, client names, official project names, codes, technical acronyms,",
    "equipment models, software names, certifications, technical standards, locations, addresses,",
    "emails, phone numbers, dates, work periods.",
    "Translate job titles only when appropriate and without changing meaning.",
    "",
    "sourceLanguage must be one of: it | en | other | unknown.",
    languageRule,
    "",
    "SUMMARY RULES:",
    "- If a profile/summary exists, keep its content; fix form/grammar only; translate if required.",
    "- If no summary/profile exists, summary must be \"\".",
    "- Do NOT generate a new professional profile in this phase.",
    "",
    "EDUCATION RULES:",
    "- Keep period, institution, qualification, location, details when present.",
    "- Do not turn short courses into academic degrees.",
    "- Do not move certifications into education unless the CV places them there.",
    "- Prefer original order or reverse chronological when clearly reconstructible.",
    "",
    "EXPERIENCE RULES:",
    "- Keep each experience separate.",
    "- Do not merge experiences from different companies.",
    "- Do not replace employer with end client.",
    "- Distinguish company vs client vs project vs site vs location.",
    "- description must be an array of distinct activity strings.",
    "- Do not over-summarize; do not drop relevant technical activities.",
    "",
    "OTHER INFORMATION:",
    "- Anything not confidently belonging to primaryInformation/summary/education/experience",
    "  must go into otherInformation (certifications, courses, software, skills, licenses,",
    "  authorizations, references, extras).",
    "",
    "WARNINGS:",
    "- Include only real issues found (ambiguities, unreadable fragments, missing critical fields).",
    "",
    "SCHEMA KEYS (all always required):",
    JSON.stringify(Object.keys(CV_JSON_SCHEMA.properties))
  ].join("\n");
}

/**
 * Messaggio utente con testo CV.
 * @param {string} cvText
 * @param {{ outputLanguage: string }} options
 * @returns {string}
 */
export function buildCvParserUserPrompt(cvText, options) {
  const opts = options || {};
  return [
    "Analyze the following CV text and extract structured data.",
    "Requested output language mode: " + (opts.outputLanguage || "same") + ".",
    "",
    "CV TEXT:",
    "-----",
    String(cvText || ""),
    "-----"
  ].join("\n");
}

/**
 * Compatibilità FASE A.
 * @returns {{ version: string, role: string, content: string }}
 */
export function getCvParserPrompt() {
  return {
    version: CV_PARSER_PROMPT_VERSION,
    role: "system",
    content: buildCvParserSystemPrompt({ outputLanguage: "same" })
  };
}

export const CV_PARSER_PROMPT = getCvParserPrompt();
