# PROJECT HANDOVER — REV03 (CV Manager)

Documento di passaggio per agent / sviluppatori successivi.  
**Non contiene modifiche al codice.** Solo contesto operativo, vincoli e stato.

**Linea di lavoro:** REV03 — CV Manager → **REV03_SHARED**  
**Base legacy congelata:** REV02_STABLE  
**Data handover:** 2026-07-27 (aggiornato shared Pages)  
**GitHub Pages:** https://xcllcx.github.io/gestionale-costo-personale/ (statico: Costo/OT/Draft; CV AI solo locale)

### Staging server (locale, CV Manager AI completo)

```bash
cp .env.example .env   # OPENAI_API_KEY server-side
npm install
npm run staging        # http://127.0.0.1:8767/
```

Endpoint:
- `GET /api/health`
- `POST /api/analyze-cv`

Su GitHub Pages non si chiama `/api/*`: messaggio UI che l’AI è solo in versione locale.
Su localhost la UI verifica il backend all’avvio e disabilita “Analizza e genera” se non ready.


---

## A) Stato attuale del progetto

### Cosa funziona (produzione locale)

| Area | Stato |
|------|--------|
| Calcolo costo personale (Italia / Europa / Estero) | OK — invariato (REV02) |
| Pocket Money, rate candidato, rimborsi, margini | OK — invariato |
| Overtime automatico + manuale | OK — invariato |
| Draft Tecnico + export Word Draft | OK — invariato |
| Export Word costo/OT | OK — invariato |
| Tab **CV Manager** | OK — infrastruttura + pipeline |
| Upload template aziendale DOCX | OK — **qualsiasi DOCX accettato** |
| Upload CV DOCX/PDF | OK (`.doc` non supportato) |
| Estrazione testo (mammoth / pdf.js) | OK |
| Analisi OpenAI → JSON validato | OK (modalità locale o endpoint sicuro) |
| Generazione DOCX su template | OK (placeholder **oppure** shell) |
| Download CV aziendale | OK (auto + pulsante Scarica) |
| Anteprima editabile esperienze | **Rimossa** (FASE B2) — voluto |

### Come avviare in locale

I moduli REV03 usano **ES Modules** (`import` dinamico da `script.js`).  
**Non aprire** `index.html` via `file://` (i listener CV non si collegano).

```bash
cd gestionale-costo-personale
python -m http.server 8767
```

Aprire: `http://127.0.0.1:8767/index.html`

### Flusso operativo CV Manager (attuale)

```text
Carica template aziendale (DOCX qualsiasi)
→ Carica CV (DOCX o PDF testuale)
→ Seleziona lingua output
→ Configura AI (secure o localDev)
→ [Analizza e genera CV]
   → estrazione testo
   → OpenAI Responses API (JSON schema)
   → validazione
   → compilazione template → DOCX
   → download automatico
→ [Scarica CV Aziendale] / [Rigenera documento] / [Nuovo CV]
```

---

## B) Ultima versione stabile e backup

| Marca | Percorso | Note |
|-------|----------|------|
| **REV02_STABLE** | `BACKUP_REV02_STABLE/` | Ultima base **stabile congelata** (costo/OT/Draft). Rollback REV02 da qui. |
| Pre FASE A | `BACKUP_BEFORE_REV03_FASE_A/` | Prima della modularizzazione CV |
| Pre B1 | `BACKUP_BEFORE_REV03_B1/` | Prima di estrazione/OpenAI/JSON |
| Pre B2 | `BACKUP_BEFORE_REV03_B2/` | Prima di generazione Word + UI compatta |

**`VERSION.md` nel root è ancora etichettato `REV02_STABLE`** (non riallineato a REV03).  
REV03 è **feature branch locale di fatto**: codice presente, **non** marcato come nuova stable ufficiale e **non** pubblicato.

**Regola:** prima di modifiche sostanziali creare `BACKUP_BEFORE_…`.  
**Non** modificare formule / Overtime / Draft / Word legacy REV02.

---

## C) File creati e modificati (REV03)

### Creati

```text
modules/cvManager.js          — coordinamento UI + pipeline
modules/cvFileParser.js       — estrazione DOCX/PDF
modules/openAiClient.js       — client AI (secure / localDev)
modules/cvSchema.js           — schema JSON + validazione
modules/cvAnalysisView.js     — card "Stato elaborazione" (compatta)
modules/cvWordGenerator.js    — generazione DOCX da template
settings/aiSettings.js        — modello, modalità, API key (localStorage)
prompts/cv_parser_prompt.js   — prompt anti-invenzione
templates/cv_aziendale_template.docx
templates/build_cv_template.py
templates/README.md
lib/mammoth.browser.min.js
lib/pdfjs/pdf.min.mjs
lib/pdfjs/pdf.worker.min.mjs
lib/docxtemplater/pizzip.js
lib/docxtemplater/docxtemplater.js
PROJECT_HANDOVER_REV03.md     — questo documento
```

### Modificati (legacy minimo)

| File | Cosa è cambiato |
|------|-----------------|
| `index.html` | Tab CV Manager + markup card; script legacy invariato come ruolo |
| `style.css` | Stili CV Manager / stato compatto |
| `script.js` | Solo: `AppState.cvManager`, `switchView("cvManager")`, `registerRev03Modules()` |
| `.gitignore` | Backup REV03 + `tmp_cv_fixtures/` |

### Non toccati (vincolo assoluto)

- Formule `calcolaItalia` / `calcolaEuropa` / `calcolaEuropaBaseAssunzione` / `calcolaMargineEPrezzi`
- Formule overtime
- `DRAFT_TEMPLATES` / export Draft Word
- Export Word costo/OT (`handleEsportaWord`, `buildTableRows`, …)
- `AppState.calculation` / `overtime` / `draft` (struttura e logica)

---

## D) Architettura dei moduli

### Principio

- `script.js` = **legacy REV02** + bootstrap (`initApp` + `registerRev03Modules`)
- Nuova logica = **file separati ES Module**, nessun refactor massivo di `script.js`
- `AppState.cvManager` = ramo **indipendente** (non scrivere su calculation/overtime/draft)

### Bootstrap

```javascript
// script.js — registerRev03Modules()
import("./modules/cvManager.js").then(mod => mod.initCvManager(AppState))
```

### Mappa responsabilità

| File | Ruolo |
|------|--------|
| `cvManager.js` | Eventi UI, stati, orchestrazione analisi+generazione, Nuovo/Rigenera/Download |
| `cvFileParser.js` | Lazy-load mammoth/pdf.js; estrazione; soglia testo minimo |
| `openAiClient.js` | `analyzeCvWithAI`; Responses API o `POST /api/analyze-cv` |
| `cvSchema.js` | `CV_JSON_SCHEMA`, `validateCvAnalysis`, normalizzazione |
| `cv_parser_prompt.js` | System/user prompt; divieto invenzione |
| `aiSettings.js` | localStorage key/model/mode/endpoint; mai key in AppState |
| `cvWordGenerator.js` | Placeholder **o** shell; nome file; download blob |
| `cvAnalysisView.js` | Solo riepilogo sintetico (niente editor esperienze) |

### AppState.cvManager (forma attuale)

```javascript
{
  template: null,           // { name, type, size, base64, arrayBuffer, placeholdersOk?, fillMode? }
  uploadedFile: null,       // { name, type, size, format, file }
  extractedText: "",
  detectedLanguage: "unknown",  // it|en|other|unknown
  outputLanguage: "same",       // same|it|en
  model: "gpt-5.5",
  analysisStatus: "idle",       // idle|file_loaded|extracting|extracted|analyzing|validating|ready|error_*
  analysis: null,               // JSON validato (fonte unica per Word)
  validationErrors: [],
  lastError: null,
  generationStatus: "idle",     // idle|generating|completed|error
  generatedDocument: null,      // Blob DOCX
  generatedFileName: ""
}
```

**API key:** mai in `AppState`. Solo `localStorage` (`gestionale.cvManager.apiKey`) in modalità locale.

---

## E) Funzionamento completo del CV Manager

### UI (ordine card)

1. Template Aziendale — carica / sostituisci / usa template predefinito  
2. Curriculum — DOCX/PDF  
3. Lingua output — stessa / IT / EN  
4. Configurazione AI — secure (default) / localDev  
5. Stato elaborazione — riepilogo compatto  
6. Azioni — Analizza e genera / Nuovo CV / Rigenera / Scarica  

### Pulsanti

| Pulsante | Comportamento |
|----------|----------------|
| **Analizza e genera CV** | Estrazione (se serve) → OpenAI (se `analysis` assente) → Word → download auto |
| **Rigenera documento** | Solo Word da `analysis` esistente — **nessuna** chiamata OpenAI |
| **Scarica CV Aziendale** | Download del Blob già generato |
| **Nuovo CV** | Pulisce CV/testo/analisi/documento; **mantiene** template, AI, lingua output |

### Regole di invalidazione

- Nuovo file CV → cancella analisi e documento  
- Cambio lingua output → cancella analisi (serve nuova chiamata AI)  
- Sostituzione template → cancella documento generato; **analisi JSON resta** (Rigenera ok)

### Formati CV

- **DOCX** — mammoth  
- **PDF** testo selezionabile — pdf.js  
- **PDF scansito / senza testo** — errore utente, no OCR  
- **DOC** — messaggio: convertire in DOCX/PDF  

---

## F) Librerie utilizzate

| Libreria | Percorso | Uso |
|----------|----------|-----|
| mammoth 1.9 | `lib/mammoth.browser.min.js` | Testo da DOCX (lazy) |
| pdfjs-dist 4.10 | `lib/pdfjs/*.mjs` | Testo da PDF (lazy) |
| PizZip | `lib/docxtemplater/pizzip.js` | ZIP DOCX in browser |
| docxtemplater 3.55 | `lib/docxtemplater/docxtemplater.js` | Sostituzione `{{...}}` |
| docx (già REV02) | `lib/docx.min.js` | Solo export Word **costo/OT/Draft** — **non** usato per CV aziendale |

Delimiter docxtemplater: `{ start: "{{", end: "}}" }` (default single-brace andrebbe in conflitto).

---

## G) Schema JSON (analisi AI)

Tutte le chiavi sempre presenti; stringhe vuote / array vuoti; **no null**; no proprietà extra.

```json
{
  "sourceLanguage": "it|en|other|unknown",
  "outputLanguage": "it|en|other|unknown",
  "primaryInformation": {
    "fullName": "",
    "skill": "",
    "yearOfBirth": "",
    "nationality": "",
    "languages": [],
    "address": ""
  },
  "summary": "",
  "education": [
    { "period": "", "institution": "", "qualification": "", "location": "", "details": "" }
  ],
  "experience": [
    {
      "period": "", "company": "", "client": "", "project": "",
      "position": "", "location": "", "description": []
    }
  ],
  "otherInformation": [{ "label": "", "content": "" }],
  "warnings": []
}
```

Validazione: `validateCvAnalysis()` in `cvSchema.js`.  
Prompt: `prompts/cv_parser_prompt.js` — **divieto di inventare** dati; summary vuoto se assente nel CV.

---

## H) Gestione API OpenAI

### Modalità

| Mode | Default | Comportamento |
|------|---------|---------------|
| `secure` | **Sì** | `POST` verso endpoint configurabile (default `/api/analyze-cv`). Key solo backend. |
| `localDev` | No | Chiamata diretta `https://api.openai.com/v1/responses`. Solo localhost/file. |

Commento obbligatorio nel codice:

`SECURITY: direct browser API access is allowed only for local development and must never be deployed publicly.`

### Sicurezza chiave

- Non in codice, Git, AppState, log, messaggi errore, JSON CV  
- Locale: `localStorage` + campo password + hint mascherato  
- Su host pubblico: localDev forzato off  

### API

- **Responses API** + `text.format.type = json_schema` (strict) con `CV_JSON_SCHEMA`  
- Modello configurabile in UI (default iniziale `gpt-5.5`)  
- Errori mappati a messaggi utente (auth, quota, rate limit, timeout, JSON invalido, …)

### Backend sicuro

**Non implementato.** L’endpoint `/api/analyze-cv` è solo contratto lato client. Per deploy pubblico va creato un backend con env var key.

---

## I) Metodo di generazione DOCX

File: `modules/cvWordGenerator.js` → `generateCvDocx({ templateBuffer, analysis })`

### Due modalità

1. **`placeholders`** — se il template contiene tutti i marker `{{…}}`  
   → docxtemplater fill, layout/celle/logo intatti  

2. **`shell`** (default per template aziendali reali senza marker)  
   → apre il DOCX con PizZip  
   → **conserva** header, footer, media, styles, `sectPr` (margini, riferimenti)  
   → **sostituisce** il contenuto di `<w:body>` con paragrafi CV (Times New Roman 12 / titoli Segoe UI 14)  
   → se i placeholder falliscono a runtime → fallback automatico a shell  

### Nome file

`CV_{Skill}_{Nome Iniziale}_{anno}_{Naz}.docx`  
Fallback: `CV_Aziendale.docx`

### Campi vuoti in Experience

Non stampare etichette `Client:` / `Project:` / `Location:` se il valore è vuoto.  
Summary vuoto → nessuna invenzione.

---

## J) Placeholder del template (opzionali)

Documentati in `templates/README.md`.

| Marker | Fonte |
|--------|--------|
| `{{FULL_NAME}}` | `primaryInformation.fullName` |
| `{{SKILL}}` | `primaryInformation.skill` |
| `{{YEAR_OF_BIRTH}}` | `primaryInformation.yearOfBirth` |
| `{{NATIONALITY}}` | `primaryInformation.nationality` |
| `{{LANGUAGES}}` | lingue unite |
| `{{ADDRESS}}` | `primaryInformation.address` |
| `{{SUMMARY}}` | `summary` |
| `{{EDUCATION}}` | blocco testo da `education[]` |
| `{{EXPERIENCE}}` | blocco testo da `experience[]` |
| `{{OTHER_INFORMATION}}` | blocco da `otherInformation[]` |

Template di esempio con marker: `templates/cv_aziendale_template.docx`  
Ricostruzione: `python templates/build_cv_template.py`

**Regola prodotto (post-correzione):** il template aziendale dell’utente va **sempre accettato**, anche senza questi marker.

---

## K) Ultime correzioni richieste (dall’utente)

1. Il template aziendale, una volta caricato, veniva rifiutato (“non ha i campi richiesti”) → **deve accettarlo sempre**.  
2. Dopo l’analisi non si poteva scaricare il CV impaginato sul template → generazione bloccata dal punto 1 / download non esposto.

---

## L) Correzioni già completate

- [x] Accettazione di **qualsiasi DOCX** template (niente alert bloccante sui placeholder)  
- [x] Modalità **shell** se mancano i marker (header/footer/logo preservati)  
- [x] Fallback shell se docxtemplater fallisce  
- [x] Download automatico a fine generazione + pulsante Scarica  
- [x] Rimozione anteprima estesa (B2)  
- [x] Pulsante unico Analizza e genera; Rigenera senza OpenAI; Nuovo CV  
- [x] API key fuori da AppState  
- [x] DOC non supportato esplicitamente  
- [x] PDF senza testo → messaggio scansione  

---

## M) Correzioni / lavori ancora da completare

| Voce | Priorità | Note |
|------|----------|------|
| Backend `/api/analyze-cv` per deploy pubblico | Alta per Pages | Oggi solo contratto client |
| Allineare `VERSION.md` / `AppState.meta.versione` a REV03 | Media | Ancora etichette REV02/REV01 |
| Mappatura più fedele su template aziendali complessi (tabelle fisse, zone logo multiple) | Media | Shell sostituisce tutto il body |
| Inserimento placeholder nel template reale del cliente (opzionale, qualità massima) | Media | Meglio di shell per layout Primary Information a griglia |
| OCR PDF scansiti | Bassa | Esplicitamente fuori scope B1/B2 |
| Supporto `.doc` | Bassa | Richiede libreria/conversione affidabile |
| Marcatura ufficiale `REV03_STABLE` + backup omonimo | Media | Solo dopo smoke end-to-end utente |
| Push GitHub / aggiornamento Pages | **Solo su richiesta esplicita** | Attualmente vietato |

---

## N) Bug noti / limitazioni

1. **`file://`**: CV Manager non si inizializza (ES modules). Serve HTTP locale.  
2. **Shell mode**: sostituisce l’intero body del template; testi/placeholder “demo” nel corpo del template aziendale vengono sovrascritti (header/footer/media restano).  
3. **Experience come blocco testo**: non è un loop nativo Word; elenchi sono paragrafi con `- `. Modificabili in Word dopo il download.  
4. **Endpoint sicuro assente**: in modalità secure senza backend, l’analisi fallisce con errore di rete (atteso). Usare **Locale temporanea** in sviluppo.  
5. **localStorage template**: file grandi possono superare la quota browser.  
6. **Chiave API in chat**: l’utente ha incollato una key in conversazione → raccomandare rotazione su OpenAI.  
7. **Test live OpenAI end-to-end** (traduzioni IT↔EN su CV reali lunghi) non tutti eseguiti dall’agent in modo esaustivo.

---

## O) Test eseguiti

| Area | Esito |
|------|--------|
| Estrazione DOCX / PDF testuale | OK (fixture) |
| PDF senza testo | OK messaggio |
| DOC rifiutato | OK messaggio |
| Validazione schema JSON / proprietà extra | OK |
| UI compatta senza editor esperienze | OK |
| Generazione con template+placeholder | OK |
| Generazione shell (senza placeholder) + header preservato | OK (logica implementata + smoke) |
| 22 esperienze nel DOCX, no DOM pesante | OK |
| Summary vuoto non inventato | OK |
| Rigenera senza OpenAI (codice) | OK |
| Isolamento AppState.calculation / draft | OK |
| Accettazione template senza marker (fix) | OK (post-fix) |

---

## P) Test ancora necessari (consigliati al prossimo agent / utente)

1. Template **reale** aziendale dell’utente → Analizza e genera → aprire DOCX in Word (logo, footer, multipagina).  
2. CV lungo reale (≥20 esperienze) IT→EN e EN→IT.  
3. CV senza summary → nessun testo inventato nel Word.  
4. Cambio lingua → nuova analisi; solo Rigenera → nessuna seconda chiamata AI.  
5. Nuovo CV → pulizia stato; template e AI restano.  
6. Regressione: Calcola costo, Overtime, Draft Word, Esporta Word.  
7. Modalità secure con mock backend (quando disponibile).  
8. Verifica download su browser che bloccano popup (pulsante Scarica).

---

## Q) Istruzioni esatte per il prossimo agent

1. **Leggere** questo file e, se serve contesto legacy, `PROJECT_HANDOVER_REV02.md`.  
2. **Non** modificare formule costo, overtime, Draft, export Word REV02.  
3. **Non** pushare / non aggiornare GitHub Pages senza richiesta esplicita.  
4. Prima di cambi sostanziali: backup `BACKUP_BEFORE_…`.  
5. Avviare sempre con HTTP (`python -m http.server …`), mai solo `file://`.  
6. Nuova logica solo in `modules/`, `settings/`, `prompts/`, `templates/` — `script.js` solo bootstrap minimo.  
7. API key: mai in repo, mai in AppState, mai nei log.  
8. Se si migliora il fill del template aziendale:
   - preferire **non** rompere shell mode (sempre accettare DOCX);
   - opzionale: tool per iniettare placeholder nel template cliente;
   - non chiedere a OpenAI di generare Word.  
9. OpenAI produce **solo JSON**; Word solo da `cvWordGenerator.js` + `analysis`.  
10. Dopo fix: aggiornare questo handover o creare `PROJECT_HANDOVER_REV03_x.md`.  
11. Se l’utente chiede “stable”: aggiornare `VERSION.md`, creare `BACKUP_REV03_STABLE/`, documentare.  
12. Backend `/api/analyze-cv`: fuori dal vanilla statico attuale — valutare solo se richiesto esplicitamente.

### Checklist ripresa rapida CV Manager

```text
[ ] HTTP server attivo
[ ] Tab CV Manager visibile e moduli caricati (no errori console su import)
[ ] Template DOCX accettato (anche senza {{}})
[ ] CV DOCX/PDF estratto
[ ] localDev + key in localStorage OPPURE backend secure
[ ] Analizza e genera → Blob + download
[ ] Rigenera senza network OpenAI
[ ] Altre tab REV02 ancora OK
```

---

## R) Conferme finali

| Voce | Stato |
|------|--------|
| REV02_STABLE (formule / OT / Draft / Word legacy) | Non alterata nella logica |
| GitHub remoto | **Non aggiornato** |
| GitHub Pages | **Non aggiornato** |
| Push | **Non eseguiti** in questa linea REV03 |
| Anteprima estesa esperienze | Rimossa |
| JSON analisi | Interno in `AppState.cvManager.analysis` |
| Template senza placeholder | Accettato (shell mode) |

---

*Fine handover REV03 — CV Manager (post FASE A/B1/B2 + correzione accettazione template).*
