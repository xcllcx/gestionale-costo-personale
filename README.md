# Managing Platform — Recruitment & Pricing Suite

Applicazione per calcolo costi personale, overtime, draft tecnico, offerta cliente e CV Manager aziendale.

**Versione corrente:** `REV04_OFFERTA_CLIENTE_STABLE`

## VERSIONE GITHUB PAGES

Link: https://xcllcx.github.io/gestionale-costo-personale/

### Funzioni disponibili online

- Calcolo Costi
- Overtime
- Draft Tecnico
- **Offerta Cliente** (template Word B caricato manualmente)
- CV Manager (UI + modalità Browser)
- Navigazione completa e generazione documenti nel browser

### Offerta Cliente (su GitHub Pages)

- Caricare il template placeholder da `templates/client_offer/OFFERTA_CLIENTE_TEMPLATE_B.docx` (o master aziendale)
- Nessun fallback al vecchio template A
- Import dati da Costo / Overtime / Draft; rate Calendar / Working / Lump Sum mensile

### CV Manager (su GitHub Pages)

- Interfaccia disponibile
- Modalità **Browser — API key personale**: ogni utente inserisce la propria chiave (mai nel repository)
- Modalità Sicura non disponibile (Pages non esegue Express)

## Avvio locale completo

```bash
cp .env.example .env
# Impostare OPENAI_API_KEY — non commitare .env
npm install
npm run staging
```

Oppure launcher: `AVVIA_REV04.bat` → `http://127.0.0.1:8767/`

## Test

```bash
npm test
```

Suite smoke senza chiave OpenAI (mock backend).

## CI

GitHub Actions: `.github/workflows/ci.yml` esegue `npm test`.

## Documentazione

- `REVISION_INFO.md` — revisione corrente
- `DEPLOYMENT.md` — Pages vs staging locale
- `CHANGELOG.md` — storico modifiche
- `VERSION.md` — profilo versione

## Sicurezza

Non committare: `.env`, `key.txt`, API key, CV reali, cedolini, backup locali, offerte Word compilate.

## REV05

Non inclusa in questa release (sviluppo solo locale futuro).
