# Managing Platform — Recruitment & Pricing Suite

Applicazione per calcolo costi personale, overtime, draft tecnico e CV Manager aziendale.

**Versione corrente:** `REV03_SHARED`

## VERSIONE GITHUB PAGES

Link: https://xcllcx.github.io/gestionale-costo-personale/

### Funzioni disponibili online

- Calcolo Costi
- Overtime
- Draft Tecnico
- Navigazione completa e generazione documenti nel browser

### CV Manager (su GitHub Pages)

- Interfaccia disponibile
- Funzione AI **non** disponibile (nessun backend su Pages)
- Messaggio informativo: *La funzione AI del CV Manager è disponibile esclusivamente nella versione locale.*
- Upload template / CV e operazioni non-AI restano accessibili dove non richiedono OpenAI

## Avvio locale completo (CV Manager AI)

```bash
cp .env.example .env
# Impostare OPENAI_API_KEY — non commitare .env
npm install
npm run staging
```

Aprire `http://127.0.0.1:8767/`

Lo staging server serve frontend statico + `GET /api/health` + `POST /api/analyze-cv`.

## Solo frontend statico (senza AI)

```bash
python -m http.server 8767
```

Su localhost è disponibile la modalità locale di sviluppo (API key nel browser) — vietata in pubblicazione.

## Test

```bash
npm test
```

Suite smoke senza chiave OpenAI (mock backend). Include verifica modalità GitHub Pages simulata.

## CI

GitHub Actions: `.github/workflows/ci.yml` esegue `npm test`.

## Documentazione

- `DEPLOYMENT.md` — Pages vs staging locale
- `PROJECT_HANDOVER_REV03.md` — contesto CV Manager
- `VERSION.md` — profilo release
- `.env.example` — variabili (valori fittizi)

## Sicurezza

- Nessuna API key nel client pubblico
- Nessun CV reale nel repository
- Modalità localDev solo su localhost
- Non committare `.env`

## Licenza / uso

Software interno personale. Non pubblicare segreti.
