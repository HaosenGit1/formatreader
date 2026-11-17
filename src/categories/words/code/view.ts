/** Code viewer: every programming language, JSON, XML, YAML and config files. */
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { codeView, preloadHighlighter } from '../shared/code-block';
import { isSource, readText } from '../shared/read';
import { codeKind, languageName } from './languages';
import { isNotebook, renderNotebook, type Notebook } from './notebook';
import './notebook.css';

const s = strings({
  invalidJson: { en: 'This JSON has an error, shown as-is:', zh: 'JSON 有错误，按原样显示：' },
  notebook: { en: 'Notebook', zh: '笔记本' },
  cells: { en: 'cells', zh: '个单元格' },
  source: { en: 'Source', zh: '源码' },
});

/** Pretty-print JSON documents below this size (bigger ones are shown as they are). */
const PRETTY_LIMIT = 30 * 1024 * 1024;

export const preload = () => preloadHighlighter();

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  // The language is usually known from the name: fetch its grammar while the file is read.
  const guess = codeKind(file.name, '');
  if (guess) void preloadHighlighter(guess.language);
  const src = await readText(file, ctx.mount);
  if (!isSource(src)) return src;

  let jsonError: string | null = null;
  let kind = codeKind(file.name, src.text.slice(0, 4000)) ?? { language: 'plaintext' };

  // Jupyter notebooks: shown as cells, with the raw JSON one click away.
  let notebook: Notebook | null = null;
  let showSource = false;
  if (/\.ipynb$/i.test(file.name)) {
    try {
      const parsed: unknown = JSON.parse(src.text);
      if (isNotebook(parsed)) notebook = parsed;
    } catch {
      /* not valid JSON: shown as code with an error note */
    }
  }

  const draw = async () => {
    kind = codeKind(file.name, src.text.slice(0, 4000)) ?? { language: 'plaintext' };
    if (notebook && !showSource) {
      ctx.mount.replaceChildren(await renderNotebook(notebook));
      return;
    }
    let text = src.text;
    jsonError = null;
    if (kind.json === 'document' && text.length < PRETTY_LIMIT) {
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch (e) {
        jsonError = (e as Error).message;
      }
    }
    ctx.mount.replaceChildren(await codeView(text, kind.language));
  };
  const changed = async () => {
    await draw();
    ctx.refreshChrome();
  };
  await draw();

  return {
    meta: () => {
      if (notebook) return ['Jupyter', `${notebook.cells.length} ${s('cells')}`];
      if (kind.json === 'lines') return ['JSON Lines'];
      // Languages without a highlighter yet: name them by extension (SOL, TF…) rather than "Text".
      const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1];
      return [kind.language === 'plaintext' && ext ? ext.toUpperCase() : languageName(kind.language)];
    },
    tools: () => {
      const out: HTMLElement[] = [];
      const enc = src.tool(changed);
      if (enc) out.push(enc);
      if (notebook) {
        const btn = (value: boolean, label: string) =>
          h('button', { type: 'button', class: showSource === value ? 'active' : '', 'aria-pressed': String(showSource === value), onclick: () => { showSource = value; void changed(); } }, label);
        out.push(h('div', { class: 'seg', role: 'group' }, btn(false, s('notebook')), btn(true, s('source'))));
      }
      return out;
    },
    notices: () => [...src.notices(changed), ...(jsonError ? [h('div', { class: 'notice' }, `${s('invalidJson')} ${jsonError}`)] : [])],
    onFontScale: () => {},
    onLangChange: () => void draw(),
  };
}
