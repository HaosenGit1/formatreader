import { formatCount, h, renderProgressively } from '../core/dom';
import { t } from '../core/i18n';
import { parseAss, parseDelimited, parseSrtVtt } from './parse';
import type { TextKind } from './text-kind';

/** Above this size we skip syntax highlighting (it would be slow and adds little). */
const HIGHLIGHT_LIMIT = 400 * 1024;

// ---------------------------------------------------------------------------
// Syntax highlighting (highlight.js core + only the language that is needed)
// ---------------------------------------------------------------------------

const languageModules = import.meta.glob('../../node_modules/highlight.js/es/languages/*.js');
type Hljs = typeof import('highlight.js/lib/core').default;
let hljsPromise: Promise<Hljs> | null = null;

async function highlighter(language: string): Promise<Hljs | null> {
  const key = Object.keys(languageModules).find((k) => k.endsWith(`/${language}.js`));
  if (!key) return null;
  hljsPromise ??= import('highlight.js/lib/core').then((m) => m.default);
  const hljs = await hljsPromise;
  if (!hljs.getLanguage(language)) {
    const mod = (await languageModules[key]()) as { default: Parameters<Hljs['registerLanguage']>[1] };
    hljs.registerLanguage(language, mod.default);
  }
  return hljs;
}

/** Split highlighted HTML into lines, closing and reopening spans across line breaks. */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let line = '';
  const re = /<span[^>]*>|<\/span>|\n|[^<\n]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tok = m[0];
    if (tok === '\n') {
      lines.push(line + '</span>'.repeat(open.length));
      line = open.join('');
    } else if (tok.startsWith('<span')) {
      open.push(tok);
      line += tok;
    } else if (tok === '</span>') {
      open.pop();
      line += tok;
    } else {
      line += tok;
    }
  }
  lines.push(line);
  return lines;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function codeView(text: string, language: string): Promise<HTMLElement> {
  let htmlLines: string[];
  const hljs = text.length <= HIGHLIGHT_LIMIT && language !== 'plaintext' ? await highlighter(language) : null;
  if (hljs) {
    htmlLines = splitHighlightedLines(hljs.highlight(text, { language, ignoreIllegals: true }).value);
  } else {
    htmlLines = text.split(/\r?\n/).map(escapeHtml);
  }
  if (htmlLines.length > 1 && htmlLines[htmlLines.length - 1] === '') htmlLines.pop();

  const code = h('code', { class: 'code-lines hljs', dir: 'ltr' });
  renderProgressively(
    code,
    htmlLines,
    (line) => {
      const span = document.createElement('span');
      span.className = 'line';
      span.innerHTML = line || ' ';
      return span;
    },
    500,
  );
  return h('div', { class: 'view view-code' }, h('div', { class: 'meta' }, `${formatCount(htmlLines.length)} ${t('lines')}`), h('pre', {}, code));
}

// ---------------------------------------------------------------------------
// Plain reading text (novels, logs, notes)
// ---------------------------------------------------------------------------

function plainView(text: string): HTMLElement {
  const CHUNK = 40_000;
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + CHUNK);
    if (end < text.length) {
      const nl = text.indexOf('\n', end);
      end = nl === -1 ? text.length : nl + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  const body = h('div', { class: 'reading', dir: 'auto' });
  renderProgressively(body, chunks, (c) => h('div', { class: 'chunk' }, c), 3);
  return h('div', { class: 'view view-plain' }, body);
}

// ---------------------------------------------------------------------------
// Tables (CSV / TSV)
// ---------------------------------------------------------------------------

function tableView(text: string, delimiter: string): HTMLElement {
  const rows = parseDelimited(text, delimiter, 1_000_000);
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  const header = rows.shift() ?? [];
  const width = Math.max(header.length, ...rows.slice(0, 1000).map((r) => r.length));
  const thead = h('thead', {}, h('tr', {}, h('th', { class: 'rownum' }, '#'), ...Array.from({ length: width }, (_, c) => h('th', { dir: 'auto' }, header[c] ?? ''))));
  const tbody = h('tbody');
  renderProgressively(
    tbody,
    rows,
    (r, idx) => h('tr', {}, h('td', { class: 'rownum' }, String(idx + 1)), ...Array.from({ length: width }, (_, c) => h('td', { dir: 'auto' }, r[c] ?? ''))),
    100,
  );
  const name = delimiter === '\t' ? 'Tab' : delimiter === ',' ? 'Comma' : `"${delimiter}"`;
  return h(
    'div',
    { class: 'view view-table' },
    h('div', { class: 'meta' }, `${formatCount(rows.length)} ${t('rows')} × ${width} ${t('columns')} · ${name}`),
    h('div', { class: 'table-wrap' }, h('table', {}, thead, tbody)),
  );
}

// ---------------------------------------------------------------------------
// Subtitles
// ---------------------------------------------------------------------------

function subtitleView(text: string, format: 'srt' | 'vtt' | 'ass'): HTMLElement {
  const cues = format === 'ass' ? parseAss(text) : parseSrtVtt(text);
  const list = h('ol', { class: 'cues' });
  renderProgressively(
    list,
    cues,
    (c) =>
      h(
        'li',
        {},
        h('div', { class: 'cue-time' }, `${c.start} → ${c.end}`, c.speaker ? h('span', { class: 'cue-speaker' }, c.speaker) : null),
        h('div', { class: 'cue-text', dir: 'auto' }, c.text),
      ),
    300,
  );
  return h('div', { class: 'view view-subtitle' }, h('div', { class: 'meta' }, `${formatCount(cues.length)} ${t('cues')} · ${format.toUpperCase()}`), list);
}

// ---------------------------------------------------------------------------
// Rendered Markdown / HTML — inside a sandbox with scripts disabled
// ---------------------------------------------------------------------------

const FRAME_CSS = `
:root{color-scheme:light dark;--fg:#1d1d1f;--bg:#fff;--muted:#6e6e73;--line:#e5e5ea;--code:#f5f5f7;--link:#0a66d8}
@media (prefers-color-scheme:dark){:root{--fg:#ececf0;--bg:#16171a;--muted:#9a9aa3;--line:#2c2d33;--code:#202127;--link:#6aa8ff}}
body{margin:0;padding:32px 24px 64px;background:var(--bg);color:var(--fg);font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif}
.md{max-width:780px;margin:0 auto}
a{color:var(--link)}img,video{max-width:100%;height:auto}
pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;background:var(--code);border-radius:6px}
code{padding:.15em .35em}pre{padding:14px 16px;overflow:auto}pre code{padding:0;background:none}
table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid var(--line);padding:6px 10px}
blockquote{margin:0;padding:0 1em;color:var(--muted);border-left:4px solid var(--line)}
hr{border:0;border-top:1px solid var(--line)}h1,h2{border-bottom:1px solid var(--line);padding-bottom:.3em}
`;

const FRAME_CSP =
  "default-src 'none'; img-src * data: blob:; media-src * data: blob:; style-src 'unsafe-inline' *; font-src * data:";

function sandboxFrame(html: string, wrapMarkdown: boolean): HTMLIFrameElement {
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><base target="_blank">`;
  const doc = wrapMarkdown
    ? `<!doctype html><html><head>${head}<style>${FRAME_CSS}</style></head><body><article class="md">${html}</article></body></html>`
    : html.replace(/<head[^>]*>/i, (m) => m + head).replace(/^(?![\s\S]*<head)/, `<head>${head}</head>`);
  // No allow-scripts and no allow-same-origin: the document cannot run code or reach this page.
  return h('iframe', { class: 'rendered', sandbox: 'allow-popups allow-popups-to-escape-sandbox', srcdoc: doc, title: 'Document preview' });
}

async function markdownView(text: string): Promise<HTMLElement> {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }) as string);
  return h('div', { class: 'view view-rendered' }, sandboxFrame(html, true));
}

async function htmlView(text: string): Promise<HTMLElement> {
  const { default: DOMPurify } = await import('dompurify');
  const clean = DOMPurify.sanitize(text, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style', 'link', 'meta'] });
  return h('div', { class: 'view view-rendered' }, sandboxFrame(`<!doctype html>${clean}`, false));
}

// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** For Markdown/HTML: show source instead of the rendered page. */
  source?: boolean;
}

export async function renderText(text: string, kind: TextKind, opts: RenderOptions = {}): Promise<{ el: HTMLElement; note?: string }> {
  switch (kind.kind) {
    case 'table':
      return { el: tableView(text, kind.delimiter) };
    case 'subtitle':
      return { el: subtitleView(text, kind.format) };
    case 'markdown':
      return { el: opts.source ? await codeView(text, 'markdown') : await markdownView(text) };
    case 'html':
      return { el: opts.source ? await codeView(text, 'xml') : await htmlView(text) };
    case 'json': {
      if (kind.lines) return { el: await codeView(text, 'json') };
      if (text.length < 30 * 1024 * 1024) {
        try {
          return { el: await codeView(JSON.stringify(JSON.parse(text), null, 2), 'json') };
        } catch (e) {
          return { el: await codeView(text, 'json'), note: `${t('invalidJson')} ${(e as Error).message}` };
        }
      }
      return { el: await codeView(text, 'json') };
    }
    case 'code':
      return { el: await codeView(text, kind.language) };
    default:
      return { el: plainView(text) };
  }
}
