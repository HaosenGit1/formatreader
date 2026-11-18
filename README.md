# FormatReader

Drop any file into the browser — FormatReader detects the format and shows it.
Everything runs locally: files are never uploaded, and nothing is downloaded or saved.

**Categories:** Words · Images · Drawings (now) · Sounds · Videos (later).
Works offline, and as one portable file (`FormatReader.html`) for computers without internet.
The full, test-checked list is on [formatreader.com/formats.html](https://formatreader.com/formats.html).

## What works today

### Words

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
| COMTRADE (power systems) | .cff, .zip with .cfg+.dat, .cfg (details) | Stacked waveforms, digital lanes, trigger, zoom, table |
| Archives | ZIP, RAR, 7Z, TAR, ISO, CAB, XZ, BZ2, GZ | File list; any file inside opens in place; passwords |

### Images

| Kind | Formats | View |
| --- | --- | --- |
| Photos & pictures | JPEG, PNG, GIF, WebP, AVIF, BMP, ICO, SVG/SVGZ | Zoom, pan, rotate, photo details (EXIF) |
| iPhone photos | HEIC / HEIF | Decoded here in every browser (libheif) |
| TIFF, Photoshop | TIFF (multi-page), PSD | Pages; flattened image |
| Camera RAW | CR2, CR3, NEF, ARW, RAF, ORF, RW2, PEF, DNG… | The camera's embedded preview |
| HDR & textures | OpenEXR, Radiance HDR, TGA | Auto exposure + tone mapping |
| Medical | DICOM (uncompressed, RLE, JPEG baseline) | Scan window, frames; no patient identifiers shown |

### Drawings

| Kind | Formats | View |
| --- | --- | --- |
| CAD 2D | DXF (any version, any code page) | Lines, arcs, splines, text, blocks, dimensions, layers |
| AutoCAD | DWG | The preview picture saved in the file |
| 3D | STL, OBJ, PLY, glTF/GLB, 3MF, FBX | Turn, zoom, wireframe, size |
| CAD & BIM | STEP, IGES, BREP, IFC | Same 3D view (engines load on demand) |
| Diagrams | Visio VSDX, ODG, XMind | Page text; preview; outline |

Pasting text (⌘V / Ctrl+V) works too. Every viewer has a full-screen mode (F); on iPhones,
where browsers allow real full screen only for video, the page fills the screen itself.

## Open-source engines

Viewers load these only when a file needs them. All are used unmodified.

| Engine | Used for | Licence |
| --- | --- | --- |
| [libheif-js](https://github.com/catdad-experiments/libheif-js) | HEIC | LGPL-3.0 |
| [occt-import-js](https://github.com/kovacsv/occt-import-js) (Open CASCADE) | STEP, IGES, BREP | LGPL-2.1 |
| [web-ifc](https://github.com/ThatOpen/engine_web-ifc) | IFC | MPL-2.0 |
| [three.js](https://threejs.org) | 3D view, EXR/HDR/TGA decoding | MIT |
| [libarchive.js](https://github.com/nika-begiashvili/libarchivejs) | Archives | MIT (libarchive: BSD) |
| [sql.js](https://github.com/sql-js/sql.js) | SQLite | MIT |
| [SheetJS](https://sheetjs.com) | Spreadsheets | Apache-2.0 |
| [foliate-js](https://github.com/johnfactotum/foliate-js) | Ebooks | MIT |
| dxf-parser, dicom-parser, UTIF, ag-psd, exifr, mdb-reader, docx-preview, pptx-preview, echarts, highlight.js, marked, DOMPurify, postal-mime, msgreader, hwp.js, fflate, jschardet | Various | MIT / Apache-2.0 / ISC / BSD-style (see each package) |

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
src/categories/data/      comtrade
src/categories/archives/  archive (libarchive) · gzip
src/categories/images/    (next)   drawings/ sounds/ videos/ archives/
tests/                    mirrors src/
samples/                  test files, one folder per viewer
```

Heavy parts load only when needed: the statistical encoding detector (for non-Unicode files),
the syntax highlighter (one language at a time), and the Markdown renderer.
The first page load is about 17 KB gzipped; `npm run build` fails if it passes 60 KB.
