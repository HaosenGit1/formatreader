/** Reading views of the Text viewer: plain text, subtitles, rendered Markdown/HTML. */
import { formatCount, h, renderProgressively } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import { parseAss, parseSrtVtt } from './subtitles';

const s = strings({ cues: { en: 'subtitles', zh: '条字幕' } });

// ---------------------------------------------------------------------------
// Plain reading text (novels, logs, notes)
// ---------------------------------------------------------------------------

export function plainView(text: string): HTMLElement {
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
// Subtitles
// ---------------------------------------------------------------------------

export function subtitleView(text: string, format: 'srt' | 'vtt' | 'ass'): HTMLElement {
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
  return h('div', { class: 'view view-subtitle' }, h('div', { class: 'meta' }, `${formatCount(cues.length)} ${s('cues')} · ${format.toUpperCase()}`), list);
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

export async function markdownView(text: string): Promise<HTMLElement> {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }) as string);
  return h('div', { class: 'view view-rendered' }, sandboxFrame(html, true));
}

export async function htmlView(text: string): Promise<HTMLElement> {
  const { default: DOMPurify } = await import('dompurify');
  const clean = DOMPurify.sanitize(text, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style', 'link', 'meta'] });
  return h('div', { class: 'view view-rendered' }, sandboxFrame(`<!doctype html>${clean}`, false));
}

