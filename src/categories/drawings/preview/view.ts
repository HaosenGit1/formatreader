/**
 * Drawings whose full rendering isn't available here yet, shown through what
 * the file itself carries: the preview picture AutoCAD saves in DWG files, the
 * thumbnail in OpenDocument drawings, and the pages and shape texts of Visio files.
 */
import './preview.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { ACAD_VERSIONS } from '../shared/acad';
import { dwgPreview } from './dwg';

const s = strings({
  dwgNote: {
    en: 'Showing the preview picture AutoCAD saved inside this file. Full DWG drawing view is not available yet; a DXF export of the drawing opens fully here.',
    zh: '显示 AutoCAD 保存在文件中的预览图。暂不支持完整显示 DWG 图纸；导出为 DXF 后可在这里完整打开。',
  },
  dwgNone: {
    en: 'This DWG file has no saved preview picture, and full DWG drawing view is not available yet. A DXF export of the drawing opens fully here.',
    zh: '这个 DWG 文件没有保存预览图，暂不支持完整显示 DWG 图纸。导出为 DXF 后可在这里完整打开。',
  },
  odgNote: { en: 'Showing the preview picture saved inside this drawing.', zh: '显示保存在图纸中的预览图。' },
  noPreview: { en: 'This file has no preview picture.', zh: '这个文件没有预览图。' },
  visioNote: { en: 'Visio pages and the text on their shapes. Shapes themselves are not drawn yet.', zh: 'Visio 页面及其形状上的文字。暂不绘制形状本身。' },
  page: { en: 'Page', zh: '页' },
  pages: { en: 'pages', zh: '页' },
  noText: { en: '(no text on this page)', zh: '（此页没有文字）' },
});

const img = (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  return { el: h('img', { class: 'pv-image', src: url, alt: '' }), url };
};

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const id = ctx.format?.id ?? '';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const urls: string[] = [];
  let meta: string[] = [];
  let note = '';

  if (id === 'dwg') {
    const ver = new TextDecoder('latin1').decode(bytes.subarray(0, 6));
    const preview = dwgPreview(bytes);
    meta = ['DWG', `AutoCAD ${ACAD_VERSIONS[ver] ?? ver}`];
    if (preview) {
      const { el, url } = img(preview.blob);
      urls.push(url);
      ctx.mount.replaceChildren(h('div', { class: 'view view-preview' }, el));
      note = s('dwgNote');
    } else {
      ctx.mount.replaceChildren(h('div', { class: 'view view-preview pv-empty' }, s('dwgNone')));
    }
  } else {
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(bytes, { filter: (f) => /^(Thumbnails\/|docProps\/thumbnail|visio\/pages\/|content\.xml$)/.test(f.name) });
    if (id === 'odg') {
      const thumb = files['Thumbnails/thumbnail.png'];
      const pages = (strFromU8(files['content.xml'] ?? new Uint8Array()).match(/<draw:page\b/g) ?? []).length;
      meta = ['OpenDocument Drawing', ...(pages ? [`${pages} ${s('pages')}`] : [])];
      if (thumb) {
        const { el, url } = img(new Blob([thumb], { type: 'image/png' }));
        urls.push(url);
        ctx.mount.replaceChildren(h('div', { class: 'view view-preview' }, el));
        note = s('odgNote');
      } else ctx.mount.replaceChildren(h('div', { class: 'view view-preview pv-empty' }, s('noPreview')));
    } else {
      // Visio (.vsdx): page names from pages.xml, shape texts from each page.
      const pagesXml = strFromU8(files['visio/pages/pages.xml'] ?? new Uint8Array());
      const names = [...pagesXml.matchAll(/<Page\b[^>]*\bName(?:U)?="([^"]*)"/g)].map((m) => m[1]);
      const pageFiles = Object.keys(files)
        .filter((f) => /^visio\/pages\/page\d+\.xml$/.test(f))
        .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
      const decode = (x: string) => x.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').trim();
      const sections = pageFiles.map((f, i) => {
        const xml = strFromU8(files[f]);
        const texts = [...xml.matchAll(/<Text\b[^>]*>([\s\S]*?)<\/Text>/g)].map((m) => decode(m[1])).filter(Boolean);
        return h(
          'section',
          { class: 'pv-page' },
          h('h3', {}, names[i] || `${s('page')} ${i + 1}`),
          texts.length ? h('ul', {}, ...texts.map((t) => h('li', {}, t))) : h('p', { class: 'pv-muted' }, s('noText')),
        );
      });
      meta = ['Visio', `${pageFiles.length} ${s('pages')}`];
      note = s('visioNote');
      ctx.mount.replaceChildren(h('div', { class: 'view view-preview pv-visio' }, ...sections));
    }
  }

  return {
    meta: () => meta,
    notices: () => (note ? [h('div', { class: 'notice subtle' }, note)] : []),
    destroy: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}
