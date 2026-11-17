/** Highlighted code block, shared by the Code viewer and Text's "Source" mode. */
import './code-block.css';
import { formatCount, h, renderProgressively } from '../../../core/dom';
import { strings } from '../../../core/i18n';

const s = strings({ lines: { en: 'lines', zh: '行' } });

/** Above this size we skip syntax highlighting (it would be slow and adds little). */
const HIGHLIGHT_LIMIT = 400 * 1024;

// ---------------------------------------------------------------------------
// Syntax highlighting (highlight.js core + only the language that is needed)
// ---------------------------------------------------------------------------

const languageModules = import.meta.glob('../../../../node_modules/highlight.js/es/languages/*.js');
type Hljs = typeof import('highlight.js/lib/core').default;
let hljsPromise: Promise<Hljs> | null = null;

/** Start downloading the highlighter (and a language, if known) before the text is ready. */
export function preloadHighlighter(language?: string): Promise<unknown> {
  hljsPromise ??= import('highlight.js/lib/core').then((m) => m.default);
  return language ? highlighter(language).catch(() => null) : hljsPromise;
}

/** Our own grammars for languages highlight.js doesn't ship. */
const customLanguages: Partial<Record<string, () => Promise<{ default: Parameters<Hljs['registerLanguage']>[1] }>>> = {
  hcl: () => import('./langs/hcl'),
  solidity: () => import('./langs/solidity'),
};

async function highlighter(language: string): Promise<Hljs | null> {
  const custom = customLanguages[language];
  const key = custom ? null : Object.keys(languageModules).find((k) => k.endsWith(`/${language}.js`));
  if (!custom && !key) return null;
  hljsPromise ??= import('highlight.js/lib/core').then((m) => m.default);
  const hljs = await hljsPromise;
  if (!hljs.getLanguage(language)) {
    const mod = custom ? await custom() : ((await languageModules[key!]()) as { default: Parameters<Hljs['registerLanguage']>[1] });
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

/** Highlighted code with line numbers. Big files are shown without colours to stay fast. */
export async function codeView(text: string, language: string): Promise<HTMLElement> {
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
  return h('div', { class: 'view view-code' }, h('div', { class: 'meta' }, `${formatCount(htmlLines.length)} ${s('lines')}`), h('pre', {}, code));
}


/** A highlighted block without line numbers (e.g. a notebook cell). */
export async function highlightBlock(text: string, language: string): Promise<HTMLElement> {
  const code = h('code', { class: 'hljs', dir: 'ltr' });
  const hljs = text.length <= HIGHLIGHT_LIMIT ? await highlighter(language) : null;
  if (hljs) code.innerHTML = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  else code.textContent = text;
  return h('pre', { class: 'code-plain' }, code);
}
