/**
 * Offerta Cliente — stato dedicato (refactor template-based).
 */

export const CLIENT_OFFER_STORAGE_KEY = "gestionale.clientOffer.v2";
/**
 * v4: solo template B aziendale caricato manualmente (niente fallback A).
 */
export const CLIENT_OFFER_TEMPLATE_KEY = "gestionale.clientOffer.template.v4";
/** Progressivo numerico locale (solo lastNumber). */
export const CLIENT_OFFER_SEQUENCE_KEY = "gestionale.clientOffer.sequence.v1";
/** Ultimo numero già usato (default aziendale: 239 → prossima offerta 240). */
export const DEFAULT_LAST_SEQUENCE_NUMBER = 239;

/** Fallback in-memory quando localStorage non è disponibile (test Node). */
let memoryLastSequenceNumber = DEFAULT_LAST_SEQUENCE_NUMBER;

/**
 * @returns {number}
 */
export function getLastSequenceNumber() {
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      const raw = localStorage.getItem(CLIENT_OFFER_SEQUENCE_KEY);
      if (raw != null && raw !== "") {
        if (raw.charAt(0) === "{") {
          const o = JSON.parse(raw);
          const n = Number(o && o.lastNumber);
          if (Number.isFinite(n) && n >= 0) return Math.floor(n);
        } else {
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0) return Math.floor(n);
        }
      }
    }
  } catch {
    /* ignore */
  }
  return memoryLastSequenceNumber;
}

/**
 * Salva soltanto il numero numerico (es. 239).
 * @param {number|string} value
 * @returns {number}
 */
export function setLastSequenceNumber(value) {
  const n = Math.floor(Number(value));
  const safe = Number.isFinite(n) && n >= 0 ? n : DEFAULT_LAST_SEQUENCE_NUMBER;
  memoryLastSequenceNumber = safe;
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      localStorage.setItem(
        CLIENT_OFFER_SEQUENCE_KEY,
        JSON.stringify({ lastNumber: safe })
      );
    }
  } catch (err) {
    console.warn("[clientOffer] sequence non persistita:", err);
  }
  return safe;
}

/**
 * Prossimo numero senza consumarlo.
 * @returns {number}
 */
export function peekNextSequenceNumber() {
  return getLastSequenceNumber() + 1;
}

/**
 * Incrementa e restituisce il nuovo progressivo (solo su Nuova offerta / Usa prossimo).
 * @returns {number}
 */
export function allocateNextSequenceNumber() {
  const next = peekNextSequenceNumber();
  setLastSequenceNumber(next);
  return next;
}

/**
 * Reset test / bootstrap: imposta l'ultimo numero usato senza side-effect UI.
 * @param {number} [lastNumber]
 */
export function resetSequenceForTests(lastNumber) {
  const n =
    lastNumber == null ? DEFAULT_LAST_SEQUENCE_NUMBER : Math.floor(Number(lastNumber));
  memoryLastSequenceNumber = Number.isFinite(n) && n >= 0 ? n : DEFAULT_LAST_SEQUENCE_NUMBER;
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      localStorage.setItem(
        CLIENT_OFFER_SEQUENCE_KEY,
        JSON.stringify({ lastNumber: memoryLastSequenceNumber })
      );
    }
  } catch {
    /* ignore */
  }
}

/**
 * @returns {object}
 */
export function createDefaultClientOfferState() {
  const iso = new Date().toISOString().slice(0, 10);
  return {
    offer: {
      date: iso,
      proposalNumber: "",
      subject: "",
      location: "",
      fileName: ""
    },
    service: {
      position: "",
      assignedCandidate: "",
      activityLocation: "",
      supportType: "Technical Assistance Service"
    },
    /** Dati cliente opzionali — se vuoti restano i {{PLACEHOLDER}} nel Word */
    client: {
      name: "",
      address1: "",
      address2: "",
      contactTitle: "",
      contactName: "",
      contactSurname: ""
    },
    remuneration: {
      rateType: "calendar",
      selectedClientRate: null,
      /** Rate Calendar importato da Calcolo costi (rate30) — conservato separato */
      importedCalendarRate: null,
      /** Rate Working importato/derivato (rate26 o calendar×30/26) */
      importedWorkingRate: null,
      /** Monthly Lump Sum (unità mensile, non daily) */
      monthlyLumpSumRate: null,
      calendarDays: 30,
      workingDays: 26,
      monthlyPocketMoney: 0,
      dailyPocketMoney: 0,
      offerDailyRate: null,
      workingHoursPerDay: 10,
      workingDaysPerWeek: 6,
      pocketMode: "separate"
    },
    overtime: {
      mode: "manual",
      mondaySaturdayRate: null,
      mondaySaturdayMultiplier: 1.25,
      sundayHolidayRate: null,
      sundayHolidayMultiplier: 1.5,
      weeklyThreshold: 60,
      customText: ""
    },
    accommodation: {
      mode: "client_reimbursed",
      lumpSum: null,
      customText: ""
    },
    transportation: {
      mode: "client_reimbursed",
      lumpSum: null,
      customText: ""
    },
    logistics: {
      combinedLumpSum: false,
      combinedLumpSumAmount: null,
      travellingDay: "100",
      travellingDayCustom: "",
      ticketFlight: "standard",
      ticketFlightCustom: "",
      mobDemob: "standard",
      mobDemobCustom: "",
      ownCarEnabled: true,
      ownCarKmRate: 0.5
    },
    rotation: {
      mode: "defined",
      workDays: 90,
      restDays: 15,
      customText: ""
    },
    dates: {
      startMode: "within",
      endMode: "within",
      startDate: "",
      endDate: "",
      startManual: "",
      endManual: ""
    },
    /** Campi toccati manualmente — auto-import non li sovrascrive */
    manualLocks: {},
    /** Snapshot ultimo auto/force import (valori grezzi) */
    lastImported: {
      draft: null,
      cost: null,
      overtime: null
    },
    template: {
      name: "",
      size: 0,
      loadedAt: "",
      hasBuffer: false
    },
    meta: {
      lastGeneratedAt: null,
      lastFileName: "",
      autoImportedAt: null,
      /** Numero progressivo associato all'offerta corrente (non incrementa al download). */
      currentSequenceNumber: null,
      /** Se true, Proposal Number / nome file non vengono ricostruiti automaticamente. */
      proposalNumberManuallyEdited: false,
      fileNameManuallyEdited: false
    }
  };
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

export function ensureClientOfferState(appState) {
  if (!appState || typeof appState !== "object") {
    throw new Error("[clientOffer] AppState mancante");
  }
  if (!appState.clientOffer || typeof appState.clientOffer !== "object") {
    appState.clientOffer = createDefaultClientOfferState();
  }
  if (
    !appState.clientOffer.client ||
    typeof appState.clientOffer.client !== "object"
  ) {
    appState.clientOffer.client = createDefaultClientOfferState().client;
  }
  return appState.clientOffer;
}

/**
 * Reset offerta corrente: pulisce i campi, mantiene progressivo e Proposal Number.
 * Non incrementa il contatore globale.
 * @param {object} appState
 * @returns {object}
 */
export function resetClientOfferState(appState) {
  const prev = (appState && appState.clientOffer) || {};
  const prevTemplate = prev.template;
  const keepSeq =
    prev.meta && prev.meta.currentSequenceNumber != null
      ? prev.meta.currentSequenceNumber
      : null;
  const keepManual = !!(prev.meta && prev.meta.proposalNumberManuallyEdited);
  const keepFileManual = !!(prev.meta && prev.meta.fileNameManuallyEdited);
  const keepProposal =
    prev.offer && prev.offer.proposalNumber ? prev.offer.proposalNumber : "";
  const keepFileName =
    prev.offer && prev.offer.fileName ? prev.offer.fileName : "";

  const next = createDefaultClientOfferState();
  if (prevTemplate && prevTemplate.hasBuffer) {
    next.template = cloneJson(prevTemplate);
  }
  next.meta.currentSequenceNumber = keepSeq;
  next.meta.proposalNumberManuallyEdited = keepManual;
  next.meta.fileNameManuallyEdited = keepFileManual;
  next.offer.proposalNumber = keepProposal;
  next.offer.fileName = keepFileName;
  appState.clientOffer = next;
  return next;
}

export function markManualLock(state, path) {
  if (!state.manualLocks) state.manualLocks = {};
  state.manualLocks[path] = true;
}

export function isLocked(state, path) {
  return !!(state.manualLocks && state.manualLocks[path]);
}

export function clearManualLocks(state) {
  state.manualLocks = {};
}

export function toPersistable(state) {
  const s = cloneJson(state || createDefaultClientOfferState());
  // buffer non serializzato qui (chiave dedicata)
  return s;
}

export function loadClientOfferFromStorage(appState) {
  try {
    const raw = localStorage.getItem(CLIENT_OFFER_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;
    appState.clientOffer = deepMerge(createDefaultClientOfferState(), parsed);
    return true;
  } catch {
    return false;
  }
}

export function saveClientOfferToStorage(state) {
  try {
    localStorage.setItem(
      CLIENT_OFFER_STORAGE_KEY,
      JSON.stringify(toPersistable(state))
    );
  } catch (err) {
    console.warn("[clientOffer] persistenza non disponibile:", err);
  }
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return cloneJson(base);
  }
  const out = cloneJson(base);
  Object.keys(patch).forEach(function (key) {
    const pv = patch[key];
    const bv = out[key];
    if (
      pv &&
      typeof pv === "object" &&
      !Array.isArray(pv) &&
      bv &&
      typeof bv === "object" &&
      !Array.isArray(bv)
    ) {
      out[key] = deepMerge(bv, pv);
    } else if (pv !== undefined) {
      out[key] = cloneJson(pv);
    }
  });
  return out;
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
