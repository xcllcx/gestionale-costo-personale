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
   2. STATO APPLICAZIONE
   ============================================================================= */

/** Modalità corrente: "italia" | "europa" | "europa-base" */
let currentMode = "italia";

/** Ultimo risultato di calcolo REV0 (necessario per export Word e UI costo) */
let lastResult = null;

/**
 * Memoria globale dell'ultimo calcolo costo.
 * Aggiornata a ogni CALCOLA. La schermata Overtime legge SOLO da qui.
 * @type {null | {
 *   tipoContratto: string,
 *   mode: string,
 *   netto: number,
 *   parteTassata: number,
 *   costoLavoro: number,
 *   trasferta: number,
 *   pocketMoney: number,
 *   affitto: number,
 *   auto: number,
 *   costiStruttura: number,
 *   margine: number,
 *   marginePerc: number,
 *   totaleCosto: number,
 *   prezzoFinale: number,
 *   rate26: number,
 *   rate30: number,
 *   rate217: number,
 *   quotaBase: number|null,
 *   differenza: number|null,
 *   moltiplicatore: number,
 *   fullResult: object
 * }}
 */
let currentCalculation = null;

/** Ultimo risultato overtime (indipendente dalla REV0) */
let lastOvertime = null;

/** Vista SPA attiva: "costo" | "overtime" */
let currentView = "costo";

/** Default overtime (solo valori orari — nessuna ore straordinarie) */
const OVERTIME_DEFAULTS = Object.freeze({
  oreLavorative: 10,
  metodo: "working",
  maggiorazione: 1,
  giorniCalendar: 30
});

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
  rows.push({ label: "Netto", value: formatCurrency(result.netto) });

  // Campi aggiuntivi solo per Europa Base Assunzione (chiarezza del calcolo)
  if (result.mode === "europa-base") {
    rows.push({
      label: "Quota Base Assunzione",
      value: formatCurrency(result.quotaBase)
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
  lastResult = null;
  currentCalculation = null;
  lastOvertime = null;
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

  const input = collectInputFromForm();
  const validation = validateInput(input);

  if (!validation.ok) {
    window.alert(validation.message);
    document.getElementById("netto").focus();
    return;
  }

  try {
    const result = calcolaPerModalita(currentMode, input);
    lastResult = result;
    // Aggiorna memoria globale per Overtime (REV0 intatta)
    syncCurrentCalculation(result);
    lastOvertime = null;
    clearOvertimeResultsView();
    renderResults(result);
    refreshOvertimeImportedPanel();
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
  document.getElementById("netto").focus();
}

/* =============================================================================
   9b. MEMORIA GLOBALE currentCalculation + NAVIGAZIONE SPA
   ============================================================================= */

/**
 * Popola currentCalculation dall'ultimo risultato REV0.
 * Non altera i valori: solo li espone con chiavi stabili per Overtime.
 * @param {object} result - output di calcolaItalia / Europa / Estero
 */
function syncCurrentCalculation(result) {
  currentCalculation = {
    tipoContratto: result.modeLabel,
    mode: result.mode,
    netto: result.netto,
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
    fullResult: result
  };
}

/**
 * Cambia vista SPA senza reload e senza perdere i dati dei form.
 * @param {"costo"|"overtime"} view
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

  if (view === "overtime") {
    refreshOvertimeImportedPanel();
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
 * OVERTIME TECNICO — costo orario (€/ora)
 *
 * Working:  (Netto / 26) / oreLavorative × maggiorazione
 * Calendar: (Netto / giorniCalendar) / oreLavorative × maggiorazione
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

  if (metodo === "working") {
    quotaGiornaliera = calc.netto / 26;
    steps.push(
      "Metodo tecnico: Working days"
    );
    steps.push(
      "Quota giornaliera = Netto ÷ 26 = " +
        formatCurrency(calc.netto) +
        " ÷ 26 = " +
        formatCurrency(quotaGiornaliera)
    );
  } else {
    quotaGiornaliera = calc.netto / giorniCalendar;
    steps.push(
      "Metodo tecnico: Calendar days (" + giorniCalendar + " gg)"
    );
    steps.push(
      "Quota giornaliera = Netto ÷ Giorni calendar = " +
        formatCurrency(calc.netto) +
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
    quotaGiornaliera,
    costoOrarioBase,
    costoOrario,
    steps
  };
}

/**
 * OVERTIME CLIENTE — prezzo orario (€/ora)
 *
 * Working:  Rate26 / oreLavorative × maggiorazione
 * Calendar: getEquivalent26Rate(Rate30, giorni) / oreLavorative × maggiorazione
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
  let rateEquivalente26 = null;
  let valoreMensileCalendar = null;
  let prezzoOrarioBase = 0;

  if (metodo === "working") {
    prezzoOrarioBase = calc.rate26 / oreLavorative;
    steps.push("Metodo cliente: Working days");
    steps.push(
      "Prezzo orario base = Rate26 ÷ Ore lavorative = " +
        formatCurrency(calc.rate26) +
        " ÷ " +
        oreLavorative +
        " = " +
        formatHourly(prezzoOrarioBase)
    );
  } else {
    // Rate Calendar: Rate30 × giorni → equivalente 26 → / ore
    const rateCalendar = calc.rate30;
    valoreMensileCalendar = rateCalendar * giorniCalendar;
    rateEquivalente26 = getEquivalent26Rate(rateCalendar, giorniCalendar);
    prezzoOrarioBase = rateEquivalente26 / oreLavorative;

    steps.push("Metodo cliente: Calendar days (" + giorniCalendar + " gg)");
    steps.push(
      "Valore mensile = Rate30 × Giorni calendar = " +
        formatCurrency(rateCalendar) +
        " × " +
        giorniCalendar +
        " = " +
        formatCurrency(valoreMensileCalendar)
    );
    steps.push(
      "Rate equivalente 26 = getEquivalent26Rate(rate, giorni) = (" +
        formatCurrency(rateCalendar) +
        " × " +
        giorniCalendar +
        ") ÷ 26 = " +
        formatCurrency(rateEquivalente26)
    );
    steps.push(
      "Prezzo orario base = Rate equivalente 26 ÷ Ore lavorative = " +
        formatCurrency(rateEquivalente26) +
        " ÷ " +
        oreLavorative +
        " = " +
        formatHourly(prezzoOrarioBase)
    );
  }

  const prezzoOrario = prezzoOrarioBase * fattoreMagg;
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
    giorniCalendar: metodo === "calendar" ? giorniCalendar : null,
    fattoreMagg,
    maggLabel: labelMaggiorazione(fattoreMagg),
    rateEquivalente26,
    valoreMensileCalendar,
    prezzoOrarioBase,
    prezzoOrario,
    steps
  };
}

/**
 * Orchestratore: tecnico + cliente indipendenti + margine orario.
 * @returns {object|null}
 */
function calcolaOvertimeCompleto() {
  if (!currentCalculation) {
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
    currentCalculation,
    metodoTecnico,
    giorniTecnico,
    oreLavorative,
    maggTecnico
  );
  const cliente = calcolaOvertimeCliente(
    currentCalculation,
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
    imported: {
      tipoContratto: currentCalculation.tipoContratto,
      netto: currentCalculation.netto,
      prezzoFinale: currentCalculation.prezzoFinale,
      rate26: currentCalculation.rate26,
      rate30: currentCalculation.rate30,
      rate217: currentCalculation.rate217
    }
  };
}

/**
 * Aggiorna pannello dati importati + mostra/nasconde contenuto overtime
 */
function refreshOvertimeImportedPanel() {
  const hasCalc = !!currentCalculation;
  setVisible("otMissingCard", !hasCalc);
  setVisible("otContent", hasCalc);

  if (!hasCalc) {
    return;
  }

  document.getElementById("otImpTipo").textContent = currentCalculation.tipoContratto;
  document.getElementById("otImpNetto").textContent = formatCurrency(
    currentCalculation.netto
  );
  document.getElementById("otImpPrezzoFinale").textContent = formatCurrency(
    currentCalculation.prezzoFinale
  );
  document.getElementById("otImpRate26").textContent = formatCurrency(
    currentCalculation.rate26
  );
  document.getElementById("otImpRate30").textContent = formatCurrency(
    currentCalculation.rate30
  );
  document.getElementById("otImpRate217").textContent = formatCurrency(
    currentCalculation.rate217
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

  lastOvertime = null;
  clearOvertimeResultsView();
  syncCalendarDaysVisibility();
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

  if (!currentCalculation) {
    window.alert(
      "Eseguire prima un calcolo nella scheda Calcolo costo personale."
    );
    switchView("costo");
    return;
  }

  try {
    const ot = calcolaOvertimeCompleto();
    lastOvertime = ot;
    renderOvertimeResults(ot);
  } catch (err) {
    console.error(err);
    window.alert(err.message || "Errore durante il calcolo overtime.");
  }
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

  // Modalità iniziale Italia (default già nel markup)
  applyMode("italia", { resetDefaults: true });

  // Vista iniziale + pannello overtime
  switchView("costo");
  syncCalendarDaysVisibility();
  refreshOvertimeImportedPanel();

  // Avviso se manca la libreria docx (l'app resta comunque usabile)
  if (!isDocxAvailable()) {
    console.warn(
      "[Calcolo Costo Personale] lib/docx.min.js non caricata: export Word disabilitato fino al ripristino del file."
    );
  }
}

// Avvio sicuro a DOM pronto
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
