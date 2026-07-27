/**
 * Impostazioni AI (REV03_SHARED + Browser su GitHub Pages)
 * Gestione modello, modalità connessione, chiave browser e health backend.
 * La API key NON va mai in AppState, log, Git o messaggi UI in chiaro di default.
 */

const STORAGE_KEY_API = "gestionale.cvManager.apiKey";
const STORAGE_KEY_MODEL = "gestionale.cvManager.model";
const STORAGE_KEY_MODE = "gestionale.cvManager.connectionMode";
const STORAGE_KEY_ENDPOINT = "gestionale.cvManager.secureEndpoint";
const STORAGE_KEY_PERSIST_KEY = "gestionale.cvManager.persistApiKey";

export const AI_DEFAULT_MODEL = "gpt-5.5";
export const AI_DEFAULT_SECURE_ENDPOINT = "/api/analyze-cv";
export const AI_DEFAULT_HEALTH_ENDPOINT = "/api/health";

/** Modalità: secure | localDev (valore storage; UI = "Browser") */
export const AI_MODE_SECURE = "secure";
export const AI_MODE_LOCAL = "localDev";
/** Alias semantico della modalità Browser (stesso valore di AI_MODE_LOCAL). */
export const AI_MODE_BROWSER = AI_MODE_LOCAL;

/**
 * @typedef {"unknown"|"checking"|"ready"|"not_configured"|"unreachable"|"incomplete"|"static_host"} BackendHealthStatus
 */

/** Messaggio quando Secure non è disponibile su host statico (Pages). */
export const STATIC_HOST_AI_MESSAGE =
  "La modalità Sicura non è disponibile su questo host. Selezionare Browser e inserire una API key personale.";

export const BROWSER_AI_SECURITY_HINT =
  "La API key viene utilizzata direttamente dal browser e resta sul dispositivo corrente. Utilizzare preferibilmente una chiave personale o dedicata all’applicazione.";

/** Chiave solo in memoria di sessione (non persistita). Non loggare. */
let memoryApiKey = "";

/** @type {{ status: BackendHealthStatus, checkedAt: number, message: string, openaiConfigured: boolean|null }} */
let backendHealth = {
  status: "unknown",
  checkedAt: 0,
  message: "",
  openaiConfigured: null
};

/**
 * Host di sviluppo locale (file:// o localhost / 127.0.0.1).
 * @returns {boolean}
 */
export function isLocalDevHost() {
  if (typeof window === "undefined" || !window.location) {
    return false;
  }
  const protocol = window.location.protocol || "";
  const host = String(window.location.hostname || "").toLowerCase();
  if (protocol === "file:") {
    return true;
  }
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/**
 * Hosting GitHub Pages.
 * @returns {boolean}
 */
export function isGitHubPages() {
  if (typeof window === "undefined" || !window.location) {
    return false;
  }
  const host = String(window.location.hostname || "").toLowerCase();
  return host === "github.io" || host.endsWith(".github.io");
}

/**
 * Unica fonte di verità: dove è consentita la modalità Browser (API key utente).
 * Consentita su file://, localhost, 127.0.0.1 e *.github.io.
 * @returns {boolean}
 */
export function isBrowserAiAllowed() {
  return isLocalDevHost() || isGitHubPages();
}

/**
 * Deploy non-locale (Pages o altro host pubblico).
 * @returns {boolean}
 */
export function isPublicDeploy() {
  return !isLocalDevHost();
}

/**
 * Host senza backend Express raggiungibile (es. GitHub Pages).
 * Non implica che la modalità Browser sia vietata.
 * @returns {boolean}
 */
export function isStaticHostWithoutBackend() {
  return isGitHubPages() || (isPublicDeploy() && !isLocalDevHost());
}

/**
 * Imposta lo stato backend senza chiamate di rete (host statico).
 * @returns {{ status: BackendHealthStatus, checkedAt: number, message: string, openaiConfigured: boolean|null }}
 */
export function applyStaticHostBackendState() {
  backendHealth = {
    status: "static_host",
    checkedAt: Date.now(),
    message: STATIC_HOST_AI_MESSAGE,
    openaiConfigured: false
  };
  return getBackendHealth();
}

/**
 * Preferenza persistenza chiave (default: salva sul dispositivo).
 * @returns {boolean}
 */
export function getPersistApiKeyPreference() {
  try {
    const v = localStorage.getItem(STORAGE_KEY_PERSIST_KEY);
    if (v === "0") return false;
    return true;
  } catch (err) {
    return true;
  }
}

/**
 * @returns {{ model: string, connectionMode: string, secureEndpoint: string, hasApiKey: boolean, persistApiKey: boolean }}
 */
export function loadAiSettings() {
  let model = AI_DEFAULT_MODEL;
  let connectionMode = AI_MODE_SECURE;
  let secureEndpoint = AI_DEFAULT_SECURE_ENDPOINT;
  let hasApiKey = false;
  let persistApiKey = true;

  try {
    model = localStorage.getItem(STORAGE_KEY_MODEL) || AI_DEFAULT_MODEL;
    const storedMode = localStorage.getItem(STORAGE_KEY_MODE);
    secureEndpoint =
      localStorage.getItem(STORAGE_KEY_ENDPOINT) || AI_DEFAULT_SECURE_ENDPOINT;
    persistApiKey = getPersistApiKeyPreference();
    const storedKey = localStorage.getItem(STORAGE_KEY_API) || "";
    hasApiKey = !!(memoryApiKey || storedKey);

    if (storedMode === AI_MODE_LOCAL && isBrowserAiAllowed()) {
      connectionMode = AI_MODE_LOCAL;
    } else if (storedMode === AI_MODE_SECURE) {
      connectionMode = AI_MODE_SECURE;
    } else if (isGitHubPages() && isBrowserAiAllowed()) {
      // Prima visita / senza preferenza: su Pages la modalità utile è Browser
      connectionMode = AI_MODE_LOCAL;
    } else {
      connectionMode = AI_MODE_SECURE;
    }
  } catch (err) {
    console.warn("[aiSettings] Impossibile leggere localStorage.");
  }

  if (connectionMode === AI_MODE_LOCAL && !isBrowserAiAllowed()) {
    connectionMode = AI_MODE_SECURE;
  }

  return {
    model: model,
    connectionMode: connectionMode,
    secureEndpoint: secureEndpoint,
    hasApiKey: hasApiKey,
    persistApiKey: persistApiKey
  };
}

/**
 * Restituisce la chiave solo per la chiamata Browser.
 * NON loggare il valore restituito.
 * @returns {string}
 */
export function getLocalApiKey() {
  if (!isBrowserAiAllowed()) {
    return "";
  }
  if (memoryApiKey) {
    return memoryApiKey;
  }
  try {
    return localStorage.getItem(STORAGE_KEY_API) || "";
  } catch (err) {
    return "";
  }
}

/**
 * @param {{
 *   model?: string,
 *   connectionMode?: string,
 *   secureEndpoint?: string,
 *   apiKey?: string,
 *   clearApiKey?: boolean,
 *   persistApiKey?: boolean
 * }} settings
 * @returns {{ model: string, connectionMode: string, secureEndpoint: string, hasApiKey: boolean, persistApiKey: boolean }}
 */
export function saveAiSettings(settings) {
  const input = settings || {};
  const model =
    typeof input.model === "string" && input.model.trim()
      ? input.model.trim()
      : AI_DEFAULT_MODEL;

  let connectionMode = AI_MODE_SECURE;
  if (input.connectionMode === AI_MODE_LOCAL && isBrowserAiAllowed()) {
    connectionMode = AI_MODE_LOCAL;
  }

  const secureEndpoint =
    typeof input.secureEndpoint === "string" && input.secureEndpoint.trim()
      ? input.secureEndpoint.trim()
      : AI_DEFAULT_SECURE_ENDPOINT;

  const persistApiKey =
    typeof input.persistApiKey === "boolean"
      ? input.persistApiKey
      : getPersistApiKeyPreference();

  try {
    localStorage.setItem(STORAGE_KEY_MODEL, model);
    localStorage.setItem(STORAGE_KEY_MODE, connectionMode);
    localStorage.setItem(STORAGE_KEY_ENDPOINT, secureEndpoint);
    localStorage.setItem(STORAGE_KEY_PERSIST_KEY, persistApiKey ? "1" : "0");

    if (input.clearApiKey) {
      memoryApiKey = "";
      localStorage.removeItem(STORAGE_KEY_API);
    } else if (typeof input.apiKey === "string") {
      const key = input.apiKey.trim();
      if (!key) {
        memoryApiKey = "";
        localStorage.removeItem(STORAGE_KEY_API);
      } else if (persistApiKey) {
        memoryApiKey = "";
        localStorage.setItem(STORAGE_KEY_API, key);
      } else {
        memoryApiKey = key;
        localStorage.removeItem(STORAGE_KEY_API);
      }
    } else if (!persistApiKey) {
      // Preferenza "non salvare": rimuove eventuale copia persistita
      localStorage.removeItem(STORAGE_KEY_API);
    }
  } catch (err) {
    console.warn("[aiSettings] Impossibile scrivere localStorage.");
  }

  return loadAiSettings();
}

/**
 * Deriva URL health dall'endpoint analyze.
 * @param {string} analyzeEndpoint
 * @returns {string}
 */
export function resolveHealthEndpoint(analyzeEndpoint) {
  const ep = String(analyzeEndpoint || AI_DEFAULT_SECURE_ENDPOINT).trim();
  if (!ep) return AI_DEFAULT_HEALTH_ENDPOINT;
  if (/analyze-cv\/?$/i.test(ep)) {
    return ep.replace(/analyze-cv\/?$/i, "health");
  }
  return AI_DEFAULT_HEALTH_ENDPOINT;
}

/**
 * Snapshot sincrono dell'ultimo health check.
 * @returns {{ status: BackendHealthStatus, checkedAt: number, message: string, openaiConfigured: boolean|null }}
 */
export function getBackendHealth() {
  return {
    status: backendHealth.status,
    checkedAt: backendHealth.checkedAt,
    message: backendHealth.message,
    openaiConfigured: backendHealth.openaiConfigured
  };
}

/**
 * Health check una tantum / manuale (non polling aggressivo).
 * Su host statico senza backend: nessun fetch automatico.
 * @param {{ endpoint?: string, timeoutMs?: number, forceNetwork?: boolean }} [options]
 * @returns {Promise<{ status: BackendHealthStatus, checkedAt: number, message: string, openaiConfigured: boolean|null }>}
 */
export async function checkBackendHealth(options) {
  const opts = options || {};

  if (isStaticHostWithoutBackend() && opts.forceNetwork !== true) {
    return applyStaticHostBackendState();
  }

  const settings = loadAiSettings();
  const analyzeEp = opts.endpoint || settings.secureEndpoint || AI_DEFAULT_SECURE_ENDPOINT;
  const healthUrl = resolveHealthEndpoint(analyzeEp);
  const timeoutMs = opts.timeoutMs || 8000;

  backendHealth = {
    status: "checking",
    checkedAt: Date.now(),
    message: "Verifica backend in corso…",
    openaiConfigured: null
  };

  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) {
      backendHealth = {
        status: "unreachable",
        checkedAt: Date.now(),
        message: "Backend non raggiungibile (HTTP " + response.status + ").",
        openaiConfigured: null
      };
      return getBackendHealth();
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch (err) {
      backendHealth = {
        status: "unreachable",
        checkedAt: Date.now(),
        message: "Backend ha restituito una risposta non valida.",
        openaiConfigured: null
      };
      return getBackendHealth();
    }

    const configured = !!(payload && payload.openaiConfigured === true);
    if (payload && payload.ok === true && configured) {
      backendHealth = {
        status: "ready",
        checkedAt: Date.now(),
        message: "Backend disponibile.",
        openaiConfigured: true
      };
    } else if (payload && payload.ok === true && !configured) {
      backendHealth = {
        status: "not_configured",
        checkedAt: Date.now(),
        message: "Backend raggiungibile ma OpenAI non configurata sul server.",
        openaiConfigured: false
      };
    } else {
      backendHealth = {
        status: "unreachable",
        checkedAt: Date.now(),
        message: "Backend non disponibile.",
        openaiConfigured: null
      };
    }
  } catch (err) {
    backendHealth = {
      status: "unreachable",
      checkedAt: Date.now(),
      message:
        "Backend non raggiungibile. Avviare lo staging server oppure verificare l’endpoint.",
      openaiConfigured: null
    };
  } finally {
    clearTimeout(timer);
  }

  return getBackendHealth();
}

/**
 * Configurazione AI valida per avviare l'analisi (readiness onesta).
 * In modalità Browser non richiede health backend.
 * @returns {{ ok: boolean, reason: string, message: string }}
 */
export function getAiConfigReadiness() {
  const settings = loadAiSettings();
  if (!settings.model) {
    return {
      ok: false,
      reason: "missing_model",
      message: "Impostare un modello AI."
    };
  }

  if (settings.connectionMode === AI_MODE_LOCAL) {
    if (!isBrowserAiAllowed()) {
      return {
        ok: false,
        reason: "browser_forbidden",
        message: "La modalità Browser non è disponibile su questo host."
      };
    }
    if (!getLocalApiKey()) {
      return {
        ok: false,
        reason: "missing_key",
        message: "Inserire una API key per utilizzare il CV Manager."
      };
    }
    return { ok: true, reason: "", message: "" };
  }

  // Modalità Secure
  if (!settings.secureEndpoint) {
    return {
      ok: false,
      reason: "missing_endpoint",
      message: "Endpoint sicuro non configurato."
    };
  }

  const health = getBackendHealth();
  if (health.status === "static_host") {
    return {
      ok: false,
      reason: "static_host",
      message: STATIC_HOST_AI_MESSAGE
    };
  }
  if (health.status === "unknown") {
    return {
      ok: false,
      reason: "backend_unchecked",
      message: "Verifica del backend non ancora eseguita."
    };
  }
  if (health.status === "checking") {
    return {
      ok: false,
      reason: "backend_checking",
      message: "Verifica backend in corso…"
    };
  }
  if (health.status === "unreachable") {
    return {
      ok: false,
      reason: "backend_unreachable",
      message: health.message || "Backend non raggiungibile."
    };
  }
  if (health.status === "not_configured") {
    return {
      ok: false,
      reason: "backend_not_configured",
      message: health.message || "OpenAI non configurata sul server."
    };
  }
  if (health.status === "ready") {
    return { ok: true, reason: "", message: "" };
  }

  return {
    ok: false,
    reason: "incomplete",
    message: "Configurazione AI incompleta."
  };
}

/**
 * Maschera una API key per visualizzazione UI.
 * @param {string} apiKey
 * @returns {string}
 */
export function maskApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== "string") {
    return "";
  }
  if (apiKey.length <= 8) {
    return "•".repeat(apiKey.length);
  }
  const head = apiKey.slice(0, 3);
  const tail = apiKey.slice(-4);
  return head + "•".repeat(Math.min(apiKey.length - 7, 24)) + tail;
}

/**
 * Hint mascherato senza esporre la chiave in AppState.
 * @returns {string}
 */
export function getMaskedApiKeyHint() {
  const key = getLocalApiKey();
  if (!key) {
    return "";
  }
  return maskApiKey(key);
}
