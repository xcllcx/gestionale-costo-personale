# REV03_RELEASE_CANDIDATE — Piano

## Hosting attuale
- Repo: `xcllcx/gestionale-costo-personale`
- Branch: `main` → GitHub Pages (statico)
- Ultimo commit remoto: publish statico (pre-REV03)

## Untracked da versionare
- `modules/`, `settings/`, `prompts/`, `templates/`, `lib/docxtemplater/`, `lib/mammoth*`, `lib/pdfjs/`
- `VERSION.md`, handover docs

## Escludere dal publish
- `BACKUP_*`, `tmp_cv_fixtures/`, `.env`, CV reali, log, cache editor

## Architettura RC
1. Frontend statico invariato (Pages-compatible)
2. Backend Node (`server/`) con `GET /api/health` + `POST /api/analyze-cv`
3. Staging: `npm run staging` = Express serve static + API
4. Produzione futura: Pages + `OPENAI` backend separato, oppure stesso server Node

## Non toccare
Formule costo/OT, Draft, schema JSON, prompt, layout Word/UI
