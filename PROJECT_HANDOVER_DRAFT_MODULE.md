# PROJECT HANDOVER — Modulo Draft Tecnico

Documento di passaggio per un nuovo agent.  
**Non contiene modifiche al codice.** Solo contesto e istruzioni operative.

---

## 1) Stato attuale progetto

### Versione stabile
- **REV01_STABLE** salvata correttamente.
- Backup completo: cartella `BACKUP_REV01_STABLE/`
- File versione: `VERSION.md`
- Backup pre-AppState: `BACKUP_BEFORE_APPSTATE/`

### Architettura attuale
- Applicazione **vanilla** (HTML + CSS + JS), senza framework, senza Node, senza database.
- **SPA a tab**: `Calcolo costo personale` | `Calcolo overtime` (nessun reload pagina).
- Store centralizzato: **`AppState`** (esposto anche come `window.AppState`).

```text
AppState = {
  meta: { versione, dataCreazione },
  calculation: null | { ...snapshot, fullResult },
  overtime: null | { ... },
  draft: {}                    // riservato al nuovo modulo
}
```

Alias di compatibilità REV01 (sempre allineati ad AppState tramite setter):
- `lastResult` ↔ `AppState.calculation.fullResult`
- `currentCalculation` ↔ `AppState.calculation`
- `lastOvertime` ↔ `AppState.overtime`

Setter da usare:
- `setAppCalculation(result | null)`
- `setAppOvertime(ot | null)`
- `clearAppCalculationAndOvertime()`

### File principali
| File | Ruolo |
|------|--------|
| `index.html` | UI + navigazione SPA (`viewCosto`, `viewOvertime`) |
| `style.css` | Design system (card, tab, overtime) |
| `script.js` | Logica completa (calcoli, AppState, Word) |
| `lib/docx.min.js` | Libreria export `.docx` (browser UMD) |
| `VERSION.md` | Marcatura versione |
| `.gitignore` | Esclude backup locali dal repo |

### Funzionalità già presenti
- Calcolo costo personale (Italia / Europa / Estero — ex Europa Base Assunzione)
- Rimborsi (pocket, affitto, auto), trasferta, costi struttura, moltiplicatore, margine
- Rate giornalieri 26 / 30 / 21,7
- Modulo Overtime orario (€/ora), tecnico e cliente indipendenti
- Esportazione Word (costo + overtime se calcolato)
- Memoria sessione volatile (niente persistenza su disco/DB)

### Deploy
- GitHub Pages (pubblico): configurato in precedenza.
- **Sviluppo nuove feature: solo locale.** Non pushare finché non richiesto esplicitamente.

---

## 2) Obiettivo nuova implementazione

Aggiungere il modulo **Draft Tecnico**:

- Nuova sezione/tab nella SPA (stesso stile gestionale).
- Compilazione dati per bozza tecnica proposta candidato/cliente.
- Dati collegati ad **AppState** (`AppState.draft` + lettura da `AppState.calculation` / `AppState.overtime`).
- **Prossimo step operativo (vedi §5):** solo UI + struttura dati, **senza** export Word.

---

## 3) Decisioni già prese — struttura Draft

Campi e opzioni definiti dal product owner. Implementare secondo questa specifica.

| Sezione | Tipo | Dettaglio |
|---------|------|-----------|
| **Posizione** | testo libero | — |
| **Località** | testo libero | — |
| **Progetto** | testo libero | — |
| **Periodo progetto** | calendario **oppure** testo indicativo | Entrambe le modalità ammesse |
| **Orario lavoro** | scelta | `60h/6gg` · `48h/6gg` · `40h/5gg` · **personalizzato** |
| **Turnazione** | libero / preset | Formato libero (es. `90/15`) · `TBD` · `N/A` |
| **Straordinari** | scelta | Automatico da overtime tecnico · Manuale · Formula `1/10` rate giornaliero · `N/A` |
| **Alloggio** | scelta | Cliente · Candidato · Contributo massimo · Personalizzato |
| **Trasporti locali** | scelta | Cliente · Candidato · Renting auto city car a nostro carico · Personalizzato |
| **Mob/Demob** | scelta + flag | Standard · `N/A` · checkbox **voli a nostro carico** |
| **Giorni viaggio** | scelta | `100%` · `50%` · `N/A` |
| **Contratto** | scelta | CCNL Commercio · livello **1°** o **2°** |
| **Remunerazione** | auto da AppState | Recupero automatico **netto mese** · recupero automatico **rate26** |
| **Clausole finali** | testo fisso | Contenuto fisso (non editabile dall’utente, o solo lettura) |

### Mapping dati automatici (Remunerazione / Straordinari)
- **Netto mese** ← `AppState.calculation.netto` (richiede calcolo costo già eseguito).
- **Rate 26** ← `AppState.calculation.rate26`.
- **Straordinari automatici da OT tecnico** ← `AppState.overtime.tecnico.costoOrario` (o struttura equivalente in `lastOvertime`), solo se overtime già calcolato.

Se calculation/overtime assenti: UI deve segnalarlo (come già fa la vista Overtime con “Dati non disponibili”), senza inventare valori.

---

## 4) Regole importanti

1. **NON modificare** le formule REV01 (`calcolaItalia`, `calcolaEuropa`, `calcolaEuropaBaseAssunzione`, formule overtime orarie, `getEquivalent26Rate`, ecc.).
2. **Usare AppState** come unico punto di accesso dati tra moduli; non creare store paralleli.
3. **Sviluppo solo locale**; non aggiornare GitHub Pages / non pushare salvo richiesta esplicita dell’utente.
4. **Mantenere rollback**:
   - Prima di ogni modifica sostanziale: copia backup (es. `BACKUP_BEFORE_DRAFT_UI/`).
   - Rollback a REV01: ripristinare da `BACKUP_REV01_STABLE/`.
5. **Non rompere** tab Costo e Overtime esistenti (stessi id form/risultati dove possibile; nuove sezioni isolate).
6. **Nessun database / nessun Node / nessun framework** — restare su HTML/CSS/JS puri.
7. Coerenza UI: palette bianco / blu scuro / grigio chiaro, card, ombre leggere (come REV01).

---

## 5) Prossimo step (scope immediato)

### Fare
- Aggiungere tab/navigazione **Draft Tecnico**.
- Implementare **solo UI** dei campi elencati in §3.
- Definire e popolare **`AppState.draft`** (struttura dati JS allineata ai campi).
- Collegare campi automatici (netto, rate26, OT tecnico) in sola lettura da AppState.
- Validazioni UX minime (es. avviso se manca calculation).

### Non fare (in questo step)
- Export Word del Draft.
- Archivio tecnici.
- Storico calcoli.
- Offerte cliente.
- Persistenza `localStorage` (salvo se strettamente necessario per non perdere bozza in sessione — **preferire solo RAM/AppState** in questo step).

### Criterio di done
- Si può compilare il Draft in UI.
- I dati sono in `AppState.draft`.
- Remunerazione/OT automatici riflettono AppState quando disponibili.
- Costo e Overtime REV01 invariati nei risultati.
- Backup creato prima delle modifiche.

---

## 6) Riferimenti rapidi codice

- Store: sezione `AppState` in `script.js` (inizio stato applicazione).
- Calcolo → AppState: `setAppCalculation` / `syncCurrentCalculation`.
- Overtime → AppState: `setAppOvertime` / `calcolaOvertimeCompleto`.
- Navigazione SPA: `switchView`, tab `.nav-tab`, pannelli `#viewCosto` / `#viewOvertime`.
- Pattern UI da replicare: card + `field-group` + `radio-chip` (vedi Overtime).

---

## 7) Contatti / contesto prodotto

- App: gestionale costo personale + overtime.
- Branding footer: Crafted with Cursor by Lorenzo Coluccelli.
- Label contratto “Estero” = modalità interna `europa-base`.

---

*Fine handover. Prossimo agent: partire da §5, rispettando §4.*
