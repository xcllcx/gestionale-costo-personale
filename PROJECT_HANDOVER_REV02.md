# PROJECT HANDOVER — REV02_STABLE

Documento di passaggio per agent / sviluppatori successivi.  
**Non contiene modifiche al codice.** Solo contesto operativo e vincoli.

**Versione congelata:** REV02_STABLE  
**Backup:** `BACKUP_REV02_STABLE/`  
**Data marcatura:** 2026-07-27

---

## A) Architettura attuale

### Tipo applicazione
- **Vanilla** HTML + CSS + JavaScript (nessun framework, nessun Node runtime obbligatorio, nessun database).
- **SPA a tab** senza reload: `Calcolo costo personale` | `Calcolo overtime` | `Draft Tecnico`.
- Funziona aprendo `index.html` in locale o pubblicando staticamente (es. GitHub Pages).
- Sessione **volatile in RAM** (niente `localStorage` obbligatorio in REV02).

### File principali

| File | Ruolo |
|------|--------|
| `index.html` | UI, navigazione SPA, form Costo / Overtime / Draft |
| `style.css` | Design system (card, tab, overtime, draft) |
| `script.js` | Logica completa: calcoli, AppState, overtime, draft, Word |
| `lib/docx.min.js` | Libreria export `.docx` (UMD browser) |
| `VERSION.md` | Marcatura versione stabile |
| `.gitignore` | Esclude backup locali dal repo |
| `PROJECT_HANDOVER_REV02.md` | Questo documento |

### Struttura AppState

```text
AppState = {
  meta: { versione, dataCreazione },
  calculation: null | {
    tipoContratto, mode, netto, nettoMensile, pocketMoney,
    rate26, rate30, rate217, prezzoFinale, ... , fullResult
  },
  overtime: null | { tecnico, cliente, margineOrario, imported, ... },
  draft: {
    project, workSchedule, rotation, overtime,
    accommodation, localTransport, mobDemob,
    travelDays, contract, remuneration
  }
}
```

Alias REV01 (sempre allineati via setter):
- `lastResult` ↔ `AppState.calculation.fullResult`
- `currentCalculation` ↔ `AppState.calculation`
- `lastOvertime` ↔ `AppState.overtime`

Setter:
- `setAppCalculation(result | null)`
- `setAppOvertime(ot | null)`
- `clearAppCalculationAndOvertime()`

**Nota:** le formule di calcolo **non** dipendono da AppState; AppState è solo store condiviso tra moduli.

### Builder Word
- Export costo + overtime: `handleEsportaWord()` + `buildOvertimeWordParagraphs()` + `buildTableRows()`.
- Export Draft dedicato: `handleEsportaDraftWord()` + `buildDraftWordSection()` / `buildDraftWordParagraphs()`.
- Libreria: `window.docx` da `lib/docx.min.js`.
- Font Draft: Arial MT 11 pt; titolo “DRAFT DI CONTRATTO”.

### Organizzazione codice (`script.js`)
1. Costanti / default  
2. AppState + setter  
3. Utility DOM/formato  
4. Formule costo (Italia / Europa / Estero) — **API immutabili**  
5. Steps / collect input / adapter Pocket  
6. Render UI costo  
7. Modalità contratto + azioni Calcola/Reset  
8. Sync AppState + navigazione SPA  
9. Overtime (formule + sorgente AppState/manuale)  
10. Draft UI binding  
11. Export Word costo/OT  
12. Export Word Draft + `DRAFT_TEMPLATES`  
13. `initApp`

---

## B) Funzionalità implementate

### Calcolo costo personale
- **Italia** — trasferta Italia default, parte tassata = netto − trasferta.
- **Europa** — stessa logica Italia, trasferta Europa default; `modeLabel` = Europa.
- **Estero** (`europa-base`) — Quota Base × moltiplicatore; differenza netto−quota esentasse.

### Pocket Money
- Campo in card **Compenso** (sotto Netto / Rate candidato).
- **Imponibile**: adapter `buildCalcInputFromForm` somma Pocket al netto prima delle formule (formule invariate).
- In Estero: Pocket entra nella quota base (resta tassato senza cambiare formula).
- Non è più in “Indennità esentasse”.

### Rate candidato (informativo)
- UI: Netto mensile ÷ 26 (sola lettura, non entra nei calcoli REV01).
- Draft: stesso rate candidato (non il rate vendita cliente `prezzoGiorno26`).

### Rimborsi / indennità esentasse
- Affitto, Auto, Trasferta (Italia/Europa): sommati al totale **senza** moltiplicatore.
- Costi struttura, margine %, moltiplicatore configurabili.

### Overtime
- **Automatico:** legge `AppState.calculation` (netto, rate26/30/217, tipo contratto).
- **Manuale (standalone):** sezione “Calcolo manuale” con rate giornaliero + Working(26) / Calendar(30/31). Se rate manuale valorizzato, ha priorità.
- Tecnico e Cliente indipendenti (metodo + maggiorazione + ore giornaliere).
- Solo valori **orari** (€/ora).

### Draft Tecnico
- Tab dedicata, form completo, sync su `AppState.draft`.
- Remunerazione / OT / Pocket automatici da AppState.
- Export Word con template aziendali.

### Export Word
- Report calcolo costo (+ sezione overtime se presente).
- Documento Draft separato (tabella 2 colonne, template, data, firma).

### AppState
- Punto unico dati tra Costo, Overtime, Draft.

### Backup
- `BACKUP_REV02_STABLE/` — congelamento attuale.
- Precedenti: `BACKUP_REV01_STABLE/`, `BACKUP_BEFORE_*`.

---

## C) Logiche di calcolo — API immutabili

**Regola:** le funzioni seguenti sono **API immutabili**. Non modificarne i corpi. Eventuali cambi di comportamento devono passare da adapter/input (come Pocket Money), non da riscrittura delle formule.

### Condivise
- `calcolaMargineEPrezzi(totaleCosto, marginePerc)`  
  - `margine = totaleCosto × (marginePerc/100)`  
  - `prezzoFinale = totaleCosto + margine`  
  - `prezzoGiorno26/30/217 = prezzoFinale ÷ 26 | 30 | 21,7`

### Italia (`calcolaItalia`)
1. `parteTassata = netto − trasferta`  
2. `costoLavoro = parteTassata × moltiplicatore`  
3. `totaleCosto = costoLavoro + trasferta + pocketMoney + affitto + auto + costiStruttura`  
4. Margine e prezzi tramite `calcolaMargineEPrezzi`

> In REV02 il form passa a questa formula un `netto` già comprensivo di Pocket (adapter) e `pocketMoney = 0` in input calcolo, così il Pocket non viene sommato due volte come esentasse.

### Europa (`calcolaEuropa`)
- Riusa `calcolaItalia`, imposta `mode = "europa"` e `modeLabel = "Europa"`.

### Estero (`calcolaEuropaBaseAssunzione`)
1. `differenza = netto − quotaBase` (esentasse)  
2. `parteTassata = quotaBase`  
3. `costoLavoro = quotaBase × moltiplicatore`  
4. `totaleCosto = costoLavoro + differenza + pocketMoney + affitto + auto + costiStruttura`

> Adapter Estero: Pocket aggiunto a `quotaBase` (e a `netto`) così resta tassato senza alterare la formula.

### Overtime — helper
- `getEquivalent26Rate(rate, calendarDays) = rate × calendarDays / 26`

### Overtime tecnico (`calcolaOvertimeTecnico`) — immutabile
- Working: `quota = netto/26` → `costoOrario = (quota/ore) × magg`  
- Calendar: `quota = netto/giorni` → idem

### Overtime cliente (`calcolaOvertimeCliente`) — immutabile
- Working: `prezzoOrario = (rate26/ore) × magg`  
- Calendar: `getEquivalent26Rate(rate30, giorni)/ore × magg`

### Orchestrazione
- `calcolaOvertimeCompleto()` sceglie la sorgente (`getOvertimeCalcSource`) ma **non** cambia le formule OT.

---

## D) Template Draft

### Dove sono salvati
- Oggetto unico: **`DRAFT_TEMPLATES`** in `script.js` (sezione export Draft Word).
- Helper: `applyDraftTemplate(template, vars)` per placeholder `{nome}`.

### Come vengono utilizzati
- `buildDraftWordRows()` seleziona il template in base alle scelte UI / AppState.draft.
- `buildDraftWordSection()` genera titolo + tabella Word (28–30% / 70–72%, senza bordi).
- Nessuna parafrasi AI: solo template fissi + variabili.

### Sezioni automatiche (da AppState / calcolo)
| Voce | Fonte |
|------|--------|
| Remunerazione | Netto mensile + Rate candidato (netto÷26) |
| Straordinari auto | `AppState.overtime.tecnico.costoOrario` |
| Straordinari 1/10 | template fisso |
| Pocket Money | se pocket > 0 → `Euro {mensile/30} calendar day` |
| Date / durata | form draft + template “Indicativamente dal/al…” |
| Clausole (Nota, Prova, Preavviso, Assicurazioni) | testi fissi in `DRAFT_TEMPLATES` |

### Campi da utente / AppState.draft
- Posizione, Località, Progetto, Orario (preset/custom), Turnazione, Alloggio, Trasporti, Mob/Demob, Giorni viaggio, Contratto livello, testi personalizzati.

### Correzione testi
Modificare **solo** le stringhe in `DRAFT_TEMPLATES` — punto unico.

---

## E) File più importanti

### `index.html`
- **Ruolo:** markup UI SPA.  
- **Responsabilità:** tab, form costo/overtime/draft, id DOM.  
- **Dipendenze:** `style.css`, `script.js`, `lib/docx.min.js`.

### `style.css`
- **Ruolo:** presentazione.  
- **Responsabilità:** layout card/tab/overtime/draft.  
- **Dipendenze:** nessuna runtime.

### `script.js`
- **Ruolo:** tutta la logica.  
- **Responsabilità:** formule, AppState, OT, Draft, Word.  
- **Dipendenze:** DOM di `index.html`, `window.docx`.

### `lib/docx.min.js`
- **Ruolo:** generazione `.docx`.  
- **Responsabilità:** API Document/Packer/Table.  
- **Dipendenze:** nessuna (UMD).

### `VERSION.md`
- **Ruolo:** marcatura versione stabile.  
- **Responsabilità:** etichetta REV + elenco feature.

### `PROJECT_HANDOVER_REV02.md`
- **Ruolo:** passaggio conoscenza.  
- **Responsabilità:** vincoli e mappa sistema.

### Backup `BACKUP_REV02_STABLE/`
- **Ruolo:** rollback completo REV02.  
- **Responsabilità:** copia file applicativi congelati.

---

## F) Punti critici — NON modificare

1. Formule `calcolaItalia`, `calcolaEuropa`, `calcolaEuropaBaseAssunzione`, `calcolaMargineEPrezzi`.
2. Formule overtime `calcolaOvertimeTecnico`, `calcolaOvertimeCliente`, `getEquivalent26Rate`.
3. `buildTableRows` / `buildOvertimeWordParagraphs` salvo bugfix espliciti richiesti.
4. Non introdurre framework, database, Node obbligatorio.
5. Non pushare / aggiornare GitHub Pages senza richiesta esplicita.
6. Non riscrivere i testi di `DRAFT_TEMPLATES` con frasi “inventate”: solo testi aziendali approvati.
7. Non trattare di nuovo il Pocket Money come esentasse senza decisione prodotto.
8. Non usare il rate vendita cliente (`prezzoGiorno26`) come rate candidato nel Draft.

---

## G) Roadmap futura (solo idee — non implementare ora)

- Miglioramento UI / accessibilità
- Archivio tecnici
- Storico calcoli
- Generatore offerte cliente
- Persistenza `localStorage` / export-import JSON
- Export PDF (eventuale)
- Template Draft multipli / per cliente
- Allineamento `AppState.meta.versione` a REV02_STABLE in codice
- Test automatici smoke su formule

---

## H) Stato attuale

**REV02_STABLE è considerata una base stabile.**

Da questo punto:
- nuove feature solo in locale;
- prima di modifiche sostanziali creare un nuovo backup (`BACKUP_BEFORE_…`);
- rollback a REV02: ripristinare da `BACKUP_REV02_STABLE/`;
- rollback a REV01: `BACKUP_REV01_STABLE/`.

Sviluppo successivo: partire da questo handover rispettando la sezione F.

---

*Fine handover REV02_STABLE.*
