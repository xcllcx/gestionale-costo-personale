# Versione

**Versione:** REV03_SHARED

**Profilo:**
- **Stabile su GitHub Pages** per i moduli statici (Costo, Overtime, Draft Tecnico)
- **Stabile in locale** per l’applicazione completa incluso CV Manager AI
- **CV Manager AI** disponibile solo con staging locale (`npm run staging`) — non eseguito da GitHub Pages

Non è una release “production backend ready”.

## Funzionalità

| Modulo | GitHub Pages | Locale (staging) |
|--------|--------------|------------------|
| Calcolo Costi | Sì | Sì |
| Overtime | Sì | Sì |
| Draft Tecnico | Sì | Sì |
| CV Manager UI | Sì (AI disabilitata) | Sì |
| Analisi AI CV | No | Sì (`/api/analyze-cv`) |

## Link pubblico

https://xcllcx.github.io/gestionale-costo-personale/

## Avvio locale completo (CV Manager AI)

```bash
cp .env.example .env
# Impostare OPENAI_API_KEY — non commitare .env
npm install
npm run staging
```

Aprire: `http://127.0.0.1:8767/`

## Note

- Backup locale: `BACKUP_BEFORE_REV03_RC/` (escluso da Git)
- Tag: valutare `v3.0.0` solo se allineato alla strategia di release condivisa
