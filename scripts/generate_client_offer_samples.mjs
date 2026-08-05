/**
 * Genera anteprime testo + JSON dei due documenti di prova (senza browser).
 * I .docx veri si generano dall'UI «Offerta Cliente» → Genera/Scarica Word.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createDefaultClientOfferState } from "../modules/clientOffer/state.js";
import { buildDocumentModel } from "../modules/clientOffer/transform.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "output_test", "client_offer");
fs.mkdirSync(outDir, { recursive: true });

function base() {
  return createDefaultClientOfferState();
}

function constructionManager() {
  const s = base();
  s.offer.date = "2026-05-25";
  s.offer.subject = "Construction Management";
  s.offer.location = "Monfalcone, Italy";
  s.offer.proposalNumber =
    "OFF_234LC_CONSTRUCTION MANAGEMENT_ITALY_DEMONT S.R.L.";
  s.offer.fileName = s.offer.proposalNumber;
  s.client.companyName = "DEMONT S.r.l.";
  s.client.addressLine1 = "Loc. Braia z.i.";
  s.client.city = "Millesimo";
  s.client.zip = "17017";
  s.client.province = "SV";
  s.client.country = "Italy";
  s.client.contactTitle = "Eng.";
  s.client.contactLastName = "Berriolo";
  s.client.contactFirstName = "M.";
  s.service.position = "Construction Manager";
  s.service.assignedCandidate = "Eng. Alessio S.";
  s.service.activityLocation = "Monfalcone, Italy";
  s.remuneration.rateType = "calendar";
  s.remuneration.offerDailyRate = 480;
  s.remuneration.pocketMode = "na";
  s.remuneration.workingHoursPerDay = 10;
  s.remuneration.workingDaysPerWeek = 6;
  s.overtime.mode = "manual";
  s.overtime.mondaySaturdayRate = 69;
  s.overtime.sundayHolidayRate = 72;
  s.overtime.mondaySaturdayMultiplier = 1;
  s.overtime.sundayHolidayMultiplier = 1;
  s.overtime.weeklyThreshold = 60;
  s.logistics.combinedLumpSum = true;
  s.logistics.combinedLumpSumAmount = 2000;
  s.logistics.includeMealsInCombined = true;
  s.logistics.travellingDay = "100";
  s.logistics.ticketFlight = "standard";
  s.logistics.mobDemob = "standard";
  s.logistics.ownCarEnabled = true;
  s.logistics.ownCarKmRate = 0.5;
  s.rotation.mode = "defined";
  s.rotation.workDays = 90;
  s.rotation.restDays = 15;
  s.dates.startMode = "within";
  s.dates.endMode = "within";
  s.dates.startDate = "2026-06-01";
  s.dates.endDate = "2026-12-01";
  return s;
}

function technicalSupervision() {
  const s = base();
  s.offer.date = "2026-07-27";
  s.offer.subject = "Technical supervision";
  s.offer.location = "Spain & Italy";
  s.offer.proposalNumber =
    "OFF_239LC_TECHNICAL SUPERVISION_SPAIN&ITALY_DANIELI S.P.A.";
  s.offer.fileName = s.offer.proposalNumber;
  s.client.companyName = "Danieli & C. Officine Meccaniche S.P.A.";
  s.client.addressLine1 = "Via Nazionale, 41";
  s.client.city = "Buttrio";
  s.client.zip = "33042";
  s.client.province = "UD";
  s.client.country = "Italy";
  s.client.contactTitle = "Eng.";
  s.client.contactFirstName = "A.";
  s.client.contactLastName = "Parise";
  s.service.position = "Electrical Supervisor";
  s.service.assignedCandidate = "Eng. Donato Moro";
  s.service.activityLocation = "Spain & Italy";
  s.remuneration.rateType = "calendar";
  s.remuneration.offerDailyRate = 490;
  s.remuneration.dailyPocketMoney = 50;
  s.remuneration.monthlyPocketMoney = 1500;
  s.remuneration.pocketMode = "separate";
  s.remuneration.workingHoursPerDay = 10;
  s.remuneration.workingDaysPerWeek = 6;
  s.overtime.mode = "manual";
  s.overtime.mondaySaturdayRate = 71;
  s.overtime.mondaySaturdayMultiplier = 1.25;
  s.overtime.sundayHolidayRate = 85;
  s.overtime.sundayHolidayMultiplier = 1.5;
  s.overtime.weeklyThreshold = 60;
  s.accommodation.mode = "client_reimbursed";
  s.transportation.mode = "client_reimbursed";
  s.logistics.combinedLumpSum = false;
  s.logistics.travellingDay = "100";
  s.logistics.ticketFlight = "standard";
  s.logistics.mobDemob = "standard";
  s.logistics.ownCarEnabled = true;
  s.logistics.ownCarKmRate = 0.5;
  s.rotation.mode = "tbd";
  s.dates.startMode = "within";
  s.dates.endMode = "within";
  s.dates.startDate = "2026-08-01";
  s.dates.endDate = "2027-04-01";
  return s;
}

function writePreview(name, state) {
  const model = buildDocumentModel(state);
  const lines = [];
  lines.push(model.letterDate);
  lines.push(...model.clientAddressLines);
  lines.push(model.attention);
  lines.push("Technical Support");
  lines.push(model.subject);
  lines.push(model.location);
  lines.push(model.proposalNumber);
  lines.push(model.dear);
  lines.push(model.intro);
  lines.push("Best regards");
  lines.push(model.signatoryName + " " + model.signatoryTitle);
  lines.push("--- PAGE 2 ---");
  lines.push("TERMS AND CONDITIONS OF SALE");
  lines.push("1.0 SCOPE");
  lines.push(model.scope);
  lines.push("2.0 PERFORMANCE OF SERVICES");
  lines.push(model.position);
  lines.push(model.assigned);
  lines.push("3.0 REMUNERATION");
  lines.push(...model.remunerationLines);
  lines.push(...model.overtimeLines);
  lines.push(model.inclusionsTitle);
  lines.push(model.inclusionsBody);
  lines.push(...model.accommodationTransportLines);
  if (model.pocketMoneyLine) lines.push(model.pocketMoneyLine);
  if (model.travellingDay) lines.push(model.travellingDay);
  if (model.ticketFlight) lines.push(model.ticketFlight);
  if (model.mobDemob) lines.push(model.mobDemob);
  if (model.ownCar) lines.push(model.ownCar);
  lines.push("--- PAGE 3 ---");
  if (model.rotation.show) {
    lines.push(model.rotation.title);
    lines.push(model.rotation.body);
  }
  lines.push("5.0 COMMENCEMENT AND DURATION");
  lines.push(model.commencement.startLine);
  lines.push(model.commencement.endLine);
  lines.push("6.0 INVOICING");
  lines.push(model.invoicing);
  lines.push("7.0 PAYMENT");
  lines.push(model.payment);
  lines.push("8.0 ACCIDENTS AND ILLNESS");
  lines.push(model.accidents);
  lines.push("9.0 COMPETENT COURT");
  lines.push(model.court);
  lines.push(model.footer.name);
  lines.push(model.footer.address + " — " + model.footer.vat);

  const txtPath = path.join(outDir, name + ".txt");
  const jsonPath = path.join(outDir, name + ".json");
  fs.writeFileSync(txtPath, lines.join("\n"), "utf8");
  fs.writeFileSync(jsonPath, JSON.stringify({ state, model }, null, 2), "utf8");
  console.log("Wrote", txtPath);
  return { txtPath, jsonPath, fileName: model.fileName };
}

const a = writePreview("TEST_OFF_234_CONSTRUCTION_MANAGER", constructionManager());
const b = writePreview("TEST_OFF_239_TECHNICAL_SUPERVISION", technicalSupervision());

fs.writeFileSync(
  path.join(outDir, "README.txt"),
  [
    "Anteprime generate automaticamente dal modello Offerta Cliente.",
    "Per i .docx tipografici (logo/firma/footer): aprire la suite in locale,",
    "tab Offerta Cliente, caricare i JSON di stato oppure compilare i campi",
    "e premere Genera Word / Scarica Word.",
    "",
    "File Construction Manager: " + a.fileName,
    "File Technical Supervision: " + b.fileName,
    ""
  ].join("\n"),
  "utf8"
);

console.log("OK →", outDir);
