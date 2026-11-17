import './style.css';
import { detectFormat, type FormatInfo } from './core/detect-format';
import { formatBytes, h } from './core/dom';
import { infoView } from './core/info-view';
import { lang, onLangChange, setLang, t } from './core/i18n';
import { decode } from './words/encoding/codec';
import { detectEncoding, isBinaryResult, type EncodingResult } from './words/encoding/detect';
import { repairMojibake, type RepairResult } from './words/encoding/mojibake';
import { ENCODING_CHOICES, encodingName } from './words/encoding/names';
import { classifyText, type TextKind } from './words/text-kind';
import { renderText } from './words/views';
import { BOOK_FORMATS, openBook, type BookController } from './words/book-view';
import { openSlides, type SlidesController } from './words/slides-view';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Doc =
  | { type: 'text'; name: string; size: number; bytes: Uint8Array | null; detected: EncodingResult | null; encoding: string; text: string; repair: RepairResult | null; showOriginal: boolean; kind: TextKind; source: boolean }
  | { type: 'pdf'; name: string; size: number; url: string }
  | { type: 'book'; name: string; size: number; format: string; book: BookController & { restyle: () => void } }
  | { type: 'slides'; name: string; size: number; slides: SlidesController }
  | { type: 'info'; name: string; size: number; head: Uint8Array; format: FormatInfo | null }
  | { type: 'error'; name: string; size: number; message: string };

let doc: Doc | null = null;
let renderToken = 0;

const app = document.getElementById('app')!;
const fileInput = h('input', { type: 'file', hidden: true }) as HTMLInputElement;
document.body.append(fileInput);

// Per-viewer reading size (a convenience; failure to persist is fine).
let fontScale = 1;
try {
  fontScale = Number(localStorage.getItem('fr.fontScale')) || 1;
} catch {
  /* ignore */
}
const applyFontScale = () => document.documentElement.style.setProperty('--reader-scale', String(fontScale));
applyFontScale();

// ---------------------------------------------------------------------------
// Opening files and text
// ---------------------------------------------------------------------------

function closeCurrent() {
  if (doc?.type === 'pdf') URL.revokeObjectURL(doc.url);
  if (doc?.type === 'book') doc.book.destroy();
  if (doc?.type === 'slides') doc.slides.destroy();
}

/** Lay out the page, then let a viewer build itself inside it (it must not be moved afterwards). */
function mountShell(extraClass = ''): { mount: HTMLElement; bar: HTMLElement } {
  // The viewer builds itself inside `mount` while the loading screen covers the page.
  const mount = h('div', { class: 'book-mount' });
  const bar = h('div', { class: 'toolbar' });
  const page = h('main', { class: `doc ${extraClass}`.trim() }, bar, mount);
  app.replaceChildren(header(), page, h('div', { class: 'loading-cover' }, loadingView()));
  return { mount, bar };
}

async function openFile(file: File) {
  closeCurrent();
  doc = null;
  const token = ++renderToken;
  showLoading();
  try {
    const format = await detectFormat(file, file.name);
    if (token !== renderToken) return;

    const isFb2 = /\.fb2$/i.test(file.name);
    if ((format && BOOK_FORMATS.has(format.id)) || isFb2) {
      const { mount, bar } = mountShell('doc-book');
      const book = (await openBook(file, mount, () => fontScale)) as BookController & { restyle: () => void };
      if (token !== renderToken) return book.destroy();
      doc = { type: 'book', name: file.name, size: file.size, format: format?.name ?? 'FictionBook', book };
      document.title = `${book.title} — FormatReader`;
      bar.replaceWith(toolbar(doc));
      app.querySelector('.loading-cover')?.remove();
      return;
    }

    if (format?.id === 'pptx') {
      const { mount, bar } = mountShell();
      const slides = await openSlides(file, mount);
      if (token !== renderToken) return slides.destroy();
      doc = { type: 'slides', name: file.name, size: file.size, slides };
      document.title = `${file.name} — FormatReader`;
      bar.replaceWith(toolbar(doc));
      app.querySelector('.loading-cover')?.remove();
      return;
    }

    if (format?.id === 'pdf') {
      doc = { type: 'pdf', name: file.name, size: file.size, url: URL.createObjectURL(file) };
      return render();
    }
    if (format && !format.text) {
      const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
      doc = { type: 'info', name: file.name, size: file.size, head, format };
      return render();
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (token !== renderToken) return;
    if (bytes.length === 0) {
      doc = { type: 'error', name: file.name, size: 0, message: t('empty') };
      return render();
    }
    const detected = await detectEncoding(bytes);
    if (isBinaryResult(detected)) {
      doc = { type: 'info', name: file.name, size: file.size, head: bytes.subarray(0, 64 * 1024), format };
      return render();
    }
    const text = decode(bytes.subarray(detected.bomLength), detected.encoding);
    const repair = detected.encoding === 'utf-8' ? repairMojibake(text) : null;
    doc = {
      type: 'text', name: file.name, size: file.size, bytes, detected, encoding: detected.encoding,
      text, repair, showOriginal: false, kind: classifyText(file.name, repair?.text ?? text), source: false,
    };
    render();
  } catch (err) {
    doc = { type: 'error', name: file.name, size: file.size, message: (err as Error).message };
    render();
  }
}

function openPastedText(text: string) {
  closeCurrent();
  ++renderToken;
  const repair = repairMojibake(text);
  doc = {
    type: 'text', name: t('pasted'), size: new TextEncoder().encode(text).length, bytes: null, detected: null,
    encoding: 'utf-8', text, repair, showOriginal: false, kind: classifyText('', repair?.text ?? text), source: false,
  };
  render();
}

function changeEncoding(label: string) {
  if (doc?.type !== 'text' || !doc.bytes) return;
  const d = doc.detected;
  const skip = label === 'auto' ? d?.bomLength ?? 0 : d && label === d.encoding ? d.bomLength : 0;
  const encoding = label === 'auto' ? d?.encoding ?? 'utf-8' : label;
  const text = decode(doc.bytes.subarray(skip), encoding);
  const repair = encoding === 'utf-8' ? repairMojibake(text) : null;
  doc = { ...doc, encoding, text, repair, showOriginal: false, kind: classifyText(doc.name, repair?.text ?? text) };
  render();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function header(): HTMLElement {
  return h(
    'header',
    { class: 'site-header' },
    h(
      'button',
      { class: 'brand', type: 'button', onclick: () => { closeCurrent(); doc = null; render(); } },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'F'),
      h('span', { class: 'brand-name' }, 'FormatReader'),
    ),
    h('button', { class: 'lang-toggle', type: 'button', onclick: () => setLang(lang() === 'en' ? 'zh' : 'en') }, t('language')),
  );
}

function landing(): HTMLElement {
  const open = () => fileInput.click();
  return h(
    'main',
    { class: 'landing' },
    h(
      'button',
      { type: 'button', class: 'circle', onclick: open },
      h('span', { class: 'circle-text' }, t('readAny')),
    ),
  );
}

/** The only loading state: just the name. */
function loadingView(): HTMLElement {
  // The name is the progress bar: it fills with colour from left to right.
  return h('div', { class: 'loading', role: 'status', 'aria-label': 'Loading' }, h('div', { class: 'loading-name' }, 'FormatReader'));
}

function svg(path: string, size = 20): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', String(size));
  s.setAttribute('height', String(size));
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.6');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = path;
  return s;
}

function showLoading() {
  app.replaceChildren(loadingView());
}

function toolbar(d: Doc): HTMLElement {
  const items: Array<Node | null> = [];

  if (d.type === 'text' && d.bytes) {
    const select = h('select', { class: 'enc-select', 'aria-label': t('encoding'), onchange: (e: Event) => changeEncoding((e.target as HTMLSelectElement).value) }) as HTMLSelectElement;
    const detected = d.detected?.encoding;
    select.append(h('option', { value: 'auto' }, `${t('auto')} · ${encodingName(detected ?? 'utf-8', lang())}`));
    const seen = new Set<string>();
    const ordered = [...(d.detected?.alternatives ?? []), ...ENCODING_CHOICES.map((c) => c.label)];
    for (const label of ordered) {
      if (seen.has(label)) continue;
      seen.add(label);
      select.append(h('option', { value: label }, encodingName(label, lang())));
    }
    select.value = d.encoding === detected ? 'auto' : d.encoding;
    items.push(h('label', { class: 'tool' }, h('span', { class: 'tool-label' }, t('encoding')), select));
  }

  if (d.type === 'text' && (d.kind.kind === 'markdown' || d.kind.kind === 'html')) {
    items.push(
      h(
        'div',
        { class: 'seg', role: 'group' },
        h('button', { type: 'button', class: d.source ? '' : 'active', 'aria-pressed': String(!d.source), onclick: () => { if (doc?.type === 'text') { doc = { ...doc, source: false }; render(); } } }, t('rendered')),
        h('button', { type: 'button', class: d.source ? 'active' : '', 'aria-pressed': String(d.source), onclick: () => { if (doc?.type === 'text') { doc = { ...doc, source: true }; render(); } } }, t('source')),
      ),
    );
  }

  if (d.type === 'book') items.push(...d.book.tools());

  if (d.type === 'text' || d.type === 'book') {
    items.push(
      h(
        'div',
        { class: 'seg', role: 'group' },
        h('button', { type: 'button', title: t('fontSmaller'), 'aria-label': t('fontSmaller'), onclick: () => setFont(-0.1) }, 'A−'),
        h('button', { type: 'button', title: t('fontLarger'), 'aria-label': t('fontLarger'), onclick: () => setFont(0.1) }, 'A+'),
      ),
    );
  }

  return h(
    'div',
    { class: 'toolbar' },
    h(
      'div',
      { class: 'file' },
      h('div', { class: 'file-name', title: d.name }, d.type === 'book' ? d.book.title : d.name),
      h('div', { class: 'file-meta' }, fileMeta(d)),
    ),
    h('div', { class: 'tools' }, ...items, fullscreenButton(d), h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, t('openAnother'))),
  );
}

// ---------------------------------------------------------------------------
// Full screen (every viewer). Slides get a real slideshow.
// ---------------------------------------------------------------------------

const expandIcon = () => svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 16);
const shrinkIcon = () => svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>', 16);

function toggleFullscreen() {
  if (doc?.type === 'slides') return doc.slides.present();
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  const target = app.querySelector<HTMLElement>('main.doc');
  target?.requestFullscreen?.().catch(() => {});
}

function fullscreenButton(d: Doc): HTMLElement | null {
  if (d.type === 'error') return null;
  // Element full screen is not available everywhere (e.g. iPhone); slides still get the overlay show.
  if (d.type !== 'slides' && !document.fullscreenEnabled) return null;
  const label = d.type === 'slides' ? t('present') : document.fullscreenElement ? t('exitFullscreen') : t('fullscreen');
  return h(
    'button',
    { type: 'button', class: 'btn fs-btn', title: `${label} (F)`, onclick: toggleFullscreen },
    document.fullscreenElement ? shrinkIcon() : expandIcon(),
    label,
  );
}

// Keep the button label in sync without re-rendering (re-rendering would leave full screen).
document.addEventListener('fullscreenchange', () => {
  const btn = app.querySelector('.fs-btn');
  if (!btn || doc?.type === 'slides' || !doc) return;
  btn.replaceWith(fullscreenButton(doc) ?? '');
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'f' && e.key !== 'F') return;
  if (e.metaKey || e.ctrlKey || e.altKey || !doc) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
  e.preventDefault();
  toggleFullscreen();
});

function fileMeta(d: Doc): string {
  const parts = [formatBytes(d.size)];
  if (d.type === 'pdf') parts.unshift('PDF');
  if (d.type === 'book') parts.unshift(...[d.book.author, d.format].filter(Boolean));
  if (d.type === 'slides') parts.unshift(`PowerPoint · ${d.slides.count} ${t('slides')}`);
  if (d.type === 'info' && d.format) parts.unshift(d.format.name);
  if (d.type === 'text') parts.unshift(kindLabel(d.kind));
  return parts.join(' · ');
}

function kindLabel(k: TextKind): string {
  switch (k.kind) {
    case 'table': return k.delimiter === '\t' ? 'TSV' : 'CSV';
    case 'subtitle': return k.format.toUpperCase();
    case 'markdown': return 'Markdown';
    case 'html': return 'HTML';
    case 'json': return k.lines ? 'JSON Lines' : 'JSON';
    case 'code': return languageName(k.language);
    default: return lang() === 'zh' ? '文本' : 'Text';
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', csharp: 'C#', cpp: 'C++', c: 'C', fsharp: 'F#',
  objectivec: 'Objective-C', php: 'PHP', sql: 'SQL', pgsql: 'PostgreSQL', json: 'JSON', xml: 'XML',
  yaml: 'YAML', ini: 'INI / TOML', css: 'CSS', scss: 'SCSS', less: 'Less', bash: 'Shell', dos: 'Batch',
  powershell: 'PowerShell', vbnet: 'VB.NET', vbscript: 'VBScript', delphi: 'Pascal / Structured Text',
  x86asm: 'Assembly', armasm: 'ARM Assembly', gcode: 'G-code', step21: 'STEP', glsl: 'GLSL', latex: 'LaTeX',
  graphql: 'GraphQL', protobuf: 'Protocol Buffers', dockerfile: 'Dockerfile', makefile: 'Makefile',
  cmake: 'CMake', vhdl: 'VHDL', http: 'HTTP', plaintext: 'Text', markdown: 'Markdown', ocaml: 'OCaml',
  matlab: 'MATLAB', sas: 'SAS', llvm: 'LLVM IR', wasm: 'WebAssembly', asciidoc: 'AsciiDoc', ldif: 'LDIF',
};

function languageName(id: string): string {
  return LANGUAGE_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

function setFont(delta: number) {
  fontScale = Math.min(2, Math.max(0.7, Math.round((fontScale + delta) * 10) / 10));
  applyFontScale();
  if (doc?.type === 'book') doc.book.restyle();
  try {
    localStorage.setItem('fr.fontScale', String(fontScale));
  } catch {
    /* ignore */
  }
}

function notices(d: Doc): HTMLElement | null {
  if (d.type !== 'text') return null;
  const out: HTMLElement[] = [];
  const det = d.detected;
  if (det && d.bytes && d.encoding === det.encoding) {
    const name = encodingName(det.encoding, lang());
    if (det.reason === 'statistical' || det.reason === 'fallback') {
      const pct = Math.round(det.confidence * 100);
      out.push(
        h(
          'div',
          { class: 'notice' },
          h('strong', {}, `${det.reason === 'fallback' ? t('whyFallback') : t('whyStat')} ${name}`),
          det.reason === 'statistical' ? ` (${pct}%)` : '',
          ' — ',
          t('legacyNote'),
          det.confidence < 0.5 ? ` ${t('lowConfidence')}` : '',
        ),
      );
    } else if (det.reason === 'bom' && det.encoding !== 'utf-8') {
      out.push(h('div', { class: 'notice subtle' }, `${t('whyBom')} ${name}`));
    } else if (det.reason === 'utf16-pattern') {
      out.push(h('div', { class: 'notice subtle' }, `${t('whyStat')} ${name}`));
    }
  }
  if (d.repair) {
    out.push(
      h(
        'div',
        { class: 'notice good' },
        t('repaired'),
        d.repair.lost ? ` ${d.repair.lost} ${d.repair.lost === 1 ? t('lostChar') : t('lostChars')}` : '',
        ' ',
        h('button', { type: 'button', class: 'link', onclick: () => { if (doc?.type === 'text') { doc = { ...doc, showOriginal: !doc.showOriginal }; render(); } } }, d.showOriginal ? t('showRepaired') : t('showOriginal')),
      ),
    );
  }
  return out.length ? h('div', { class: 'notices' }, ...out) : null;
}

async function render() {
  const token = ++renderToken;
  if (!doc) {
    app.replaceChildren(header(), landing());
    document.title = 'FormatReader';
    return;
  }
  const d = doc;
  if (d.type === 'book' || d.type === 'slides') {
    // Only refresh the chrome around the viewer; rebuilding it would reload the document.
    app.querySelector('.site-header')?.replaceWith(header());
    app.querySelector('.toolbar')?.replaceWith(toolbar(d));
    return;
  }
  document.title = `${d.name} — FormatReader`;

  let body: HTMLElement;
  let extraNote: string | undefined;
  if (d.type === 'text') {
    const text = d.repair && !d.showOriginal ? d.repair.text : d.text;
    const res = await renderText(text, d.kind, { source: d.source });
    if (token !== renderToken) return;
    body = res.el;
    extraNote = res.note;
  } else if (d.type === 'pdf') {
    body = h('div', { class: 'view view-pdf' }, h('iframe', { class: 'pdf-frame', src: d.url, title: d.name }));
  } else if (d.type === 'info') {
    body = infoView(d.size, d.head, d.format);
  } else {
    body = h('div', { class: 'view view-info' }, h('div', { class: 'info-card' }, h('h2', {}, t('failed')), h('p', { class: 'info-note' }, d.message)));
  }

  const n = notices(d);
  const note = extraNote ? h('div', { class: 'notices' }, h('div', { class: 'notice' }, extraNote)) : null;
  app.replaceChildren(header(), h('main', { class: 'doc' }, toolbar(d), n, note, body));
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Drag & drop, file picker, paste
// ---------------------------------------------------------------------------

// While dragging, the page shows only the circle.
const overlay = h('div', { class: 'drop-overlay', 'aria-hidden': 'true' }, h('div', { class: 'circle circle-active' }, h('span', { class: 'circle-text' }, t('readAny'))));
document.body.append(overlay);
let dragDepth = 0;

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  overlay.classList.add('show');
});
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'copy';
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) overlay.classList.remove('show');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.classList.remove('show');
  const file = e.dataTransfer?.files?.[0];
  if (file) openFile(file);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) openFile(file);
  fileInput.value = '';
});

document.addEventListener('paste', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName))) return;
  const file = e.clipboardData?.files?.[0];
  if (file) {
    e.preventDefault();
    openFile(file);
    return;
  }
  const text = e.clipboardData?.getData('text/plain');
  if (text) {
    e.preventDefault();
    openPastedText(text);
  }
});

onLangChange(() => {
  (overlay.querySelector('.circle-text') as HTMLElement).textContent = t('readAny');
  render();
});
setLang(lang());
