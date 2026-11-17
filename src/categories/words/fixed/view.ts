/** Fixed-layout documents (XPS/OXPS, OFD): every page drawn as SVG at its real proportions. */
import './fixed.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import type { FixedDocument, FixedPage } from './model';

const s = strings({
  pages: { en: 'pages', zh: '页' },
  page: { en: 'page', zh: '页' },
  fonts: { en: 'Shown with system fonts; the document’s own fonts are not used.', zh: '使用系统字体显示，未使用文档自带字体。' },
});

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (name: string, attrs: Record<string, string | number | undefined>) => {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v));
  return el;
};

function pageSvg(page: FixedPage): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: `0 0 ${page.width} ${page.height}`, class: 'fixed-page', role: 'img' }) as SVGSVGElement;
  svg.append(svgEl('rect', { x: 0, y: 0, width: page.width, height: page.height, fill: '#fff' }));
  for (const it of page.items) {
    if (it.kind === 'path') {
      svg.append(svgEl('path', { d: it.d, fill: it.fill ?? 'none', stroke: it.stroke, 'stroke-width': it.stroke ? it.strokeWidth : undefined, transform: it.transform }));
    } else if (it.kind === 'image') {
      svg.append(svgEl('image', { href: it.href, x: it.x, y: it.y, width: it.w, height: it.h, preserveAspectRatio: 'none', transform: it.transform }));
    } else {
      const t = svgEl('text', {
        x: it.xs ? it.xs.join(' ') : it.x,
        y: it.y,
        'font-size': it.size,
        fill: it.fill,
        'font-weight': it.bold ? 700 : undefined,
        transform: it.transform,
      });
      t.textContent = it.text;
      svg.append(t);
    }
  }
  return svg;
}

export const preload = () => import('fflate');

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const { unzipSync } = await import('fflate');
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  let doc: FixedDocument;
  if (ctx.format?.id === 'ofd') {
    const { parseOfd } = await import('./ofd');
    doc = parseOfd(files);
  } else {
    const { parseXps } = await import('./xps');
    doc = parseXps(files);
  }

  const pages = h('div', { class: 'fixed-pages' }, ...doc.pages.map((p) => h('div', { class: 'fixed-sheet', style: `aspect-ratio:${p.width}/${p.height}` }, pageSvg(p))));
  ctx.mount.replaceChildren(h('div', { class: 'view view-fixed' }, h('div', { class: 'fixed-note' }, s('fonts')), pages));
  const zoom = () => pages.style.setProperty('--fixed-zoom', String(ctx.fontScale()));
  zoom();
  return {
    title: doc.title || undefined,
    meta: () => [doc.kind === 'OFD' ? 'OFD' : 'XPS', `${doc.pages.length} ${doc.pages.length === 1 ? s('page') : s('pages')}`],
    onFontScale: zoom,
    onLangChange: () => {
      const note = ctx.mount.querySelector('.fixed-note');
      if (note) note.textContent = s('fonts');
    },
  };
}
