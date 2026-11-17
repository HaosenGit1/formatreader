# FormatReader

Drop any file into the browser — FormatReader detects the format and shows it.
Everything runs locally: files are never uploaded, and nothing is downloaded or saved.

**Categories:** Words (now) · Images · Drawings · Sounds · Videos (later)

## What works today (Words)

| Kind | Formats | View |
| --- | --- | --- |
| Plain text | TXT, LOG, NFO and any text file | Reading view, any encoding, 乱码 repair |
| Encoded text | \\u escapes, %-URL encoding, HTML entities, Base64 | Shown decoded |
| Code & config | ~250 extensions, 100 languages (incl. PLC ST, G-code, Terraform, Solidity) | Highlighted, line numbers |
| Data / notebooks | JSON family, XML, YAML, TOML, INI; Jupyter .ipynb | Formatted; notebook cells |
| Markup | Markdown, HTML | Rendered safely, or source |
| Subtitles | SRT, VTT, ASS, SSA | Cue list |
| Tables | CSV, TSV, PSV | Grid, delimiter and encoding detected |
| Spreadsheets | XLSX/XLSM/XLSB/XLS, ODS, Numbers, WPS ET, DBF, SYLK, DIF, Lotus, Excel XML | Excel-like grid, tabs, formulas |
| Databases | Access MDB/ACCDB, SQLite | Tables and views in a grid |
| Word | DOCX/DOCM/DOTX | Pages |
| Old Office | DOC/DOT (Word 6/95–2003), PPT/PPS/POT, WPS Writer (.wps), WPS Presentation (.dps) | Text only (paragraphs, tables, slide text) |
| Rich text | RTF | Page (formatting, tables, pictures, any code page) |
| OpenDocument | ODT/OTT, ODP/OTP (ODS → spreadsheets) | Page; slides |
| Fixed layout | XPS/OXPS, OFD | Pages drawn as SVG |
| Korean | HWP (5.x), HWPX | Pages |
| Apple | Pages, Keynote | Preview image stored in the file |
| PowerPoint | PPTX | Slides + full-screen slideshow |
| PDF | PDF | Browser's viewer |
| Ebooks | EPUB, MOBI, AZW3, FB2, CBZ/CBR/CB7, PalmDoc (PDB) | Book reader / text |
| Email | EML, MBOX, Outlook MSG, MHTML | Message view; attachments open in place; no tracking |
| Archives | ZIP, RAR, 7Z, TAR, ISO, CAB, XZ, BZ2, GZ | File list; any file inside opens in place; passwords |

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
[docs/UPDATING.md](docs/UPDATING.md) covers library updates, trying new viewer versions
side by side (`?try=`), and adding formats.

```
src/core/                 shell: front page, toolbar, full screen, format detection, viewer registry
src/categories/words/     text · code · sheets · db · docs · rtf · odf · fixed · hwp · hwpx · iwork ·
                          legacy · email · books · slides · pdf · shared
src/categories/archives/  archive (libarchive) · gzip
src/categories/images/    (next)   drawings/ sounds/ videos/ archives/
tests/                    mirrors src/
samples/                  test files, one folder per viewer
```

Heavy parts load only when needed: the statistical encoding detector (for non-Unicode files),
the syntax highlighter (one language at a time), and the Markdown renderer.
The first page load is about 17 KB gzipped; `npm run build` fails if it passes 60 KB.
