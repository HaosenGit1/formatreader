# FormatReader

Drop any file into the browser — FormatReader detects the format and shows it.
Everything runs locally: files are never uploaded, and nothing is downloaded or saved.

**Categories:** Words (now) · Images · Drawings · Sounds · Videos (later)

## What works today (Words)

| Kind | Formats | View |
| --- | --- | --- |
| Plain text | TXT, LOG, NFO, any text file | Reading view, adjustable size |
| Any encoding | UTF-8/16, GBK/GB18030, Big5, Shift_JIS, EUC-JP, EUC-KR, Windows-125x, KOI8, ISO-8859-x, Thai, … | Auto-detected, switchable from the toolbar |
| Repaired text | Text that was mis-decoded and saved (浣犲ソ → 你好, cafÃ© → café) | Repaired automatically, original one click away |
| Code & config | ~200 languages incl. IEC 61131-3 ST, G-code, STEP, Terraform, Solidity | Highlighted, line numbers |
| Notebooks | Jupyter (.ipynb) | Cells with Markdown, code, tables, images, errors |
| Encoded text | \\u escapes, %-URL encoding, HTML entities, Base64 | Shown decoded, original one click away |
| Data | JSON, JSON Lines, XML, YAML, INI/TOML | Pretty-printed and highlighted |
| Tables | CSV, TSV, PSV (delimiter and encoding auto-detected) | Grid with sticky header |
| Spreadsheets | XLSX, XLSM, XLSB, XLS, ODS, Numbers, WPS ET, DBF, SYLK, DIF, Lotus, Excel 2003 XML | Excel-like grid, sheet tabs, merged cells, formulas on hover |
| Subtitles | SRT, VTT, ASS/SSA | Cue list |
| Markup | Markdown, HTML | Rendered in a sandbox (scripts never run), or source |
| Ebooks | EPUB, MOBI, AZW3, FB2, CBZ | Book reader: pages/scroll, contents, remembers position |
| Word | DOCX, DOCM, DOTX | Paper pages fitted to the window, zoom with A− / A+ |
| Slides | PPTX | All slides + full-screen slideshow |
| PDF | PDF | Browser's built-in viewer |
| Everything else | old .doc/.xls-era binaries not listed above, images, video, CAD, archives… | Identified by its bytes; viewer coming in later stages |

Pasting text (⌘V / Ctrl+V) works too. Every viewer has a full-screen mode (F).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + sample-file tests
npm run build      # static site in dist/
npm run samples    # regenerate test files in samples/
```

Try it with the files in [`samples/`](samples/) — GBK novels, Big5, Shift_JIS, a GBK CSV from Excel,
GBK subtitles, a double-encoded file, UTF-16 from Notepad, code, Markdown and HTML.

## Layout

Each kind of file has its own viewer module; the shell around them knows no file
formats. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the structure, the
isolation rules, the speed budget, and how to add a viewer (images, drawings…).

```
src/core/                 shell: front page, toolbar, full screen, format detection, viewer registry
src/categories/words/     text · code · sheets · docs · books · slides · pdf · shared
src/categories/images/    (next)   drawings/ sounds/ videos/ archives/
tests/                    mirrors src/
samples/                  test files, one folder per viewer
```

Heavy parts load only when needed: the statistical encoding detector (for non-Unicode files),
the syntax highlighter (one language at a time), and the Markdown renderer.
The first page load is about 17 KB gzipped; `npm run build` fails if it passes 60 KB.
