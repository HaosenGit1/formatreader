/**
 * XMind mind maps shown as an outline: one tree per sheet, branches collapsible.
 * Reads XMind 2020+ (content.json) and XMind 8 (content.xml).
 */
import './mindmap.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';

const s = strings({
  sheets: { en: 'sheets', zh: '个画布' },
  topics: { en: 'topics', zh: '个主题' },
  untitled: { en: '(untitled)', zh: '（无标题）' },
});

interface Topic {
  title: string;
  note?: string;
  children: Topic[];
}

function fromJson(t: Record<string, unknown>): Topic {
  const kids = ((t.children as Record<string, unknown> | undefined)?.attached as Record<string, unknown>[] | undefined) ?? [];
  const note = ((t.notes as Record<string, unknown> | undefined)?.plain as Record<string, unknown> | undefined)?.content as string | undefined;
  return { title: String(t.title ?? ''), note, children: kids.map(fromJson) };
}

function fromXml(el: Element): Topic {
  const title = [...el.children].find((c) => c.localName === 'title')?.textContent ?? '';
  const children: Topic[] = [];
  for (const c of el.children) {
    if (c.localName !== 'children') continue;
    for (const group of c.children) if (group.localName === 'topics' && group.getAttribute('type') !== 'detached') for (const t of group.children) if (t.localName === 'topic') children.push(fromXml(t));
  }
  return { title, children };
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === 'content.json' || f.name === 'content.xml' });
  let sheets: Array<{ title: string; root: Topic }> = [];
  if (files['content.json']) {
    const data = JSON.parse(strFromU8(files['content.json'])) as Array<Record<string, unknown>>;
    sheets = data.map((sh) => ({ title: String(sh.title ?? ''), root: fromJson(sh.rootTopic as Record<string, unknown>) }));
  } else if (files['content.xml']) {
    const doc = new DOMParser().parseFromString(strFromU8(files['content.xml']), 'application/xml');
    sheets = [...doc.getElementsByTagNameNS('*', 'sheet')].map((sh) => {
      const root = [...sh.children].find((c) => c.localName === 'topic');
      return { title: [...sh.children].find((c) => c.localName === 'title')?.textContent ?? '', root: root ? fromXml(root) : { title: '', children: [] } };
    });
  }
  let count = 0;
  const node = (t: Topic, depth: number): HTMLElement => {
    count++;
    const label = h('span', { class: 'mm-title' }, t.title || s('untitled'));
    const note = t.note ? h('div', { class: 'mm-note' }, t.note) : null;
    if (!t.children.length) return h('li', {}, label, note);
    return h('li', {}, h('details', { open: depth < 3 }, h('summary', {}, label), note, h('ul', {}, ...t.children.map((c) => node(c, depth + 1)))));
  };
  ctx.mount.replaceChildren(
    h(
      'div',
      { class: 'view view-mindmap' },
      ...sheets.map((sh) => h('section', { class: 'mm-sheet' }, sheets.length > 1 ? h('h3', {}, sh.title) : null, h('ul', { class: 'mm-tree' }, node(sh.root, 0)))),
    ),
  );
  return { meta: () => ['XMind', ...(sheets.length > 1 ? [`${sheets.length} ${s('sheets')}`] : []), `${count} ${s('topics')}`] };
}
