# Template Offerta Cliente (placeholder)

File principali (senza dati cliente compilati):

- `OFFERTA_CLIENTE_TEMPLATE.docx` — template con `{{PLACEHOLDER}}`
- `OFFERTA_CLIENTE_TEMPLATE_B.docx` — template B aziendale (stesso contenuto placeholder)

Su GitHub Pages / clone: l’utente carica manualmente il file template nell’UI Offerta Cliente.  
**Nessun fallback automatico al template A.**

Campioni offerta compilati (`OFF_234LC_*`, `OFF_239LC_*`) **non** sono nel repository.

## Placeholder

`{{OFFER_DATE}}` `{{SUBJECT}}` `{{LOCATION}}` `{{PROPOSAL_NUMBER}}`
`{{POSITION}}` `{{CANDIDATE}}` `{{CLIENT_NAME}}` `{{CLIENT_ADDRESS_1}}` `{{CLIENT_ADDRESS_2}}`
`{{CONTACT_TITLE}}` `{{CONTACT_NAME}}` `{{CONTACT_SURNAME}}`
`{{DAILY_RATE_TEXT}}` / `{{DAILY_RATE}}` `{{WORKING_HOURS_TEXT}}` / `{{WORKING_HOURS}}`
`{{OVERTIME_STANDARD}}` `{{OVERTIME_HOLIDAY}}` / `{{OVERTIME_HOLIDAY_ROW}}`
`{{POCKET_MONEY_ROW}}` `{{ACCOMMODATION_ROW}}` `{{TRANSPORTATION_ROW}}`
`{{TRAVELLING_DAY_ROW}}` `{{TICKET_FLIGHT_ROW}}` `{{MOB_DEMOB_ROW}}` `{{OWN_CAR_ROW}}`
`{{ROTATION_TITLE}}` `{{ROTATION_TEXT}}` `{{ROTATION_WORK_DAYS}}` `{{ROTATION_REST_DAYS}}`
`{{START_DATE}}` `{{END_DATE}}`

Righe opzionali vuote vengono rimosse in post-processing.
