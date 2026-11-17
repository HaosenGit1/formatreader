# Updating FormatReader

Each file format is handled by its own viewer module, and each viewer loads
its own libraries. Updating or replacing one viewer does not change the others.

## Which viewer uses which library

| Viewer (module) | Opens | Library | Where it comes from |
| --- | --- | --- | --- |
| `words/sheets` | Excel, ODS, Numbers, old spreadsheets | `xlsx` (SheetJS) | SheetJS CDN — monthly check workflow opens an issue |
| `words/docs` | Word DOCX | `docx-preview` | npm — Dependabot |
| `words/slides` | PowerPoint PPTX | `pptx-preview`, `echarts` (charts) | npm — Dependabot |
| `words/books` | EPUB, MOBI, AZW3, FB2, CBZ | `foliate-js` | npm — Dependabot |
| `words/code` | code, JSON, notebooks | `highlight.js`, `marked` + `dompurify` (notebooks) | npm — Dependabot |
| `words/text` | text, Markdown, HTML, subtitles | `marked`, `dompurify` | npm — Dependabot |
| `words/shared/encoding` | encoding detection (Text, Code, Sheets) | `jschardet` | npm — Dependabot |
| `words/pdf` | PDF | none (browser's viewer) | — |

Shared underneath: `docx-preview` and `pptx-preview` both use `jszip`, and
Text and Code both use `marked`/`dompurify`. Updating one of those affects
both viewers — the tests open samples for both, so a break shows up.

## How updates arrive

- **Dependabot** (`.github/dependabot.yml`) checks npm every Monday and opens
  **one pull request per viewer library**. Build tools (Vite, Vitest,
  TypeScript) come together in one PR, since they never reach visitors.
- **SheetJS** isn't on npm: `.github/workflows/check-sheetjs.yml` checks its CDN
  on the 1st of each month and opens an issue when a new version exists.

## What every update must pass (automatic, in CI)

1. `npm test` — 200+ tests, including **every file in `samples/`** opened by
   the viewer its folder is named after (`samples/sheets/` → Sheets, …), and
   the encoding of each text sample.
2. `npm run build` — type check, production build, and the **60 KB first-load
   budget** (fails if a library ends up in the first download).

If CI is green, merging is safe. If red, only the PR's viewer is affected:
close the PR and the site keeps the current version.

## Updating a library by hand

```bash
npm install docx-preview@<version> --save-exact
npm test && npm run build
```

Then open the matching samples locally (`npm run dev`) and look at them.

## Replacing a library or trying a new version side by side

Never edit the working viewer in place for a big change. Instead:

1. Copy the module, e.g. `src/categories/words/slides/` → `slides-v2/`, and
   switch it to the new library.
2. List it next to the old one with `experimental: true`:

   ```ts
   { id: 'words/slides-v2', category: 'words', experimental: true,
     accepts: ({ format }) => format?.id === 'pptx',
     load: () => import('./slides-v2/view') },
   ```

3. Deploy. Visitors still get the old viewer. You open
   `https://formatreader.com/?try=words/slides-v2` to use the new one on the
   real site (the toolbar shows 🧪 and the viewer id).
4. When happy: delete the old module and its entry, remove `experimental`.
   If not: delete the new folder and entry. Nothing else changes.

## Adding a new format

1. If it belongs to an existing viewer, extend that viewer's `accepts()` (and
   `detect-format.ts` if the bytes need recognising).
2. Otherwise create a new viewer module — see `docs/ARCHITECTURE.md`,
   "Adding a viewer".
3. Add a sample file to `samples/<viewer>/`. The samples test picks it up
   automatically and checks it opens in the right viewer.

## Keeping an eye on better libraries

Worth re-checking every few months, per viewer:

- **Word**: `docx-preview` vs alternatives (e.g. `mammoth` for simpler HTML)
- **PowerPoint**: `pptx-preview` vs newer renderers
- **PDF**: replace the browser viewer with PDF.js for phones
- **Ebooks**: `foliate-js` releases (adds formats over time)
- **Old Office (.doc/.ppt)**: no good browser library yet — watch for one
