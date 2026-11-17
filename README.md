# FormatReader

Drop any file into the browser — FormatReader detects the format and shows it.
Everything runs locally: files are never uploaded, and nothing is downloaded or saved.

**Categories:** Words (now) · Images · Drawings · Sounds · Videos (later)

## What works today (Words, stage 1)

| Kind | Formats | View |
| --- | --- | --- |
| Plain text | TXT, LOG, NFO, any text file | Reading view, adjustable size |
| Any encoding | UTF-8/16, GBK/GB18030, Big5, Shift_JIS, EUC-JP, EUC-KR, Windows-125x, KOI8, ISO-8859-x, Thai, … | Auto-detected, switchable from the toolbar |
| Repaired text | Text that was mis-decoded and saved (浣犲ソ → 你好, cafÃ© → café) | Repaired automatically, original one click away |
| Code & config | ~200 languages incl. IEC 61131-3 ST, G-code, STEP | Highlighted, line numbers |
| Data | JSON, JSON Lines, XML, YAML, INI/TOML | Pretty-printed and highlighted |
| Tables | CSV, TSV (delimiter auto-detected) | Table with sticky header |
| Subtitles | SRT, VTT, ASS/SSA | Cue list |
| Markup | Markdown, HTML | Rendered in a sandbox (scripts never run), or source |
| PDF | PDF | Browser's built-in viewer |
| Everything else | DOCX, XLSX, EPUB, MOBI, images, video, CAD, archives… | Identified by its bytes; viewer coming in later stages |

Pasting text (⌘V / Ctrl+V) works too.

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

```
src/
  main.ts                 drop zone, paste, toolbar, page flow
  core/
    detect-format.ts      magic bytes → format and category
    zip.ts                reads ZIP entry names (DOCX/XLSX/EPUB/ODT…)
    info-view.ts          recognised-but-not-yet-viewable and unknown files
    i18n.ts               English / 中文
  words/
    encoding/             detection, decoding, double-encoding repair
    text-kind.ts          table / subtitle / markdown / html / json / code / plain
    parse.ts              CSV and subtitle parsers
    views.ts              the viewers
tests/                    vitest
samples/                  test files in many encodings
```

Heavy parts load only when needed: the statistical encoding detector (for non-Unicode files),
the syntax highlighter (one language at a time), and the Markdown renderer.
The first page load is about 32 KB gzipped.
