/**
 * Apple Pages / Keynote / Numbers: Apple's internal format (IWA) is not
 * documented, but the files keep preview images, which we show.
 */
import './iwork.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';

const s = strings({
  note: {
    en: 'Showing the preview image saved inside the file. Apple’s own format can only be fully opened in Pages, Keynote or Numbers (or exported to PDF/Word there).',
    zh: '显示文件中保存的预览图。Apple 的格式只能在 Pages、Keynote 或 Numbers 中完整打开（或在其中导出为 PDF/Word）。',
  },
  none: { en: 'This file has no preview image inside.', zh: '这个文件里没有预览图。' },
});

const PREVIEW = /^(preview\.jpg|preview-web\.jpg|preview-micro\.jpg|QuickLook\/Thumbnail\.(jpg|png)|QuickLook\/Preview\.(pdf|jpg|png)|Data\/(preview|st-)[^/]*\.(jpg|jpeg|png))$/i;

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const { unzipSync } = await import('fflate');
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => PREVIEW.test(f.name) });
  // Biggest image first (the full-page preview rather than a thumbnail).
  const images = Object.entries(files)
    .filter(([n]) => !/\.pdf$/i.test(n))
    .sort((a, b) => b[1].length - a[1].length);
  const pdf = Object.entries(files).find(([n]) => /\.pdf$/i.test(n));
  const urls: string[] = [];
  let body: HTMLElement;
  if (pdf) {
    const url = URL.createObjectURL(new Blob([pdf[1] as BlobPart], { type: 'application/pdf' }));
    urls.push(url);
    body = h('iframe', { class: 'iwork-pdf', src: url, title: file.name });
  } else if (images.length) {
    const [name, data] = images[0];
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: /png$/i.test(name) ? 'image/png' : 'image/jpeg' }));
    urls.push(url);
    body = h('img', { class: 'iwork-preview', src: url, alt: file.name });
  } else {
    body = h('p', { class: 'iwork-none' }, s('none'));
  }
  ctx.mount.replaceChildren(h('div', { class: 'view view-iwork' }, h('p', { class: 'iwork-note' }, s('note')), body));
  const kind = /\.key$/i.test(file.name) ? 'Keynote' : /\.numbers$/i.test(file.name) ? 'Numbers' : 'Pages';
  return { meta: () => [`Apple ${kind}`], destroy: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}
