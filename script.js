/* =============================================================================
   CALCOLO COSTO PERSONALE — Logica applicativa
   -----------------------------------------------------------------------------
   Applicazione vanilla JS (nessun framework, nessun database, nessun Node.js).
   Funziona aprendo index.html oppure pubblicando su GitHub Pages.
   ============================================================================= */

"use strict";

/* =============================================================================
   1. COSTANTI DI DEFAULT (modificabili dall'utente via form)
   ============================================================================= */

/** Valori predefiniti condivisi / per modalità */
const DEFAULTS = Object.freeze({
  marginePerc: 30,
  costiStruttura: 1500,
  moltiplicatore: 2.6,
  trasfertaItalia: 1394.4,
  trasfertaEuropa: 2324.1,
  quotaBase: 2000,
  pocketMoney: 0,
  rimborsoAffitto: 0,
  rimborsoAuto: 0,
  netto: ""
});

/** Giorni lavorativi / mese usati per il prezzo giornaliero */
const GIORNI_PREZZO = Object.freeze({
  d26: 26,
  d30: 30,
  d217: 21.7
});

/** Etichette leggibili delle modalità contratto */
const MODE_LABELS = Object.freeze({
  italia: "Italia",
  europa: "Europa",
  "europa-base": "Estero"
});

/* =============================================================================
   2. STATO APPLICAZIONE — AppState centralizzato (punto unico dati)
   -----------------------------------------------------------------------------
   Compatibilità REV01: lastResult / currentCalculation / lastOvertime restano
   disponibili e sono sempre allineati ad AppState tramite i setter dedicati.
   Le formule di calcolo NON dipendono da AppState.
   ============================================================================= */

/**
 * Store globale dell'applicazione.
 * Futuri moduli (Draft, Offerte, Archivio, Storico) devono leggere/scrivere qui.
 *
 * calculation / overtime: null quando assenti (falsy, come REV01).
 * draft: struttura modulo Draft Tecnico (FASE A — solo UI + stato).
 */
const AppState = {
  meta: {
    versione: "REV01_STABLE",
    dataCreazione: null
  },
  calculation: null,
  overtime: null,
  draft: {
    project: {},
    workSchedule: {},
    rotation: {},
    overtime: {},
    accommodation: {},
    localTransport: {},
    mobDemob: {},
    travelDays: {},
    contract: {},
    remuneration: {}
  },
  // REV03 FASE B2 — ramo indipendente (non tocca calculation / overtime / draft)
  // API key NON è in AppState (solo localStorage / backend)
  cvManager: {
    template: null,
    uploadedFile: null,
    extractedText: "",
    detectedLanguage: "unknown",
    outputLanguage: "same",
    model: "gpt-5.5",
    analysisStatus: "idle",
    analysis: null,
    validationErrors: [],
    lastError: null,
    generationStatus: "idle",
    generatedDocument: null,
    generatedFileName: ""
  },
  // Modulo locale Offerta Cliente (indipendente — non tocca calculation/overtime/draft/cvManager)
  clientOffer: null
};

/** Espone AppState globalmente per debug e futuri moduli */
if (typeof window !== "undefined") {
  window.AppState = AppState;
}

/** Modalità corrente: "italia" | "europa" | "europa-base" */
let currentMode = "italia";

/**
 * Alias REV01 → AppState.calculation.fullResult (stesso riferimento dopo setAppCalculation).
 * Mantenuto per compatibilità Word / UI costo.
 */
let lastResult = null;

/**
 * Alias REV01 → AppState.calculation
 * Snapshot normalizzato usato da Overtime (e futuri moduli).
 */
let currentCalculation = null;

/**
 * Alias REV01 → AppState.overtime
 */
let lastOvertime = null;

/** Vista SPA attiva: "costo" | "overtime" | "draft" | "cvManager" | "clientOffer" */
let currentView = "costo";

/**
 * Scrive il risultato costo in AppState.calculation e aggiorna gli alias REV01.
 * lastResult e currentCalculation puntano ai dati contenuti in AppState.calculation.
 *
 * @param {object|null} result - output di calcolaPerModalita, oppure null per reset
 */
function setAppCalculation(result) {
  if (!result) {
    lastResult = null;
    currentCalculation = null;
    AppState.calculation = null;
    return;
  }

  lastResult = result;
  // Costruisce lo snapshot normalizzato e lo assegna ad AppState.calculation
  syncCurrentCalculation(result);
}

/**
 * Scrive il risultato overtime in AppState.overtime e aggiorna lastOvertime.
 * @param {object|null} ot
 */
function setAppOvertime(ot) {
  lastOvertime = ot || null;
  AppState.overtime = ot || null;
}

/**
 * Reset completo di calculation + overtime in AppState (draft intatto).
 */
function clearAppCalculationAndOvertime() {
  setAppCalculation(null);
  setAppOvertime(null);
}

/** Default overtime (solo valori orari — nessuna ore straordinarie) */
const OVERTIME_DEFAULTS = Object.freeze({
  oreLavorative: 10,
  metodo: "working",
  maggiorazione: 1,
  giorniCalendar: 30
});

/**
 * Regola commerciale: pocket money sempre calendar.
 * Mai dividere per workingDays / 26.
 */
var POCKET_MONEY_CALENDAR_DAYS = 30;

/** Working days di riferimento per conversione Calendar → Working (OT cliente). */
var CLIENT_OVERTIME_WORKING_DAYS = 26;

/** Etichette maggiorazione */
const MAGG_LABELS = Object.freeze({
  "1": "Base (×1)",
  "1.15": "+15% (×1,15)",
  "1.25": "+25% (×1,25)",
  "1.5": "+50% (×1,50)",
  "1.50": "+50% (×1,50)"
});

/** Etichette metodo Working / Calendar */
const METODO_LABELS = Object.freeze({
  working: "Working days",
  calendar: "Calendar days"
});

/* =============================================================================
   3. UTILITÀ — FORMATO, LETTURA INPUT, DOM
   ============================================================================= */

/**
 * Formatta un numero come valuta italiana: 12.345,67 €
 * @param {number} value
 * @returns {string}
 */
function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return (
    n.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " €"
  );
}

/**
 * Formatta una percentuale in stile italiano (es. 30,00 %)
 * @param {number} value
 * @returns {string}
 */
function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return (
    n.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " %"
  );
}

/**
 * Legge un input numerico dal DOM. Restituisce 0 se vuoto/non valido.
 * @param {string} id - id dell'elemento input
 * @returns {number}
 */
function readNumber(id) {
  const el = document.getElementById(id);
  if (!el) {
    return 0;
  }
  const raw = String(el.value).trim().replace(",", ".");
  if (raw === "") {
    return 0;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Imposta il valore di un input (stringa o numero)
 * @param {string} id
 * @param {string|number} value
 */
function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.value = value === "" || value === null || value === undefined ? "" : value;
  }
}

/**
 * Mostra/nasconde un elemento tramite attributo hidden
 * @param {string} id
 * @param {boolean} visible
 */
function setVisible(id, visible) {
  const el = document.getElementById(id);
  if (!el) {
    return;
  }
  if (visible) {
    el.removeAttribute("hidden");
  } else {
    el.setAttribute("hidden", "");
  }
}

/**
 * Data odierna in formato italiano lungo
 * @returns {string}
 */
function getItalianDate() {
  return new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

/**
 * Data corta per nome file (YYYY-MM-DD)
 * @returns {string}
 */
function getFileDateStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* =============================================================================
   4. FUNZIONI DI CALCOLO DEDICATE (una per tipo + helper condivisi)
   ============================================================================= */

/**
 * Calcola margine, prezzo vendita e prezzi giornalieri a partire dal totale costo.
 * Funzione condivisa da tutte le modalità — evita duplicazione.
 *
 * @param {number} totaleCosto
 * @param {number} marginePerc - percentuale (es. 30 = 30%)
 * @returns {{ margine: number, prezzoFinale: number, prezzoGiorno26: number, prezzoGiorno30: number, prezzoGiorno217: number }}
 */
function calcolaMargineEPrezzi(totaleCosto, marginePerc) {
  const margine = totaleCosto * (marginePerc / 100);
  const prezzoFinale = totaleCosto + margine;

  return {
    margine,
    prezzoFinale,
    prezzoGiorno26: prezzoFinale / GIORNI_PREZZO.d26,
    prezzoGiorno30: prezzoFinale / GIORNI_PREZZO.d30,
    prezzoGiorno217: prezzoFinale / GIORNI_PREZZO.d217
  };
}

/**
 * CASO 1 — ITALIA
 * Parte tassata = Netto − Trasferta Italia
 * Costo lavoro  = Parte tassata × Moltiplicatore
 * Totale costo  = Costo lavoro + Trasferta + Pocket + Affitto + Auto + Struttura
 * Pocket/Affitto/Auto/Trasferta sono ESENTASSE (non moltiplicati).
 *
 * @param {object} input
 * @returns {object} risultato strutturato
 */
function calcolaItalia(input) {
  const {
    netto,
    pocketMoney,
    rimborsoAffitto,
    rimborsoAuto,
    marginePerc,
    costiStruttura,
    moltiplicatore,
    trasferta
  } = input;

  // 1) Parte tassata
  const parteTassata = netto - trasferta;

  // 2) Costo lavoro (solo la parte tassata viene moltiplicata)
  const costoLavoro = parteTassata * moltiplicatore;

  // 3) Totale costo (indennità esentasse sommate in coda)
  const totaleCosto =
    costoLavoro +
    trasferta +
    pocketMoney +
    rimborsoAffitto +
    rimborsoAuto +
    costiStruttura;

  // 4) + 5) Margine e prezzo vendita + prezzi giornalieri
  const prezzi = calcolaMargineEPrezzi(totaleCosto, marginePerc);

  return buildResult({
    mode: "italia",
    netto,
    parteTassata,
    trasferta,
    pocketMoney,
    rimborsoAffitto,
    rimborsoAuto,
    costiStruttura,
    moltiplicatore,
    marginePerc,
    costoLavoro,
    totaleCosto,
    quotaBase: null,
    differenza: null,
    ...prezzi,
    steps: buildStepsItalia({
      netto,
      trasferta,
      parteTassata,
      moltiplicatore,
      costoLavoro,
      pocketMoney,
      rimborsoAffitto,
      rimborsoAuto,
      costiStruttura,
      totaleCosto,
      marginePerc,
      margine: prezzi.margine,
      prezzoFinale: prezzi.prezzoFinale
    })
  });
}

/**
 * CASO 2 — EUROPA
 * Identico all'Italia, con Trasferta Europa di default diversa.
 * La logica è la stessa: riusiamo calcolaItalia per non duplicare codice.
 *
 * @param {object} input
 * @returns {object}
 */
function calcolaEuropa(input) {
  const result = calcolaItalia(input);
  result.mode = "europa";
  // modeLabel resterebbe "Italia" da calcolaItalia — allinea etichetta alla modalità reale
  result.modeLabel = MODE_LABELS.europa;
  // Rigenera i passaggi con etichetta Europa
  result.steps = buildStepsItalia({
    netto: result.netto,
    trasferta: result.trasferta,
    parteTassata: result.parteTassata,
    moltiplicatore: result.moltiplicatore,
    costoLavoro: result.costoLavoro,
    pocketMoney: result.pocketMoney,
    rimborsoAffitto: result.rimborsoAffitto,
    rimborsoAuto: result.rimborsoAuto,
    costiStruttura: result.costiStruttura,
    totaleCosto: result.totaleCosto,
    marginePerc: result.marginePerc,
    margine: result.margine,
    prezzoFinale: result.prezzoFinale,
    labelTrasferta: "Trasferta Europa"
  });
  return result;
}

/**
 * CASO 3 — EUROPA BASE ASSUNZIONE
 * Differenza (esentasse) = Netto − Quota Base
 * Costo lavoro           = Quota Base × Moltiplicatore
 * Totale costo           = Costo lavoro + Differenza + Pocket + Affitto + Auto + Struttura
 * Solo la quota base viene moltiplicata.
 *
 * @param {object} input
 * @returns {object}
 */
function calcolaEuropaBaseAssunzione(input) {
  const {
    netto,
    quotaBase,
    pocketMoney,
    rimborsoAffitto,
    rimborsoAuto,
    marginePerc,
    costiStruttura,
    moltiplicatore
  } = input;

  // Differenza completamente esentasse
  const differenza = netto - quotaBase;

  // Parte tassata = quota base (unica voce da moltiplicare)
  const parteTassata = quotaBase;

  // Costo lavoro
  const costoLavoro = quotaBase * moltiplicatore;

  // Totale costo (nessuna trasferta in questa modalità)
  const trasferta = 0;
  const totaleCosto =
    costoLavoro +
    differenza +
    pocketMoney +
    rimborsoAffitto +
    rimborsoAuto +
    costiStruttura;

  const prezzi = calcolaMargineEPrezzi(totaleCosto, marginePerc);

  return buildResult({
    mode: "europa-base",
    netto,
    parteTassata,
    trasferta,
    pocketMoney,
    rimborsoAffitto,
    rimborsoAuto,
    costiStruttura,
    moltiplicatore,
    marginePerc,
    costoLavoro,
    totaleCosto,
    quotaBase,
    differenza,
    ...prezzi,
    steps: buildStepsEuropaBase({
      netto,
      quotaBase,
      differenza,
      moltiplicatore,
      costoLavoro,
      pocketMoney,
      rimborsoAffitto,
      rimborsoAuto,
      costiStruttura,
      totaleCosto,
      marginePerc,
      margine: prezzi.margine,
      prezzoFinale: prezzi.prezzoFinale
    })
  });
}

/**
 * Dispatcher: sceglie la funzione di calcolo in base alla modalità.
 * @param {string} mode
 * @param {object} input
 * @returns {object}
 */
function calcolaPerModalita(mode, input) {
  switch (mode) {
    case "italia":
      return calcolaItalia(input);
    case "europa":
      return calcolaEuropa(input);
    case "europa-base":
      return calcolaEuropaBaseAssunzione(input);
    default:
      throw new Error("Modalità di contratto non riconosciuta: " + mode);
  }
}

/**
 * Normalizza l'oggetto risultato (struttura unica per UI + Word)
 * @param {object} data
 * @returns {object}
 */
function buildResult(data) {
  return {
    mode: data.mode,
    modeLabel: MODE_LABELS[data.mode] || data.mode,
    netto: data.netto,
    parteTassata: data.parteTassata,
    trasferta: data.trasferta,
    pocketMoney: data.pocketMoney,
    rimborsoAffitto: data.rimborsoAffitto,
    rimborsoAuto: data.rimborsoAuto,
    costiStruttura: data.costiStruttura,
    moltiplicatore: data.moltiplicatore,
    marginePerc: data.marginePerc,
    costoLavoro: data.costoLavoro,
    totaleCosto: data.totaleCosto,
    margine: data.margine,
    prezzoFinale: data.prezzoFinale,
    prezzoGiorno26: data.prezzoGiorno26,
    prezzoGiorno30: data.prezzoGiorno30,
    prezzoGiorno217: data.prezzoGiorno217,
    quotaBase: data.quotaBase,
    differenza: data.differenza,
    steps: data.steps || []
  };
}

/* =============================================================================
   5. TESTI DEI PASSAGGI MATEMATICI
   ============================================================================= */

/**
 * Genera l'elenco testuale dei passaggi per Italia / Europa
 */
function buildStepsItalia(p) {
  const labelTrasferta = p.labelTrasferta || "Trasferta";
  return [
    `Parte tassata = Netto − ${labelTrasferta} = ${formatCurrency(p.netto)} − ${formatCurrency(p.trasferta)} = ${formatCurrency(p.parteTassata)}`,
    `Costo lavoro = Parte tassata × Moltiplicatore = ${formatCurrency(p.parteTassata)} × ${p.moltiplicatore} = ${formatCurrency(p.costoLavoro)}`,
    `Totale costo = Costo lavoro + ${labelTrasferta} + Pocket Money + Affitto + Auto + Costi struttura = ${formatCurrency(p.costoLavoro)} + ${formatCurrency(p.trasferta)} + ${formatCurrency(p.pocketMoney)} + ${formatCurrency(p.rimborsoAffitto)} + ${formatCurrency(p.rimborsoAuto)} + ${formatCurrency(p.costiStruttura)} = ${formatCurrency(p.totaleCosto)}`,
    `Nota: Pocket Money, Affitto, Auto e Trasferta sono esentasse e NON vengono moltiplicati.`,
    `Margine = Totale costo × Margine % = ${formatCurrency(p.totaleCosto)} × ${formatPercent(p.marginePerc)} = ${formatCurrency(p.margine)}`,
    `Prezzo vendita = Totale costo + Margine = ${formatCurrency(p.totaleCosto)} + ${formatCurrency(p.margine)} = ${formatCurrency(p.prezzoFinale)}`,
    `Prezzo giornaliero (26) = ${formatCurrency(p.prezzoFinale)} ÷ 26`,
    `Prezzo giornaliero (30) = ${formatCurrency(p.prezzoFinale)} ÷ 30`,
    `Prezzo giornaliero (21,7) = ${formatCurrency(p.prezzoFinale)} ÷ 21,7`
  ];
}

/**
 * Genera l'elenco testuale dei passaggi per Europa Base Assunzione
 */
function buildStepsEuropaBase(p) {
  return [
    `Differenza (esentasse) = Netto − Quota Base Assunzione = ${formatCurrency(p.netto)} − ${formatCurrency(p.quotaBase)} = ${formatCurrency(p.differenza)}`,
    `Parte tassata = Quota Base Assunzione = ${formatCurrency(p.quotaBase)}`,
    `Costo lavoro = Quota Base × Moltiplicatore = ${formatCurrency(p.quotaBase)} × ${p.moltiplicatore} = ${formatCurrency(p.costoLavoro)}`,
    `Totale costo = Costo lavoro + Differenza + Pocket Money + Affitto + Auto + Costi struttura = ${formatCurrency(p.costoLavoro)} + ${formatCurrency(p.differenza)} + ${formatCurrency(p.pocketMoney)} + ${formatCurrency(p.rimborsoAffitto)} + ${formatCurrency(p.rimborsoAuto)} + ${formatCurrency(p.costiStruttura)} = ${formatCurrency(p.totaleCosto)}`,
    `Nota: la Differenza è completamente esentasse. Solo la Quota Base viene moltiplicata.`,
    `Margine = Totale costo × Margine % = ${formatCurrency(p.totaleCosto)} × ${formatPercent(p.marginePerc)} = ${formatCurrency(p.margine)}`,
    `Prezzo vendita = Totale costo + Margine = ${formatCurrency(p.totaleCosto)} + ${formatCurrency(p.margine)} = ${formatCurrency(p.prezzoFinale)}`,
    `Prezzo giornaliero (26) = ${formatCurrency(p.prezzoFinale)} ÷ 26`,
    `Prezzo giornaliero (30) = ${formatCurrency(p.prezzoFinale)} ÷ 30`,
    `Prezzo giornaliero (21,7) = ${formatCurrency(p.prezzoFinale)} ÷ 21,7`
  ];
}

/* =============================================================================
   6. LETTURA INPUT DAL FORM
   ============================================================================= */

/**
 * Prepara l'input per le formule REV01 senza modificarle.
 * Pocket Money è imponibile: netto_calc = netto + pocket, pocket_calc = 0.
 * In modalità Estero (europa-base) il pocket entra nella quota base (tassata).
 * @param {object} formInput - valori grezzi dal form
 * @param {string} mode
 * @returns {object}
 */
function buildCalcInputFromForm(formInput, mode) {
  const pocket = Number(formInput.pocketMoney) || 0;
  const nettoBase = Number(formInput.netto) || 0;
  const input = Object.assign({}, formInput, {
    netto: nettoBase + pocket,
    pocketMoney: 0,
    // metadati per UI / Draft (le formule li ignorano)
    nettoMensile: nettoBase,
    pocketMoneyOriginale: pocket
  });

  if (mode === "europa-base" && pocket > 0) {
    // Tiene invariata la differenza (netto−quota) e tassa il pocket via quota base
    input.quotaBase = (Number(formInput.quotaBase) || 0) + pocket;
  }

  return input;
}

/**
 * Raccoglie tutti i valori dal form in un oggetto input tipizzato.
 * @returns {object}
 */
function collectInputFromForm() {
  return {
    netto: readNumber("netto"),
    pocketMoney: readNumber("pocketMoney"),
    rimborsoAffitto: readNumber("rimborsoAffitto"),
    rimborsoAuto: readNumber("rimborsoAuto"),
    marginePerc: readNumber("marginePerc"),
    costiStruttura: readNumber("costiStruttura"),
    moltiplicatore: readNumber("moltiplicatore"),
    trasferta: readNumber("trasferta"),
    quotaBase: readNumber("quotaBase")
  };
}

/**
 * Validazione minima prima del calcolo
 * @param {object} input
 * @returns {{ ok: boolean, message?: string }}
 */
function validateInput(input) {
  if (!(input.netto > 0)) {
    return { ok: false, message: "Inserire un Netto mensile maggiore di zero." };
  }
  if (!(input.moltiplicatore > 0)) {
    return { ok: false, message: "Il moltiplicatore deve essere maggiore di zero." };
  }
  if (input.marginePerc < 0) {
    return { ok: false, message: "Il margine non può essere negativo." };
  }
  if (currentMode === "europa-base" && input.quotaBase < 0) {
    return { ok: false, message: "La Quota Base Assunzione non può essere negativa." };
  }
  return { ok: true };
}

/* =============================================================================
   7. RENDER UI — TABELLA, KPI, PASSAGGI
   ============================================================================= */

/**
 * Costruisce le righe della tabella riepilogativa a partire dal risultato.
 * @param {object} result
 * @returns {Array<{ label: string, value: string, rowClass?: string }>}
 */
function buildTableRows(result) {
  const rows = [];

  // Ordine richiesto dal capitolato (sempre presente)
  // Mostra il netto mensile di input (il pocket è voce separata, già incluso nel calcolo)
  rows.push({
    label: "Netto",
    value: formatCurrency(
      result.nettoMensile != null ? result.nettoMensile : result.netto
    )
  });

  // Campi aggiuntivi solo per Europa Base Assunzione (chiarezza del calcolo)
  if (result.mode === "europa-base") {
    rows.push({
      label: "Quota Base Assunzione",
      value: formatCurrency(
        result.quotaBaseOriginale != null
          ? result.quotaBaseOriginale
          : result.quotaBase
      )
    });
    rows.push({
      label: "Differenza (esentasse)",
      value: formatCurrency(result.differenza)
    });
  }

  rows.push({
    label:
      result.mode === "europa-base"
        ? "Parte tassata (Quota Base)"
        : "Parte tassata",
    value: formatCurrency(result.parteTassata)
  });

  rows.push({
    label:
      result.mode === "europa"
        ? "Trasferta Europa"
        : result.mode === "italia"
          ? "Trasferta Italia"
          : "Trasferta",
    value: formatCurrency(result.trasferta)
  });

  rows.push({ label: "Pocket Money", value: formatCurrency(result.pocketMoney) });
  rows.push({ label: "Affitto", value: formatCurrency(result.rimborsoAffitto) });
  rows.push({ label: "Auto", value: formatCurrency(result.rimborsoAuto) });
  rows.push({ label: "Costi struttura", value: formatCurrency(result.costiStruttura) });
  rows.push({ label: "Costo lavoro", value: formatCurrency(result.costoLavoro) });
  rows.push({ label: "Totale costo", value: formatCurrency(result.totaleCosto) });
  rows.push({
    label: "Margine (" + formatPercent(result.marginePerc) + ")",
    value: formatCurrency(result.margine),
    rowClass: "row-margin"
  });
  rows.push({
    label: "Prezzo finale",
    value: formatCurrency(result.prezzoFinale),
    rowClass: "row-final"
  });
  rows.push({
    label: "Prezzo al giorno (26)",
    value: formatCurrency(result.prezzoGiorno26)
  });
  rows.push({
    label: "Prezzo al giorno (30)",
    value: formatCurrency(result.prezzoGiorno30)
  });
  rows.push({
    label: "Prezzo al giorno (21,7)",
    value: formatCurrency(result.prezzoGiorno217)
  });

  return rows;
}

/**
 * Aggiorna la tabella HTML e i KPI a schermo.
 * @param {object} result
 */
function renderResults(result) {
  const corpo = document.getElementById("corpoTabella");
  const listaPassaggi = document.getElementById("listaPassaggi");

  // Tabella
  const rows = buildTableRows(result);
  corpo.innerHTML = rows
    .map(function (row) {
      const cls = row.rowClass ? ' class="' + row.rowClass + '"' : "";
      return (
        "<tr" +
        cls +
        "><td>" +
        escapeHtml(row.label) +
        '</td><td class="amount">' +
        escapeHtml(row.value) +
        "</td></tr>"
      );
    })
    .join("");

  // KPI in evidenza
  document.getElementById("kpiTotaleCosto").textContent = formatCurrency(
    result.totaleCosto
  );
  document.getElementById("kpiMargine").textContent = formatCurrency(result.margine);
  document.getElementById("kpiPrezzoFinale").textContent = formatCurrency(
    result.prezzoFinale
  );

  // Passaggi
  listaPassaggi.innerHTML = result.steps
    .map(function (step) {
      return "<li>" + escapeHtml(step) + "</li>";
    })
    .join("");

  // Visibilità pannelli
  setVisible("statoVuoto", false);
  setVisible("contenitoreRisultati", true);

  document.getElementById("sottotitoloRisultati").textContent =
    "Contratto: " + result.modeLabel + " — " + getItalianDate();

  // Abilita export Word
  document.getElementById("btnEsportaWord").disabled = false;
}

/**
 * Escape HTML per evitare injection accidentale nei testi inseriti
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* =============================================================================
   8. GESTIONE MODALITÀ CONTRATTO (UI)
   ============================================================================= */

/**
 * Applica la modalità selezionata: aggiorna pulsanti, label, default trasferta/quota.
 * @param {string} mode
 * @param {object} [options]
 * @param {boolean} [options.resetDefaults=true] - se true, ripristina trasferta/quota di default
 */
function applyMode(mode, options) {
  const opts = options || {};
  const resetDefaults = opts.resetDefaults !== false;

  currentMode = mode;

  // Stato attivo dei pulsanti
  document.querySelectorAll(".contract-btn").forEach(function (btn) {
    const isActive = btn.getAttribute("data-mode") === mode;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  const isBase = mode === "europa-base";

  // Label netto
  document.getElementById("labelNetto").textContent = isBase
    ? "Netto desiderato"
    : "Netto mensile";

  // Quota base solo in europa-base
  setVisible("fieldQuotaBase", isBase);

  // Trasferta solo in italia/europa
  setVisible("fieldTrasferta", !isBase);

  if (!isBase) {
    const isEuropa = mode === "europa";
    document.getElementById("labelTrasferta").textContent = isEuropa
      ? "Trasferta Europa"
      : "Trasferta Italia";

    if (resetDefaults) {
      setInputValue(
        "trasferta",
        isEuropa ? DEFAULTS.trasfertaEuropa : DEFAULTS.trasfertaItalia
      );
    }
  } else if (resetDefaults) {
    setInputValue("quotaBase", DEFAULTS.quotaBase);
  }

  // Reset risultati quando si cambia modalità (evita confusione)
  clearResultsView();
}

/**
 * Nasconde i risultati e disabilita export
 */
function clearResultsView() {
  clearAppCalculationAndOvertime();
  setVisible("statoVuoto", true);
  setVisible("contenitoreRisultati", false);
  document.getElementById("sottotitoloRisultati").textContent =
    "Compila i parametri e premi Calcola.";
  document.getElementById("btnEsportaWord").disabled = true;
  const btnOt = document.getElementById("btnEsportaWordOt");
  if (btnOt) {
    btnOt.disabled = true;
  }
  document.getElementById("corpoTabella").innerHTML = "";
  document.getElementById("listaPassaggi").innerHTML = "";
  clearOvertimeResultsView();
  refreshOvertimeImportedPanel();
  refreshDraftBindings();
}

/* =============================================================================
   9. AZIONI — CALCOLA / RESET
   ============================================================================= */

/**
 * Esegue il calcolo completo e aggiorna la UI
 * @param {Event} [event]
 */
function handleCalcola(event) {
  if (event) {
    event.preventDefault();
  }

  const formInput = collectInputFromForm();
  const validation = validateInput(formInput);

  if (!validation.ok) {
    window.alert(validation.message);
    document.getElementById("netto").focus();
    return;
  }

  try {
    // Adapter: pocket imponibile senza alterare le formule REV01
    const calcInput = buildCalcInputFromForm(formInput, currentMode);
    const result = calcolaPerModalita(currentMode, calcInput);
    // Ripristina pocket e netto mensile per UI / Draft / Word
    result.pocketMoney = formInput.pocketMoney;
    result.nettoMensile = formInput.netto;
    result.quotaBaseOriginale = formInput.quotaBase;
    // result.netto resta il totale usato dal calcolo (netto + pocket)
    // Aggiorna AppState.calculation (+ alias lastResult / currentCalculation)
    setAppCalculation(result);
    // Nuovo calcolo costo invalida overtime precedente
    setAppOvertime(null);
    clearOvertimeResultsView();
    renderResults(result);
    refreshOvertimeImportedPanel();
    refreshDraftBindings();
  } catch (err) {
    console.error(err);
    window.alert("Errore durante il calcolo: " + err.message);
  }
}

/**
 * Reset completo ai valori di default della modalità corrente
 */
function handleReset() {
  setInputValue("netto", DEFAULTS.netto);
  setInputValue("pocketMoney", DEFAULTS.pocketMoney);
  setInputValue("rimborsoAffitto", DEFAULTS.rimborsoAffitto);
  setInputValue("rimborsoAuto", DEFAULTS.rimborsoAuto);
  setInputValue("marginePerc", DEFAULTS.marginePerc);
  setInputValue("costiStruttura", DEFAULTS.costiStruttura);
  setInputValue("moltiplicatore", DEFAULTS.moltiplicatore);
  setInputValue("quotaBase", DEFAULTS.quotaBase);

  // Trasferta in base alla modalità (senza resettare la modalità stessa)
  if (currentMode === "europa") {
    setInputValue("trasferta", DEFAULTS.trasfertaEuropa);
  } else {
    setInputValue("trasferta", DEFAULTS.trasfertaItalia);
  }

  clearResultsView();
  refreshRateCandidatoPreview();
  document.getElementById("netto").focus();
}

/* =============================================================================
   9b. MEMORIA GLOBALE currentCalculation + NAVIGAZIONE SPA
   ============================================================================= */

/**
 * Popola currentCalculation dall'ultimo risultato REV0 e lo sincronizza in AppState.calculation.
 * Non altera i valori: solo li espone con chiavi stabili per Overtime / futuri moduli.
 * @param {object} result - output di calcolaItalia / Europa / Estero
 */
function syncCurrentCalculation(result) {
  currentCalculation = {
    // Etichetta sempre da mode reale (evita etichette stale)
    tipoContratto: MODE_LABELS[result.mode] || result.modeLabel || result.mode,
    mode: result.mode,
    netto: result.netto,
    nettoMensile:
      result.nettoMensile != null ? result.nettoMensile : result.netto,
    parteTassata: result.parteTassata,
    costoLavoro: result.costoLavoro,
    trasferta: result.trasferta,
    pocketMoney: result.pocketMoney,
    affitto: result.rimborsoAffitto,
    auto: result.rimborsoAuto,
    costiStruttura: result.costiStruttura,
    margine: result.margine,
    marginePerc: result.marginePerc,
    totaleCosto: result.totaleCosto,
    prezzoFinale: result.prezzoFinale,
    rate26: result.prezzoGiorno26,
    rate30: result.prezzoGiorno30,
    rate217: result.prezzoGiorno217,
    quotaBase: result.quotaBase,
    differenza: result.differenza,
    moltiplicatore: result.moltiplicatore,
    // lastResult rimane accessibile anche da AppState.calculation.fullResult
    fullResult: result
  };
  // Punto unico: currentCalculation === AppState.calculation
  AppState.calculation = currentCalculation;
}

/**
 * Cambia vista SPA senza reload e senza perdere i dati dei form.
 * @param {"costo"|"overtime"|"draft"|"cvManager"|"clientOffer"} view
 */
function switchView(view) {
  currentView = view;

  document.querySelectorAll(".nav-tab").forEach(function (tab) {
    const active = tab.getAttribute("data-view") === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", active ? "true" : "false");
  });

  setVisible("viewCosto", view === "costo");
  setVisible("viewOvertime", view === "overtime");
  setVisible("viewDraft", view === "draft");
  setVisible("viewCvManager", view === "cvManager");
  setVisible("viewClientOffer", view === "clientOffer");

  if (view === "overtime") {
    refreshOvertimeImportedPanel();
  }
  if (view === "draft") {
    refreshDraftBindings();
  }
  if (view === "clientOffer" && typeof window.__refreshClientOffer === "function") {
    window.__refreshClientOffer();
  }
}

/* =============================================================================
   9c. CALCOLO OVERTIME (modulo indipendente — non tocca formule REV0)
   -----------------------------------------------------------------------------
   Solo valori ORARI (€/ora). Nessuna moltiplicazione per ore straordinarie.
   Tecnico e Cliente: configurazioni completamente indipendenti.
   ============================================================================= */

/**
 * Formatta un valore come tariffa oraria italiana: 24,04 €/ora
 * @param {number} value
 * @returns {string}
 */
function formatHourly(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return (
    n.toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " €/ora"
  );
}

/**
 * Converte un rate giornaliero calendar in equivalente su base 26.
 * Formula: (rate × calendarDays) ÷ 26
 *
 * @param {number} rate - rate giornaliero (es. Rate 30)
 * @param {number} calendarDays - giorni calendar parametrici
 * @returns {number}
 */
function getEquivalent26Rate(rate, calendarDays) {
  return (rate * calendarDays) / 26;
}

/**
 * Legge il fattore maggiorazione da un gruppo radio per name.
 * @param {string} radioName
 * @returns {number}
 */
function readMaggiorazioneByName(radioName) {
  const checked = document.querySelector('input[name="' + radioName + '"]:checked');
  if (!checked) {
    return 1;
  }
  const n = Number(checked.value);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Legge metodo working|calendar da un gruppo radio.
 * @param {string} radioName
 * @returns {"working"|"calendar"}
 */
function readMetodoByName(radioName) {
  const checked = document.querySelector('input[name="' + radioName + '"]:checked');
  return checked && checked.value === "calendar" ? "calendar" : "working";
}

/**
 * Etichetta leggibile della maggiorazione
 * @param {number} fattore
 * @returns {string}
 */
function labelMaggiorazione(fattore) {
  return MAGG_LABELS[String(fattore)] || "×" + fattore;
}

/**
 * Base economica OVERTIME TECNICO: esclusivamente il netto mensile inserito.
 * Non include pocket money né altre voci accessorie.
 * (calc.netto dopo il calcolo costo può essere netto+pocket per le formule costo.)
 *
 * @param {object} calc
 * @returns {number}
 */
function getTechnicianMonthlyNet(calc) {
  if (!calc || typeof calc !== "object") {
    return 0;
  }
  const fromMensile = Number(calc.nettoMensile);
  if (Number.isFinite(fromMensile) && fromMensile > 0) {
    return fromMensile;
  }
  const netto = Number(calc.netto);
  if (!Number.isFinite(netto)) {
    return 0;
  }
  // Legacy: senza nettoMensile, calc.netto poteva già includere il pocket imponibile
  if (!calc.standalone) {
    const pocket = Number(calc.pocketMoney);
    if (Number.isFinite(pocket) && pocket > 0) {
      const recovered = netto - pocket;
      if (recovered > 0) {
        return recovered;
      }
    }
  }
  return netto;
}

/**
 * OVERTIME TECNICO — costo orario (€/ora)
 *
 * Working:  (Netto mensile / 26) / oreLavorative × maggiorazione
 * Calendar: (Netto mensile / giorniCalendar) / oreLavorative × maggiorazione
 *
 * La base è solo il netto mensile (technicianMonthlyNet), mai netto+pocket.
 *
 * @param {object} calc - currentCalculation
 * @param {"working"|"calendar"} metodo
 * @param {number} giorniCalendar
 * @param {number} oreLavorative
 * @param {number} fattoreMagg
 * @returns {object}
 */
function calcolaOvertimeTecnico(calc, metodo, giorniCalendar, oreLavorative, fattoreMagg) {
  const steps = [];
  let quotaGiornaliera = 0;
  const technicianMonthlyNet = getTechnicianMonthlyNet(calc);

  if (metodo === "working") {
    quotaGiornaliera = technicianMonthlyNet / 26;
    steps.push(
      "Metodo tecnico: Working days"
    );
    steps.push(
      "Quota giornaliera = Netto mensile ÷ 26 = " +
        formatCurrency(technicianMonthlyNet) +
        " ÷ 26 = " +
        formatCurrency(quotaGiornaliera)
    );
  } else {
    quotaGiornaliera = technicianMonthlyNet / giorniCalendar;
    steps.push(
      "Metodo tecnico: Calendar days (" + giorniCalendar + " gg)"
    );
    steps.push(
      "Quota giornaliera = Netto mensile ÷ Giorni calendar = " +
        formatCurrency(technicianMonthlyNet) +
        " ÷ " +
        giorniCalendar +
        " = " +
        formatCurrency(quotaGiornaliera)
    );
  }

  const costoOrarioBase = quotaGiornaliera / oreLavorative;
  const costoOrario = costoOrarioBase * fattoreMagg;

  steps.push(
    "Costo orario base = Quota giornaliera ÷ Ore lavorative = " +
      formatCurrency(quotaGiornaliera) +
      " ÷ " +
      oreLavorative +
      " = " +
      formatHourly(costoOrarioBase)
  );
  steps.push(
    "Maggiorazione tecnica: " +
      labelMaggiorazione(fattoreMagg) +
      " → Costo overtime tecnico = " +
      formatHourly(costoOrarioBase) +
      " × " +
      fattoreMagg +
      " = " +
      formatHourly(costoOrario)
  );

  return {
    metodo,
    metodoLabel: METODO_LABELS[metodo],
    giorniCalendar: metodo === "calendar" ? giorniCalendar : null,
    fattoreMagg,
    maggLabel: labelMaggiorazione(fattoreMagg),
    technicianMonthlyNet,
    quotaGiornaliera,
    costoOrarioBase,
    costoOrario,
    steps
  };
}

/**
 * Quota giornaliera pocket money per overtime cliente.
 * Regola commerciale: sempre mensile ÷ POCKET_MONEY_CALENDAR_DAYS (30).
 * Mai ÷ 26 né ÷ workingDays.
 * @param {object} calc
 * @returns {number}
 */
function getClientDailyPocketMoney(calc) {
  if (!calc || typeof calc !== "object") {
    return 0;
  }
  const monthly = Number(calc.pocketMoney);
  if (!Number.isFinite(monthly) || monthly === 0) {
    return 0;
  }
  if (monthly < 0) {
    throw new Error(
      "Il rate cliente al netto del pocket money non è valido. Verificare rate, pocket money, giorni e ore contrattuali."
    );
  }
  return monthly / POCKET_MONEY_CALENDAR_DAYS;
}

/**
 * OVERTIME CLIENTE — prezzo orario (€/ora)
 *
 * Working:
 *   (Rate26 − pocket/30) / ore × magg
 *
 * Calendar:
 *   1) equivalentWorking = Rate30 × calendarDays / workingDays
 *   2) (equivalentWorking − pocket/30) / ore × magg
 *
 * Il pocket money resta sempre calendar (÷ 30), anche dopo la conversione.
 *
 * @param {object} calc
 * @param {"working"|"calendar"} metodo
 * @param {number} giorniCalendar
 * @param {number} oreLavorative
 * @param {number} fattoreMagg
 * @returns {object}
 */
function calcolaOvertimeCliente(calc, metodo, giorniCalendar, oreLavorative, fattoreMagg) {
  const steps = [];
  const workingDays =
    calc && Number(calc.workingDays) > 0
      ? Number(calc.workingDays)
      : CLIENT_OVERTIME_WORKING_DAYS;
  const calendarDays =
    Number(giorniCalendar) > 0
      ? Number(giorniCalendar)
      : OVERTIME_DEFAULTS.giorniCalendar;

  if (!(workingDays > 0)) {
    throw new Error(
      "Il rate cliente al netto del pocket money non è valido. Verificare rate, pocket money, giorni e ore contrattuali."
    );
  }
  if (!(oreLavorative > 0)) {
    throw new Error(
      "Il rate cliente al netto del pocket money non è valido. Verificare rate, pocket money, giorni e ore contrattuali."
    );
  }

  const dailyPocketMoney = getClientDailyPocketMoney(calc);
  const selectedDailyRate =
    metodo === "calendar" ? Number(calc.rate30) : Number(calc.rate26);

  if (!Number.isFinite(selectedDailyRate) || selectedDailyRate <= 0) {
    throw new Error("Rate cliente non valido per il calcolo overtime.");
  }

  let clientEquivalentWorkingRate = selectedDailyRate;
  if (metodo === "calendar") {
    // Calendar → Working: rate × calendarDays / workingDays
    clientEquivalentWorkingRate =
      (selectedDailyRate * calendarDays) / workingDays;
  }

  const clientWorkingOvertimeBase =
    clientEquivalentWorkingRate - dailyPocketMoney;

  if (!(clientWorkingOvertimeBase > 0)) {
    throw new Error(
      "Il rate cliente al netto del pocket money non è valido. Verificare rate, pocket money, giorni e ore contrattuali."
    );
  }

  const prezzoOrarioBase = clientWorkingOvertimeBase / oreLavorative;
  const prezzoOrario = prezzoOrarioBase * fattoreMagg;

  if (metodo === "working") {
    steps.push("Metodo cliente: Working days (Rate 26)");
    steps.push(
      "Rate Working selezionato = " + formatCurrency(selectedDailyRate)
    );
  } else {
    steps.push(
      "Metodo cliente: Calendar days (Rate 30, " + calendarDays + " gg)"
    );
    steps.push(
      "Rate Calendar selezionato = " + formatCurrency(selectedDailyRate)
    );
    steps.push(
      "Equivalente Working = Rate Calendar × Calendar days ÷ Working days = " +
        formatCurrency(selectedDailyRate) +
        " × " +
        calendarDays +
        " ÷ " +
        workingDays +
        " = " +
        formatCurrency(clientEquivalentWorkingRate)
    );
  }

  steps.push(
    "Pocket money giornaliero = Pocket mensile ÷ " +
      POCKET_MONEY_CALENDAR_DAYS +
      " = " +
      formatCurrency(Number(calc.pocketMoney) || 0) +
      " ÷ " +
      POCKET_MONEY_CALENDAR_DAYS +
      " = " +
      formatCurrency(dailyPocketMoney)
  );
  steps.push(
    "Base Working overtime cliente = Equivalente Working − Pocket giornaliero = " +
      formatCurrency(clientEquivalentWorkingRate) +
      " − " +
      formatCurrency(dailyPocketMoney) +
      " = " +
      formatCurrency(clientWorkingOvertimeBase)
  );
  steps.push(
    "Prezzo orario base = Base Working ÷ Ore lavorative = " +
      formatCurrency(clientWorkingOvertimeBase) +
      " ÷ " +
      oreLavorative +
      " = " +
      formatHourly(prezzoOrarioBase)
  );
  steps.push(
    "Maggiorazione cliente: " +
      labelMaggiorazione(fattoreMagg) +
      " → Prezzo overtime cliente = " +
      formatHourly(prezzoOrarioBase) +
      " × " +
      fattoreMagg +
      " = " +
      formatHourly(prezzoOrario)
  );

  return {
    metodo,
    metodoLabel: METODO_LABELS[metodo],
    giorniCalendar: metodo === "calendar" ? calendarDays : null,
    workingDays: metodo === "calendar" ? workingDays : null,
    fattoreMagg,
    maggLabel: labelMaggiorazione(fattoreMagg),
    selectedDailyRate,
    clientEquivalentWorkingRate,
    dailyPocketMoney,
    clientOvertimeBaseDaily: clientWorkingOvertimeBase,
    clientWorkingOvertimeBase,
    rateEquivalente26:
      metodo === "calendar" ? clientEquivalentWorkingRate : null,
    valoreMensileCalendar:
      metodo === "calendar" ? selectedDailyRate * calendarDays : null,
    prezzoOrarioBase,
    prezzoOrario,
    steps
  };
}

/**
 * Sorgente dati per Overtime.
 * Se rate manuale > 0 → modalità standalone.
 * Altrimenti → AppState.calculation (comportamento REV01 invariato).
 * @returns {object|null}
 */
function getOvertimeCalcSource() {
  const rateManuale = readNumber("otRateManuale");
  if (rateManuale > 0) {
    const metodoManuale = readMetodoByName("otMetodoManuale") || "working";
    const giorniManuale =
      readNumber("otGiorniManuale") || OVERTIME_DEFAULTS.giorniCalendar;
    const giorniBase = metodoManuale === "calendar" ? giorniManuale : 26;
    // Rate giornaliero manuale = base; costruisce lo snapshot atteso dalle formule OT
    return {
      tipoContratto: "Manuale",
      mode: "manuale",
      standalone: true,
      netto: rateManuale * giorniBase,
      rate26: rateManuale,
      rate30: rateManuale,
      rate217: rateManuale,
      prezzoFinale: rateManuale * 26,
      giorniManuale: giorniBase
    };
  }

  return AppState.calculation || currentCalculation || null;
}

/**
 * Orchestratore: tecnico + cliente indipendenti + margine orario.
 * Formule OT invariate; cambia solo la sorgente dati (AppState o manuale).
 * @returns {object|null}
 */
function calcolaOvertimeCompleto() {
  const calc = getOvertimeCalcSource();
  if (!calc) {
    return null;
  }

  const oreLavorative = readNumber("otOreLavorative");
  const metodoTecnico = readMetodoByName("otMetodoTecnico");
  const metodoCliente = readMetodoByName("otMetodoCliente");
  const maggTecnico = readMaggiorazioneByName("otMaggTecnico");
  const maggCliente = readMaggiorazioneByName("otMaggCliente");
  const giorniTecnico =
    readNumber("otGiorniCalendarTecnico") || OVERTIME_DEFAULTS.giorniCalendar;
  const giorniCliente =
    readNumber("otGiorniCalendarCliente") || OVERTIME_DEFAULTS.giorniCalendar;

  if (!(oreLavorative > 0)) {
    throw new Error("Le ore lavorative giornaliere devono essere maggiori di zero.");
  }
  if (metodoTecnico === "calendar" && !(giorniTecnico > 0)) {
    throw new Error("I giorni calendar (tecnico) devono essere maggiori di zero.");
  }
  if (metodoCliente === "calendar" && !(giorniCliente > 0)) {
    throw new Error("I giorni calendar (cliente) devono essere maggiori di zero.");
  }

  const tecnico = calcolaOvertimeTecnico(
    calc,
    metodoTecnico,
    giorniTecnico,
    oreLavorative,
    maggTecnico
  );
  const cliente = calcolaOvertimeCliente(
    calc,
    metodoCliente,
    giorniCliente,
    oreLavorative,
    maggCliente
  );

  const margineOrario = cliente.prezzoOrario - tecnico.costoOrario;

  const steps = [];
  steps.push("--- OVERTIME TECNICO ---");
  tecnico.steps.forEach(function (s) {
    steps.push(s);
  });
  steps.push("--- OVERTIME CLIENTE ---");
  cliente.steps.forEach(function (s) {
    steps.push(s);
  });
  steps.push("--- MARGINE ORARIO ---");
  steps.push(
    "Margine orario overtime = Prezzo cliente − Costo tecnico = " +
      formatHourly(cliente.prezzoOrario) +
      " − " +
      formatHourly(tecnico.costoOrario) +
      " = " +
      formatHourly(margineOrario)
  );

  return {
    oreLavorative,
    tecnico,
    cliente,
    margineOrario,
    steps,
    standalone: !!calc.standalone,
    imported: {
      tipoContratto: calc.tipoContratto,
      netto: getTechnicianMonthlyNet(calc),
      prezzoFinale: calc.prezzoFinale,
      rate26: calc.rate26,
      rate30: calc.rate30,
      rate217: calc.rate217
    }
  };
}

/**
 * Mostra/nasconde giorni calendar del calcolo manuale overtime.
 */
function syncManualOvertimeVisibility() {
  setVisible(
    "fieldGiorniManuale",
    readMetodoByName("otMetodoManuale") === "calendar"
  );
}

/**
 * Aggiorna pannello dati importati. Il form OT resta sempre disponibile (anche standalone).
 */
function refreshOvertimeImportedPanel() {
  const calc = AppState.calculation || currentCalculation;
  const hasCalc = !!calc;
  const hasManual = readNumber("otRateManuale") > 0;

  // Avviso soft solo se non c'è né calcolo né manuale già valorizzato
  setVisible("otMissingCard", !hasCalc && !hasManual);
  setVisible("otContent", true);
  setVisible("otImportedCard", hasCalc);

  if (!hasCalc) {
    return;
  }

  document.getElementById("otImpTipo").textContent =
    MODE_LABELS[calc.mode] || calc.tipoContratto || "—";
  document.getElementById("otImpNetto").textContent = formatCurrency(
    getTechnicianMonthlyNet(calc)
  );
  document.getElementById("otImpPrezzoFinale").textContent = formatCurrency(
    calc.prezzoFinale
  );
  document.getElementById("otImpRate26").textContent = formatCurrency(
    calc.rate26
  );
  document.getElementById("otImpRate30").textContent = formatCurrency(
    calc.rate30
  );
  document.getElementById("otImpRate217").textContent = formatCurrency(
    calc.rate217
  );
}

/**
 * Mostra/nasconde i campi giorni calendar (tecnico e cliente indipendenti)
 */
function syncCalendarDaysVisibility() {
  setVisible(
    "fieldGiorniCalendarTecnico",
    readMetodoByName("otMetodoTecnico") === "calendar"
  );
  setVisible(
    "fieldGiorniCalendarCliente",
    readMetodoByName("otMetodoCliente") === "calendar"
  );
}

/**
 * Reset solo dei campi overtime (non tocca il calcolo costo)
 */
function handleResetOvertime() {
  setInputValue("otOreLavorative", OVERTIME_DEFAULTS.oreLavorative);
  setInputValue("otGiorniCalendarTecnico", OVERTIME_DEFAULTS.giorniCalendar);
  setInputValue("otGiorniCalendarCliente", OVERTIME_DEFAULTS.giorniCalendar);

  const setRadio = function (name, value) {
    const el = document.querySelector(
      'input[name="' + name + '"][value="' + value + '"]'
    );
    if (el) {
      el.checked = true;
    }
  };

  setRadio("otMetodoTecnico", "working");
  setRadio("otMetodoCliente", "working");
  setRadio("otMaggTecnico", "1");
  setRadio("otMaggCliente", "1");

  setAppOvertime(null);
  clearOvertimeResultsView();
  syncCalendarDaysVisibility();
  refreshDraftBindings();
}

/**
 * Pulisce solo la vista risultati overtime
 */
function clearOvertimeResultsView() {
  setVisible("otStatoVuoto", true);
  setVisible("otContenitoreRisultati", false);
  const sub = document.getElementById("otSottotitoloRisultati");
  if (sub) {
    sub.textContent = "Configura tecnico e cliente, poi premi Calcola overtime.";
  }
  const corpo = document.getElementById("corpoTabellaOvertime");
  if (corpo) {
    corpo.innerHTML = "";
  }
  const lista = document.getElementById("listaPassaggiOt");
  if (lista) {
    lista.innerHTML = "";
  }
  const btnOt = document.getElementById("btnEsportaWordOt");
  if (btnOt) {
    btnOt.disabled = !lastResult;
  }
}

/**
 * Render tabella e KPI overtime (solo €/ora)
 * @param {object} ot
 */
function renderOvertimeResults(ot) {
  const rows = [
    { label: "— Overtime tecnico —", value: "", rowClass: "row-section" },
    { label: "Metodo", value: ot.tecnico.metodoLabel },
    { label: "Maggiorazione", value: ot.tecnico.maggLabel },
    {
      label: "Costo orario tecnico",
      value: formatHourly(ot.tecnico.costoOrario),
      rowClass: "row-margin"
    },
    { label: "— Overtime cliente —", value: "", rowClass: "row-section" },
    { label: "Metodo", value: ot.cliente.metodoLabel },
    { label: "Maggiorazione", value: ot.cliente.maggLabel },
    {
      label: "Prezzo orario cliente",
      value: formatHourly(ot.cliente.prezzoOrario),
      rowClass: "row-final"
    },
    {
      label: "Margine orario overtime",
      value: formatHourly(ot.margineOrario),
      rowClass: "row-margin"
    }
  ];

  if (ot.tecnico.giorniCalendar != null) {
    rows.splice(2, 0, {
      label: "Giorni calendar (tecnico)",
      value: String(ot.tecnico.giorniCalendar)
    });
  }
  // Dopo eventuale insert tecnico, ricalcola indice per cliente
  const clienteSectionIdx = rows.findIndex(function (r) {
    return r.label === "— Overtime cliente —";
  });
  if (ot.cliente.giorniCalendar != null && clienteSectionIdx >= 0) {
    rows.splice(clienteSectionIdx + 2, 0, {
      label: "Giorni calendar (cliente)",
      value: String(ot.cliente.giorniCalendar)
    });
    if (ot.cliente.rateEquivalente26 != null) {
      rows.splice(clienteSectionIdx + 3, 0, {
        label: "Rate equivalente 26",
        value: formatCurrency(ot.cliente.rateEquivalente26)
      });
    }
  }

  document.getElementById("corpoTabellaOvertime").innerHTML = rows
    .map(function (row) {
      const cls = row.rowClass ? ' class="' + row.rowClass + '"' : "";
      return (
        "<tr" +
        cls +
        "><td>" +
        escapeHtml(row.label) +
        '</td><td class="amount">' +
        escapeHtml(row.value) +
        "</td></tr>"
      );
    })
    .join("");

  document.getElementById("kpiOtTecnico").textContent = formatHourly(
    ot.tecnico.costoOrario
  );
  document.getElementById("kpiOtCliente").textContent = formatHourly(
    ot.cliente.prezzoOrario
  );
  document.getElementById("kpiOtMargine").textContent = formatHourly(
    ot.margineOrario
  );

  document.getElementById("listaPassaggiOt").innerHTML = ot.steps
    .map(function (step) {
      return "<li>" + escapeHtml(step) + "</li>";
    })
    .join("");

  document.getElementById("otSottotitoloRisultati").textContent =
    "Overtime orario calcolato — " + getItalianDate();

  setVisible("otStatoVuoto", false);
  setVisible("otContenitoreRisultati", true);

  document.getElementById("btnEsportaWord").disabled = false;
  document.getElementById("btnEsportaWordOt").disabled = false;
}

/**
 * Handler submit form overtime
 * @param {Event} event
 */
function handleCalcolaOvertime(event) {
  if (event) {
    event.preventDefault();
  }

  if (!getOvertimeCalcSource()) {
    window.alert(
      "Inserire un Rate giornaliero in Calcolo manuale, oppure eseguire prima un calcolo costo personale."
    );
    return;
  }

  try {
    const ot = calcolaOvertimeCompleto();
    if (!ot) {
      window.alert("Impossibile calcolare l'overtime: dati insufficienti.");
      return;
    }
    setAppOvertime(ot);
    renderOvertimeResults(ot);
    refreshDraftBindings();
  } catch (err) {
    console.error(err);
    window.alert(err.message || "Errore durante il calcolo overtime.");
  }
}

/* =============================================================================
   9d. DRAFT TECNICO (FASE A) — UI + AppState.draft
   -----------------------------------------------------------------------------
   Nessun export Word. Nessuna modifica alle formule REV01.
   ============================================================================= */

/**
 * Legge il valore del radio selezionato per name.
 * @param {string} name
 * @returns {string}
 */
function readDraftRadio(name) {
  const el = document.querySelector('input[name="' + name + '"]:checked');
  return el ? el.value : "";
}

/**
 * Mostra/nasconde i campi condizionali del form Draft.
 */
function syncDraftConditionalFields() {
  const periodoMode = readDraftRadio("draftPeriodoMode");
  setVisible("draftPeriodoCalendarBlock", periodoMode !== "text");
  setVisible("draftPeriodoTextBlock", periodoMode === "text");

  setVisible("draftOrarioCustomBlock", readDraftRadio("draftOrario") === "custom");
  setVisible(
    "draftTurnazioneFreeBlock",
    readDraftRadio("draftTurnazioneMode") === "free"
  );
  setVisible(
    "draftStraordinariManualBlock",
    readDraftRadio("draftStraordinari") === "manual"
  );

  const alloggio = readDraftRadio("draftAlloggio");
  setVisible(
    "draftAlloggioDetailBlock",
    alloggio === "contributo" || alloggio === "personalizzato"
  );

  const trasporti = readDraftRadio("draftTrasporti");
  setVisible(
    "draftTrasportiDetailBlock",
    trasporti === "personalizzato"
  );
}

/**
 * Scrive i campi del form in AppState.draft (struttura FASE A).
 * Collega remunerazione e predispone OT tecnico da AppState esistenti.
 */
function syncDraftStateFromForm() {
  const calc = AppState.calculation;
  const ot = AppState.overtime;

  const remAvailable = !!(calc && Number.isFinite(Number(calc.netto)));
  const otTecnico =
    ot && ot.tecnico && Number.isFinite(Number(ot.tecnico.costoOrario))
      ? ot.tecnico.costoOrario
      : null;

  AppState.draft = {
    language: readDraftRadio("draftLanguage") || "it",
    project: {
      posizione: (document.getElementById("draftPosizione") || {}).value || "",
      localita: (document.getElementById("draftLocalita") || {}).value || "",
      progetto: (document.getElementById("draftProgetto") || {}).value || "",
      periodoMode: readDraftRadio("draftPeriodoMode") || "calendar",
      periodoDa: (document.getElementById("draftPeriodoDa") || {}).value || "",
      periodoA: (document.getElementById("draftPeriodoA") || {}).value || "",
      periodoTesto: (document.getElementById("draftPeriodoTesto") || {}).value || ""
    },
    workSchedule: {
      mode: readDraftRadio("draftOrario") || "40h5",
      custom: (document.getElementById("draftOrarioCustom") || {}).value || ""
    },
    rotation: {
      mode: readDraftRadio("draftTurnazioneMode") || "free",
      value: (document.getElementById("draftTurnazione") || {}).value || ""
    },
    overtime: {
      mode: readDraftRadio("draftStraordinari") || "auto",
      manualValue:
        (document.getElementById("draftStraordinariManuale") || {}).value || "",
      // Predisposizione collegamento futuro a AppState.overtime
      tecnicoCostoOrario: otTecnico,
      linkedFromAppState: otTecnico != null
    },
    accommodation: {
      mode: readDraftRadio("draftAlloggio") || "cliente",
      detail: (document.getElementById("draftAlloggioDettaglio") || {}).value || ""
    },
    localTransport: {
      mode: readDraftRadio("draftTrasporti") || "cliente",
      detail:
        (document.getElementById("draftTrasportiDettaglio") || {}).value || ""
    },
    mobDemob: {
      mode: readDraftRadio("draftMobDemob") || "standard",
      voliNostroCarico: !!(
        document.getElementById("draftVoliNostroCarico") || {}
      ).checked
    },
    travelDays: {
      mode: readDraftRadio("draftGiorniViaggio") || "100"
    },
    contract: {
      type: "CCNL Commercio",
      livello: readDraftRadio("draftContrattoLivello") || "1"
    },
    remuneration: {
      available: remAvailable,
      nettoMese: remAvailable
        ? calc.nettoMensile != null
          ? calc.nettoMensile
          : calc.netto
        : null,
      // Rate candidato (netto mensile / 26) — non il rate vendita cliente
      rate26: remAvailable
        ? getRateCandidato26(
            calc.nettoMensile != null ? calc.nettoMensile : calc.netto
          )
        : null,
      pocketMoney: remAvailable ? calc.pocketMoney || 0 : null,
      pocketCalendarDay: remAvailable
        ? getPocketMoneyCalendarDay(calc.pocketMoney)
        : null
    }
  };
}

/**
 * Aggiorna i campi sola lettura Draft da AppState.calculation / overtime.
 */
function refreshDraftBindings() {
  const form = document.getElementById("formDraft");
  if (!form) {
    return;
  }

  syncDraftConditionalFields();

  const languageHint = document.getElementById("draftLanguageHint");
  if (languageHint) {
    languageHint.textContent =
      readDraftRadio("draftLanguage") === "en"
        ? "The document will be generated in English."
        : "Il documento sarà generato in italiano.";
  }

  const calc = AppState.calculation;
  const remAvailable = !!(calc && Number.isFinite(Number(calc.netto)));
  const nettoMensile = remAvailable
    ? calc.nettoMensile != null
      ? Number(calc.nettoMensile)
      : Number(calc.netto)
    : null;

  const remNetto = document.getElementById("draftRemNetto");
  const remRate26 = document.getElementById("draftRemRate26");
  const remMissing = document.getElementById("draftRemMissing");
  const remHint = document.getElementById("draftRemHint");

  if (remNetto) {
    remNetto.textContent =
      nettoMensile != null && Number.isFinite(nettoMensile)
        ? formatCurrency(nettoMensile)
        : "—";
  }
  if (remRate26) {
    const rateCand =
      nettoMensile != null ? getRateCandidato26(nettoMensile) : null;
    remRate26.textContent =
      rateCand == null ? "—" : formatCurrency(rateCand);
  }
  if (remMissing) {
    if (remAvailable) {
      remMissing.setAttribute("hidden", "");
    } else {
      remMissing.removeAttribute("hidden");
    }
  }
  if (remHint) {
    remHint.textContent = remAvailable
      ? "Valori automatici da AppState.calculation (sola lettura)."
      : "In attesa di un calcolo costo personale.";
  }

  // Pocket Money (solo se > 0): Euro XX,XX calendar day
  const pocketText = buildDraftPocketMoneyText();
  const pocketBlock = document.getElementById("draftPocketBlock");
  const pocketValue = document.getElementById("draftPocketValue");
  if (pocketBlock) {
    if (pocketText) {
      pocketBlock.removeAttribute("hidden");
      if (pocketValue) {
        pocketValue.textContent = pocketText;
      }
    } else {
      pocketBlock.setAttribute("hidden", "");
      if (pocketValue) {
        pocketValue.textContent = "—";
      }
    }
  }

  // Predisposizione collegamento OT tecnico (futuro uso pieno in modalità auto)
  const ot = AppState.overtime;
  const otEl = document.getElementById("draftOtTecnico");
  const otHint = document.getElementById("draftOtHint");
  const hasOt =
    ot && ot.tecnico && Number.isFinite(Number(ot.tecnico.costoOrario));

  if (otEl) {
    otEl.textContent = hasOt ? formatHourly(ot.tecnico.costoOrario) : "—";
  }
  if (otHint) {
    otHint.textContent = hasOt
      ? "Collegato da AppState.overtime.tecnico.costoOrario."
      : "Predisposto: si aggiorna quando esiste un calcolo overtime.";
  }

  syncDraftStateFromForm();
}

/**
 * Collega listener del form Draft (input → AppState.draft).
 */
function initDraftModule() {
  const form = document.getElementById("formDraft");
  if (!form) {
    return;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
  });

  const onDraftChange = function () {
    syncDraftConditionalFields();
    syncDraftStateFromForm();
    const languageHint = document.getElementById("draftLanguageHint");
    if (languageHint) {
      languageHint.textContent =
        readDraftRadio("draftLanguage") === "en"
          ? "The document will be generated in English."
          : "Il documento sarà generato in italiano.";
    }
  };

  form.addEventListener("input", onDraftChange);
  form.addEventListener("change", onDraftChange);

  refreshDraftBindings();
}

/* =============================================================================
   10. EXPORT WORD (.docx) — usa lib/docx.min.js (UMD browser)
   ============================================================================= */

/**
 * Verifica che la libreria docx sia disponibile globalmente
 * @returns {boolean}
 */
function isDocxAvailable() {
  return typeof window.docx === "object" && window.docx !== null;
}

/**
 * Costruisce i paragrafi Word della sezione CALCOLO OVERTIME (solo €/ora).
 * @param {object} docxLib - window.docx
 * @param {string} BLUE - colore hex senza #
 * @returns {Array}
 */
function buildOvertimeWordParagraphs(docxLib, BLUE) {
  const { Paragraph, TextRun, HeadingLevel, AlignmentType } = docxLib;
  const blocks = [];

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 480, after: 160 },
      children: [
        new TextRun({
          text: "CALCOLO OVERTIME",
          bold: true,
          color: BLUE,
          size: 32,
          font: "Calibri"
        })
      ]
    })
  );

  if (!lastOvertime) {
    blocks.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: "Nessun calcolo overtime effettuato in questa sessione.",
            italics: true,
            size: 20,
            font: "Calibri",
            color: "5A6577"
          })
        ]
      })
    );
    return blocks;
  }

  const ot = lastOvertime;

  function line(label, value) {
    return new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: label + ": ",
          bold: true,
          size: 20,
          font: "Calibri",
          color: BLUE
        }),
        new TextRun({
          text: String(value),
          size: 20,
          font: "Calibri",
          color: "2C3544"
        })
      ]
    });
  }

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 100, after: 140 },
      children: [
        new TextRun({
          text: "Dati importati",
          bold: true,
          color: BLUE,
          size: 26,
          font: "Calibri"
        })
      ]
    })
  );
  blocks.push(line("Tipo contratto", ot.imported.tipoContratto));
  blocks.push(line("Netto", formatCurrency(ot.imported.netto)));
  blocks.push(line("Prezzo finale", formatCurrency(ot.imported.prezzoFinale)));
  blocks.push(line("Rate 26", formatCurrency(ot.imported.rate26)));
  blocks.push(line("Rate 30", formatCurrency(ot.imported.rate30)));
  blocks.push(line("Rate 21,7", formatCurrency(ot.imported.rate217)));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 260, after: 140 },
      children: [
        new TextRun({
          text: "Parametri overtime",
          bold: true,
          color: BLUE,
          size: 26,
          font: "Calibri"
        })
      ]
    })
  );
  blocks.push(line("Ore lavorative giornaliere", String(ot.oreLavorative)));
  blocks.push(line("Metodo overtime tecnico", ot.tecnico.metodoLabel));
  if (ot.tecnico.giorniCalendar != null) {
    blocks.push(
      line("Giorni calendar (tecnico)", String(ot.tecnico.giorniCalendar))
    );
  }
  blocks.push(line("Maggiorazione tecnica", ot.tecnico.maggLabel));
  blocks.push(line("Metodo overtime cliente", ot.cliente.metodoLabel));
  if (ot.cliente.giorniCalendar != null) {
    blocks.push(
      line("Giorni calendar (cliente)", String(ot.cliente.giorniCalendar))
    );
  }
  blocks.push(line("Maggiorazione cliente", ot.cliente.maggLabel));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 260, after: 140 },
      children: [
        new TextRun({
          text: "Risultati overtime (€/ora)",
          bold: true,
          color: BLUE,
          size: 26,
          font: "Calibri"
        })
      ]
    })
  );
  blocks.push(
    line("Costo overtime tecnico", formatHourly(ot.tecnico.costoOrario))
  );
  blocks.push(
    line("Prezzo overtime cliente", formatHourly(ot.cliente.prezzoOrario))
  );
  blocks.push(line("Margine overtime", formatHourly(ot.margineOrario)));

  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 260, after: 140 },
      children: [
        new TextRun({
          text: "Passaggi e formule overtime",
          bold: true,
          color: BLUE,
          size: 26,
          font: "Calibri"
        })
      ]
    })
  );

  ot.steps.forEach(function (step, index) {
    blocks.push(
      new Paragraph({
        spacing: { after: 70 },
        children: [
          new TextRun({
            text: index + 1 + ". " + step,
            size: 20,
            font: "Calibri",
            color: "2C3544"
          })
        ]
      })
    );
  });

  return blocks;
}

/* =============================================================================
   10b. EXPORT WORD — DRAFT TECNICO (REV02.1)
   -----------------------------------------------------------------------------
   Builder dedicato. Template aziendali fissi + variabili.
   NON genera/parafrasa testi. NON modifica buildOvertimeWordParagraphs / buildTableRows.
   ============================================================================= */

/** Font e corpo standard Draft aziendale */
const DRAFT_WORD_FONT = "Arial MT";
/** Corpo 11 pt = 22 half-points */
const DRAFT_WORD_SIZE = 22;
/** Titolo più grande (16 pt) */
const DRAFT_WORD_TITLE_SIZE = 32;

/**
 * Template aziendali approvati (testi fissi da bozze "DRAFT di CONTRATTO").
 * Solo placeholder {var} vengono sostituiti; nessun testo generato.
 */
const DRAFT_TEMPLATES = Object.freeze({
  orario60:
    "Fino a 60 ore/settimana, fino a 6 giorni/settimana. Qualora il cliente richiedesse un orario differente (ad esempio 40 ore/settimana per 5 giornate lavorative), il compenso netto concordato rimarrà invariato. Eventuali assenze volontarie o per esigenze personali non saranno remunerate.",
  orario48:
    "Fino a 48 ore/settimana, fino a 6 giorni/settimana. Qualora il cliente richiedesse un orario differente (ad esempio 40 ore/settimana per 5 giornate lavorative), il compenso netto concordato rimarrà invariato. Eventuali assenze volontarie o per esigenze personali non saranno remunerate.",
  orario40:
    "Fino a 40 ore/settimana, fino a 5 giorni/settimana. Eventuali assenze volontarie o per esigenze personali non saranno remunerate.",

  straordinariEuro:
    "Euro {importo} per ogni ora lavorata in eccesso rispetto l'orario standard solo se espressamente richiesto e firmato dal cliente.",
  straordinariFormula10:
    "pari ad 1/10 del rate giornaliero per ogni ora lavorata in eccesso rispetto l'orario di cantiere standard, solo se espressamente richiesto e approvate dal cliente.",
  straordinariNA: "N/A",

  alloggioCliente: "A carico del Cliente.",
  alloggioCandidato: "A suo carico.",
  alloggioContributo:
    "Contributo fino a un massimo di Euro {importo} a fronte di presentazione pezze giustificative.",

  trasportiCliente: "A carico del Cliente.",
  trasportiCandidato: "A suo carico.",
  trasportiRenting: "Renting auto (city car) a nostro carico.",

  pocketMoneyCalendar: "Euro {importo} calendar day",

  mobStandard:
    "Le spese sostenute per Mob / Demob saranno rimborsate a fronte di giustificativi con evidenza di copia di fatture scontrini o documentazione equivalente.",
  mobVoli: "Ticket flight (classe economy) a nostro carico",
  mobNA: "N/A",

  viaggio100:
    "Durante i giorni di viaggio necessari per il raggiungimento del sito e per il rientro presso la propria residenza, sarà riconosciuto un importo pari al 100% dell'importo giornaliero concordato per le attività in sito.",
  viaggio50:
    "Durante i giorni di viaggio necessari per il raggiungimento del sito e per il rientro presso la propria residenza, sarà riconosciuto un importo pari al 50% dell'importo giornaliero concordato per le attività in sito.",
  viaggioNA: "N/A",

  contratto:
    'Assunzione a "Tempo Determinato" – Liv. {livello} – C.C.N.L. COMMERCIO',

  remunerazione:
    "La retribuzione sarà pari {rate26} euro netti per giorno lavorato ({rate26}X26 pari a {netto} euro mese) E sarà così costituita:\n- Retribuzione base riferita al livello di appartenenza\n- Rateo di 13^\n- Rateo di 14^\n- Ferie e permessi\n- TFR\n- Indennità di trasferta\n- voci di rimborso varie",

  nota:
    "La procedura di pagamento tiene conto dei tempi occorrenti per gestione della documentazione necessaria per la elaborazione degli stipendi, pertanto la competenza mensile viene erogata ENTRO E NON OLTRE IL 20 del mese successivo a quello lavorato a fronte di Time sheet firmato ed approvato inviato in sede entro il 3 del mese successivo a quello lavorato",
  periodoProva: "In accordo con il CCNL del Commercio",
  periodoPreavviso: "In accordo con il CCNL del Commercio",
  assicurazione1: "In accordo alle Leggi ed ai Regolamenti Italiani (INAIL)",
  assicurazione2: "Allianz",

  inizioPrefix: "Indicativamente dal {data}",
  inizioCompat:
    "compatibilmente con i tempi per la documentazione burocratica",
  finePrefix: "Indicativamente al {data}",
  durataSuffix:
    "(estendibili / modificabili in relazione alla reale situazione del progetto)",

  turnazioneTBD: "To Be Defined",
  turnazioneNA: "N/A",
  turnazioneDefinita:
    "{schema}. In fase di turnazione saranno riconosciuti i giorni di viaggio; le spese di viaggio saranno rimborsate a fronte di presentazione di ricevute per biglietti / carburante / pedaggi / altro. I giorni di turnazione non saranno remunerati."
});

/** English contract-draft wording, aligned to the user-approved Sweden draft. */
const DRAFT_TEMPLATES_EN = Object.freeze({
  orario60:
    "Up to 60 hours/week, up to 6 days/week. If the Client requests a different schedule (for example 40 hours/week over 5 working days), the agreed net compensation will remain unchanged. Any voluntary absences or absences for personal needs will not be remunerated.",
  orario48:
    "Up to 48 hours/week, up to 6 days/week. If the Client requests a different schedule (for example 40 hours/week over 5 working days), the agreed net compensation will remain unchanged. Any voluntary absences or absences for personal needs will not be remunerated.",
  orario40:
    "Up to 40 hours/week, up to 5 days/week. Any voluntary absences or absences for personal needs will not be remunerated.",
  straordinariEuro:
    "Euro {importo} for each hour worked in excess of the standard hours, only if expressly requested and approved by the Client.",
  straordinariFormula10:
    "An amount equal to 1/10 of the daily rate for each hour worked in excess of the standard site schedule, only if expressly requested and approved by the Client.",
  straordinariNA: "N/A",
  alloggioCliente: "Accommodation provided by the Client.",
  alloggioCandidato: "Accommodation at the candidate's expense.",
  alloggioContributo:
    "Contribution up to a maximum of Euro {importo}, subject to submission of supporting documents.",
  trasportiCliente: "Local transportation provided by the Client.",
  trasportiCandidato: "Local transportation at the candidate's expense.",
  trasportiRenting: "City-car rental provided at our expense.",
  pocketMoneyCalendar: "Euro {importo} /calendar day",
  mobStandard:
    "Mob/Demob travel expenses will be reimbursed upon submission of supporting documents, such as invoices, receipts or equivalent documentation.",
  mobVoli: "Flight ticket, if used, economy class, at our expense.",
  mobNA: "N/A",
  viaggio100:
    "During the travel days necessary to reach the site and return to the place of residence, an amount equal to 100% of the agreed daily amount for on-site activities will be recognized.",
  viaggio50:
    "During the travel days necessary to reach the site and return to the place of residence, an amount equal to 50% of the agreed daily amount for on-site activities will be recognized.",
  viaggioNA: "N/A",
  contratto: "Fixed-term employment - Level {livello} - C.C.N.L. COMMERCIO",
  remunerazione:
    "The remuneration will be Euro {rate26} net per day worked ({rate26} x 26 = Euro {netto} net per month) and will consist of:\n- Base salary corresponding to the assigned level\n- Accrued 13th-month pay\n- Accrued 14th-month pay\n- Holidays and leave\n- TFR\n- Travel allowance\n- Miscellaneous reimbursement items",
  nota:
    "The payment procedure takes into account the time required to process the documentation necessary for payroll preparation. Therefore, the monthly salary will be paid no later than the 20th of the month following the worked month, upon receipt at headquarters of the signed and approved timesheet by the 3rd of that month.",
  periodoProva: "In accordance with the C.C.N.L. COMMERCIO.",
  periodoPreavviso: "In accordance with the C.C.N.L. COMMERCIO.",
  assicurazione1: "In accordance with Italian laws and regulations (INAIL).",
  assicurazione2: "Allianz",
  inizioPrefix: "Indicatively from {data}",
  inizioCompat: "subject to the time required for administrative documentation",
  finePrefix: "Indicatively until {data}",
  durataSuffix:
    "(extendable / subject to change based on actual project requirements)",
  turnazioneTBD: "To Be Defined",
  turnazioneNA: "N/A",
  turnazioneDefinita:
    "{schema}. During rotation, travel days will be recognized and travel expenses will be reimbursed upon submission of receipts for tickets, fuel, tolls or equivalent costs. Rotation rest days will not be remunerated."
});

const DRAFT_LABELS = Object.freeze({
  it: {
    position: "Posizione", location: "Località", project: "Progetto",
    start: "Inizio Progetto", end: "Fine Progetto", duration: "Durata Stimata",
    hours: "Orario di lavoro", rotation: "Turnazione", overtime: "Straordinari",
    accommodation: "Alloggio", transport: "Trasporti locali", mob: "Mob e Demob",
    travel: "Giorni di viaggio", contract: "Tipo di contratto",
    remuneration: "Remunerazione intervento", note: "Nota",
    probation: "Periodo di prova", notice: "Periodo di preavviso",
    insurance1: "Assicurazione 1", insurance2: "Assicurazione 2"
  },
  en: {
    position: "Role", location: "Location", project: "Project",
    start: "Project Start Date", end: "Project End Date", duration: "Estimated Project Duration",
    hours: "Working hours", rotation: "Rotation", overtime: "Overtime",
    accommodation: "Accommodation", transport: "Local transportation", mob: "Mob and Demob Travel",
    travel: "Travel days", contract: "Contract Type",
    remuneration: "Remuneration", note: "Note", probation: "Probation Period",
    notice: "Notice period", insurance1: "Insurance 1", insurance2: "Insurance 2"
  }
});

function getDraftLanguage(draft) {
  return draft && draft.language === "en" ? "en" : "it";
}

function getDraftTemplates(draft) {
  return getDraftLanguage(draft) === "en" ? DRAFT_TEMPLATES_EN : DRAFT_TEMPLATES;
}

/**
 * Sostituisce placeholder {nome} in un template aziendale.
 * @param {string} template
 * @param {object} vars
 * @returns {string}
 */
function applyDraftTemplate(template, vars) {
  let out = String(template || "");
  const map = vars || {};
  Object.keys(map).forEach(function (key) {
    out = out.split("{" + key + "}").join(String(map[key]));
  });
  return out;
}

/**
 * Parse importi IT/EN: 1000 | 1.000 | 1.000,00 | 1000,00 | 1000.00 | 1,500.00
 * Allineato a modules/clientOffer/transform.parseMoneyInput.
 * @param {any} value
 * @returns {number|null}
 */
function parseDraftMoneyInput(value) {
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
  if (
    /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ||
    (/^\d+,\d+$/.test(s) && s.indexOf(".") < 0)
  ) {
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
 * Numero in formato italiano (es. 1.500,00) senza simbolo valuta.
 * Accetta number o stringhe IT/EN; non altera date/proposal/rotation.
 * Implementazione deterministica (indipendente dalla locale Node).
 * @param {any} value
 * @returns {string}
 */
function formatDraftItNumber(value) {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : parseDraftMoneyInput(value);
  if (n == null || !Number.isFinite(n)) {
    return "";
  }
  const fixed = Math.round(n * 100) / 100;
  const neg = fixed < 0;
  const abs = Math.abs(fixed);
  const parts = abs.toFixed(2).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + intPart + "," + parts[1];
}

/**
 * Importo economico per Word Draft: "Euro 1.500,00".
 * @param {any} value
 * @returns {string}
 */
function formatDraftEuroAmount(value) {
  const formatted = formatDraftItNumber(value);
  if (!formatted) return "";
  return "Euro " + formatted;
}

/**
 * Formatta una data ISO (yyyy-mm-dd) in dd/mm/yyyy.
 * @param {string} iso
 * @returns {string}
 */
function formatDraftDateIt(iso) {
  if (!iso || typeof iso !== "string") {
    return "";
  }
  const parts = iso.split("-");
  if (parts.length !== 3) {
    return iso;
  }
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

/**
 * Stima durata tra due date ISO in mesi (senza giorni).
 * @param {string} da
 * @param {string} a
 * @returns {string}
 */
function formatDraftDuration(da, a, language) {
  const t1 = Date.parse(da);
  const t2 = Date.parse(a);
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t2 < t1) {
    return "";
  }
  const days = Math.round((t2 - t1) / 86400000) + 1;
  const months = Math.max(1, Math.round(days / 30.4375));
  if (months === 1) {
    return language === "en" ? "1 month" : "1 mese";
  }
  return months + (language === "en" ? " months" : " mesi");
}

/**
 * Rate candidato (26) = Netto mensile / 26.
 * Solo per Draft UI/Word — NON è il rate di vendita cliente.
 * @param {number} netto
 * @returns {number|null}
 */
function getRateCandidato26(netto) {
  const n = Number(netto);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n / 26;
}

/**
 * Aggiorna l'anteprima informativa "Rate candidato (26 gg)" sotto il campo Netto.
 * Non entra in nessun calcolo REV01.
 */
function refreshRateCandidatoPreview() {
  const el = document.getElementById("rateCandidatoPreview");
  if (!el) {
    return;
  }
  const rate = getRateCandidato26(readNumber("netto"));
  el.textContent = rate == null ? "—" : formatCurrency(rate);
}

/**
 * Pocket Money giornaliero (calendar day) = mensile / 30.
 * @param {number} pocketMensile
 * @returns {number|null}
 */
function getPocketMoneyCalendarDay(pocketMensile) {
  const n = Number(pocketMensile);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n / 30;
}

/**
 * Testo Draft Pocket Money (solo se > 0).
 * @returns {string|null}
 */
function buildDraftPocketMoneyText() {
  const templates = getDraftTemplates(AppState.draft || {});
  const calc = AppState.calculation;
  const pocket =
    calc && calc.pocketMoney != null
      ? Number(calc.pocketMoney)
      : readNumber("pocketMoney");
  const day = getPocketMoneyCalendarDay(pocket);
  if (day == null) {
    return null;
  }
  return applyDraftTemplate(templates.pocketMoneyCalendar, {
    importo: formatDraftItNumber(day)
  });
}

/**
 * Remunerazione: template + netto mensile + rate candidato (netto mensile / 26).
 * Il pocket ha voce separata nel Draft.
 * @returns {string}
 */
function buildDraftRemunerationText() {
  const templates = getDraftTemplates(AppState.draft || {});
  const calc = AppState.calculation;
  if (!calc) {
    return "—";
  }
  const nettoMensile =
    calc.nettoMensile != null ? Number(calc.nettoMensile) : Number(calc.netto);
  if (!Number.isFinite(nettoMensile) || nettoMensile <= 0) {
    return "—";
  }
  const rateCand = getRateCandidato26(nettoMensile);
  if (rateCand == null) {
    return "—";
  }
  return applyDraftTemplate(templates.remunerazione, {
    rate26: formatDraftItNumber(rateCand),
    netto: formatDraftItNumber(nettoMensile)
  });
}

/**
 * Straordinari: template aziendali + importo OT / manuale / formula 1/10.
 * @param {object} draft
 * @returns {string}
 */
function buildDraftOvertimeText(draft) {
  const templates = getDraftTemplates(draft || {});
  const otDraft = (draft && draft.overtime) || {};
  const mode = otDraft.mode || "auto";

  if (mode === "na") {
    return templates.straordinariNA;
  }
  if (mode === "formula10") {
    return templates.straordinariFormula10;
  }
  if (mode === "manual") {
    const manual = (otDraft.manualValue || "").trim();
    if (!manual) {
      return "—";
    }
    // Se l'utente ha già inserito una frase completa, usarla così com'è
    if (/[A-Za-z]{8,}/.test(manual) && !/^\d/.test(manual)) {
      return manual;
    }
    const rawImporto = manual.replace(/^Euro\s+/i, "").trim();
    const formatted = formatDraftItNumber(rawImporto);
    return applyDraftTemplate(templates.straordinariEuro, {
      importo: formatted || rawImporto
    });
  }

  // automatico da OT tecnico
  const ot = AppState.overtime;
  if (ot && ot.tecnico && Number.isFinite(Number(ot.tecnico.costoOrario))) {
    return applyDraftTemplate(templates.straordinariEuro, {
      importo: formatDraftItNumber(ot.tecnico.costoOrario)
    });
  }
  return "—";
}

/**
 * Costruisce le righe etichetta → valore del Draft Word da template aziendali.
 * @returns {Array<{label: string, value: string}>}
 */
function buildDraftWordRows() {
  const draft = AppState.draft || {};
  const templates = getDraftTemplates(draft);
  const labels = DRAFT_LABELS[getDraftLanguage(draft)];
  const project = draft.project || {};
  const schedule = draft.workSchedule || {};
  const rotation = draft.rotation || {};
  const accommodation = draft.accommodation || {};
  const transport = draft.localTransport || {};
  const mob = draft.mobDemob || {};
  const travel = draft.travelDays || {};
  const contract = draft.contract || {};

  // Periodo (template + date)
  let inizio = "—";
  let fine = "—";
  let durata = "—";
  if (project.periodoMode === "text") {
    const txt = (project.periodoTesto || "").trim();
    durata = txt
      ? txt + "\n" + templates.durataSuffix
      : "—";
  } else {
    const da = formatDraftDateIt(project.periodoDa);
    const a = formatDraftDateIt(project.periodoA);
    if (da) {
      inizio =
        applyDraftTemplate(templates.inizioPrefix, { data: da }) +
        "\n" +
        templates.inizioCompat;
    }
    if (a) {
      fine = applyDraftTemplate(templates.finePrefix, { data: a });
    }
    if (project.periodoDa && project.periodoA) {
      const d = formatDraftDuration(
        project.periodoDa,
        project.periodoA,
        getDraftLanguage(draft)
      );
      durata = d
        ? d + "\n" + templates.durataSuffix
        : "—";
    }
  }

  // Orario — template aziendali
  let orario = "—";
  if (schedule.mode === "custom") {
    orario = (schedule.custom || "").trim() || "—";
  } else if (schedule.mode === "60h6") {
    orario = templates.orario60;
  } else if (schedule.mode === "48h6") {
    orario = templates.orario48;
  } else if (schedule.mode === "40h5") {
    orario = templates.orario40;
  }

  // Turnazione
  let turnazione = "—";
  if (rotation.mode === "tbd") {
    turnazione = templates.turnazioneTBD;
  } else if (rotation.mode === "na") {
    turnazione = templates.turnazioneNA;
  } else {
    const schema = (rotation.value || "").trim();
    turnazione = schema
      ? applyDraftTemplate(templates.turnazioneDefinita, {
          schema: schema
        })
      : "—";
  }

  // Alloggio
  let alloggio = "—";
  if (accommodation.mode === "cliente") {
    alloggio = templates.alloggioCliente;
  } else if (accommodation.mode === "candidato") {
    alloggio = templates.alloggioCandidato;
  } else if (accommodation.mode === "contributo") {
    const detRaw = (accommodation.detail || "").trim();
    const formatted = formatDraftItNumber(detRaw);
    alloggio = applyDraftTemplate(templates.alloggioContributo, {
      importo: formatted || detRaw || "…"
    });
  } else if (accommodation.mode === "personalizzato") {
    alloggio = (accommodation.detail || "").trim() || "—";
  }

  // Trasporti
  let trasporti = "—";
  if (transport.mode === "cliente") {
    trasporti = templates.trasportiCliente;
  } else if (transport.mode === "candidato") {
    trasporti = templates.trasportiCandidato;
  } else if (transport.mode === "renting") {
    trasporti = templates.trasportiRenting;
  } else if (transport.mode === "personalizzato") {
    trasporti = (transport.detail || "").trim() || "—";
  }

  // Mob / Demob
  let mobText = "—";
  if (mob.mode === "na") {
    mobText = templates.mobNA;
  } else {
    mobText = templates.mobStandard;
  }
  if (mob.voliNostroCarico) {
    mobText =
      (mobText === templates.mobNA ? "" : mobText + "\n") +
      templates.mobVoli;
  }

  // Giorni viaggio
  let giorniViaggio = "—";
  if (travel.mode === "100") {
    giorniViaggio = templates.viaggio100;
  } else if (travel.mode === "50") {
    giorniViaggio = templates.viaggio50;
  } else if (travel.mode === "na") {
    giorniViaggio = templates.viaggioNA;
  }

  // Contratto
  const livello = contract.livello === "2" ? "2" : "1";
  const tipoContratto = applyDraftTemplate(templates.contratto, {
    livello: livello
  });

  const rows = [
    { label: labels.position, value: (project.posizione || "").trim() || "—" },
    { label: labels.location, value: (project.localita || "").trim() || "—" },
    { label: labels.project, value: (project.progetto || "").trim() || "—" },
    { label: labels.start, value: inizio },
    { label: labels.end, value: fine },
    { label: labels.duration, value: durata },
    { label: labels.hours, value: orario },
    { label: labels.rotation, value: turnazione },
    { label: labels.overtime, value: buildDraftOvertimeText(draft) },
    { label: labels.accommodation, value: alloggio },
    { label: labels.transport, value: trasporti }
  ];

  const pocketText = buildDraftPocketMoneyText();
  if (pocketText) {
    rows.push({ label: "Pocket Money", value: pocketText });
  }

  rows.push(
    { label: labels.mob, value: mobText },
    { label: labels.travel, value: giorniViaggio },
    { label: labels.contract, value: tipoContratto },
    {
      label: labels.remuneration,
      value: buildDraftRemunerationText()
    },
    { label: labels.note, value: templates.nota },
    { label: labels.probation, value: templates.periodoProva },
    { label: labels.notice, value: templates.periodoPreavviso },
    { label: labels.insurance1, value: templates.assicurazione1 },
    { label: labels.insurance2, value: templates.assicurazione2 }
  );

  return rows;
}

/**
 * Builder dedicato: titolo + tabella 2 colonne (template aziendali).
 * REV02.1 — layout allineato, data generazione, firma.
 * @param {object} docxLib - window.docx
 * @returns {{ title: object, table: object, children: Array }}
 */
function buildDraftWordSection(docxLib) {
  const {
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    BorderStyle,
    VerticalAlign
  } = docxLib;

  const FONT = DRAFT_WORD_FONT;
  const SIZE = DRAFT_WORD_SIZE;
  const language = getDraftLanguage(AppState.draft || {});
  const isEnglish = language === "en";
  // Larghezza utile A4 con margini 720 DXA: 11906 - 1440 = 10466
  const PAGE_CONTENT = 10466;
  const COL_LABEL = Math.round(PAGE_CONTENT * 0.3);
  const COL_VALUE = PAGE_CONTENT - COL_LABEL;

  const noBorder = {
    style: BorderStyle.NONE,
    size: 0,
    color: "FFFFFF"
  };
  const borders = {
    top: noBorder,
    bottom: noBorder,
    left: noBorder,
    right: noBorder
  };

  // Margini cella identici sx/dx → prima riga di testo allineata in alto
  const cellMargins = {
    top: 120,
    bottom: 160,
    left: 80,
    right: 120
  };

  function draftParagraphs(text, opts) {
    const o = opts || {};
    const raw = String(text == null || text === "" ? "—" : text);
    const lines = raw.split(/\n/);
    return lines.map(function (line, index) {
      return new Paragraph({
        spacing: {
          before: 0,
          after: index === lines.length - 1 ? 0 : 60,
          line: 276,
          lineRule: "auto"
        },
        children: [
          new TextRun({
            text: line,
            bold: !!o.bold,
            size: SIZE,
            font: FONT
          })
        ]
      });
    });
  }

  function draftCell(text, opts) {
    const o = opts || {};
    const cellOpts = {
      width: { size: o.width || COL_VALUE, type: WidthType.DXA },
      borders: borders,
      margins: cellMargins,
      children: draftParagraphs(text, o)
    };
    if (VerticalAlign && VerticalAlign.TOP) {
      cellOpts.verticalAlign = VerticalAlign.TOP;
    }
    return new TableCell(cellOpts);
  }

  const rows = buildDraftWordRows().map(function (row) {
    return new TableRow({
      children: [
        draftCell(row.label, { width: COL_LABEL, bold: true }),
        draftCell(row.value, { width: COL_VALUE, bold: false })
      ]
    });
  });

  const title = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [
      new TextRun({
        text: isEnglish ? "CONTRACT DRAFT" : "DRAFT DI CONTRATTO",
        bold: true,
        size: DRAFT_WORD_TITLE_SIZE,
        font: FONT
      })
    ]
  });

  const table = new Table({
    width: { size: PAGE_CONTENT, type: WidthType.DXA },
    columnWidths: [COL_LABEL, COL_VALUE],
    rows: rows
  });

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  const dataGenerazione = dd + "/" + mm + "/" + yyyy;

  const datePara = new Paragraph({
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({
        text: isEnglish ? "Draft Date:" : "Data generazione Draft:",
        bold: true,
        size: SIZE,
        font: FONT
      })
    ]
  });
  const dateValuePara = new Paragraph({
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: dataGenerazione,
        size: SIZE,
        font: FONT
      })
    ]
  });

  const signatureSpacer = new Paragraph({
    spacing: { before: 600, after: 200 },
    children: []
  });
  const signatureLine = new Paragraph({
    spacing: { before: 200, after: 120 },
    children: [
      new TextRun({
        text: "________________________________________",
        size: SIZE,
        font: FONT
      })
    ]
  });
  const signatureLabel = new Paragraph({
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: isEnglish ? "Candidate's signature" : "Firma del candidato",
        size: SIZE,
        font: FONT
      })
    ]
  });

  return {
    title: title,
    table: table,
    children: [
      title,
      table,
      datePara,
      dateValuePara,
      signatureSpacer,
      signatureLine,
      signatureLabel
    ]
  };
}

/**
 * Alias richiesto: paragrafi/sezione Draft per il Document.
 * @param {object} docxLib
 * @returns {Array}
 */
function buildDraftWordParagraphs(docxLib) {
  return buildDraftWordSection(docxLib).children;
}

/**
 * Esporta esclusivamente il Draft Tecnico in .docx (modificabile in Word).
 */
async function handleEsportaDraftWord() {
  if (!isDocxAvailable()) {
    window.alert(
      "Libreria Word non disponibile. Verificare che lib/docx.min.js sia presente."
    );
    return;
  }

  // Allinea AppState.draft al form prima dell'export
  syncDraftStateFromForm();

  if (!AppState.calculation) {
    const proceed = window.confirm(
      "Non risulta un calcolo costo personale.\n" +
        "La remunerazione nel Draft indicherà dati non disponibili.\n\n" +
        "Continuare comunque con l'export?"
    );
    if (!proceed) {
      return;
    }
  }

  const { Document, Packer } = window.docx;
  const section = buildDraftWordSection(window.docx);
  const draftLanguage = getDraftLanguage(AppState.draft || {});
  const isEnglish = draftLanguage === "en";

  const doc = new Document({
    creator: "Calcolo Costo Personale",
    title: isEnglish ? "CONTRACT DRAFT" : "DRAFT DI CONTRATTO",
    description: isEnglish
      ? "Technical contract draft"
      : "Draft Tecnico — bozza condizioni",
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children: section.children
      }
    ]
  });

  try {
    const blob = await Packer.toBlob(doc);
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName =
      (isEnglish ? "Contract_Draft_" : "Draft_Tecnico_") + stamp + ".docx";
    downloadBlob(blob, fileName);
  } catch (err) {
    console.error(err);
    window.alert("Errore durante la generazione del Draft Word: " + err.message);
  }
}

/**
 * Crea e scarica il file .docx professionale con input, passaggi e tabella.
 */
async function handleEsportaWord() {
  if (!lastResult) {
    window.alert("Eseguire prima un calcolo.");
    return;
  }

  if (!isDocxAvailable()) {
    window.alert(
      "Libreria Word non disponibile. Verificare che lib/docx.min.js sia presente."
    );
    return;
  }

  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    HeadingLevel,
    BorderStyle,
    ShadingType
  } = window.docx;

  const r = lastResult;
  const input = collectInputFromForm();

  // Colori stile aziendale (hex senza #)
  const BLUE = "0B2A4A";
  const GRAY = "F4F6F9";
  const ORANGE_BG = "FFF1E6";
  const GREEN_BG = "E8F6EE";
  const WHITE = "FFFFFF";

  /**
   * Cella tabella helper
   */
  function cell(text, opts) {
    const o = opts || {};
    return new TableCell({
      width: { size: o.width || 4500, type: WidthType.DXA },
      shading: o.shading
        ? { type: ShadingType.CLEAR, fill: o.shading }
        : undefined,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "D8DEE8" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "D8DEE8" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "D8DEE8" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "D8DEE8" }
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: String(text),
              bold: !!o.bold,
              color: o.color || "2C3544",
              size: o.size || 20,
              font: "Calibri"
            })
          ],
          alignment: o.align || AlignmentType.LEFT
        })
      ]
    });
  }

  /**
   * Riga a due colonne Voce | Importo
   */
  function dataRow(label, value, style) {
    const s = style || {};
    return new TableRow({
      children: [
        cell(label, {
          width: 5500,
          bold: !!s.bold,
          shading: s.shading,
          color: s.color
        }),
        cell(value, {
          width: 3500,
          bold: true,
          align: AlignmentType.RIGHT,
          shading: s.shading,
          color: s.color
        })
      ]
    });
  }

  // Intestazione tabella
  const headerRow = new TableRow({
    children: [
      cell("Voce", {
        width: 5500,
        bold: true,
        shading: BLUE,
        color: WHITE
      }),
      cell("Importo", {
        width: 3500,
        bold: true,
        shading: BLUE,
        color: WHITE,
        align: AlignmentType.RIGHT
      })
    ]
  });

  const tableRows = buildTableRows(r).map(function (row) {
    let style = {};
    if (row.rowClass === "row-margin") {
      style = { shading: ORANGE_BG, color: "C45C12", bold: true };
    } else if (row.rowClass === "row-final") {
      style = { shading: GREEN_BG, color: "1B7A4A", bold: true };
    }
    return dataRow(row.label, row.value, style);
  });

  // Paragrafi passaggi
  const stepParagraphs = r.steps.map(function (step, index) {
    return new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: index + 1 + ". " + step,
          size: 20,
          font: "Calibri",
          color: "2C3544"
        })
      ]
    });
  });

  // Sezione input inseriti
  const inputLines = [
    ["Tipo contratto", r.modeLabel],
    [r.mode === "europa-base" ? "Netto desiderato" : "Netto mensile", formatCurrency(input.netto)]
  ];

  if (r.mode === "europa-base") {
    inputLines.push(["Quota Base Assunzione", formatCurrency(input.quotaBase)]);
  } else {
    inputLines.push([
      r.mode === "europa" ? "Trasferta Europa" : "Trasferta Italia",
      formatCurrency(input.trasferta)
    ]);
  }

  inputLines.push(
    ["Pocket Money", formatCurrency(input.pocketMoney)],
    ["Rimborso Affitto", formatCurrency(input.rimborsoAffitto)],
    ["Rimborso Auto", formatCurrency(input.rimborsoAuto)],
    ["Margine %", formatPercent(input.marginePerc)],
    ["Costi struttura", formatCurrency(input.costiStruttura)],
    ["Moltiplicatore costo lavoro", String(input.moltiplicatore)]
  );

  const inputParagraphs = inputLines.map(function (pair) {
    return new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: pair[0] + ": ",
          bold: true,
          size: 20,
          font: "Calibri",
          color: BLUE
        }),
        new TextRun({
          text: pair[1],
          size: 20,
          font: "Calibri",
          color: "2C3544"
        })
      ]
    });
  });

  const doc = new Document({
    creator: "Calcolo Costo Personale",
    title: "CALCOLO COSTO PERSONALE",
    description: "Report calcolo costo personale — " + r.modeLabel,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children: [
          // Titolo
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: "CALCOLO COSTO PERSONALE",
                bold: true,
                color: BLUE,
                size: 36,
                font: "Calibri"
              })
            ]
          }),
          // Data
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: "Data: " + getItalianDate(),
                size: 22,
                font: "Calibri",
                color: "5A6577"
              })
            ]
          }),
          // Tipo contratto
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [
              new TextRun({
                text: "Tipo di contratto: ",
                size: 22,
                font: "Calibri",
                color: "5A6577"
              }),
              new TextRun({
                text: r.modeLabel,
                bold: true,
                size: 22,
                font: "Calibri",
                color: BLUE
              })
            ]
          }),

          // Sezione input
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 100, after: 160 },
            children: [
              new TextRun({
                text: "1. Parametri inseriti",
                bold: true,
                color: BLUE,
                size: 26,
                font: "Calibri"
              })
            ]
          }),
          ...inputParagraphs,

          // Sezione passaggi
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 280, after: 160 },
            children: [
              new TextRun({
                text: "2. Passaggi matematici",
                bold: true,
                color: BLUE,
                size: 26,
                font: "Calibri"
              })
            ]
          }),
          ...stepParagraphs,

          // Sezione tabella
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 280, after: 160 },
            children: [
              new TextRun({
                text: "3. Tabella riepilogativa",
                bold: true,
                color: BLUE,
                size: 26,
                font: "Calibri"
              })
            ]
          }),
          new Table({
            width: { size: 9000, type: WidthType.DXA },
            columnWidths: [5500, 3500],
            rows: [headerRow].concat(tableRows)
          }),

          // Risultati chiave
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 320, after: 160 },
            children: [
              new TextRun({
                text: "4. Risultati principali",
                bold: true,
                color: BLUE,
                size: 26,
                font: "Calibri"
              })
            ]
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: "Totale costo: ",
                bold: true,
                size: 22,
                font: "Calibri"
              }),
              new TextRun({
                text: formatCurrency(r.totaleCosto),
                size: 22,
                font: "Calibri"
              })
            ]
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: "Margine: ",
                bold: true,
                size: 22,
                font: "Calibri",
                color: "C45C12"
              }),
              new TextRun({
                text: formatCurrency(r.margine),
                size: 22,
                font: "Calibri",
                color: "C45C12"
              })
            ]
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: "Prezzo finale: ",
                bold: true,
                size: 24,
                font: "Calibri",
                color: "1B7A4A"
              }),
              new TextRun({
                text: formatCurrency(r.prezzoFinale),
                bold: true,
                size: 24,
                font: "Calibri",
                color: "1B7A4A"
              })
            ]
          }),

          // -------- SEZIONE OVERTIME (se calcolata) --------
          ...buildOvertimeWordParagraphs(window.docx, BLUE),

          // Footer documento
          new Paragraph({
            spacing: { before: 400 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "Documento generato automaticamente — Calcolo Costo Personale",
                italics: true,
                size: 16,
                font: "Calibri",
                color: "5A6577"
              })
            ]
          })
        ]
      }
    ]
  });

  try {
    const blob = await Packer.toBlob(doc);
    const fileName =
      "Calcolo_Costo_Personale_" +
      r.mode +
      "_" +
      getFileDateStamp() +
      ".docx";
    downloadBlob(blob, fileName);
  } catch (err) {
    console.error(err);
    window.alert("Errore durante la generazione del file Word: " + err.message);
  }
}

/**
 * Scarica un Blob come file sul computer dell'utente (senza librerie esterne)
 * @param {Blob} blob
 * @param {string} fileName
 */
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoca dopo un breve delay per compatibilità Safari
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1500);
}

/* =============================================================================
   11. INIZIALIZZAZIONE
   ============================================================================= */

/**
 * Collega tutti gli event listener e imposta lo stato iniziale
 */
function initApp() {
  // Meta AppState
  if (!AppState.meta.dataCreazione) {
    AppState.meta.dataCreazione = new Date().toISOString();
  }

  // Data in header
  const dataEl = document.getElementById("dataCorrente");
  if (dataEl) {
    dataEl.textContent = getItalianDate();
  }

  // Navigazione SPA (tab)
  document.querySelectorAll(".nav-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      switchView(tab.getAttribute("data-view"));
    });
  });

  const btnVaiACosto = document.getElementById("btnVaiACosto");
  if (btnVaiACosto) {
    btnVaiACosto.addEventListener("click", function () {
      switchView("costo");
    });
  }

  // Pulsanti modalità contratto
  document.querySelectorAll(".contract-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const mode = btn.getAttribute("data-mode");
      applyMode(mode, { resetDefaults: true });
    });
  });

  // Form: Calcola costo (REV0)
  document.getElementById("formCalcolo").addEventListener("submit", handleCalcola);

  // Anteprima informativa Rate candidato (Netto / 26) — non entra nei calcoli
  const nettoInput = document.getElementById("netto");
  if (nettoInput) {
    nettoInput.addEventListener("input", refreshRateCandidatoPreview);
    nettoInput.addEventListener("change", refreshRateCandidatoPreview);
  }

  // Reset costo
  document.getElementById("btnReset").addEventListener("click", handleReset);

  // Esporta Word (da entrambe le viste)
  document
    .getElementById("btnEsportaWord")
    .addEventListener("click", function () {
      handleEsportaWord();
    });
  const btnWordOt = document.getElementById("btnEsportaWordOt");
  if (btnWordOt) {
    btnWordOt.addEventListener("click", function () {
      handleEsportaWord();
    });
  }

  // Form overtime
  const formOt = document.getElementById("formOvertime");
  if (formOt) {
    formOt.addEventListener("submit", handleCalcolaOvertime);
  }
  const btnResetOt = document.getElementById("btnResetOvertime");
  if (btnResetOt) {
    btnResetOt.addEventListener("click", handleResetOvertime);
  }

  // Toggle giorni Calendar (tecnico e cliente indipendenti)
  document
    .querySelectorAll('input[name="otMetodoTecnico"], input[name="otMetodoCliente"]')
    .forEach(function (radio) {
      radio.addEventListener("change", syncCalendarDaysVisibility);
    });

  // Overtime calcolo manuale (standalone)
  document.querySelectorAll('input[name="otMetodoManuale"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      syncManualOvertimeVisibility();
      refreshOvertimeImportedPanel();
    });
  });
  const otRateManuale = document.getElementById("otRateManuale");
  if (otRateManuale) {
    otRateManuale.addEventListener("input", refreshOvertimeImportedPanel);
    otRateManuale.addEventListener("change", refreshOvertimeImportedPanel);
  }

  // Draft Tecnico (FASE A + B)
  initDraftModule();
  const btnDraftWord = document.getElementById("btnEsportaDraftWord");
  if (btnDraftWord) {
    btnDraftWord.addEventListener("click", function () {
      handleEsportaDraftWord();
    });
  }

  // Modalità iniziale Italia (default già nel markup)
  applyMode("italia", { resetDefaults: true });
  refreshRateCandidatoPreview();

  // Vista iniziale + pannello overtime
  switchView("costo");
  syncCalendarDaysVisibility();
  syncManualOvertimeVisibility();
  refreshOvertimeImportedPanel();
  refreshDraftBindings();

  // REV03+ — hook bootstrap (moduli ES caricati da modules/bootstrap.js)
  registerRev03Modules();

  // Avviso se manca la libreria docx (l'app resta comunque usabile)
  if (!isDocxAvailable()) {
    console.warn(
      "[Calcolo Costo Personale] lib/docx.min.js non caricata: export Word disabilitato fino al ripristino del file."
    );
  }
}

/**
 * Registra i moduli REV03+ via ES dynamic import.
 * script.js resta il bootstrap legacy; la logica nuova vive nei moduli.
 * Non alterare formule / overtime / draft / Word.
 */
function registerRev03Modules() {
  import("./modules/cvManager.js")
    .then(function (mod) {
      if (mod && typeof mod.initCvManager === "function") {
        mod.initCvManager(AppState);
      }
    })
    .catch(function (err) {
      console.warn(
        "[REV03] CV Manager non caricato (serve HTTP locale o Pages, non file://):",
        err
      );
    });

  // Cache-bust: evita UI/state JS obsoleti in cache browser dopo refactor
  import("./modules/clientOffer/index.js?v=rev04-margin-fix-20260828")
    .then(function (mod) {
      if (mod && typeof mod.refreshClientOfferView === "function") {
        window.__refreshClientOffer = mod.refreshClientOfferView;
      }
      try {
        if (mod && typeof mod.initClientOffer === "function") {
          mod.initClientOffer(AppState);
        }
      } catch (err) {
        console.error("[ClientOffer] init fallita:", err);
      }
    })
    .catch(function (err) {
      console.warn(
        "[ClientOffer] modulo non caricato (serve HTTP locale, non file://):",
        err
      );
    });
}

// Avvio sicuro a DOM pronto
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
