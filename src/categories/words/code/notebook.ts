/**
 * Jupyter notebooks (.ipynb) shown as cells: Markdown, highlighted code, and
 * outputs (text, tables, images, errors). HTML and Markdown are sanitised, and
 * the page's Content-Security-Policy blocks any script inside a notebook.
 */
import { h } from '../../../core/dom';
import { highlightBlock } from '../shared/code-block';

type Multiline = string | string[];
interface Output {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error';
  name?: string;
  text?: Multiline;
  data?: Record<string, Multiline>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  execution_count?: number | null;
}
interface Cell {
  cell_type: 'markdown' | 'code' | 'raw';
  source: Multiline;
  execution_count?: number | null;
  outputs?: Output[];
}
export interface Notebook {
  cells: Cell[];
  metadata?: { kernelspec?: { language?: string; display_name?: string }; language_info?: { name?: string } };
  nbformat?: number;
}

const join = (m: Multiline | undefined) => (Array.isArray(m) ? m.join('') : m ?? '');
// Terminal colour codes in tracebacks.
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

export function isNotebook(value: unknown): value is Notebook {
  return !!value && typeof value === 'object' && Array.isArray((value as Notebook).cells);
}

export function notebookLanguage(nb: Notebook): string {
  return (nb.metadata?.language_info?.name ?? nb.metadata?.kernelspec?.language ?? 'python').toLowerCase();
}

export async function renderNotebook(nb: Notebook): Promise<HTMLElement> {
  const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
  const safeHtml = (html: string) => {
    const div = h('div');
    div.innerHTML = DOMPurify.sanitize(html);
    return div;
  };
  const language = notebookLanguage(nb);

  const renderOutput = async (o: Output): Promise<HTMLElement | null> => {
    if (o.output_type === 'stream') {
      return h('pre', { class: `nb-out${o.name === 'stderr' ? ' nb-stderr' : ''}` }, join(o.text));
    }
    if (o.output_type === 'error') {
      const tb = (o.traceback ?? []).map(stripAnsi).join('\n') || `${o.ename}: ${o.evalue}`;
      return h('pre', { class: 'nb-out nb-error' }, tb);
    }
    const data = o.data ?? {};
    for (const type of ['image/png', 'image/jpeg', 'image/gif']) {
      if (data[type]) return h('img', { class: 'nb-img', src: `data:${type};base64,${join(data[type]).replace(/\s/g, '')}`, alt: '' });
    }
    if (data['image/svg+xml']) {
      // As an <img>, SVG can't run scripts.
      const svg = join(data['image/svg+xml']);
      return h('img', { class: 'nb-img', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, alt: '' });
    }
    if (data['text/html']) return h('div', { class: 'nb-html' }, safeHtml(join(data['text/html'])));
    if (data['text/markdown']) return h('div', { class: 'nb-md' }, safeHtml(marked.parse(join(data['text/markdown']), { async: false }) as string));
    if (data['application/json']) return h('pre', { class: 'nb-out' }, JSON.stringify(data['application/json'], null, 2));
    if (data['text/plain']) return h('pre', { class: 'nb-out' }, join(data['text/plain']));
    return null;
  };

  const cells: HTMLElement[] = [];
  for (const cell of nb.cells) {
    const source = join(cell.source);
    if (cell.cell_type === 'markdown') {
      cells.push(h('section', { class: 'nb-cell nb-markdown' }, h('div', { class: 'nb-md', dir: 'auto' }, safeHtml(marked.parse(source, { async: false, gfm: true }) as string))));
      continue;
    }
    if (cell.cell_type === 'raw') {
      cells.push(h('section', { class: 'nb-cell' }, h('pre', { class: 'nb-out' }, source)));
      continue;
    }
    const prompt = cell.execution_count != null ? `[${cell.execution_count}]` : '[ ]';
    const outputs = (await Promise.all((cell.outputs ?? []).map(renderOutput))).filter((x): x is HTMLElement => !!x);
    cells.push(
      h(
        'section',
        { class: 'nb-cell nb-code' },
        h('div', { class: 'nb-row' }, h('div', { class: 'nb-prompt' }, prompt), h('div', { class: 'nb-input' }, await highlightBlock(source, language))),
        outputs.length ? h('div', { class: 'nb-row' }, h('div', { class: 'nb-prompt' }, ''), h('div', { class: 'nb-outputs' }, ...outputs)) : null,
      ),
    );
  }
  return h('div', { class: 'view view-notebook' }, ...cells);
}
