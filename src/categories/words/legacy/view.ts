/**
 * Old binary Office files: Word 97–2003 (.doc/.dot), WPS Writer (.wps),
 * PowerPoint 97–2003 (.ppt/.pps/.pot) and WPS Presentation (.dps).
 * Text only: layout, pictures and charts are not reproduced.
 */
import './legacy.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { renderPaper } from '../shared/paper';
import { docBlocks, docText, pptSlides } from './extract';

const s = strings({
  note: {
    en: 'Older Office format: text only. Layout, pictures and charts are not shown.',
    zh: '旧版 Office 格式：仅显示文字，不显示版式、图片和图表。',
  },
  slide: { en: 'Slide', zh: '幻灯片' },
  slides: { en: 'slides', zh: '页幻灯片' },
  empty: { en: '(no text on this slide)', zh: '（此页没有文字）' },
});

export const preload = () => import('xlsx');

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const XLSX = await import('xlsx');
  const cfb = XLSX.CFB.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const stream = (name: string) => {
    const e = XLSX.CFB.find(cfb, name);
    return e?.content ? new Uint8Array(e.content as ArrayLike<number> as Uint8Array) : undefined;
  };
  const note = h('p', { class: 'legacy-note' }, s('note'));

  const ppt = stream('PowerPoint Document');
  if (ppt) {
    const slides = pptSlides(ppt);
    const list = h(
      'div',
      { class: 'legacy-slides' },
      ...slides.map((sl, i) =>
        h(
          'section',
          { class: 'legacy-slide' },
          h('div', { class: 'legacy-slide-no' }, `${s('slide')} ${i + 1}`),
          ...sl.title.map((t) => h('h2', { dir: 'auto' }, t)),
          sl.body.length ? h('ul', {}, ...sl.body.map((t) => h('li', { dir: 'auto' }, t))) : null,
          !sl.title.length && !sl.body.length ? h('p', { class: 'legacy-empty' }, s('empty')) : null,
        ),
      ),
    );
    ctx.mount.replaceChildren(h('div', { class: 'view view-legacy' }, note, list));
    const kind = /\.dps$/i.test(file.name) ? 'WPS Presentation' : 'PowerPoint 97–2003';
    return { meta: () => [kind, `${slides.length} ${s('slides')}`], onFontScale: () => {} };
  }

  const word = stream('WordDocument');
  if (!word) throw new Error('This Office file holds neither a Word document nor a presentation');
  const page = renderPaper(docBlocks(docText(word, { '0Table': stream('0Table'), '1Table': stream('1Table') })));
  ctx.mount.replaceChildren(h('div', { class: 'view-legacy-doc' }, note, page.el));
  const kind = /\.wps$/i.test(file.name) ? 'WPS Writer' : 'Word 97–2003';
  return { meta: () => [kind], onFontScale: () => {}, destroy: page.dispose };
}
