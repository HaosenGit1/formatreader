/** Draws the shared document model as a white "paper" page. */
import './paper.css';
import { h } from '../../../core/dom';
import type { Block, Para, Run } from './doc-model';

function runEl(r: Run, basePt: number): Node {
  const style: string[] = [];
  if (r.sizePt) style.push(`font-size:${(r.sizePt / basePt).toFixed(3)}em`);
  if (r.color) style.push(`color:${r.color}`);
  let el: HTMLElement = h('span', { style: style.join(';') || undefined }, r.text);
  if (r.b) el = h('strong', {}, el);
  if (r.i) el = h('em', {}, el);
  if (r.u) el = h('u', {}, el);
  if (r.strike) el = h('s', {}, el);
  if (r.sup) el = h('sup', {}, el);
  if (r.sub) el = h('sub', {}, el);
  return el;
}

function paraEl(p: Para, basePt: number): HTMLElement {
  const empty = !p.runs.some((r) => r.text.length);
  const level = p.heading;
  const tag = level ? (`h${Math.min(6, level)}` as 'h1') : 'p';
  return h(
    tag,
    { class: `${p.pageBreakBefore ? 'page-break' : ''}${p.listItem ? ' li' : ''}`.trim() || undefined, style: p.align ? `text-align:${p.align}` : undefined, dir: 'auto' },
    ...(p.listItem ? [h('span', { class: 'li-mark', 'aria-hidden': 'true' }, p.listItem)] : []),
    ...(empty ? [h('br')] : p.runs.map((r) => runEl(r, basePt))),
  );
}

/** Returns the page and a cleanup that releases picture URLs. */
/**
 * `basePt`: the point size that 1em stands for (12 for pages; slides pass
 * their default text size so explicit sizes keep their proportions).
 */
export function renderPaper(blocks: Block[], basePt = 12): { el: HTMLElement; dispose: () => void } {
  const urls: string[] = [];
  const children: HTMLElement[] = [];
  for (const b of blocks) {
    if (b.type === 'para') children.push(paraEl(b, basePt));
    else if (b.type === 'picture') {
      const url = URL.createObjectURL(new Blob([b.data as BlobPart], { type: b.mime }));
      urls.push(url);
      children.push(h('p', { class: 'pic' }, h('img', { src: url, alt: '', style: b.widthPt ? `width:${Math.round(b.widthPt * 1.333)}px` : undefined })));
    } else {
      children.push(
        h(
          'table',
          {},
          h('tbody', {}, ...b.rows.map((row) => h('tr', {}, ...row.map((cell) => h('td', {}, ...cell.map((p) => paraEl(p, basePt))))))),
        ),
      );
    }
  }
  const el = h('div', { class: 'view view-paper' }, h('article', { class: 'paper' }, ...children));
  return { el, dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}
