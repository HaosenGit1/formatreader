/**
 * Print a whole ebook (and "Save as PDF" in the print window): every chapter, in reading order,
 * each starting on a new page, in a hidden frame of its own. Not just the page on screen.
 * Comics and fixed-layout books: one picture / page per sheet, sized like the book's pages.
 *
 * Nothing in the book runs: scripts and event handlers are removed, and the frame is sandboxed.
 */

export interface PrintSection {
  load(): Promise<string | null> | string | null;
  unload?(): void;
  linear?: string;
}

export interface PrintableBook {
  sections?: PrintSection[];
  metadata?: { title?: unknown };
  dir?: string;
}

const READ_FAIL = Symbol('read-fail');

/** One chapter's document, parsed from the address the book engine gives it. */
async function readSection(url: string): Promise<Document | typeof READ_FAIL> {
  // Only the book's own chapters, already in memory (blob: addresses): never the network.
  if (!url.startsWith('blob:')) return READ_FAIL;
  try {
    const blob = await (await fetch(url)).blob();
    const text = await blob.text();
    if (/xml|xhtml/.test(blob.type) || /^\s*<\?xml/.test(text)) {
      const doc = new DOMParser().parseFromString(text, 'application/xhtml+xml');
      if (!doc.querySelector('parsererror')) return doc;
    }
    return new DOMParser().parseFromString(text, 'text/html');
  } catch {
    return READ_FAIL;
  }
}

/** Remove anything that could run, and links that only make sense inside the book file. */
function clean(root: Element) {
  root.querySelectorAll('script, noscript, iframe, object, embed, audio, video').forEach((el) => el.remove());
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
    }
    if (el.localName === 'a') {
      const href = el.getAttribute('href') ?? '';
      if (!/^(https?:|mailto:)/i.test(href)) el.removeAttribute('href');
    }
  }
}

/** The page size a fixed-layout page asks for (`<meta name="viewport" content="width=…, height=…">`). */
function viewportSize(doc: Document): { w: number; h: number } | null {
  const v = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';
  const w = Number(/width\s*=\s*(\d+(?:\.\d+)?)/i.exec(v)?.[1]);
  const h = Number(/height\s*=\s*(\d+(?:\.\d+)?)/i.exec(v)?.[1]);
  return w > 0 && h > 0 ? { w, h } : null;
}

/** Natural size of a picture, to size comic pages. */
function pictureSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? { w: img.naturalWidth, h: img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface BuiltBook {
  html: string;
  pages: number;
}

/**
 * The whole book as one printable HTML page. `progress(done, total)` is called as chapters load.
 * `fixed`: comics / fixed-layout books (one sheet per page).
 */
export async function buildPrintHtml(book: PrintableBook, title: string, fixed: boolean, progress: (done: number, total: number) => void): Promise<BuiltBook> {
  const sections = (book.sections ?? []).filter((s) => s.linear !== 'no');
  const styleLinks = new Set<string>();
  const styleTexts: string[] = [];
  const parts: string[] = [];
  let size: { w: number; h: number } | null = null;
  let done = 0;

  for (const section of sections) {
    progress(done, sections.length);
    let url: string | null = null;
    try {
      url = await section.load();
    } catch {
      url = null;
    }
    const doc = url ? await readSection(url) : READ_FAIL;
    done++;
    if (doc === READ_FAIL) continue;

    for (const link of doc.querySelectorAll('link[rel~="stylesheet" i][href]')) styleLinks.add(link.getAttribute('href')!);
    for (const style of doc.querySelectorAll('style')) {
      const css = style.textContent ?? '';
      if (css.trim() && !styleTexts.includes(css)) styleTexts.push(css);
    }
    const body = doc.body ?? doc.documentElement;
    clean(body);

    if (fixed) {
      size ??= viewportSize(doc);
      if (!size) {
        const src = body.querySelector('img')?.getAttribute('src');
        if (src) size = await pictureSize(src);
      }
    }
    // The chapter's own classes and inline style move with it (books often style `body.calibre`).
    const cls = ['fr-sec', fixed ? 'fr-fixed' : '', body.getAttribute('class') ?? ''].filter(Boolean).join(' ');
    const style = body.getAttribute('style');
    const lang = doc.documentElement.getAttribute('lang') ?? doc.documentElement.getAttribute('xml:lang');
    parts.push(
      `<section class="${escapeHtml(cls)}"${style && !fixed ? ` style="${escapeHtml(style)}"` : ''}${lang ? ` lang="${escapeHtml(lang)}"` : ''}>${new XMLSerializer().serializeToString(body).replace(/^<body[^>]*>|<\/body>$/g, '').replace(/^<html[^>]*>|<\/html>$/g, '')}</section>`,
    );
  }
  progress(done, sections.length);

  const page = fixed
    ? // Sheets the size of the book's own pages; a printer scales them to the paper.
      `@page { size: ${size ? `${size.w}px ${size.h}px` : 'auto'}; margin: 0; }
       body { margin: 0; }
       .fr-fixed { position: relative; box-sizing: border-box; width: 100vw; height: 100vh; overflow: hidden; break-after: page; margin: 0 !important; padding: 0 !important; }
       .fr-fixed:last-child { break-after: auto; }
       .fr-fixed > img:only-child, .fr-fixed > svg:only-child { display: block; width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; }
       .fr-fixed img { max-width: 100%; max-height: 100%; }`
    : `@page { margin: 18mm 16mm; }
       body { margin: 0; }
       .fr-sec { display: block; break-before: page; }
       .fr-sec:first-child { break-before: auto; }
       img, svg, video { max-width: 100%; height: auto; }
       img { max-height: 92vh; object-fit: contain; break-inside: avoid; }
       pre { white-space: pre-wrap !important; }
       p, li, blockquote, dd { orphans: 2; widows: 2; }
       h1, h2, h3, h4 { break-after: avoid; }`;

  const html = `<!doctype html>
<html${book.dir === 'rtl' ? ' dir="rtl"' : ''}>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
${[...styleLinks].map((href) => `<link href="${escapeHtml(href)}" rel="stylesheet">`).join('\n')}
${styleTexts.map((css) => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`).join('\n')}
<style>
  html { color-scheme: light; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${page}
</style>
</head>
<body>${parts.join('\n')}</body>
</html>`;
  return { html, pages: parts.length };
}

/** Wait until the pictures and fonts in the frame are ready (or a time limit passes). */
async function settled(doc: Document, ms = 15000) {
  const images = [...doc.images].map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => { img.addEventListener('load', () => r(), { once: true }); img.addEventListener('error', () => r(), { once: true }); })));
  await Promise.race([Promise.all([...images, doc.fonts?.ready]), new Promise((r) => setTimeout(r, ms))]);
}

/** Load `html` in a hidden, script-free frame and open the browser's print window for it. */
export async function printHtml(html: string, done: () => void = () => {}): Promise<void> {
  document.getElementById('fr-book-print')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'fr-book-print';
  frame.title = 'print';
  frame.setAttribute('aria-hidden', 'true');
  // Same origin (so it can be told to print), modals (the print window), but no scripts.
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  const loaded = new Promise<void>((r) => frame.addEventListener('load', () => r(), { once: true }));
  frame.srcdoc = html;
  document.body.append(frame);
  await loaded;
  const win = frame.contentWindow!;
  await settled(frame.contentDocument!);
  // Remove the frame once the print window closes (and in any case after a while).
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => {
      frame.remove();
      done();
    }, 1000);
  };
  win.addEventListener('afterprint', cleanup, { once: true });
  win.focus();
  win.print();
  // Some browsers never send "afterprint" for a frame.
  setTimeout(cleanup, 10 * 60 * 1000);
}
