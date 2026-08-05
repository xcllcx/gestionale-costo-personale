# REV04_OFFERTA_CLIENTE_STABLE

- **Nome revisione:** REV04_OFFERTA_CLIENTE_STABLE
- **Data:** 2026-08-05
- **Stato:** STABLE — pubblicata su GitHub / GitHub Pages
- **Cartella operativa locale:** `REV04_OFFERTA_CLIENTE_STABLE` (launcher `AVVIA_REV04.*`, porta `8767`)

## Moduli inclusi

1. Calcolo costo personale
2. Calcolo overtime
3. Draft Tecnico
4. Offerta Cliente
5. CV Manager

## Funzionalità Offerta Cliente

- Generazione Word da template aziendale B (caricamento manuale obbligatorio; nessun fallback template A)
- Import automatico da Calcolo costi, Overtime e Draft Tecnico
- Rate Type: Calendar Day / Working Day / Lump Sum (Monthly Rate)
- Pocket money, accommodation, transportation, logistics, rotation
- Proposal Number progressivo locale + filename allineato
- Formattazione importi italiana; arrotondamento commerciale `Math.ceil` sui rate offerta

## Ordine tab (solo UI)

1. Calcolo costo personale  
2. Calcolo overtime  
3. Draft Tecnico  
4. Offerta Cliente  
5. CV Manager  

## Launcher locale

- `AVVIA_REV04.bat` / `AVVIA_REV04.ps1` / `AVVIA_REV04_SILENZIOSO.vbs`
- `CHIUDI_REV04.bat` / `CHIUDI_REV04.ps1`
- Serve su `http://127.0.0.1:8767/` (non `file://`)
- In repository: gli stessi script funzionano dalla root del clone (`npm install` + avvio)

## Test eseguiti

- Suite automatica: `npm test`
- Fix Working Rate / Lump Sum Monthly / formattazione Draft (2026-08-03)
- Verifica operativa locale pre-publish (2026-08-05)

## Limitazioni note

- Offerta Cliente: template B aziendale da caricare manualmente (file placeholder in `templates/client_offer/`)
- Generazione Word via HTTP (locale o GitHub Pages statico)
- CV Manager AI Secure richiede backend locale; su Pages solo Browser (API key utente)
- **REV05 non inclusa** (Simulazione Costo Reale TES / reverse payroll — solo sviluppo locale futuro)

## Istruzione

- Non modificare i backup `BACKUP_REV04_*` già congelati in locale
- Evoluzioni successive (REV05+): solo in locale, su copia dedicata, senza mescolare in questa release
