# Versione

**Versione:** REV04_OFFERTA_CLIENTE_STABLE  
**Tag:** `REV04_OFFERTA_CLIENTE_STABLE` (alias semantico `v4.1.0` se creato)

**Profilo:**
- **Stabile su GitHub Pages** per Costo, Overtime, Draft Tecnico, Offerta Cliente (template caricato manualmente), CV Manager in modalità Browser
- **Stabile in locale** con launcher REV04 / `npm run staging` (Secure + Browser)
- Nessuna API key nel repository o nel bundle pubblicato
- **REV05 non inclusa**

## Funzionalità

| Modulo | GitHub Pages | Locale (staging / launcher) |
|--------|--------------|-------------------------------|
| Calcolo Costi | Sì | Sì |
| Overtime | Sì | Sì |
| Draft Tecnico | Sì | Sì |
| Offerta Cliente | Sì (template manuale) | Sì |
| CV Manager UI | Sì | Sì |
| Analisi AI CV (Browser) | Sì (API key utente) | Sì |
| Analisi AI CV (Secure) | No (nessun backend) | Sì |

## Link pubblico

https://xcllcx.github.io/gestionale-costo-personale/

## Avvio locale

```bash
cp .env.example .env
# Impostare OPENAI_API_KEY — non commitare .env
npm install
npm run staging
# oppure AVVIA_REV04.bat
```

Aprire: `http://127.0.0.1:8767/`
