/**
 * Offerta Cliente — trasformazioni pure + dati template + arrotondamento commerciale.
 */

export const POCKET_CALENDAR_DAYS = 30;
/** Giorni calendar di riferimento per derivazione Working Rate. */
export const DEFAULT_CALENDAR_DAYS = 30;
/** Giorni working di riferimento per derivazione Working Rate. */
export const DEFAULT_WORKING_DAYS = 26;

/**
 * @deprecated Legacy — il naming usa ora {{CLIENT_NAME}} come segmento.
 * Mantenuto solo per compatibilità test/migrazione.
 */
export const CLIENT_MANUAL_SUFFIX = "_(CLIENTE da aggiungere manualmente)";

/**
 * Placeholder cliente: se il valore manca restano letterali nel Word (non rimuovere).
 */
export const PRESERVED_CLIENT_PLACEHOLDERS = Object.freeze([
  "CLIENT_NAME",
  "CLIENT_ADDRESS_1",
  "CLIENT_ADDRESS_2",
  "CONTACT_TITLE",
  "CONTACT_NAME",
  "CONTACT_SURNAME"
]);

/**
 * Valore reale oppure placeholder letterale {{KEY}} da lasciare nel Word.
 * @param {any} value
 * @param {string} placeholder - nome senza graffe
 * @returns {string}
 */
export function valueOrPlaceholder(value, placeholder) {
  const normalized = String(value == null ? "" : value).trim();
  if (normalized) return normalized;
  return "{{" + placeholder + "}}";
}

/**
 * Mapping Attention/Dear: titolo + nome completo (mai solo iniziale se c'è cognome).
 * @param {object} client
 * @returns {{ CONTACT_TITLE: string, CONTACT_NAME: string, CONTACT_SURNAME: string }}
 */
export function resolveContactFields(client) {
  const c = client || {};
  const title = safeText(c.contactTitle).trim();
  const name = safeText(c.contactName).trim();
  const surname = safeText(c.contactSurname).trim();
  const nameIsInitial = /^[A-Za-z]\.?$/.test(name);

  let displayName = "";
  if (name && surname) {
    if (nameIsInitial) {
      displayName = name.replace(/\.$/, "") + ". " + surname;
    } else if (
      new RegExp(
        "\\b" + surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
        "i"
      ).test(name)
    ) {
      displayName = name;
    } else {
      displayName = (name + " " + surname).replace(/\s+/g, " ").trim();
    }
  } else if (name) {
    displayName = name;
  } else if (surname) {
    displayName = surname;
  }

  let outTitle;
  if (title) {
    outTitle = title;
  } else if (displayName) {
    // Allinea al saluto del template B ("Dear Eng. …")
    outTitle = "Eng.";
  } else {
    outTitle = "{{CONTACT_TITLE}}";
  }

  const outName = displayName || "{{CONTACT_NAME}}";

  let outSurname;
  if (surname) {
    outSurname = surname;
  } else if (name && !nameIsInitial) {
    const parts = name.split(/\s+/).filter(Boolean);
    outSurname = parts.length > 1 ? parts[parts.length - 1] : name;
  } else {
    outSurname = "{{CONTACT_SURNAME}}";
  }

  return {
    CONTACT_TITLE: outTitle,
    CONTACT_NAME: outName,
    CONTACT_SURNAME: outSurname
  };
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isPreservedClientPlaceholder(key) {
  return PRESERVED_CLIENT_PLACEHOLDERS.indexOf(key) >= 0;
}

const ACC_LABELS = Object.freeze({
  client_reimbursed: "Client charge / reimbursed",
  our_lump: "Monthly lump sum",
  our_charge: "At our charge",
  na: "N/A",
  custom: "Custom"
});

const TR_LABELS = Object.freeze({
  client_reimbursed: "Client charge / reimbursed",
  our_lump: "Monthly lump sum",
  our_charge: "At our charge – no reimbursement",
  na: "N/A",
  custom: "Custom"
});

/**
 * Arrotondamento commerciale: sempre all'euro intero superiore.
 * @param {number} value
 * @returns {number|null}
 */
export function ceilEuro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.ceil(n);
}

/**
 * @param {any} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function safeText(value, fallback) {
  if (value === undefined || value === null) return fallback || "";
  if (typeof value === "number" && !Number.isFinite(value)) return fallback || "";
  const s = String(value);
  if (s === "undefined" || s === "null" || s === "NaN") return fallback || "";
  return s;
}

/**
 * Euro italiano: 1.500,00
 * @param {number} value
 * @returns {string}
 */
export function formatEuroIt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const fixed = Math.round(n * 100) / 100;
  const neg = fixed < 0;
  const abs = Math.abs(fixed);
  const parts = abs.toFixed(2).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + intPart + "," + parts[1];
}

/**
 * Formatta un importo economico in italiano (2 decimali), accettando
 * number o stringhe IT/EN (1500 | 1.500,00 | 1,500.00). Senza simbolo €.
 * Non applica Math.ceil (diverso da formatEuroCeil usato per rate offerta).
 * @param {any} value
 * @returns {string}
 */
export function formatEuroAmount(value) {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : parseMoneyInput(value);
  if (n == null || !Number.isFinite(n)) return "";
  return formatEuroIt(n);
}

/**
 * Formatta valore economico dopo Math.ceil.
 * @param {number} value
 * @returns {string}
 */
export function formatEuroCeil(value) {
  const c = ceilEuro(value);
  if (c == null) return "";
  return formatEuroIt(c);
}

export function computeDailyPocketMoney(monthlyPocketMoney) {
  const m = Number(monthlyPocketMoney);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return m / POCKET_CALENDAR_DAYS;
}

export function computeOfferDailyRate(selectedClientRate, dailyPocketMoney) {
  const rate = Number(selectedClientRate);
  if (!Number.isFinite(rate)) return null;
  const pocket = Number(dailyPocketMoney) || 0;
  if (pocket > 0) return rate - pocket;
  return rate;
}

export function proposeRemunerationFromCost(input) {
  const monthly = Number(input.monthlyPocketMoney) || 0;
  const daily = computeDailyPocketMoney(monthly);
  const offer = computeOfferDailyRate(input.selectedClientRate, daily);
  let pocketMode = input.pocketMode || "separate";
  if (daily <= 0) pocketMode = "na";
  else if (!input.pocketMode) pocketMode = "separate";
  return {
    dailyPocketMoney: daily,
    offerDailyRate: offer,
    pocketMode
  };
}

/**
 * Deriva Working Rate da Calendar: calendarRate × calendarDays / workingDays.
 * @param {number} calendarRate
 * @param {number} [calendarDays]
 * @param {number} [workingDays]
 * @returns {number|null}
 */
export function deriveWorkingRateFromCalendar(
  calendarRate,
  calendarDays,
  workingDays
) {
  const cal = Number(calendarRate);
  const cDays =
    Number(calendarDays) > 0 ? Number(calendarDays) : DEFAULT_CALENDAR_DAYS;
  const wDays =
    Number(workingDays) > 0 ? Number(workingDays) : DEFAULT_WORKING_DAYS;
  if (!Number.isFinite(cal) || cal <= 0 || !(cDays > 0) || !(wDays > 0)) {
    return null;
  }
  return (cal * cDays) / wDays;
}

/**
 * Risolve l'importo offerta in base al Rate Type selezionato.
 * Conserva calendar / working / monthly separati — non riusa un solo campo generico.
 *
 * @param {object} rem
 * @returns {{
 *   rateType: string,
 *   amount: number|null,
 *   unit: string,
 *   kind: "daily"|"monthly",
 *   label: string
 * }}
 */
export function resolveOfferRateByType(rem) {
  const r = rem || {};
  const rateType = String(r.rateType || "calendar");
  const calendarDays =
    Number(r.calendarDays) > 0 ? Number(r.calendarDays) : DEFAULT_CALENDAR_DAYS;
  const workingDays =
    Number(r.workingDays) > 0 ? Number(r.workingDays) : DEFAULT_WORKING_DAYS;

  const importedCalendar = Number(
    r.importedCalendarRate != null ? r.importedCalendarRate : null
  );
  const importedWorking = Number(r.importedWorkingRate);
  const monthlyLump = Number(r.monthlyLumpSumRate);

  if (rateType === "lumpSum") {
    const amount =
      Number.isFinite(monthlyLump) && monthlyLump > 0 ? monthlyLump : null;
    return {
      rateType: "lumpSum",
      amount: amount,
      unit: "month",
      kind: "monthly",
      label: "Monthly Rate"
    };
  }

  if (rateType === "working") {
    let amount =
      Number.isFinite(importedWorking) && importedWorking > 0
        ? importedWorking
        : null;
    if (amount == null) {
      const calFallback = Number.isFinite(importedCalendar) && importedCalendar > 0
        ? importedCalendar
        : Number(r.selectedClientRate);
      amount = deriveWorkingRateFromCalendar(
        calFallback,
        calendarDays,
        workingDays
      );
    }
    return {
      rateType: "working",
      amount: amount,
      unit: "working day",
      kind: "daily",
      label: "Working Rate"
    };
  }

  const calAmount =
    Number.isFinite(importedCalendar) && importedCalendar > 0
      ? importedCalendar
      : Number.isFinite(Number(r.selectedClientRate)) &&
          Number(r.selectedClientRate) > 0
        ? Number(r.selectedClientRate)
        : null;
  return {
    rateType: "calendar",
    amount: calAmount,
    unit: "calendar day",
    kind: "daily",
    label: "Calendar Rate"
  };
}

/**
 * Applica resolveOfferRateByType allo stato remunerazione:
 * aggiorna selectedClientRate / offerDailyRate / monthlyLumpSumRate.
 * Per Lump Sum non sottrae pocket money dal monthly rate.
 * @param {object} rem
 * @param {{ preserveOfferDaily?: boolean }} [opts]
 * @returns {object} rem mutato
 */
export function applyResolvedOfferRate(rem, opts) {
  const r = rem || {};
  const preserveOffer = !!(opts && opts.preserveOfferDaily);
  const resolved = resolveOfferRateByType(r);

  if (resolved.kind === "monthly") {
    if (resolved.amount != null) {
      r.monthlyLumpSumRate = resolved.amount;
      r.selectedClientRate = resolved.amount;
    }
    // Nessuna conversione daily / sottrazione pocket sul monthly
    if (!preserveOffer) {
      r.offerDailyRate = null;
    }
    return r;
  }

  if (resolved.amount != null) {
    r.selectedClientRate = resolved.amount;
    if (resolved.rateType === "calendar") {
      r.importedCalendarRate =
        r.importedCalendarRate != null ? r.importedCalendarRate : resolved.amount;
    }
    if (resolved.rateType === "working") {
      r.importedWorkingRate =
        r.importedWorkingRate != null ? r.importedWorkingRate : resolved.amount;
    }
    if (!preserveOffer) {
      const proposed = proposeRemunerationFromCost({
        selectedClientRate: resolved.amount,
        monthlyPocketMoney: r.monthlyPocketMoney,
        pocketMode: r.pocketMode
      });
      r.dailyPocketMoney = proposed.dailyPocketMoney;
      r.offerDailyRate = proposed.offerDailyRate;
      if (proposed.pocketMode) r.pocketMode = proposed.pocketMode;
    }
  }
  return r;
}

export function rateTypeLabel(rateType) {
  if (rateType === "working") return "working day";
  if (rateType === "lumpSum") return "month";
  return "calendar day";
}

export function accommodationLabel(mode) {
  return ACC_LABELS[mode] || mode || "—";
}

export function transportationLabel(mode) {
  return TR_LABELS[mode] || mode || "—";
}

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

/**
 * @param {number|string} day
 * @returns {{ number: string, suffix: string }}
 */
export function getOrdinalParts(day) {
  const n = Number(day);
  if (!Number.isFinite(n) || n <= 0) {
    return { number: String(day == null ? "" : day), suffix: "" };
  }
  const j = n % 10;
  const k = n % 100;
  let suffix = "th";
  if (j === 1 && k !== 11) suffix = "st";
  else if (j === 2 && k !== 12) suffix = "nd";
  else if (j === 3 && k !== 13) suffix = "rd";
  return { number: String(n), suffix: suffix };
}

function ordinalDay(day) {
  const parts = getOrdinalParts(day);
  if (!parts.suffix) return parts.number;
  return parts.number + parts.suffix;
}

/**
 * Solo data lettera (il template ha già "Milan, ").
 * @param {string} iso
 * @returns {string}
 */
export function formatLetterDate(iso) {
  if (!iso) return "…";
  const parts = String(iso).split("-");
  if (parts.length < 3) {
    return safeText(iso)
      .replace(/^Milan,\s*/i, "")
      .trim();
  }
  const y = parts[0];
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return ordinalDay(d) + " " + (MONTHS_EN[m - 1] || "") + " " + y;
}

/**
 * Evita "Within Within …" se il testo manuale lo contiene già.
 * @param {string} text
 * @returns {string}
 */
export function ensureSingleWithin(text) {
  let s = safeText(text).trim();
  s = s.replace(/^(Within\s+)+/i, "Within ");
  return s;
}

/**
 * Rimuove uno o più "Within " iniziali (quando il template li ha già).
 * @param {string} text
 * @returns {string}
 */
export function stripLeadingWithin(text) {
  return safeText(text)
    .trim()
    .replace(/^(Within\s+)+/i, "")
    .trim();
}

export function formatOfferDateDisplay(iso, mode, manual) {
  if (mode === "na") return "N/A";
  if (mode === "tbd") return "to be defined";
  if (mode === "manual") return ensureSingleWithin(manual);
  if (!iso) {
    const fallback = safeText(manual).trim();
    return fallback ? ensureSingleWithin(fallback) : "…";
  }
  const parts = String(iso).split("-");
  if (parts.length < 2) return ensureSingleWithin(iso);
  const y = parts[0];
  const m = Number(parts[1]);
  const d = parts[2] ? Number(parts[2]) : 1;
  const monthName = MONTHS_EN[m - 1] || parts[1];
  if (mode === "full") return ordinalDay(d) + " " + monthName + " " + y;
  if (mode === "month_year") return monthName + " " + y;
  return ensureSingleWithin("Within " + monthName + " " + y);
}

export function sanitizeWindowsFileName(name) {
  let s = safeText(name).trim();
  if (!s) s = "OFFERTA_CLIENTE";
  // Solo caratteri vietati Windows; preserva spazi, &, (), underscore, {{}}
  s = s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "");
  s = s.replace(/\.+$/g, "");
  if (!s) s = "OFFERTA_CLIENTE";
  if (!/\.docx$/i.test(s)) s += ".docx";
  return s;
}

/**
 * Normalizza un segmento del Proposal Number / nome file.
 * @param {any} text
 * @returns {string}
 */
export function normalizeOfferNamePart(text) {
  const raw = safeText(text).trim();
  if (!raw) return "";
  // Non alterare placeholder {{KEY}}
  if (/^\{\{[A-Z0-9_]+\}\}$/.test(raw)) return raw;
  let s = raw.replace(/\s+/g, " ").toUpperCase();
  s = s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "");
  return s;
}

/**
 * Parse importi IT/EN: 1000 | 1.000 | 1.000,00 | 1000,00 | 1000.00
 * @param {any} value
 * @returns {number|null}
 */
export function parseMoneyInput(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  let s = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/€/gi, "")
    .replace(/euro/gi, "");
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || (/^\d+,\d+$/.test(s) && !s.includes("."))) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{3},\d+$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalizza rotation da Offerta Cliente + Draft (nomi campo eterogenei).
 * @param {object} clientOfferState
 * @param {object} [draftState]
 * @returns {{ mode: string, workDays: number|null, restDays: number|null, customText: string }}
 */
export function normalizeRotationData(clientOfferState, draftState) {
  const offer = (clientOfferState && clientOfferState.rotation) || {};
  const draftRoot = draftState || {};
  const draftRot = draftRoot.rotation || draftRoot || {};

  let mode = String(
    offer.mode ||
      offer.rotationMode ||
      draftRot.mode ||
      draftRot.rotationMode ||
      "defined"
  ).toLowerCase();

  let workDays =
    offer.workDays != null
      ? offer.workDays
      : offer.rotationWorkDays != null
        ? offer.rotationWorkDays
        : offer.rotationWork != null
          ? offer.rotationWork
          : null;
  let restDays =
    offer.restDays != null
      ? offer.restDays
      : offer.rotationRestDays != null
        ? offer.rotationRestDays
        : offer.rotationRest != null
          ? offer.rotationRest
          : null;
  let customText = safeText(
    offer.customText != null
      ? offer.customText
      : offer.rotationCustomText
  ).trim();

  const draftValue = safeText(
    draftRot.value || draftRot.rotationValue || draftRot.schema
  ).trim();
  const draftMode = String(
    draftRot.mode || draftRot.rotationMode || ""
  ).toLowerCase();

  const offerHasNumeric =
    parsePositiveInt(workDays) != null && parsePositiveInt(restDays) != null;
  const offerHasCustom = mode === "custom" && !!customText;
  const offerHasNa = mode === "na";
  const offerHasTbd = mode === "tbd";
  const offerComplete =
    offerHasNumeric || offerHasCustom || offerHasNa || offerHasTbd || mode === "hide";

  if (!offerComplete) {
    if (
      draftMode === "na" ||
      /^n\.?a\.?$/i.test(draftValue) ||
      draftValue.toUpperCase() === "N/A"
    ) {
      mode = "na";
      workDays = null;
      restDays = null;
    } else if (draftMode === "tbd" || /tbd|to be defined/i.test(draftValue)) {
      mode = "tbd";
      workDays = null;
      restDays = null;
    } else if (draftMode === "custom" && draftValue) {
      mode = "custom";
      customText = draftValue;
    } else {
      const pair = String(draftValue || "").match(/(\d+)\s*[\/\-]\s*(\d+)/);
      if (pair) {
        mode = "defined";
        workDays = Number(pair[1]);
        restDays = Number(pair[2]);
      } else if (
        draftRot.workDays != null ||
        draftRot.rotationWorkDays != null
      ) {
        mode = "defined";
        workDays =
          draftRot.workDays != null
            ? draftRot.workDays
            : draftRot.rotationWorkDays;
        restDays =
          draftRot.restDays != null
            ? draftRot.restDays
            : draftRot.rotationRestDays;
      }
    }
  } else if (
    (mode === "free" || mode === "defined") &&
    !offerHasNumeric &&
    draftValue
  ) {
    const pair = String(draftValue).match(/(\d+)\s*[\/\-]\s*(\d+)/);
    if (pair) {
      mode = "defined";
      workDays = Number(pair[1]);
      restDays = Number(pair[2]);
    }
  }

  if (mode === "free") mode = "defined";

  return {
    mode: mode || "defined",
    workDays: workDays == null || workDays === "" ? null : Number(workDays),
    restDays: restDays == null || restDays === "" ? null : Number(restDays),
    customText: customText || ""
  };
}

/**
 * Scrive rotation normalizzata nello stato offerta.
 * @param {object} offerState
 * @param {object} [draftState]
 * @returns {object} rotation normalizzata
 */
export function applyNormalizedRotation(offerState, draftState) {
  const normalized = normalizeRotationData(offerState, draftState);
  if (!offerState.rotation) offerState.rotation = {};
  offerState.rotation.mode = normalized.mode;
  offerState.rotation.workDays = Number.isFinite(normalized.workDays)
    ? normalized.workDays
    : null;
  offerState.rotation.restDays = Number.isFinite(normalized.restDays)
    ? normalized.restDays
    : null;
  offerState.rotation.customText = normalized.customText;
  return normalized;
}

/**
 * Migra Proposal Number legacy (suffisso cliente / solo OFF_NLC) al formato completo.
 * @param {object} state
 * @returns {boolean} true se migrato
 */
export function migrateLegacyProposalNaming(state) {
  const s = state || {};
  if (!s.offer) return false;
  if (!s.meta) s.meta = {};
  const pn = safeText(s.offer.proposalNumber).trim();
  const legacy =
    !pn ||
    pn.indexOf(CLIENT_MANUAL_SUFFIX) >= 0 ||
    /\(CLIENTE da aggiungere/i.test(pn) ||
    /^OFF_\d+LC$/i.test(pn);
  if (!legacy && s.meta.proposalNumberManuallyEdited) return false;

  // Non sovrascrivere un progressivo corrente già valido con un vecchio 234 nel testo
  if (s.meta.currentSequenceNumber == null || s.meta.currentSequenceNumber === "") {
    const m = pn.match(/OFF_(\d+)LC/i);
    if (m) s.meta.currentSequenceNumber = Number(m[1]);
  }
  if (s.meta.currentSequenceNumber == null || s.meta.currentSequenceNumber === "") {
    return false;
  }
  // Rimuove override manuale solo se formato legacy
  if (legacy) s.meta.proposalNumberManuallyEdited = false;
  if (s.meta.proposalNumberManuallyEdited) return false;
  syncAutoProposalNaming(s, { force: true });
  return true;
}

/**
 * OFF_[N]LC_[POSITION]_[LOCATION]_[CLIENT_NAME]
 * Segmenti assenti → {{POSITION}} / {{LOCATION}} / {{CLIENT_NAME}}
 * @param {{ sequenceNumber?: number|string, seq?: number|string, position?: string, subject?: string, location?: string, clientName?: string, client?: string }} p
 * @returns {string}
 */
export function buildProposalNumber(p) {
  const src = p || {};
  const rawSeq = src.sequenceNumber != null ? src.sequenceNumber : src.seq;
  const digits = String(rawSeq == null ? "" : rawSeq).replace(/\D/g, "");
  const seqPart = digits || "XXX";
  const positionPart =
    normalizeOfferNamePart(src.position || src.subject) || "{{POSITION}}";
  const locationPart = normalizeOfferNamePart(src.location) || "{{LOCATION}}";
  const clientPart =
    normalizeOfferNamePart(src.clientName || src.client) || "{{CLIENT_NAME}}";
  return (
    "OFF_" +
    seqPart +
    "LC_" +
    positionPart +
    "_" +
    locationPart +
    "_" +
    clientPart
  );
}

/**
 * @deprecated Preferire buildProposalNumber — alias compatibile.
 * @param {object} p
 * @returns {string}
 */
export function suggestProposalNumber(p) {
  return buildProposalNumber(p);
}

/**
 * Legacy no-op: non aggiunge più il suffisso _(CLIENTE…).
 * @param {string} proposalNumber
 * @returns {string}
 */
export function ensureClientManualSuffix(proposalNumber) {
  return safeText(proposalNumber).trim();
}

/**
 * Allinea fileName al Proposal Number se non editato manualmente.
 * @param {object} state
 * @returns {object}
 */
export function applyClientManualNaming(state) {
  const s = state || {};
  if (!s.offer) return s;
  if (!(s.meta && s.meta.fileNameManuallyEdited)) {
    if (s.offer.proposalNumber) {
      s.offer.fileName = String(s.offer.proposalNumber).replace(/\.docx$/i, "");
    }
  }
  return s;
}

/**
 * Ricostruisce Proposal Number (e fileName) da progressivo + position/location/client.
 * Rispetta proposalNumberManuallyEdited.
 * @param {object} state
 * @param {{ force?: boolean }} [opts]
 * @returns {string} proposal number risultante
 */
export function syncAutoProposalNaming(state, opts) {
  const s = state || {};
  const force = !!(opts && opts.force);
  if (!s.offer) return "";
  if (!s.meta) s.meta = {};
  if (!force && s.meta.proposalNumberManuallyEdited) {
    return safeText(s.offer.proposalNumber).trim();
  }
  const seq = s.meta.currentSequenceNumber;
  if (seq == null || seq === "") {
    return safeText(s.offer.proposalNumber).trim();
  }
  const service = s.service || {};
  const client = s.client || {};
  const pn = buildProposalNumber({
    sequenceNumber: seq,
    position: service.position || s.offer.subject,
    location: s.offer.location || service.activityLocation,
    clientName: client.name
  });
  s.offer.proposalNumber = pn;
  s.meta.proposalNumberManuallyEdited = false;
  if (!s.meta.fileNameManuallyEdited) {
    s.offer.fileName = pn;
  }
  return pn;
}

function phraseAcc(cfg) {
  if (!cfg) return "";
  if (cfg.mode === "custom") return safeText(cfg.customText).trim();
  if (cfg.mode === "our_lump") {
    const amount = parseMoneyInput(cfg.lumpSum);
    if (amount != null && amount > 0) {
      return (
        "Local accommodation: Euro " +
        formatEuroCeil(amount) +
        " monthly lump sum"
      );
    }
    return "Local accommodation: at our charge – monthly lump sum recognized";
  }
  if (cfg.mode === "our_charge") return "Local accommodation: at our charge";
  if (cfg.mode === "na") return "";
  return "Local accommodation: at Client charge or reimbursed upon receipt";
}

function phraseTr(cfg) {
  if (!cfg) return "";
  if (cfg.mode === "custom") return safeText(cfg.customText).trim();
  if (cfg.mode === "our_lump") {
    const amount = parseMoneyInput(cfg.lumpSum);
    if (amount != null && amount > 0) {
      return (
        "Local transportation: Euro " +
        formatEuroCeil(amount) +
        " monthly lump sum"
      );
    }
    return "Local transportation: at our charge – monthly lump sum recognized";
  }
  if (cfg.mode === "our_charge") {
    return "Local transportation: at our charge – no reimbursement";
  }
  if (cfg.mode === "na") return "";
  return "Local transportation: at Client charge or reimbursed upon receipt";
}

/**
 * Righe logistiche per template (stringhe vuote = paragrafo rimosso).
 * Somma numerica degli lump sum quando entrambe le voci sono our_lump.
 * @param {object} state
 * @returns {{ accommodation: string, transportation: string, pocket: string }}
 */
export function buildLogisticsRows(state) {
  const log = (state && state.logistics) || {};
  const acc = (state && state.accommodation) || {};
  const tr = (state && state.transportation) || {};
  const rem = (state && state.remuneration) || {};

  if (log.combinedLumpSum) {
    const amount = parseMoneyInput(log.combinedLumpSumAmount);
    if (amount != null && amount > 0) {
      return {
        accommodation:
          "Local accommodation, transportation and meals: Euro " +
          formatEuroCeil(amount) +
          " monthly lump sum",
        transportation: "",
        pocket: buildPocketRow(rem)
      };
    }
  }

  let accommodation = "";
  let transportation = "";

  // Caso A: entrambe monthly lump sum → somma importi
  if (acc.mode === "our_lump" && tr.mode === "our_lump") {
    const accAmt = parseMoneyInput(acc.lumpSum);
    const trAmt = parseMoneyInput(tr.lumpSum);
    if (accAmt != null && accAmt > 0 && trAmt != null && trAmt > 0) {
      const combined = accAmt + trAmt;
      accommodation =
        "Local accommodation and transportation: Euro " +
        formatEuroCeil(combined) +
        " monthly lump sum";
      transportation = "";
      return {
        accommodation,
        transportation,
        pocket: buildPocketRow(rem)
      };
    }
  }

  // Caso D: entrambe Client charge (stessa modalità compatibile)
  if (
    acc.mode === tr.mode &&
    acc.mode !== "na" &&
    acc.mode !== "custom" &&
    acc.mode !== "our_lump"
  ) {
    if (acc.mode === "client_reimbursed" || acc.mode === "our_charge") {
      accommodation =
        acc.mode === "our_charge"
          ? "Local accommodation and transportation: at our charge"
          : "Local accommodation and transportation: at Client charge or reimbursed upon receipt";
      transportation = "";
      return {
        accommodation,
        transportation,
        pocket: buildPocketRow(rem)
      };
    }
  }

  // Caso B/C/E: righe distinte
  accommodation = phraseAcc(acc);
  transportation = phraseTr(tr);

  return {
    accommodation,
    transportation,
    pocket: buildPocketRow(rem)
  };
}

export function buildPocketRow(rem) {
  const r = rem || {};
  const mode = r.pocketMode || "separate";
  if (mode === "included" || mode === "na") return "";
  const pocket = Number(r.dailyPocketMoney) || 0;
  if (mode === "separate" && pocket > 0) {
    return (
      "Pocket money: Euro " + formatEuroCeil(pocket) + " /calendar day"
    );
  }
  return "";
}

export function buildTravellingDayText(logistics) {
  const mode = (logistics && logistics.travellingDay) || "100";
  if (mode === "na") return "";
  if (mode === "custom") return safeText(logistics.travellingDayCustom).trim();
  if (mode === "50") {
    return "Travelling day shall be recognized at 50% of the applicable working day rate.";
  }
  return "Travelling day is to be considered as working day";
}

export function buildTicketFlightText(logistics) {
  const mode = (logistics && logistics.ticketFlight) || "standard";
  if (mode === "na") return "";
  if (mode === "custom") return safeText(logistics.ticketFlightCustom).trim();
  if (mode === "client") return "Ticket Flight (class economy): at Client charge.";
  if (mode === "reimbursed") {
    return "Ticket Flight (class economy): reimbursed upon receipt.";
  }
  if (mode === "our") return "Ticket Flight (class economy): at our charge.";
  return "Ticket Flight (class economy): if used, directly provided by the Client or reimbursed upon receipt.";
}

export function buildMobDemobText(logistics) {
  const mode = (logistics && logistics.mobDemob) || "standard";
  if (mode === "na") return "";
  if (mode === "custom") return safeText(logistics.mobDemobCustom).trim();
  if (mode === "client") return "Travel expenses (Mob-Demob): at Client charge.";
  if (mode === "reimbursed") {
    return "Travel expenses (Mob-Demob): reimbursed upon receipt.";
  }
  if (mode === "our") return "Travel expenses (Mob-Demob): at our charge.";
  return "Travel expenses (Mob-Demob): at Client charge or reimbursed upon receipt.";
}

export function buildOwnCarText(logistics) {
  if (!logistics || !logistics.ownCarEnabled) return "";
  const km = Number(logistics.ownCarKmRate);
  const rate = Number.isFinite(km) ? km : 0.5;
  // Senza trattino a margine: rientro gestito dal post-format template B
  return (
    "In case of travelling with his own car, the cost for travel and local transportation will be: Euro " +
    formatEuroIt(rate) +
    "/Km"
  );
}

function parsePositiveInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Senza "4.0": la numerazione la fornisce il template B (list numbering). */
const ROTATION_TITLE_BASE = "REST PERIOD AND RETURN TO THE HOME";
const ROTATION_BODY_TBD =
  "Our Staff is allowed to return to the Home Office every … days of uninterrupted stay at Job Site for a standard rest period of … days.";

/**
 * Blocco Rotation completo (titolo + testo). Mai solo titolo senza testo.
 * @param {object} rotationOrState — oggetto rotation oppure stato offerta completo
 * @param {object} [draftState]
 * @returns {{ title: string, text: string, body: string, workDays: string, restDays: string }}
 */
export function buildRotationOutput(rotationOrState, draftState) {
  let r = rotationOrState || {};
  if (r.rotation || r.service || r.offer) {
    r = normalizeRotationData(r, draftState);
  } else if (draftState) {
    r = normalizeRotationData({ rotation: r }, draftState);
  } else {
    r = normalizeRotationData({ rotation: r }, null);
  }

  if (r.mode === "hide") {
    return { title: "", text: "", body: "", workDays: "", restDays: "" };
  }
  if (r.mode === "na") {
    const out = {
      title: ROTATION_TITLE_BASE + ": N.A.",
      text: "Not applicable.",
      workDays: "",
      restDays: ""
    };
    return {
      title: out.title,
      text: out.text,
      body: out.text,
      workDays: out.workDays,
      restDays: out.restDays
    };
  }
  if (r.mode === "tbd") {
    return {
      title: ROTATION_TITLE_BASE + ": (to be defined)",
      text: ROTATION_BODY_TBD,
      body: ROTATION_BODY_TBD,
      workDays: "…",
      restDays: "…"
    };
  }
  if (r.mode === "custom") {
    const custom = safeText(r.customText).trim() || "…";
    return {
      title: ROTATION_TITLE_BASE + ":",
      text: custom,
      body: custom,
      workDays: "",
      restDays: ""
    };
  }
  const work = parsePositiveInt(r.workDays);
  const rest = parsePositiveInt(r.restDays);
  if (work == null || rest == null) {
    return {
      title: ROTATION_TITLE_BASE + ": (to be defined)",
      text: ROTATION_BODY_TBD,
      body: ROTATION_BODY_TBD,
      workDays: "…",
      restDays: "…"
    };
  }
  const text =
    "Our Staff is allowed to return to the Home Office every " +
    work +
    " days of uninterrupted stay at Job Site for a standard rest period of " +
    rest +
    " days.";
  return {
    title: ROTATION_TITLE_BASE + ":",
    text: text,
    body: text,
    workDays: String(work),
    restDays: String(rest)
  };
}

/** @deprecated Usare buildRotationOutput */
export function buildRotationBlock(rotation) {
  return buildRotationOutput(rotation);
}

/**
 * Solo riga tariffa OT (per template che hanno già il testo standard).
 * @param {object} ot
 * @returns {string}
 */
export function buildOvertimeStandardRateOnly(ot) {
  const o = ot || {};
  if (o.mode === "na") return "";
  if (o.mode === "custom" && o.customText) return safeText(o.customText).trim();
  const ms = Number(o.mondaySaturdayRate);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const m1 = Number(o.mondaySaturdayMultiplier);
  let rateLine = "Euro " + formatEuroCeil(ms) + "/hh";
  if (Number.isFinite(m1) && m1 !== 1) {
    rateLine += " (x " + String(m1).replace(".", ",") + ")";
  }
  return rateLine;
}

/**
 * Paragrafo overtime completo (il template contiene solo {{OVERTIME_STANDARD}}).
 * @param {object} ot
 * @returns {string}
 */
export function buildOvertimeStandard(ot) {
  const o = ot || {};
  if (o.mode === "na") return "";
  if (o.mode === "custom" && o.customText) return safeText(o.customText).trim();
  const rateLine = buildOvertimeStandardRateOnly(ot);
  if (!rateLine) return "";
  const thr = Number(o.weeklyThreshold) || 60;
  return (
    "Overtime: The work exceeding " +
    thr +
    " hours/week from Monday to Saturday,\n" +
    "approved by the Client, shall be paid on the following Hourly Rate:\n" +
    rateLine
  );
}

/**
 * Solo riga tariffa Sunday/Holiday.
 * @param {object} ot
 * @returns {string}
 */
export function buildOvertimeHolidayRateOnly(ot) {
  const o = ot || {};
  if (o.mode === "na" || o.mode === "custom") return "";
  const sun = Number(o.sundayHolidayRate);
  if (!Number.isFinite(sun) || sun <= 0) return "";
  const m2 = Number(o.sundayHolidayMultiplier);
  let line = "Euro " + formatEuroCeil(sun) + "/hh";
  if (Number.isFinite(m2) && m2 !== 1) {
    line += " (x " + String(m2).replace(".", ",") + ")";
  }
  return line;
}

/**
 * Riga Sunday/Holiday completa — vuota se zero/null/N/A (paragrafo rimosso).
 * @param {object} ot
 * @returns {string}
 */
export function buildOvertimeHolidayRow(ot) {
  const rate = buildOvertimeHolidayRateOnly(ot);
  if (!rate) return "";
  return (
    "Hours worked on Sundays or public holidays shall be paid on the following Hourly Rate:\n" +
    rate
  );
}

/**
 * Solo la parte valore Working Hours (senza prefisso "Working hours:").
 * @param {object} rem
 * @returns {string}
 */
export function buildWorkingHoursValue(rem) {
  const r = rem || {};
  const hours = Number(r.workingHoursPerDay);
  const days = Number(r.workingDaysPerWeek);
  if (!Number.isFinite(hours) || hours <= 0) return "";
  let dayNames = "from Monday to Saturday";
  if (days === 5) dayNames = "from Monday to Friday";
  else if (days === 7) dayNames = "from Monday to Sunday";
  return hours + " hours/day " + dayNames + " (Daytime hours)";
}

/**
 * Testo Working Hours completo per {{WORKING_HOURS_TEXT}}.
 * @param {object} rem
 * @returns {string}
 */
export function buildWorkingHours(rem) {
  const value = buildWorkingHoursValue(rem);
  if (!value) return "";
  return "Working hours: " + value;
}

/**
 * Solo importo+tipo rate (dopo "Euro " se già nel template).
 * @param {object} rem
 * @returns {string}
 */
export function buildDailyRateValue(rem) {
  const r = rem || {};
  const resolved = resolveOfferRateByType(r);

  if (resolved.kind === "monthly") {
    const monthly = Number(
      resolved.amount != null
        ? resolved.amount
        : r.monthlyLumpSumRate != null
          ? r.monthlyLumpSumRate
          : r.selectedClientRate
    );
    if (!Number.isFinite(monthly) || monthly <= 0) return "";
    return formatEuroCeil(monthly) + "/month";
  }

  const daily = Number(
    r.offerDailyRate != null ? r.offerDailyRate : resolved.amount
  );
  if (!Number.isFinite(daily) || daily <= 0) return "";
  const rateType = rateTypeLabel(resolved.rateType || "calendar");
  let line = formatEuroCeil(daily) + " /" + rateType;
  if (rateType === "calendar day") {
    line += " (to be considered for 28, 30 or 31 days)";
  }
  return line;
}

/**
 * Testo rate completo per {{DAILY_RATE_TEXT}}.
 * Calendar/Working → Daily Rate at site; Lump Sum → Monthly Rate.
 * @param {object} rem
 * @returns {string}
 */
export function buildDailyRateLine(rem) {
  const r = rem || {};
  const resolved = resolveOfferRateByType(r);
  if (resolved.kind === "monthly") {
    const value = buildDailyRateValue(r);
    if (!value) return "";
    return "Monthly Rate: Euro " + value;
  }
  const value = buildDailyRateValue(r);
  if (!value) return "";
  return "Daily Rate at site: Euro " + value;
}

/**
 * Testo piano da XML Word (run spezzate unite).
 * @param {string} xml
 * @returns {string}
 */
export function wordXmlPlainText(xml) {
  return String(xml || "")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\u00a0/g, " ");
}

/**
 * Se il template ha già il prefisso statico nella stessa riga del placeholder,
 * usa solo il valore (evita "Working hours: Working hours: …").
 * @param {object} data
 * @param {string} templateXml
 * @returns {object}
 */
export function adaptTemplateDataToXml(data, templateXml) {
  const out = Object.assign({}, data || {});
  const xml = String(templateXml || "");
  const paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];

  function paraHas(key) {
    const token = "{{" + key + "}}";
    for (let i = 0; i < paras.length; i++) {
      const plain = wordXmlPlainText(paras[i]);
      if (plain.indexOf(token) >= 0) return plain;
    }
    // anche se spezzato: cerca lettere chiave nel plain del doc
    return null;
  }

  function staticBeforePlaceholder(plain, prefixRe) {
    if (!plain) return false;
    const without = plain.replace(/\{\{[A-Z0-9_]+\}\}/g, "");
    return prefixRe.test(without);
  }

  const whKeys = ["WORKING_HOURS_TEXT", "WORKING_HOURS", "WORKING_HOURS_VALUE"];
  const dailyKeys = ["DAILY_RATE_TEXT", "DAILY_RATE", "DAILY_RATE_VALUE"];

  const remLike = {
    offerDailyRate: null,
    workingHoursPerDay: 10,
    workingDaysPerWeek: 6
  };
  // ricostruisci value-only dai full text già in data
  const whFull = out.WORKING_HOURS_TEXT || out.WORKING_HOURS || "";
  const whValue = whFull.replace(/^Working hours:\s*/i, "").trim();
  const dailyFull = out.DAILY_RATE_TEXT || out.DAILY_RATE || "";
  const isMonthlyRate = /^Monthly Rate:/i.test(dailyFull);
  const dailyValue = isMonthlyRate
    ? dailyFull.replace(/^Monthly Rate:\s*Euro\s*/i, "").trim()
    : dailyFull.replace(/^Daily Rate at site:\s*Euro\s*/i, "").trim();

  whKeys.forEach(function (key) {
    const plain = paraHas(key);
    if (!plain) return;
    if (staticBeforePlaceholder(plain, /Working\s*hours\s*:/i) && whValue) {
      out[key] = whValue;
    }
  });
  // se template usa WORKING_HOURS_VALUE esplicitamente
  if (xml.indexOf("{{WORKING_HOURS_VALUE}}") >= 0) {
    out.WORKING_HOURS_VALUE = whValue;
  }

  dailyKeys.forEach(function (key) {
    const plain = paraHas(key);
    if (!plain) return;
    if (isMonthlyRate) {
      // Template ha ancora "Daily Rate at site: Euro …" → passa solo importo/month;
      // il post-process XML rinomina la label in Monthly Rate.
      if (
        staticBeforePlaceholder(plain, /Daily\s*Rate[^:\n]*:\s*Euro/i) &&
        dailyValue
      ) {
        out[key] = dailyValue;
      } else if (staticBeforePlaceholder(plain, /Daily\s*Rate[^:\n]*:\s*$/i)) {
        out[key] = "Euro " + dailyValue;
      } else if (
        staticBeforePlaceholder(plain, /Monthly\s*Rate[^:\n]*:\s*Euro/i) &&
        dailyValue
      ) {
        out[key] = dailyValue;
      } else {
        out[key] = dailyFull;
      }
      return;
    }
    if (
      staticBeforePlaceholder(plain, /Daily\s*Rate[^:\n]*:\s*Euro/i) &&
      dailyValue
    ) {
      out[key] = dailyValue;
    } else if (
      staticBeforePlaceholder(plain, /Daily\s*Rate[^:\n]*:\s*$/i) &&
      dailyFull
    ) {
      // "Daily Rate at site:" senza Euro → lascia full o "Euro " + value
      out[key] = dailyFull.replace(/^Daily Rate at site:\s*/i, "").trim();
    }
  });
  if (xml.indexOf("{{DAILY_RATE_VALUE}}") >= 0) {
    out.DAILY_RATE_VALUE = dailyValue;
  }
  if (xml.indexOf("{{DAILY_RATE_AMOUNT}}") >= 0) {
    const m = dailyValue.match(/^[\d.,]+/);
    out.DAILY_RATE_AMOUNT = m ? m[0] : "";
  }

  // START/END: se il template ha già "Within", passa solo mese/anno
  ["START_DATE", "END_DATE"].forEach(function (key) {
    const plain = paraHas(key);
    if (!plain) {
      // fallback: cerca "Within {{KEY}}" nel documento intero
      const docPlain = wordXmlPlainText(xml);
      if (
        new RegExp("Within\\s*\\{\\{" + key + "\\}\\}", "i").test(docPlain) ||
        new RegExp("Within\\s*$", "i").test(
          docPlain.split("{{" + key + "}}")[0] || ""
        )
      ) {
        out[key] = stripLeadingWithin(out[key]);
      }
      return;
    }
    if (staticBeforePlaceholder(plain, /\bWithin\b/i)) {
      out[key] = stripLeadingWithin(out[key]);
    }
  });

  // OFFER_DATE: se template ha "Milan,", non ripetere Milan nel valore
  const offerPlain = paraHas("OFFER_DATE");
  if (
    (offerPlain && staticBeforePlaceholder(offerPlain, /\bMilan\s*,/i)) ||
    /Milan\s*,\s*\{\{OFFER_DATE\}\}/i.test(wordXmlPlainText(xml))
  ) {
    out.OFFER_DATE = safeText(out.OFFER_DATE)
      .replace(/^Milan,\s*/i, "")
      .trim();
  }

  // OVERTIME: se il template ha già il testo standard (stessa riga o altro paragrafo),
  // passa solo la tariffa — evita "Overtime duplicato"
  const otPlain = paraHas("OVERTIME_STANDARD");
  const otFull = safeText(out.OVERTIME_STANDARD);
  const otRateMatch = otFull.match(/Euro\s+[\d.,]+\/hh(?:\s*\([^)]+\))?/i);
  const otRate = otRateMatch ? otRateMatch[0] : "";
  if (otFull) {
    const staticOt = (otPlain || "").replace(/\{\{OVERTIME_STANDARD\}\}/g, "");
    const docWithoutPh = wordXmlPlainText(xml).replace(
      /\{\{[A-Z0-9_]+\}\}/g,
      ""
    );
    if (
      /The work exceeding/i.test(staticOt) ||
      /The work exceeding/i.test(docWithoutPh)
    ) {
      out.OVERTIME_STANDARD =
        otRate || otFull.replace(/^Overtime:\s*/i, "").trim();
    } else if (/\bOvertime\s*:/i.test(staticOt)) {
      out.OVERTIME_STANDARD = otFull.replace(/^Overtime:\s*/i, "").trim();
    }
  }

  const holPlain =
    paraHas("OVERTIME_HOLIDAY_ROW") || paraHas("OVERTIME_HOLIDAY");
  const holFull = safeText(out.OVERTIME_HOLIDAY_ROW || out.OVERTIME_HOLIDAY);
  const holRateMatch = holFull.match(/Euro\s+[\d.,]+\/hh(?:\s*\([^)]+\))?/i);
  const holRate = holRateMatch ? holRateMatch[0] : "";
  if (holFull) {
    const staticHol = (holPlain || "")
      .replace(/\{\{OVERTIME_HOLIDAY_ROW\}\}/g, "")
      .replace(/\{\{OVERTIME_HOLIDAY\}\}/g, "");
    const docWithoutPh = wordXmlPlainText(xml).replace(
      /\{\{[A-Z0-9_]+\}\}/g,
      ""
    );
    if (
      /Hours worked on Sundays/i.test(staticHol) ||
      /Hours worked on Sundays/i.test(docWithoutPh)
    ) {
      out.OVERTIME_HOLIDAY_ROW = holRate;
      out.OVERTIME_HOLIDAY = holRate;
    }
  }

  void remLike;
  return out;
}

/**
 * Mappa centralizzata placeholder → valori per docxtemplater.
 * @param {object} state
 * @returns {object}
 */
export function buildTemplateData(state, draftState) {
  const s = state || {};
  // Normalizza rotation prima del mapping (stato offerta + eventuale draft)
  applyNormalizedRotation(s, draftState);
  migrateLegacyProposalNaming(s);

  const offer = { ...(s.offer || {}) };
  const service = s.service || {};
  const rem = s.remuneration || {};
  const ot = s.overtime || {};
  const logRows = buildLogisticsRows(s);
  const rotation = buildRotationOutput(s, draftState);
  const dates = s.dates || {};

  const dailyRateText = buildDailyRateLine(rem);
  const workingHoursText = buildWorkingHours(rem);
  const client = s.client || {};

  const data = {
    OFFER_DATE: formatLetterDate(offer.date),
    SUBJECT: safeText(offer.subject).trim() || "…",
    LOCATION:
      safeText(offer.location || service.activityLocation).trim() || "…",
    PROPOSAL_NUMBER: safeText(offer.proposalNumber).trim() || "…",
    POSITION: safeText(service.position).trim() || "…",
    CANDIDATE: safeText(service.assignedCandidate).trim() || "…",
    // Cliente: vuoto → lascia {{PLACEHOLDER}} visibile nel Word
    CLIENT_NAME: valueOrPlaceholder(client.name, "CLIENT_NAME"),
    CLIENT_ADDRESS_1: valueOrPlaceholder(client.address1, "CLIENT_ADDRESS_1"),
    CLIENT_ADDRESS_2: valueOrPlaceholder(client.address2, "CLIENT_ADDRESS_2"),
    ...resolveContactFields(client),
    DAILY_RATE_TEXT: dailyRateText,
    WORKING_HOURS_TEXT: workingHoursText,
    // alias legacy (template hotfix usa *_TEXT)
    DAILY_RATE: dailyRateText,
    WORKING_HOURS: workingHoursText,
    RATE_TYPE: rateTypeLabel(rem.rateType || "calendar"),
    OVERTIME_STANDARD: buildOvertimeStandard(ot),
    OVERTIME_HOLIDAY_ROW: buildOvertimeHolidayRow(ot),
    // Template B corporate usa OVERTIME_HOLIDAY (senza _ROW)
    OVERTIME_HOLIDAY: buildOvertimeHolidayRow(ot),
    POCKET_MONEY_ROW: logRows.pocket,
    ACCOMMODATION_ROW: logRows.accommodation,
    TRANSPORTATION_ROW: logRows.transportation,
    TRAVELLING_DAY_ROW: buildTravellingDayText(s.logistics),
    TICKET_FLIGHT_ROW: buildTicketFlightText(s.logistics),
    MOB_DEMOB_ROW: buildMobDemobText(s.logistics),
    OWN_CAR_ROW: buildOwnCarText(s.logistics),
    ROTATION_TITLE: rotation.title,
    ROTATION_TEXT: rotation.text,
    // Template B: placeholder giorni nella frase statica
    ROTATION_WORK_DAYS: rotation.workDays,
    ROTATION_REST_DAYS: rotation.restDays,
    START_DATE: formatOfferDateDisplay(
      dates.startDate,
      dates.startMode,
      dates.startManual
    ),
    END_DATE: formatOfferDateDisplay(
      dates.endDate,
      dates.endMode,
      dates.endManual
    )
  };

  assertNoBadPlaceholders(data);
  return data;
}

/**
 * @param {object} state
 * @returns {object}
 */
export function buildSummary(state) {
  const s = state || {};
  const rem = s.remuneration || {};
  const ot = s.overtime || {};
  const rot = s.rotation || {};
  const dates = s.dates || {};
  const daily = Number(rem.offerDailyRate);
  const pocket = Number(rem.dailyPocketMoney);
  const otMs = Number(ot.mondaySaturdayRate);
  const resolved = resolveOfferRateByType(rem);
  const rateSummary =
    resolved.kind === "monthly"
      ? Number.isFinite(Number(resolved.amount)) && Number(resolved.amount) > 0
        ? "Euro " + formatEuroCeil(resolved.amount) + "/month"
        : "—"
      : Number.isFinite(daily)
        ? "Euro " + formatEuroCeil(daily)
        : "—";
  return {
    subject: safeText(s.offer && s.offer.subject) || "—",
    location:
      safeText(
        (s.offer && s.offer.location) ||
          (s.service && s.service.activityLocation)
      ) || "—",
    position: safeText(s.service && s.service.position) || "—",
    candidate: safeText(s.service && s.service.assignedCandidate) || "—",
    dailyRate: rateSummary,
    pocketMoney:
      rem.pocketMode === "separate" && pocket > 0
        ? "Euro " + formatEuroCeil(pocket) + " /calendar day"
        : rem.pocketMode === "included"
          ? "Incluso nel daily rate"
          : rem.pocketMode === "na"
            ? "N/A"
            : "—",
    overtime: Number.isFinite(otMs) && otMs > 0
      ? "Euro " + formatEuroCeil(otMs) + "/hh"
      : ot.mode === "na"
        ? "N/A"
        : "—",
    accommodation: accommodationLabel(s.accommodation && s.accommodation.mode),
    transportation: transportationLabel(
      s.transportation && s.transportation.mode
    ),
    rotation:
      rot.mode === "defined"
        ? String(rot.workDays || "") + "/" + String(rot.restDays || "")
        : rot.mode === "na"
          ? "N/A"
          : rot.mode === "tbd"
            ? "TBD"
            : rot.mode || "—",
    start:
      formatOfferDateDisplay(
        dates.startDate,
        dates.startMode,
        dates.startManual
      ) || "—",
    end:
      formatOfferDateDisplay(dates.endDate, dates.endMode, dates.endManual) ||
      "—"
  };
}

/**
 * Validazione pre-download (blocca se Daily Rate / Working Hours mancanti).
 * @param {object} state
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateOfferForWord(state) {
  const errors = [];
  const s = state || {};
  const offer = s.offer || {};
  const service = s.service || {};
  const rem = s.remuneration || {};
  const ot = s.overtime || {};
  const rot = s.rotation || {};
  const dates = s.dates || {};

  if (!safeText(offer.subject).trim()) errors.push("Subject obbligatorio");
  if (!safeText(offer.location || service.activityLocation).trim()) {
    errors.push("Location obbligatoria");
  }
  if (!safeText(offer.proposalNumber).trim()) {
    errors.push("Proposal Number obbligatorio");
  }
  if (!safeText(service.position).trim()) errors.push("Mansione obbligatoria");
  if (!safeText(service.assignedCandidate).trim()) {
    errors.push("Candidato obbligatorio");
  }

  const daily = Number(rem.offerDailyRate);
  const resolved = resolveOfferRateByType(rem);
  if (resolved.kind === "monthly") {
    const monthly = Number(
      resolved.amount != null
        ? resolved.amount
        : rem.monthlyLumpSumRate != null
          ? rem.monthlyLumpSumRate
          : rem.selectedClientRate
    );
    if (!Number.isFinite(monthly) || monthly <= 0) {
      errors.push(
        "Monthly Rate non disponibile. Verificare i dati della remunerazione."
      );
    }
  } else if (!Number.isFinite(daily) || daily <= 0) {
    errors.push(
      "Daily Rate non disponibile. Verificare i dati della remunerazione."
    );
  }

  const hours = Number(rem.workingHoursPerDay);
  const days = Number(rem.workingDaysPerWeek);
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(days) || days <= 0) {
    errors.push(
      "Working Hours non disponibili. Verificare ore giornaliere e giorni settimanali."
    );
  }

  if (ot.mode !== "na" && ot.mode !== "custom") {
    const ms = Number(ot.mondaySaturdayRate);
    if (!Number.isFinite(ms) || ms <= 0) {
      errors.push("Overtime non valido (impostare rate o N/A)");
    }
  }

  {
    const normalized = normalizeRotationData(s, null);
    const rotMode = String(normalized.mode || "defined").toLowerCase();
    if (rotMode === "hide") {
      /* sezione omessa */
    } else {
      const out = buildRotationOutput(normalized);
      if (!safeText(out.title).trim() || !safeText(out.text).trim()) {
        errors.push(
          "Rotation incompleta. Verificare i giorni di attività e riposo."
        );
      } else if (rotMode === "defined" || rotMode === "free") {
        if (
          parsePositiveInt(normalized.workDays) == null ||
          parsePositiveInt(normalized.restDays) == null
        ) {
          errors.push(
            "Rotation incompleta. Verificare i giorni di attività e riposo."
          );
        }
      }
    }
  }

  if (dates.startMode === "within" || dates.startMode === "full" || dates.startMode === "month_year") {
    if (!safeText(dates.startDate).trim() && !safeText(dates.startManual).trim()) {
      errors.push("Data inizio mancante");
    }
  }
  if (dates.endMode === "within" || dates.endMode === "full" || dates.endMode === "month_year") {
    if (!safeText(dates.endDate).trim() && !safeText(dates.endManual).trim()) {
      errors.push("Data fine mancante");
    }
  }

  // coerenza testo placeholder
  if (resolved.kind === "monthly") {
    if (
      Number.isFinite(Number(resolved.amount)) &&
      Number(resolved.amount) > 0 &&
      !buildDailyRateLine(rem)
    ) {
      errors.push(
        "Monthly Rate non disponibile. Verificare i dati della remunerazione."
      );
    }
  } else if (Number.isFinite(daily) && daily > 0 && !buildDailyRateLine(rem)) {
    errors.push(
      "Daily Rate non disponibile. Verificare i dati della remunerazione."
    );
  }
  if (
    Number.isFinite(hours) &&
    hours > 0 &&
    Number.isFinite(days) &&
    days > 0 &&
    !buildWorkingHours(rem)
  ) {
    errors.push(
      "Working Hours non disponibili. Verificare ore giornaliere e giorni settimanali."
    );
  }

  return { ok: errors.length === 0, errors: errors };
}

function assertNoBadPlaceholders(node, path) {
  const p = path || "root";
  if (node === undefined || node === null) {
    throw new Error("placeholder invalido in " + p);
  }
  if (typeof node === "number" && !Number.isFinite(node)) {
    throw new Error("NaN in " + p);
  }
  if (typeof node === "string") {
    // I placeholder cliente intenzionali {{CLIENT_*}} sono ammessi
    const withoutPreserved = node.replace(
      /\{\{(CLIENT_NAME|CLIENT_ADDRESS_1|CLIENT_ADDRESS_2|CONTACT_TITLE|CONTACT_NAME|CONTACT_SURNAME)\}\}/g,
      ""
    );
    if (
      withoutPreserved.includes("undefined") ||
      /\bnull\b/.test(withoutPreserved) ||
      /\bNaN\b/.test(withoutPreserved)
    ) {
      throw new Error("placeholder testuale invalido in " + p + ": " + node);
    }
    return;
  }
  if (typeof node === "object") {
    Object.keys(node).forEach(function (k) {
      assertNoBadPlaceholders(node[k], p + "." + k);
    });
  }
}

/** Alias legacy per test */
export const buildRemunerationLines = function (rem) {
  const line = buildDailyRateLine(rem);
  const hours = buildWorkingHours(rem);
  return [line, hours].filter(Boolean);
};

export const buildPocketMoneyLine = buildPocketRow;
export const buildAccommodationTransportLines = function (acc, tr, logistics) {
  const rows = buildLogisticsRows({
    accommodation: acc,
    transportation: tr,
    logistics: logistics || {},
    remuneration: { pocketMode: "na" }
  });
  return [rows.accommodation, rows.transportation].filter(Boolean);
};
export const buildOvertimeLines = function (ot) {
  return [buildOvertimeStandard(ot), buildOvertimeHolidayRow(ot)].filter(
    Boolean
  );
};
export const buildDocumentModel = function (state) {
  return buildTemplateData(state);
};
export const buildCommencementLines = function (dates) {
  return {
    startLine:
      "Our services are expected to start in: " +
      formatOfferDateDisplay(
        dates.startDate,
        dates.startMode,
        dates.startManual
      ),
    endLine:
      "Our services are expected to be concluded in: " +
      formatOfferDateDisplay(dates.endDate, dates.endMode, dates.endManual)
  };
};
export const buildMealsLine = function () {
  return "";
};
