/**
 * Offerta Cliente — UI semplificata + template Word + download diretto.
 */

import {
  ensureClientOfferState,
  resetClientOfferState,
  saveClientOfferToStorage,
  loadClientOfferFromStorage,
  markManualLock,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  createDefaultClientOfferState,
  cloneJson,
  allocateNextSequenceNumber,
  getLastSequenceNumber,
  setLastSequenceNumber,
  peekNextSequenceNumber,
  CLIENT_OFFER_TEMPLATE_KEY
} from "./state.js";
import { importFromModules } from "./import.js";
import {
  buildSummary,
  computeDailyPocketMoney,
  computeOfferDailyRate,
  sanitizeWindowsFileName,
  applyClientManualNaming,
  syncAutoProposalNaming,
  migrateLegacyProposalNaming,
  applyNormalizedRotation,
  validateOfferForWord,
  applyResolvedOfferRate
} from "./transform.js";
import {
  generateClientOfferDocx,
  downloadOfferBlob,
  arrayBufferToBlob,
  ensureWordLibs,
  listPlaceholdersInXml,
  templateCoversWorkingHours,
  templateCoversDailyRate
} from "./wordGenerator.js";

/** @type {object|null} */
let appStateRef = null;
/** @type {ArrayBuffer|null} */
let templateBuffer = null;
/** @type {boolean} */
let autoImportDone = false;

export function initClientOfferUi(appState) {
  appStateRef = appState;
  ensureClientOfferState(appState);
  // Migrazione: stato v1 poteva avere client; v2 no — ripristina sezioni mancanti
  const s = ensureClientOfferState(appState);
  if (!s.offer) s.offer = createDefaultClientOfferState().offer;
  if (!s.service) s.service = createDefaultClientOfferState().service;
  if (!s.remuneration) s.remuneration = createDefaultClientOfferState().remuneration;
  if (!s.overtime) s.overtime = createDefaultClientOfferState().overtime;
  if (!s.accommodation) s.accommodation = createDefaultClientOfferState().accommodation;
  if (!s.transportation) s.transportation = createDefaultClientOfferState().transportation;
  if (!s.logistics) s.logistics = createDefaultClientOfferState().logistics;
  if (!s.rotation) s.rotation = createDefaultClientOfferState().rotation;
  if (!s.dates) s.dates = createDefaultClientOfferState().dates;
  if (!s.template) s.template = createDefaultClientOfferState().template;
  if (!s.manualLocks) s.manualLocks = {};
  if (!s.meta) s.meta = createDefaultClientOfferState().meta;
  if (!s.client) s.client = createDefaultClientOfferState().client;
  if (s.meta.proposalNumberManuallyEdited == null) {
    s.meta.proposalNumberManuallyEdited = false;
  }
  if (s.meta.fileNameManuallyEdited == null) {
    s.meta.fileNameManuallyEdited = false;
  }
  if (s.meta.currentSequenceNumber === undefined) {
    s.meta.currentSequenceNumber = null;
  }

  hydrateTemplateFromStorage();
  migrateLegacyProposalNaming(s);
  applyNormalizedRotation(s, appStateRef && appStateRef.draft);
  // Consenti re-bind dopo hot-reload / cache-bust
  const form = $("formClientOffer");
  if (form) form.dataset.bound = "";
  bindEvents();
  syncFormFromState();
  updateClientOfferConditionalFields();
  refreshSummary();
  refreshSequenceSettingsUi();
  setStatus(
    templateBuffer
      ? "Modulo Offerta Cliente pronto. Template: " + templateLabel()
      : "Caricare il template aziendale (B) per generare l’offerta Word."
  );
}

/**
 * Chiamato all'apertura tab — auto-import senza sovrascrivere edit manuali.
 */
export function refreshClientOfferView() {
  if (!appStateRef) return;
  const s = state();
  if (!autoImportDone) {
    const r = importFromModules(appStateRef, s, { force: false });
    autoImportDone = true;
    refreshProposalNamingFields();
    setStatus(r.message);
  }
  syncFormFromState();
  updateClientOfferConditionalFields();
  refreshSummary();
  refreshSequenceSettingsUi();
}

function state() {
  return ensureClientOfferState(appStateRef);
}

function $(id) {
  return document.getElementById(id);
}

function setStatus(msg) {
  const el = $("coStatus");
  if (el) el.textContent = msg || "";
}

function templateLabel() {
  const t = state().template;
  return t && t.name ? t.name : "nessuno";
}

function bindEvents() {
  const form = $("formClientOffer");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  form.addEventListener("input", onFormChange);
  form.addEventListener("change", onFormChange);

  bindClick("btnCoUpdateModules", function () {
    const r = importFromModules(appStateRef, state(), { force: true });
    refreshProposalNamingFields();
    syncFormFromState();
    updateClientOfferConditionalFields();
    persist();
    refreshSummary();
    setStatus(r.message);
  });

  bindClick("btnCoNewOffer", function () {
    startNewOffer();
  });

  bindClick("btnCoReset", function () {
    if (
      !window.confirm(
        "Reset offerta? I campi verranno svuotati; il numero progressivo resta lo stesso."
      )
    ) {
      return;
    }
    resetClientOfferState(appStateRef);
    autoImportDone = false;
    refreshProposalNamingFields();
    syncFormFromState();
    updateClientOfferConditionalFields();
    persist();
    refreshSummary();
    refreshSequenceSettingsUi();
    setStatus(
      "Offerta resettata (progressivo invariato). Template: " + templateLabel()
    );
  });

  bindClick("btnCoUseNextNumber", function () {
    const s = state();
    const next = allocateNextSequenceNumber();
    s.meta.currentSequenceNumber = next;
    s.meta.proposalNumberManuallyEdited = false;
    s.meta.fileNameManuallyEdited = false;
    refreshProposalNamingFields();
    syncFormFromState();
    persist();
    refreshSummary();
    refreshSequenceSettingsUi();
    setStatus("Usato prossimo numero: " + next);
  });

  bindClick("btnCoRegenName", function () {
    const s = state();
    s.meta.proposalNumberManuallyEdited = false;
    s.meta.fileNameManuallyEdited = false;
    if (s.meta.currentSequenceNumber == null) {
      setStatus(
        "Nessun progressivo associato. Usare «Nuova offerta» o «Usa prossimo numero»."
      );
      return;
    }
    refreshProposalNamingFields();
    syncFormFromState();
    persist();
    refreshSummary();
    setStatus("Nome Proposal Number rigenerato automaticamente.");
  });

  bindClick("btnCoSuggestProposal", function () {
    const s = state();
    s.meta.proposalNumberManuallyEdited = false;
    s.meta.fileNameManuallyEdited = false;
    if (s.meta.currentSequenceNumber == null) {
      s.meta.currentSequenceNumber = peekNextSequenceNumber();
    }
    refreshProposalNamingFields();
    syncFormFromState();
    persist();
    refreshSummary();
  });

  bindClick("btnCoSaveLastSequence", function () {
    const el = $("coLastSequenceNumber");
    const n = el ? Number(el.value) : NaN;
    if (!Number.isFinite(n) || n < 0) {
      setStatus("Inserire un ultimo numero offerta valido (es. 239).");
      return;
    }
    setLastSequenceNumber(n);
    refreshSequenceSettingsUi();
    setStatus(
      "Ultimo numero salvato: " +
        getLastSequenceNumber() +
        " → prossima Nuova offerta: " +
        peekNextSequenceNumber()
    );
  });

  bindClick("btnCoDownloadWord", async function () {
    await downloadOffer();
  });

  bindClick("btnCoCaricaTemplate", function () {
    const input = $("coTemplateInput");
    if (input) input.click();
  });
  bindClick("btnCoSostituisciTemplate", function () {
    const input = $("coTemplateInput");
    if (input) input.click();
  });
  bindClick("btnCoRimuoviTemplate", function () {
    templateBuffer = null;
    state().template = {
      name: "",
      size: 0,
      loadedAt: "",
      hasBuffer: false
    };
    try {
      localStorage.removeItem(CLIENT_OFFER_TEMPLATE_KEY);
    } catch (_) {}
    refreshTemplateMeta();
    persist();
    setStatus("Template rimosso.");
  });
  const input = $("coTemplateInput");
  if (input) {
    input.addEventListener("change", async function () {
      const file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      if (!/\.docx$/i.test(file.name)) {
        setStatus("Solo file .docx consentiti.");
        return;
      }
      const buf = await file.arrayBuffer();
      persistTemplate(file.name, file.size, buf);
      refreshTemplateMeta();
      try {
        await ensureWordLibs();
      } catch (_) {}
      setStatus(describeUploadedTemplate(buf, file.name));
    });
  }
}

function bindClick(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("click", function (ev) {
    ev.preventDefault();
    Promise.resolve(fn()).catch(function (err) {
      console.error(err);
      setStatus("Errore: " + (err && err.message ? err.message : err));
    });
  });
}

function onFormChange(ev) {
  const t = ev.target;
  if (!t || !t.name) return;
  syncStateFromForm();
  markLocksFromElement(t);

  const s = state();
  if (t.id === "coProposalNumber" || t.name === "coProposalNumber") {
    s.meta.proposalNumberManuallyEdited = true;
  }
  if (t.id === "coFileName" || t.name === "coFileName") {
    s.meta.fileNameManuallyEdited = true;
  }

  if (
    t.name === "coMonthlyPocket" ||
    t.name === "coSelectedRate" ||
    t.name === "coPocketMode" ||
    t.name === "coRateType" ||
    t.name === "coMonthlyLump"
  ) {
    if (t.name === "coRateType") {
      updateRemunerationFieldsByRateType({ fromUserTypeChange: true });
      persist();
      refreshSummary();
      return;
    }
    if (t.name === "coMonthlyPocket") {
      s.remuneration.dailyPocketMoney = computeDailyPocketMoney(
        s.remuneration.monthlyPocketMoney
      );
      const dailyEl = $("coDailyPocket");
      if (dailyEl) dailyEl.value = String(s.remuneration.dailyPocketMoney || 0);
    }
    if (t.name === "coMonthlyLump") {
      const monthly = numOrNull(val("coMonthlyLump"));
      s.remuneration.monthlyLumpSumRate = monthly;
      s.remuneration.selectedClientRate = monthly;
      s.remuneration.offerDailyRate = null;
      setVal("coSelectedRate", monthly);
      setVal("coOfferRate", "");
    }
    if (
      (t.name === "coMonthlyPocket" || t.name === "coSelectedRate") &&
      s.remuneration.rateType !== "lumpSum" &&
      s.remuneration.selectedClientRate != null &&
      !isLockedPath("remuneration.offerDailyRate")
    ) {
      // Aggiorna anche i rate importati se l'utente modifica il valore sorgente
      if (t.name === "coSelectedRate") {
        const typed = s.remuneration.selectedClientRate;
        if (s.remuneration.rateType === "working") {
          s.remuneration.importedWorkingRate = typed;
        } else {
          s.remuneration.importedCalendarRate = typed;
        }
      }
      const proposed = computeOfferDailyRate(
        s.remuneration.selectedClientRate,
        s.remuneration.dailyPocketMoney
      );
      if (proposed != null) {
        s.remuneration.offerDailyRate = proposed;
        const offerEl = $("coOfferRate");
        if (offerEl) offerEl.value = String(proposed);
      }
    }
  }

  const namingIds = {
    coPosition: 1,
    coSubject: 1,
    coLocation: 1,
    coActivityLocation: 1,
    coClientName: 1
  };
  if (namingIds[t.id] || namingIds[t.name]) {
    refreshProposalNamingFields();
  }

  updateClientOfferConditionalFields();
  persist();
  refreshSummary();
}

function refreshProposalNamingFields() {
  const s = state();
  syncAutoProposalNaming(s);
  setVal("coProposalNumber", s.offer.proposalNumber);
  setVal("coFileName", s.offer.fileName);
}

function refreshSequenceSettingsUi() {
  const el = $("coLastSequenceNumber");
  if (el && document.activeElement !== el) {
    el.value = String(getLastSequenceNumber());
  }
  const hint = $("coSequenceHint");
  if (hint) {
    const cur = state().meta.currentSequenceNumber;
    hint.textContent =
      "Ultimo usato: " +
      getLastSequenceNumber() +
      " · Prossima Nuova offerta: " +
      peekNextSequenceNumber() +
      (cur != null ? " · Corrente: " + cur : "");
  }
}

/**
 * Nuova offerta: incrementa progressivo, pulisce stato, importa moduli, costruisce nome.
 */
function startNewOffer() {
  const prevTemplate = state().template;
  const nextSeq = allocateNextSequenceNumber();
  const next = createDefaultClientOfferState();
  if (prevTemplate && prevTemplate.hasBuffer) {
    next.template = cloneJson(prevTemplate);
  }
  next.meta.currentSequenceNumber = nextSeq;
  next.meta.proposalNumberManuallyEdited = false;
  next.meta.fileNameManuallyEdited = false;
  appStateRef.clientOffer = next;
  autoImportDone = true;
  const r = importFromModules(appStateRef, next, { force: true });
  syncAutoProposalNaming(next, { force: true });
  syncFormFromState();
  updateClientOfferConditionalFields();
  persist();
  refreshSummary();
  refreshSequenceSettingsUi();
  setStatus(
    "Nuova offerta " +
      nextSeq +
      ". " +
      (r.message || "") +
      " Proposal: " +
      (next.offer.proposalNumber || "—")
  );
}

function isLockedPath(path) {
  return !!(state().manualLocks && state().manualLocks[path]);
}

function markLocksFromElement(el) {
  const map = {
    coSubject: "offer.subject",
    coLocation: "offer.location",
    coProposalNumber: "offer.proposalNumber",
    coPosition: "service.position",
    coAssigned: "service.assignedCandidate",
    coActivityLocation: "service.activityLocation",
    coClientName: "client.name",
    coClientAddress1: "client.address1",
    coClientAddress2: "client.address2",
    coContactTitle: "client.contactTitle",
    coContactName: "client.contactName",
    coContactSurname: "client.contactSurname",
    coSelectedRate: "remuneration",
    coMonthlyPocket: "remuneration",
    coDailyPocket: "remuneration",
    coOfferRate: "remuneration.offerDailyRate",
    coPocketMode: "remuneration",
    coOtMs: "overtime",
    coOtSun: "overtime",
    coRotMode: "rotation",
    coRotWork: "rotation",
    coRotRest: "rotation",
    coStartDate: "dates.startDate",
    coEndDate: "dates.endDate"
  };
  if (map[el.name] || map[el.id]) {
    markManualLock(state(), map[el.name] || map[el.id]);
  }
}

/**
 * Visibilità campi condizionali (centralizzata).
 */
export function updateClientOfferConditionalFields() {
  const accMode = val("coAccMode");
  const trMode = val("coTrMode");
  const travel = val("coTravelDay");
  const ticket = val("coTicket");
  const mob = val("coMob");
  const rot = val("coRotMode");
  const startMode = val("coStartMode");
  const endMode = val("coEndMode");
  const otMode = val("coOtMode");
  const ownCar = !!($("coOwnCar") || {}).checked;
  const combined = !!($("coCombinedLump") || {}).checked;

  setHidden("coAccLumpWrap", accMode !== "our_lump");
  setHidden("coAccCustomWrap", accMode !== "custom");
  setHidden("coTrLumpWrap", trMode !== "our_lump");
  setHidden("coTrCustomWrap", trMode !== "custom");
  setHidden("coTravelCustomWrap", travel !== "custom");
  setHidden("coTicketCustomWrap", ticket !== "custom");
  setHidden("coMobCustomWrap", mob !== "custom");
  setHidden("coOwnCarKmWrap", !ownCar);
  setHidden("coCombinedWrap", !combined);
  setHidden("coOtCustomWrap", otMode !== "custom");

  const showRotNums = rot === "defined";
  const showRotCustom = rot === "custom";
  setHidden("coRotWorkWrap", !showRotNums);
  setHidden("coRotRestWrap", !showRotNums);
  setHidden("coRotCustomWrap", !showRotCustom);

  setHidden("coStartManualWrap", startMode !== "manual");
  setHidden("coEndManualWrap", endMode !== "manual");

  updateRemunerationFieldsByRateType({ syncOnlyVisibility: true });
}

/**
 * Aggiorna label/visibilità e valori remunerazione in base al Rate Type.
 * Centralizzata: nessun listener duplicato.
 * @param {{ fromUserTypeChange?: boolean, syncOnlyVisibility?: boolean }} [opts]
 */
export function updateRemunerationFieldsByRateType(opts) {
  const options = opts || {};
  const s = state();
  if (!s || !s.remuneration) return;
  const rem = s.remuneration;
  const rateType = val("coRateType") || rem.rateType || "calendar";
  rem.rateType = rateType;

  const isLump = rateType === "lumpSum";
  const isWorking = rateType === "working";

  const labelEl = $("coSelectedRateLabel");
  if (labelEl) {
    if (isLump) labelEl.textContent = "Monthly Rate";
    else if (isWorking) labelEl.textContent = "Working Rate";
    else labelEl.textContent = "Calendar Rate";
  }

  setHidden("coOfferRateWrap", isLump);
  setHidden("coDailyPocketWrap", isLump);
  setHidden("coMonthlyLumpWrap", !isLump);
  // Per Lump Sum il campo selected mostra lo stesso monthly (o campo dedicato)
  setHidden("coSelectedRateWrap", isLump);

  if (options.syncOnlyVisibility) return;

  if (options.fromUserTypeChange) {
    applyResolvedOfferRate(rem);
    setVal("coSelectedRate", rem.selectedClientRate);
    setVal("coOfferRate", rem.offerDailyRate);
    setVal("coMonthlyLump", rem.monthlyLumpSumRate);
    setVal("coDailyPocket", rem.dailyPocketMoney);
    setVal("coMonthlyPocket", rem.monthlyPocketMoney);
  }

  // Allinea monthly lump field se presente
  if (isLump) {
    const monthly =
      rem.monthlyLumpSumRate != null
        ? rem.monthlyLumpSumRate
        : rem.selectedClientRate;
    if (monthly != null) {
      rem.monthlyLumpSumRate = monthly;
      rem.selectedClientRate = monthly;
      rem.offerDailyRate = null;
      setVal("coMonthlyLump", monthly);
      setVal("coSelectedRate", monthly);
      setVal("coOfferRate", "");
    }
  }
}

function setHidden(id, hidden) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle("hidden", !!hidden);
}

function persist() {
  saveClientOfferToStorage(state());
}

function val(id) {
  const el = $(id);
  return el ? el.value : "";
}

function setVal(id, value) {
  const el = $(id);
  if (!el) return;
  if (el.type === "checkbox") el.checked = !!value;
  else el.value = value == null ? "" : String(value);
}

function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function syncStateFromForm() {
  const s = state();
  s.offer.date = val("coDate");
  s.offer.proposalNumber = val("coProposalNumber");
  s.offer.subject = val("coSubject");
  s.offer.location = val("coLocation");
  s.offer.fileName = val("coFileName");

  s.service.position = val("coPosition");
  s.service.assignedCandidate = val("coAssigned");
  s.service.activityLocation = val("coActivityLocation");
  s.service.supportType = val("coSupportType");

  if (!s.client) s.client = createDefaultClientOfferState().client;
  s.client.name = val("coClientName");
  s.client.address1 = val("coClientAddress1");
  s.client.address2 = val("coClientAddress2");
  s.client.contactTitle = val("coContactTitle");
  s.client.contactName = val("coContactName");
  s.client.contactSurname = val("coContactSurname");

  s.remuneration.rateType = val("coRateType") || "calendar";
  if (s.remuneration.rateType === "lumpSum") {
    const monthly = numOrNull(val("coMonthlyLump"));
    s.remuneration.monthlyLumpSumRate =
      monthly != null ? monthly : s.remuneration.monthlyLumpSumRate;
    s.remuneration.selectedClientRate = s.remuneration.monthlyLumpSumRate;
    s.remuneration.offerDailyRate = null;
  } else {
    s.remuneration.selectedClientRate = numOrNull(val("coSelectedRate"));
    s.remuneration.offerDailyRate = numOrNull(val("coOfferRate"));
  }
  s.remuneration.monthlyPocketMoney = Number(val("coMonthlyPocket")) || 0;
  s.remuneration.dailyPocketMoney = Number(val("coDailyPocket")) || 0;
  s.remuneration.workingHoursPerDay = Number(val("coHours")) || 10;
  s.remuneration.workingDaysPerWeek = Number(val("coDaysWeek")) || 6;
  s.remuneration.pocketMode = val("coPocketMode") || "separate";

  s.overtime.mode = val("coOtMode") || "manual";
  s.overtime.mondaySaturdayRate = numOrNull(val("coOtMs"));
  s.overtime.mondaySaturdayMultiplier = Number(val("coOtMsMult")) || 1.25;
  s.overtime.sundayHolidayRate = numOrNull(val("coOtSun"));
  s.overtime.sundayHolidayMultiplier = Number(val("coOtSunMult")) || 1.5;
  s.overtime.weeklyThreshold = Number(val("coOtThreshold")) || 60;
  s.overtime.customText = val("coOtCustom");

  s.accommodation.mode = val("coAccMode") || "client_reimbursed";
  {
    const accLump = numOrNull(val("coAccLump"));
    // Non azzerare lump sum se il campo form è vuoto (wrap nascosto)
    if (accLump != null) s.accommodation.lumpSum = accLump;
  }
  s.accommodation.customText = val("coAccCustom");
  s.transportation.mode = val("coTrMode") || "client_reimbursed";
  {
    const trLump = numOrNull(val("coTrLump"));
    if (trLump != null) s.transportation.lumpSum = trLump;
  }
  s.transportation.customText = val("coTrCustom");

  s.logistics.combinedLumpSum = !!($("coCombinedLump") || {}).checked;
  {
    const combinedAmt = numOrNull(val("coCombinedAmount"));
    if (combinedAmt != null) s.logistics.combinedLumpSumAmount = combinedAmt;
  }
  s.logistics.travellingDay = val("coTravelDay") || "100";
  s.logistics.travellingDayCustom = val("coTravelCustom");
  s.logistics.ticketFlight = val("coTicket") || "standard";
  s.logistics.ticketFlightCustom = val("coTicketCustom");
  s.logistics.mobDemob = val("coMob") || "standard";
  s.logistics.mobDemobCustom = val("coMobCustom");
  s.logistics.ownCarEnabled = !!($("coOwnCar") || {}).checked;
  s.logistics.ownCarKmRate = Number(val("coOwnCarKm")) || 0.5;

  s.rotation.mode = val("coRotMode") || "defined";
  if (s.rotation.mode === "na") {
    s.rotation.workDays = null;
    s.rotation.restDays = null;
  } else if (s.rotation.mode === "tbd" || s.rotation.mode === "hide") {
    /* mantieni eventuali work/rest già in stato */
  } else if (s.rotation.mode === "custom") {
    const custom = val("coRotCustom");
    if (custom !== "") s.rotation.customText = custom;
  } else {
    // defined: aggiorna solo se il form ha valori (evita wipe a null su campi hidden)
    const w = numOrNull(val("coRotWork"));
    const r = numOrNull(val("coRotRest"));
    if (w != null) s.rotation.workDays = w;
    if (r != null) s.rotation.restDays = r;
  }
  if (s.rotation.mode !== "custom") {
    const custom = val("coRotCustom");
    if (custom) s.rotation.customText = custom;
  }

  s.dates.startMode = val("coStartMode") || "within";
  s.dates.endMode = val("coEndMode") || "within";
  s.dates.startDate = val("coStartDate");
  s.dates.endDate = val("coEndDate");
  s.dates.startManual = val("coStartManual");
  s.dates.endManual = val("coEndManual");
}

function syncFormFromState() {
  const s = state();
  setVal("coDate", s.offer.date);
  setVal("coProposalNumber", s.offer.proposalNumber);
  setVal("coSubject", s.offer.subject);
  setVal("coLocation", s.offer.location);
  setVal("coFileName", s.offer.fileName);

  setVal("coPosition", s.service.position);
  setVal("coAssigned", s.service.assignedCandidate);
  setVal("coActivityLocation", s.service.activityLocation);
  setVal("coSupportType", s.service.supportType);

  const client = s.client || {};
  setVal("coClientName", client.name);
  setVal("coClientAddress1", client.address1);
  setVal("coClientAddress2", client.address2);
  setVal("coContactTitle", client.contactTitle);
  setVal("coContactName", client.contactName);
  setVal("coContactSurname", client.contactSurname);

  setVal("coRateType", s.remuneration.rateType);
  setVal("coSelectedRate", s.remuneration.selectedClientRate);
  setVal("coMonthlyLump", s.remuneration.monthlyLumpSumRate);
  setVal("coMonthlyPocket", s.remuneration.monthlyPocketMoney);
  setVal("coDailyPocket", s.remuneration.dailyPocketMoney);
  setVal("coOfferRate", s.remuneration.offerDailyRate);
  setVal("coHours", s.remuneration.workingHoursPerDay);
  setVal("coDaysWeek", s.remuneration.workingDaysPerWeek);
  setVal("coPocketMode", s.remuneration.pocketMode);

  setVal("coOtMode", s.overtime.mode);
  setVal("coOtMs", s.overtime.mondaySaturdayRate);
  setVal("coOtMsMult", s.overtime.mondaySaturdayMultiplier);
  setVal("coOtSun", s.overtime.sundayHolidayRate);
  setVal("coOtSunMult", s.overtime.sundayHolidayMultiplier);
  setVal("coOtThreshold", s.overtime.weeklyThreshold);
  setVal("coOtCustom", s.overtime.customText);

  setVal("coAccMode", s.accommodation.mode);
  setVal("coAccLump", s.accommodation.lumpSum);
  setVal("coAccCustom", s.accommodation.customText);
  setVal("coTrMode", s.transportation.mode);
  setVal("coTrLump", s.transportation.lumpSum);
  setVal("coTrCustom", s.transportation.customText);

  setVal("coCombinedLump", s.logistics.combinedLumpSum);
  setVal("coCombinedAmount", s.logistics.combinedLumpSumAmount);
  setVal("coTravelDay", s.logistics.travellingDay);
  setVal("coTravelCustom", s.logistics.travellingDayCustom);
  setVal("coTicket", s.logistics.ticketFlight);
  setVal("coTicketCustom", s.logistics.ticketFlightCustom);
  setVal("coMob", s.logistics.mobDemob);
  setVal("coMobCustom", s.logistics.mobDemobCustom);
  setVal("coOwnCar", s.logistics.ownCarEnabled);
  setVal("coOwnCarKm", s.logistics.ownCarKmRate);

  setVal("coRotMode", s.rotation.mode);
  setVal("coRotWork", s.rotation.workDays);
  setVal("coRotRest", s.rotation.restDays);
  setVal("coRotCustom", s.rotation.customText);

  setVal("coStartMode", s.dates.startMode);
  setVal("coEndMode", s.dates.endMode);
  setVal("coStartDate", s.dates.startDate);
  setVal("coEndDate", s.dates.endDate);
  setVal("coStartManual", s.dates.startManual);
  setVal("coEndManual", s.dates.endManual);

  refreshTemplateMeta();
  updateClientOfferConditionalFields();
}

function refreshSummary() {
  const sum = buildSummary(state());
  const map = {
    coSumSubject: sum.subject,
    coSumLocation: sum.location,
    coSumPosition: sum.position,
    coSumCandidate: sum.candidate,
    coSumRate: sum.dailyRate,
    coSumPocket: sum.pocketMoney,
    coSumOt: sum.overtime,
    coSumAcc: sum.accommodation,
    coSumTr: sum.transportation,
    coSumRot: sum.rotation,
    coSumStart: sum.start,
    coSumEnd: sum.end
  };
  Object.keys(map).forEach(function (id) {
    const el = $(id);
    if (el) el.textContent = map[id];
  });
}

function refreshTemplateMeta() {
  const t = state().template;
  const status = $("coTemplateStatus");
  const meta = $("coTemplateMeta");
  if (status) {
    status.textContent = t.hasBuffer
      ? "Template attivo: " + t.name
      : "Nessun template caricato.";
  }
  if (meta) {
    meta.classList.toggle("hidden", !t.hasBuffer);
  }
  const nameEl = $("coTemplateName");
  const sizeEl = $("coTemplateSize");
  if (nameEl) nameEl.textContent = t.name || "—";
  if (sizeEl) {
    sizeEl.textContent = t.size ? Math.round(t.size / 1024) + " KB" : "—";
  }
  const btnRem = $("btnCoRimuoviTemplate");
  const btnSub = $("btnCoSostituisciTemplate");
  if (btnRem) btnRem.classList.toggle("hidden", !t.hasBuffer);
  if (btnSub) btnSub.classList.toggle("hidden", !t.hasBuffer);
}

function describeUploadedTemplate(buffer, fileName) {
  try {
    const PizZip = window.PizZip;
    if (!PizZip) {
      return (
        "Template caricato: " +
        fileName +
        " (verrà usato così com’è al download)."
      );
    }
    const zip = new PizZip(buffer);
    const xml = zip.file("word/document.xml").asText();
    const keys = listPlaceholdersInXml(xml);
    const bits = ["Template utente attivo: " + fileName];
    if (keys.length) bits.push("placeholder: " + keys.join(", "));
    if (templateCoversWorkingHours(xml)) bits.push("Working Hours: OK");
    if (templateCoversDailyRate(xml)) bits.push("Daily Rate: OK");
    bits.push("Questo file sarà sempre usato per il download.");
    return bits.join(" — ");
  } catch (err) {
    return "Template caricato: " + fileName;
  }
}

function persistTemplate(name, size, buffer) {
  templateBuffer = buffer;
  state().template = {
    name: name,
    size: size,
    loadedAt: new Date().toISOString(),
    hasBuffer: true,
    source: name === "OFFERTA_CLIENTE_TEMPLATE.docx" ? "default" : "user"
  };
  try {
    localStorage.setItem(
      CLIENT_OFFER_TEMPLATE_KEY,
      JSON.stringify({
        name: name,
        size: size,
        loadedAt: state().template.loadedAt,
        base64: arrayBufferToBase64(buffer)
      })
    );
  } catch (err) {
    console.warn("[clientOffer] template non persistito:", err);
    setStatus("Template in memoria (localStorage pieno).");
  }
  persist();
}

function hydrateTemplateFromStorage() {
  try {
    const raw = localStorage.getItem(CLIENT_OFFER_TEMPLATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.base64) return;
    templateBuffer = base64ToArrayBuffer(parsed.base64);
    state().template = {
      name: parsed.name || "template.docx",
      size: parsed.size || 0,
      loadedAt: parsed.loadedAt || "",
      hasBuffer: true
    };
  } catch (err) {
    console.warn("[clientOffer] hydrate template fallita:", err);
  }
}

async function downloadOffer() {
  syncStateFromForm();
  const s = state();
  // Recovery rotation da stato/draft (non perdere 90/15 se form vuoto)
  applyNormalizedRotation(s, appStateRef && appStateRef.draft);
  migrateLegacyProposalNaming(s);
  refreshProposalNamingFields();
  // Download NON incrementa il progressivo; allinea solo fileName se non manuale
  applyClientManualNaming(s);
  syncFormFromState();

  if (!templateBuffer) {
    const msg =
      "Template Offerta Cliente non disponibile. Caricare il template aziendale.";
    setStatus(msg);
    window.alert(msg);
    return;
  }

  const v = validateOfferForWord(s);
  if (!v.ok) {
    setStatus("Validazione: " + v.errors.join("; "));
    window.alert("Completare i campi obbligatori:\n- " + v.errors.join("\n- "));
    return;
  }
  setStatus("Generazione offerta Word…");
  try {
    const result = await generateClientOfferDocx(templateBuffer, s, {
      draft: appStateRef && appStateRef.draft
    });
    const blob = arrayBufferToBlob(result.arrayBuffer);
    const fileName = sanitizeWindowsFileName(result.fileName);
    downloadOfferBlob(blob, fileName);
    s.meta.lastGeneratedAt = new Date().toISOString();
    s.meta.lastFileName = fileName;
    persist();
    refreshSummary();
    setStatus("Download: " + fileName);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    setStatus("Errore: " + msg);
    window.alert(msg);
  }
}

export { updateClientOfferConditionalFields as updateConditional };
export function __testApi() {
  return {
    state,
    syncStateFromForm,
    syncFormFromState,
    updateClientOfferConditionalFields,
    getTemplateBuffer: function () {
      return templateBuffer;
    }
  };
}
