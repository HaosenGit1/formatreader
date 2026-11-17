# FormatReader architecture

FormatReader is a static web page. Files are read in the visitor's browser and
are never uploaded. The code is split so that each kind of file is handled by
its own **viewer module**, and changing or breaking one viewer cannot affect
the others or the app around them.

## Layout

```
src/
  main.ts                  starts the app with every category's viewers
  style.css                shell styles only (colours, header, toolbar, front page)
  core/                    the shell — knows nothing about any file format
    shell.ts               front page, loading, toolbar, full screen, drop/pick/paste
    viewer.ts              the contract every viewer implements
    registry.ts            picks the viewer for a file
    detect-format.ts       identifies files from their bytes (magic numbers, ZIP contents)
    info-entry.ts          last-resort card: "recognised as X" / "unknown file"
    i18n.ts                English / 中文, plus strings() for per-module text
  categories/
    index.ts               the list of all categories
    words/                 everything you read
      index.ts             which files each Words viewer accepts (tiny, always loaded)
      text/                plain text, Markdown, HTML, subtitles
      code/                programming languages, JSON, XML, YAML, config
      sheets/              CSV/TSV, Excel, ODS, Numbers, older spreadsheet formats
      docs/                Word (DOCX)
      db/                  Access (MDB/ACCDB), SQLite
      rtf/                 RTF
      odf/                 OpenDocument text and presentations
      fixed/               XPS/OXPS, OFD (pages as SVG)
      hwp/                 Korean HWP 5.x (hwp.js)
      hwpx/                Korean HWPX
      iwork/               Apple Pages/Keynote (stored preview)
      legacy/              Word/PowerPoint 97–2003 and WPS (text)
      email/               EML, MBOX, Outlook MSG, MHTML
      books/               EPUB, MOBI, AZW3, FB2, CBZ
      slides/              PowerPoint
      pdf/                 PDF
      shared/              used by several Words viewers: encodings (incl. fast path and escape
                           decoding), text source, code block + grammars, grid
    archives/              archive (libarchive worker, copied to /vendor), gzip;
                           files inside open via ctx.openFile
    images/ drawings/ sounds/ videos/    empty, ready for viewers
tests/                     mirrors src/: core/, words/, plus samples.test.ts over samples/
samples/                   test files, one folder per viewer
```

## How a file is opened

1. The shell reads the first bytes and `detect-format` identifies the format.
2. `registry.pickViewer` asks every viewer's `accepts()` — highest `priority`
   first — and takes the first that says yes. Catch-alls run last:
   Code (20), Text (10), the info card (0).
3. The shell lays out the page and shows the loading screen.
4. The viewer's code is loaded (`load()` → its own file, fetched only now)
   and `open(file, ctx)` draws into `ctx.mount`.
5. The shell builds the toolbar from what the viewer returns (title, meta,
   tools, notices, full screen, text size).

If anything in step 4 throws, only that file shows an error card. The shell,
the toolbar and every other viewer keep working.

## Isolation rules

- A viewer imports only from `core/` and from its own category's `shared/`.
  Never from another viewer's folder, never from another category.
- A viewer draws only inside `ctx.mount` and never moves it (moving iframes
  reloads them). To update the toolbar after its state changes, it calls
  `ctx.refreshChrome()`.
- A viewer keeps its own styles (`import './x.css'`) and its own text
  (`const s = strings({...})`).
- Heavy libraries are imported inside the viewer with `await import()`, so
  they download only when a file needs them.

## Adding a viewer (e.g. images)

1. Create `src/categories/images/photos/view.ts`:

   ```ts
   import './photos.css';
   import { h } from '../../../core/dom';
   import type { OpenContext, OpenedView } from '../../../core/viewer';

   export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
     const url = URL.createObjectURL(file);
     ctx.mount.replaceChildren(h('img', { src: url, alt: file.name }));
     return { meta: () => [ctx.format?.name ?? 'Image'], destroy: () => URL.revokeObjectURL(url) };
   }
   ```

2. List it in `src/categories/images/index.ts`:

   ```ts
   export const imagesViewers: ViewerEntry[] = [
     {
       id: 'images/photos',
       category: 'images',
       accepts: ({ format }) => ['jpg', 'png', 'gif', 'webp', 'avif'].includes(format?.id ?? ''),
       load: () => import('./photos/view'),
     },
   ];
   ```

3. Add sample files to `samples/<viewer>/` and a routing line to
   `tests/samples.test.ts`.

Nothing else changes.

## Speed

- **First load budget: 60 KB gzipped** (currently ~17 KB). `npm run build`
  fails if it is exceeded (`scripts/check-size.mjs`).
- Viewers marked `prefetch: true` (Text, Code, Sheets) download in the
  background while the front page is idle, so common files open instantly.
- Clear GBK, Big5, Shift_JIS, EUC-JP, EUC-KR, Windows-1252 and Cyrillic files
  are decided by a tiny fast path (`shared/encoding/fast.ts`); the statistical
  detector (~700 KB) downloads only for unclear files, and is fetched in the
  background for browsers set to legacy-encoding languages (not on data-saver).
- Viewers declare MIME types: matching viewers and their heavy libraries
  (`preload()`) start loading while a file is dragged over the page.
- Detection reads only the first bytes; big files render progressively.

Measured on simulated 4G, first visit: front page 160 ms; GBK/Big5/Japanese
text ~35 ms; GBK CSV 45 ms; Excel 230 ms; EPUB 440 ms; slides 510 ms.
