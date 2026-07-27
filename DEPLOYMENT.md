# Deployment — REV03_SHARED

## Ambienti

| Ambiente | Tecnologia | Cosa funziona |
|----------|------------|----------------|
| **GitHub Pages** | Statico (`main` / root) | Costo, Overtime, Draft; CV Manager UI senza AI |
| **Staging / locale** | `npm run staging` (Express) | Tutto + `GET /api/health` + `POST /api/analyze-cv` |

## GitHub Pages

URL: https://xcllcx.github.io/gestionale-costo-personale/

- Branch: `main`, cartella `/`
- Nessun backend Node su Pages
- **CV Manager:** modalità **Browser — API key personale** (chiave inserita dall’utente; mai nel repo)
- Modalità Sicura non pronta su Pages (nessun `/api/health`)
- Nessuna chiamata automatica a `/api/*` in modalità Browser

## Staging locale (CV Manager completo)

1. `cp .env.example .env` e impostare `OPENAI_API_KEY`
2. `npm install`
3. `npm run staging`
4. Aprire `http://127.0.0.1:8767/`

## Sicurezza publish

Non pubblicare: `.env`, `node_modules/`, `BACKUP_*`, CV reali, log, cache, file temporanei.

## Tag

`v3.0.0` solo se esplicitamente richiesto e coerente con la strategia di release.
