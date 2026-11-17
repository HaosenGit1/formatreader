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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Doc =
  | { type: 'text'; name: string; size: number; bytes: Uint8Array | null; detected: EncodingResult | null; encoding: string; text: string; repair: RepairResult | null; showOriginal: boolean; kind: TextKind; source: boolean }
  | { type: 'pdf'; name: string; size: number; url: string }
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

async function openFile(file: File) {
  if (doc?.type === 'pdf') URL.revokeObjectURL(doc.url);
  const token = ++renderToken;
  showLoading(file.name);
  try {
    const format = await detectFormat(file, file.name);
    if (token !== renderToken) return;

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
      { class: 'brand', type: 'button', onclick: () => { doc = null; render(); } },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'F'),
      h('span', { class: 'brand-name' }, 'FormatReader'),
    ),
    h('button', { class: 'lang-toggle', type: 'button', onclick: () => setLang(lang() === 'en' ? 'zh' : 'en') }, t('language')),
  );
}

function landing(): HTMLElement {
  const cats: Array<[Parameters<typeof t>[0], boolean]> = [
    ['catWords', true], ['catImages', false], ['catDrawings', false], ['catSounds', false], ['catVideos', false],
  ];
  return h(
    'main',
    { class: 'landing' },
    h('h1', { class: 'tagline' }, t('tagline')),
    h(
      'div',
      { class: 'dropzone', tabindex: 0, role: 'button', onclick: () => fileInput.click(), onkeydown: (e: Event) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') { e.preventDefault(); fileInput.click(); } } },
      h('div', { class: 'drop-icon', 'aria-hidden': 'true' }, dropIcon()),
      h('div', { class: 'drop-title' }, t('dropTitle')),
      h('div', { class: 'drop-or' }, t('dropOr')),
      h('span', { class: 'btn btn-primary' }, t('choose')),
      h('div', { class: 'drop-hint' }, t('pasteHint')),
    ),
    h('p', { class: 'privacy' }, lockIcon(), t('privacy')),
    h(
      'ul',
      { class: 'cats' },
      ...cats.map(([k, on]) => h('li', { class: on ? 'cat on' : 'cat' }, h('span', { class: 'cat-name' }, t(k)), h('span', { class: 'cat-state' }, on ? t('available') : t('soon')))),
    ),
  );
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
const dropIcon = () => svg('<path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>', 40);
const lockIcon = () => svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 16);

function showLoading(name: string) {
  app.replaceChildren(header(), h('main', { class: 'doc' }, h('div', { class: 'loading' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), `${t('reading')} ${name}`)));
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

  if (d.type === 'text') {
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
    h('div', { class: 'file' }, h('div', { class: 'file-name', title: d.name }, d.name), h('div', { class: 'file-meta' }, fileMeta(d))),
    h('div', { class: 'tools' }, ...items, h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, t('openAnother'))),
  );
}

function fileMeta(d: Doc): string {
  const parts = [formatBytes(d.size)];
  if (d.type === 'pdf') parts.unshift('PDF');
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

const overlay = h('div', { class: 'drop-overlay', 'aria-hidden': 'true' }, h('div', { class: 'drop-overlay-inner' }, dropIcon(), h('div', {}, t('dropOverlay'))));
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
  (overlay.querySelector('.drop-overlay-inner div:last-child') as HTMLElement).textContent = t('dropOverlay');
  render();
});
setLang(lang());
