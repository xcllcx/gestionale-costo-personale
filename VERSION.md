# Versione

**Versione:** REV03_SHARED (+ hotfix overtime tecnico 2026-07-28)

**Profilo:**
- **Stabile su GitHub Pages** per Costo, Overtime, Draft Tecnico e **CV Manager in modalità Browser** (API key personale dell’utente)
- **Stabile in locale** con modalità Sicura (backend Express) e/o Browser
- Nessuna API key nel repository o nel bundle pubblicato
- **Hotfix:** overtime tecnico basato solo sul netto mensile (pocket escluso)

## Funzionalità

| Modulo | GitHub Pages | Locale (staging) |
|--------|--------------|------------------|
| Calcolo Costi | Sì | Sì |
| Overtime | Sì | Sì |
| Draft Tecnico | Sì | Sì |
| CV Manager UI | Sì | Sì |
| Analisi AI CV (Browser) | Sì (API key utente) | Sì |
| Analisi AI CV (Secure) | No (nessun backend) | Sì (`npm run staging`) |

## Link pubblico

https://xcllcx.github.io/gestionale-costo-personale/

## Avvio locale completo (Secure + Browser)

```bash
cp .env.example .env
# Impostare OPENAI_API_KEY — non commitare .env
npm install
npm run staging
```

Aprire: `http://127.0.0.1:8767/`
