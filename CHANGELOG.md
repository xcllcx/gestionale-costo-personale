# CHANGELOG

## HOTFIX Overtime tecnico (2026-07-28)

### Fixed
- La base overtime lato tecnico usa esclusivamente il **netto mensile** (`nettoMensile`)
- Pocket money e voci accessorie non influenzano più rate/giorno, rate/ora e OT tecnico
- Pannello importato OT mostra il netto mensile corretto

## REV03_SHARED — Browser AI su GitHub Pages (2026-07-27)

### Changed
- Modalità Browser (API key personale) consentita su `*.github.io` oltre a localhost/file
- Helper centralizzato `isBrowserAiAllowed()`
- Secure resta disponibile in locale; su Pages non pronta senza backend
- Opzione “Non salvare la chiave su questo dispositivo”
- Messaggi errore AI allineati (401/429/rete)

## REV03_SHARED (2026-07-27)

### Added
- Pubblicazione GitHub Pages della suite statica REV03
- Fallback sicuro CV Manager su Pages (nessun health check di rete; AI solo locale)
- Smoke test modalità GitHub Pages simulata

### Notes
- Pages: Costo, Overtime, Draft Tecnico
- Locale (`npm run staging`): CV Manager AI completo
- Non è “production backend ready”

## REV03_RELEASE_CANDIDATE (2026-07-27)

### Added
- Backend Node Express: `GET /api/health`, `POST /api/analyze-cv`
- Health check client + disabilitazione “Analizza e genera” se backend non pronto
- AbortController su fetch AI (timeout reale)
- Smoke tests (`npm test`) e workflow CI GitHub Actions
- Documentazione README / DEPLOYMENT / .env.example

### Fixed
- Readiness AI basata solo su stringa endpoint (falso positivo)
- Persistenza template: fillMode ripristinato; niente base64+ArrayBuffer simultanei in memoria
- Busy gating ampliato (upload, lingua, modalità AI, download)

### Security
- API key OpenAI solo server-side in modalità secure
- Modalità localDev bloccata fuori localhost
- Nessun log di CV text / risposte modello complete lato server
