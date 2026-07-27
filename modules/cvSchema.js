/**
 * Schema, normalizzazione e validazione analisi CV (REV03 FASE B1)
 */

export const SOURCE_LANGUAGES = Object.freeze(["it", "en", "other", "unknown"]);
export const OUTPUT_LANGUAGES = Object.freeze(["it", "en", "other", "unknown"]);

/**
 * Schema JSON Schema (strict) per OpenAI Responses API.
 */
export const CV_JSON_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "sourceLanguage",
    "outputLanguage",
    "primaryInformation",
    "summary",
    "education",
    "experience",
    "otherInformation",
    "warnings"
  ],
  properties: {
    sourceLanguage: { type: "string", enum: SOURCE_LANGUAGES.slice() },
    outputLanguage: { type: "string", enum: OUTPUT_LANGUAGES.slice() },
    primaryInformation: {
      type: "object",
      additionalProperties: false,
      required: [
        "fullName",
        "skill",
        "yearOfBirth",
        "nationality",
        "languages",
        "address"
      ],
      properties: {
        fullName: { type: "string" },
        skill: { type: "string" },
        yearOfBirth: { type: "string" },
        nationality: { type: "string" },
        languages: { type: "array", items: { type: "string" } },
        address: { type: "string" }
      }
    },
    summary: { type: "string" },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "period",
          "institution",
          "qualification",
          "location",
          "details"
        ],
        properties: {
          period: { type: "string" },
          institution: { type: "string" },
          qualification: { type: "string" },
          location: { type: "string" },
          details: { type: "string" }
        }
      }
    },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "period",
          "company",
          "client",
          "project",
          "position",
          "location",
          "description"
        ],
        properties: {
          period: { type: "string" },
          company: { type: "string" },
          client: { type: "string" },
          project: { type: "string" },
          position: { type: "string" },
          location: { type: "string" },
          description: { type: "array", items: { type: "string" } }
        }
      }
    },
    otherInformation: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "content"],
        properties: {
          label: { type: "string" },
          content: { type: "string" }
        }
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  }
});

/**
 * @returns {object}
 */
export function createEmptyCvAnalysis() {
  return {
    sourceLanguage: "unknown",
    outputLanguage: "unknown",
    primaryInformation: {
      fullName: "",
      skill: "",
      yearOfBirth: "",
      nationality: "",
      languages: [],
      address: ""
    },
    summary: "",
    education: [],
    experience: [],
    otherInformation: [],
    warnings: []
  };
}

/**
 * @returns {object}
 */
export function createEmptyEducationItem() {
  return {
    period: "",
    institution: "",
    qualification: "",
    location: "",
    details: ""
  };
}

/**
 * @returns {object}
 */
export function createEmptyExperienceItem() {
  return {
    period: "",
    company: "",
    client: "",
    project: "",
    position: "",
    location: "",
    description: [""]
  };
}

/**
 * @returns {object}
 */
export function createEmptyOtherItem() {
  return { label: "", content: "" };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function asString(value) {
  if (value == null) return "";
  return String(value);
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(function (item) {
    return asString(item);
  });
}

/**
 * Normalizza un payload verso lo schema (solo tipi/chiavi attese).
 * @param {unknown} raw
 * @returns {object}
 */
export function normalizeCvAnalysis(raw) {
  const base = createEmptyCvAnalysis();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }

  const data = raw;
  const src = asString(data.sourceLanguage).toLowerCase();
  const out = asString(data.outputLanguage).toLowerCase();
  base.sourceLanguage = SOURCE_LANGUAGES.indexOf(src) >= 0 ? src : "unknown";
  base.outputLanguage = OUTPUT_LANGUAGES.indexOf(out) >= 0 ? out : "unknown";

  const pi = data.primaryInformation && typeof data.primaryInformation === "object"
    ? data.primaryInformation
    : {};
  base.primaryInformation = {
    fullName: asString(pi.fullName),
    skill: asString(pi.skill),
    yearOfBirth: asString(pi.yearOfBirth),
    nationality: asString(pi.nationality),
    languages: asStringArray(pi.languages),
    address: asString(pi.address)
  };

  base.summary = asString(data.summary);
  base.warnings = asStringArray(data.warnings);

  base.education = Array.isArray(data.education)
    ? data.education.map(function (item) {
        const e = item && typeof item === "object" ? item : {};
        return {
          period: asString(e.period),
          institution: asString(e.institution),
          qualification: asString(e.qualification),
          location: asString(e.location),
          details: asString(e.details)
        };
      })
    : [];

  base.experience = Array.isArray(data.experience)
    ? data.experience.map(function (item) {
        const e = item && typeof item === "object" ? item : {};
        return {
          period: asString(e.period),
          company: asString(e.company),
          client: asString(e.client),
          project: asString(e.project),
          position: asString(e.position),
          location: asString(e.location),
          description: asStringArray(e.description)
        };
      })
    : [];

  base.otherInformation = Array.isArray(data.otherInformation)
    ? data.otherInformation.map(function (item) {
        const o = item && typeof item === "object" ? item : {};
        return {
          label: asString(o.label),
          content: asString(o.content)
        };
      })
    : [];

  return base;
}

/**
 * @param {object} obj
 * @param {string[]} allowed
 * @param {string} path
 * @param {string[]} errors
 */
function assertNoExtraKeys(obj, allowed, path, errors) {
  Object.keys(obj).forEach(function (key) {
    if (allowed.indexOf(key) === -1) {
      errors.push("Proprietà non prevista: " + path + "." + key);
    }
  });
}

/**
 * @param {unknown} data
 * @returns {{ ok: boolean, errors: string[], value: object|null }}
 */
export function validateCvAnalysis(data) {
  const errors = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["La risposta non è un oggetto JSON."], value: null };
  }

  const rootKeys = [
    "sourceLanguage",
    "outputLanguage",
    "primaryInformation",
    "summary",
    "education",
    "experience",
    "otherInformation",
    "warnings"
  ];
  rootKeys.forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      errors.push("Chiave mancante: " + key);
    }
  });
  assertNoExtraKeys(data, rootKeys, "root", errors);

  if (typeof data.sourceLanguage !== "string" || SOURCE_LANGUAGES.indexOf(data.sourceLanguage) < 0) {
    errors.push("sourceLanguage non valido.");
  }
  if (typeof data.outputLanguage !== "string" || OUTPUT_LANGUAGES.indexOf(data.outputLanguage) < 0) {
    errors.push("outputLanguage non valido.");
  }
  if (typeof data.summary !== "string") {
    errors.push("summary deve essere una stringa.");
  }
  if (!Array.isArray(data.warnings) || data.warnings.some(function (w) { return typeof w !== "string"; })) {
    errors.push("warnings deve essere un array di stringhe.");
  }

  const pi = data.primaryInformation;
  if (!pi || typeof pi !== "object" || Array.isArray(pi)) {
    errors.push("primaryInformation non valido.");
  } else {
    const piKeys = [
      "fullName",
      "skill",
      "yearOfBirth",
      "nationality",
      "languages",
      "address"
    ];
    piKeys.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(pi, key)) {
        errors.push("Chiave mancante: primaryInformation." + key);
      }
    });
    assertNoExtraKeys(pi, piKeys, "primaryInformation", errors);
    ["fullName", "skill", "yearOfBirth", "nationality", "address"].forEach(function (key) {
      if (typeof pi[key] !== "string") {
        errors.push("primaryInformation." + key + " deve essere stringa.");
      }
    });
    if (
      !Array.isArray(pi.languages) ||
      pi.languages.some(function (l) {
        return typeof l !== "string";
      })
    ) {
      errors.push("primaryInformation.languages deve essere array di stringhe.");
    }
  }

  if (!Array.isArray(data.education)) {
    errors.push("education deve essere un array.");
  } else {
    data.education.forEach(function (item, idx) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push("education[" + idx + "] non valido.");
        return;
      }
      const keys = ["period", "institution", "qualification", "location", "details"];
      keys.forEach(function (key) {
        if (typeof item[key] !== "string") {
          errors.push("education[" + idx + "]." + key + " deve essere stringa.");
        }
      });
      assertNoExtraKeys(item, keys, "education[" + idx + "]", errors);
    });
  }

  if (!Array.isArray(data.experience)) {
    errors.push("experience deve essere un array.");
  } else {
    data.experience.forEach(function (item, idx) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push("experience[" + idx + "] non valido.");
        return;
      }
      const keys = [
        "period",
        "company",
        "client",
        "project",
        "position",
        "location",
        "description"
      ];
      keys.forEach(function (key) {
        if (key === "description") return;
        if (typeof item[key] !== "string") {
          errors.push("experience[" + idx + "]." + key + " deve essere stringa.");
        }
      });
      if (
        !Array.isArray(item.description) ||
        item.description.some(function (d) {
          return typeof d !== "string";
        })
      ) {
        errors.push("experience[" + idx + "].description deve essere array di stringhe.");
      }
      assertNoExtraKeys(item, keys, "experience[" + idx + "]", errors);
    });
  }

  if (!Array.isArray(data.otherInformation)) {
    errors.push("otherInformation deve essere un array.");
  } else {
    data.otherInformation.forEach(function (item, idx) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push("otherInformation[" + idx + "] non valido.");
        return;
      }
      if (typeof item.label !== "string" || typeof item.content !== "string") {
        errors.push("otherInformation[" + idx + "] richiede label/content stringa.");
      }
      assertNoExtraKeys(item, ["label", "content"], "otherInformation[" + idx + "]", errors);
    });
  }

  if (errors.length) {
    return { ok: false, errors: errors, value: null };
  }

  return { ok: true, errors: [], value: normalizeCvAnalysis(data) };
}

/**
 * Label UI per lingua rilevata.
 * @param {string} code
 * @returns {string}
 */
export function languageLabel(code) {
  switch (code) {
    case "it":
      return "Italiano";
    case "en":
      return "Inglese";
    case "other":
      return "Altra lingua";
    case "unknown":
      return "Non rilevata";
    default:
      return "Non ancora analizzata";
  }
}
