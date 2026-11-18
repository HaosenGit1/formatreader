# Sample sheets

- `locked-password-1234.xlsx`: `wind-report.xlsx` encrypted with the password `1234` (Agile encryption, 100 000 rounds) by the reference encryptor in `tests/words/office-decrypt.test.ts`.
- `wind-report-charts.xlsx`: `wind-report.xlsx` plus a picture, a column chart, a pie chart and a text box, added the way Excel stores them by `scripts/make-sheet-drawings-sample.mjs`.
