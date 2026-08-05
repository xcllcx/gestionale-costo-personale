/**
 * Offerta Cliente — import da Draft / Costi / Overtime.
 * Auto-import non sovrascrive campi con manualLocks.
 */

import { cloneJson, isLocked, clearManualLocks } from "./state.js";
import {
  deriveWorkingRateFromCalendar,
  applyResolvedOfferRate,
  DEFAULT_CALENDAR_DAYS,
  DEFAULT_WORKING_DAYS
} from "./transform.js";

/**
 * Import completo. force=true sovrascrive anche i campi lockati.
 * @param {object} appState
 * @param {object} offerState
 * @param {{ force?: boolean }} [opts]
 */
export function importFromModules(appState, offerState, opts) {
  const force = !!(opts && opts.force);
  if (force) clearManualLocks(offerState);

  const draftRes = importFromDraft(appState, offerState, { force: force });
  const costRes = importFromCost(appState, offerState, { force: force });
  const otRes = importFromOvertime(appState, offerState, { force: force });

  const parts = [];
  if (draftRes.changed) parts.push("Draft");
  if (costRes.changed) parts.push("Costi");
  if (otRes.changed) parts.push("Overtime");

  offerState.meta = offerState.meta || {};
  offerState.meta.autoImportedAt = new Date().toISOString();

  return {
    ok: true,
    changed: parts.length > 0,
    message:
      parts.length > 0
        ? (force ? "Dati aggiornati da: " : "Import automatico da: ") +
          parts.join(", ")
        : force
          ? "Nessun dato disponibile nei moduli sorgente."
          : "Nessun nuovo dato da importare (campi già compilati o moduli vuoti).",
    draft: draftRes,
    cost: costRes,
    overtime: otRes
  };
}

function canWrite(offerState, path, force) {
  return force || !isLocked(offerState, path);
}

function setIf(offerState, path, target, key, value, force) {
  if (value === undefined || value === null || value === "") return false;
  if (!canWrite(offerState, path, force)) return false;
  const cur = target[key];
  if (
    !force &&
    cur !== undefined &&
    cur !== null &&
    cur !== "" &&
    !(typeof cur === "number" && !Number.isFinite(cur))
  ) {
    // auto: non sovrascrivere valori già presenti
    return false;
  }
  target[key] = value;
  return true;
}

export function importFromDraft(appState, offerState, opts) {
  const force = !!(opts && opts.force);
  const draft = (appState && appState.draft) || {};
  const project = draft.project || {};
  const rotation = draft.rotation || {};
  let changed = false;

  const snapshot = {
    position: project.posizione || "",
    location: project.localita || "",
    projectName: project.progetto || "",
    startDate: project.periodoDa || "",
    endDate: project.periodoA || "",
    rotationMode: rotation.mode || "",
    rotationValue: rotation.value || ""
  };

  if (
    setIf(
      offerState,
      "service.position",
      offerState.service,
      "position",
      snapshot.position,
      force
    )
  ) {
    changed = true;
  }
  if (
    setIf(
      offerState,
      "offer.subject",
      offerState.offer,
      "subject",
      snapshot.position || snapshot.projectName,
      force
    )
  ) {
    changed = true;
  }
  if (
    setIf(
      offerState,
      "service.activityLocation",
      offerState.service,
      "activityLocation",
      snapshot.location,
      force
    )
  ) {
    changed = true;
  }
  if (
    setIf(
      offerState,
      "offer.location",
      offerState.offer,
      "location",
      snapshot.location,
      force
    )
  ) {
    changed = true;
  }

  if (applyRotationSnapshot(offerState, snapshot, force)) changed = true;
  if (applyDatesSnapshot(offerState, snapshot, force)) changed = true;

  offerState.lastImported.draft = cloneJson(snapshot);
  return { ok: true, changed: changed, imported: snapshot };
}

export function parseRotationPair(value) {
  const m = String(value || "").match(/(\d+)\s*[\/\-]\s*(\d+)/);
  if (!m) return null;
  return { work: Number(m[1]), rest: Number(m[2]) };
}

function applyRotationSnapshot(offerState, snapshot, force) {
  if (!canWrite(offerState, "rotation", force)) return false;
  const mode = String(snapshot.rotationMode || "").toLowerCase();
  const value = String(snapshot.rotationValue || "").trim();
  const prev = offerState.rotation || {};
  let next = null;

  if (
    mode === "na" ||
    value.toUpperCase() === "N/A" ||
    value.toUpperCase() === "NA"
  ) {
    next = {
      mode: "na",
      workDays: null,
      restDays: null,
      customText: prev.customText || ""
    };
  } else if (mode === "tbd" || /tbd|to be defined/i.test(value)) {
    next = {
      mode: "tbd",
      workDays: null,
      restDays: null,
      customText: prev.customText || ""
    };
  } else if (mode === "custom" && value) {
    next = {
      mode: "custom",
      workDays: null,
      restDays: null,
      customText: value
    };
  } else {
    const parsed = parseRotationPair(value);
    if (parsed) {
      // Draft usa spesso mode "free" + value "90/15" → offerta "defined"
      next = {
        mode: "defined",
        workDays: parsed.work,
        restDays: parsed.rest,
        customText: ""
      };
    } else if (!value && (mode === "free" || mode === "defined" || !mode)) {
      // Nessun valore draft: non forzare overwrite dei default locali
      return false;
    }
  }

  if (!next) return false;

  const same =
    prev.mode === next.mode &&
    prev.workDays === next.workDays &&
    prev.restDays === next.restDays &&
    String(prev.customText || "") === String(next.customText || "");
  if (same) return false;

  offerState.rotation.mode = next.mode;
  offerState.rotation.workDays = next.workDays;
  offerState.rotation.restDays = next.restDays;
  offerState.rotation.customText = next.customText;
  return true;
}

function applyDatesSnapshot(offerState, snapshot, force) {
  let changed = false;
  if (
    setIf(
      offerState,
      "dates.startDate",
      offerState.dates,
      "startDate",
      snapshot.startDate,
      force
    )
  ) {
    changed = true;
    if (force || !offerState.dates.startMode) {
      offerState.dates.startMode = "within";
    }
  }
  if (
    setIf(
      offerState,
      "dates.endDate",
      offerState.dates,
      "endDate",
      snapshot.endDate,
      force
    )
  ) {
    changed = true;
    if (force || !offerState.dates.endMode) {
      offerState.dates.endMode = "within";
    }
  }
  return changed;
}

export function importFromCost(appState, offerState, opts) {
  const force = !!(opts && opts.force);
  const calc = appState && appState.calculation;
  if (!calc) {
    return { ok: false, changed: false, message: "Nessun calcolo costi", imported: null };
  }

  const calendarRate = Number(calc.rate30);
  const workingFromCalc = Number(calc.rate26);
  const calendarDays =
    Number(calc.calendarDays) > 0
      ? Number(calc.calendarDays)
      : DEFAULT_CALENDAR_DAYS;
  const workingDays =
    Number(calc.workingDays) > 0
      ? Number(calc.workingDays)
      : DEFAULT_WORKING_DAYS;

  const hasCalendar = Number.isFinite(calendarRate) && calendarRate > 0;
  const hasWorking = Number.isFinite(workingFromCalc) && workingFromCalc > 0;

  if (!hasCalendar && !hasWorking) {
    return { ok: false, changed: false, imported: null };
  }

  const importedCalendarRate = hasCalendar
    ? calendarRate
    : hasWorking
      ? workingFromCalc
      : null;
  const importedWorkingRate = hasWorking
    ? workingFromCalc
    : hasCalendar
      ? deriveWorkingRateFromCalendar(calendarRate, calendarDays, workingDays)
      : null;

  const monthly = Number(calc.pocketMoney) || 0;
  const rem = offerState.remuneration;
  // Non forzare sempre calendar: preserva rateType già scelto dall'utente
  const rateType = rem.rateType || "calendar";

  const snapshot = {
    importedCalendarRate: importedCalendarRate,
    importedWorkingRate: importedWorkingRate,
    calendarDays: calendarDays,
    workingDays: workingDays,
    monthlyPocketMoney: monthly,
    rateType: rateType
  };

  let changed = false;
  if (canWrite(offerState, "remuneration", force)) {
    const empty =
      rem.offerDailyRate == null ||
      rem.selectedClientRate == null ||
      (rem.importedCalendarRate == null && rem.importedWorkingRate == null);
    if (force || empty) {
      rem.importedCalendarRate = snapshot.importedCalendarRate;
      rem.importedWorkingRate = snapshot.importedWorkingRate;
      rem.calendarDays = snapshot.calendarDays;
      rem.workingDays = snapshot.workingDays;
      rem.monthlyPocketMoney = snapshot.monthlyPocketMoney;
      applyResolvedOfferRate(rem);
      changed = true;
    }
  }

  offerState.lastImported.cost = cloneJson({
    ...snapshot,
    selectedClientRate: rem.selectedClientRate,
    dailyPocketMoney: rem.dailyPocketMoney,
    offerDailyRate: rem.offerDailyRate,
    pocketMode: rem.pocketMode,
    monthlyLumpSumRate: rem.monthlyLumpSumRate
  });
  return { ok: true, changed: changed, imported: snapshot };
}

export function importFromOvertime(appState, offerState, opts) {
  const force = !!(opts && opts.force);
  const ot = appState && appState.overtime;
  if (!ot || !ot.cliente) {
    return { ok: false, changed: false, imported: null };
  }
  const prezzo = Number(ot.cliente.prezzoOrario);
  const magg = Number(
    ot.cliente.maggiorazione != null ? ot.cliente.maggiorazione : ot.cliente.fattore
  );
  const snapshot = {
    mondaySaturdayRate: Number.isFinite(prezzo) ? prezzo : null,
    mondaySaturdayMultiplier: Number.isFinite(magg) ? magg : 1.25,
    sundayHolidayRate: null,
    sundayHolidayMultiplier: 1.5,
    weeklyThreshold: 60,
    mode: "import"
  };
  if (ot.cliente.prezzoOrarioDomenica != null) {
    const sun = Number(ot.cliente.prezzoOrarioDomenica);
    snapshot.sundayHolidayRate = Number.isFinite(sun) && sun > 0 ? sun : null;
  }

  let changed = false;
  if (canWrite(offerState, "overtime", force)) {
    const empty = offerState.overtime.mondaySaturdayRate == null;
    if (force || empty) {
      offerState.overtime.mode = "import";
      offerState.overtime.mondaySaturdayRate = snapshot.mondaySaturdayRate;
      offerState.overtime.mondaySaturdayMultiplier =
        snapshot.mondaySaturdayMultiplier;
      offerState.overtime.sundayHolidayRate = snapshot.sundayHolidayRate;
      offerState.overtime.sundayHolidayMultiplier =
        snapshot.sundayHolidayMultiplier;
      offerState.overtime.weeklyThreshold = snapshot.weeklyThreshold;
      changed = true;
    }
  }

  offerState.lastImported.overtime = cloneJson(snapshot);
  return { ok: true, changed: changed, imported: snapshot };
}

/** Alias per compatibilità test precedenti */
export function importRotationFromDraft(appState, offerState) {
  return importFromDraft(appState, offerState, { force: true });
}
export function importDatesFromDraft(appState, offerState) {
  return importFromDraft(appState, offerState, { force: true });
}
export function restoreLastImported() {
  return { ok: false, message: "Usa Aggiorna dati dai moduli" };
}
export function applyManualPatch(offerState, patch) {
  if (!patch) return offerState;
  Object.keys(patch).forEach(function (section) {
    if (
      offerState[section] &&
      typeof offerState[section] === "object" &&
      patch[section]
    ) {
      Object.assign(offerState[section], cloneJson(patch[section]));
    }
  });
  return offerState;
}
