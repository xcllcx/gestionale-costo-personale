# Template CV aziendale (REV03 FASE B2)

## File

- `cv_aziendale_template.docx` — template compatibile con placeholder stabili.
  Conserva header, footer, stili (Times New Roman 12 pt corpo, Segoe UI 14 pt titoli).

## Placeholder (opzionali)

Se presenti, vengono compilati automaticamente:

| Marker | Fonte JSON |
|--------|------------|
| `{{FULL_NAME}}` | `primaryInformation.fullName` |
| `{{SKILL}}` | `primaryInformation.skill` |
| `{{YEAR_OF_BIRTH}}` | `primaryInformation.yearOfBirth` |
| `{{NATIONALITY}}` | `primaryInformation.nationality` |
| `{{LANGUAGES}}` | `primaryInformation.languages` (unite) |
| `{{ADDRESS}}` | `primaryInformation.address` |
| `{{SUMMARY}}` | `summary` |
| `{{EDUCATION}}` | blocco formattato da `education[]` |
| `{{EXPERIENCE}}` | blocco formattato da `experience[]` |
| `{{OTHER_INFORMATION}}` | blocco formattato da `otherInformation[]` |

**Importante:** un template aziendale **senza** questi marker viene comunque accettato.
In quel caso il sistema conserva header/footer/logo/stili del file e scrive il CV nel corpo del documento (modalità shell).

I titoli di sezione del template di esempio usano capitalizzazione naturale
(`Primary Information`, `Summary`, …), non il tutto maiuscolo.
