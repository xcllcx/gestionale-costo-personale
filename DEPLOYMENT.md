# Deployment — REV04_OFFERTA_CLIENTE_STABLE

## Ambienti

| Ambiente | Tecnologia | Cosa funziona |
|----------|------------|----------------|
| **GitHub Pages** | Statico (`main` / root) | Costo, Overtime, Draft, Offerta Cliente (template manuale), CV Manager UI |
| **Staging / locale** | `npm run staging` o launcher `AVVIA_REV04.*` | Tutto + `GET /api/health` + `POST /api/analyze-cv` |

## GitHub Pages

URL: https://xcllcx.github.io/gestionale-costo-personale/

- Branch: `main`, cartella `/`
- Nessun backend Node su Pages
- **Offerta Cliente:** caricare il template B da `templates/client_offer/OFFERTA_CLIENTE_TEMPLATE_B.docx` (o master aziendale). Nessun fallback template A.
- **CV Manager:** modalità **Browser — API key personale** (chiave inserita dall’utente; mai nel repo)
- Modalità Sicura non pronta su Pages (nessun `/api/health`)

## Staging locale

1. `cp .env.example .env` e impostare `OPENAI_API_KEY`
2. `npm install`
3. `npm run staging` oppure doppio clic su `AVVIA_REV04.bat`
4. Aprire `http://127.0.0.1:8767/`

## Sicurezza publish

Non pubblicare: `.env`, `key.txt`, `node_modules/`, `BACKUP_*`, `REV04_OFFERTA_CLIENTE_STABLE/` (copia operativa locale), CV reali, cedolini, offerte Word compilate, log, cache, file temporanei.

## Tag

`REV04_OFFERTA_CLIENTE_STABLE` — release stabile Offerta Cliente.
