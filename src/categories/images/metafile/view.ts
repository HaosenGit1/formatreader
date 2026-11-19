/**
 * Windows metafiles: EMF and WMF (vector pictures from Office clip art, charts and diagrams
 * pasted out of Word / Excel / Visio, CAD and engineering software exports). Drawn as SVG by
 * rtf.js's EMF/WMF renderers (MIT), loaded only when such a file is opened.
 */
import './metafile.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { metafileInfo } from './info';

const s = strings({
  fit: { en: 'Fit', zh: '适应窗口' },
  actual: { en: '100%', zh: '100%' },
  failed: { en: 'This metafile could not be drawn ({why}).', zh: '无法绘制这个图元文件（{why}）。' },
});

/** rtf.js's EMF / WMF bundles are UMD: the module's default export is the library. */
interface Lib {
  Renderer: new (b: ArrayBuffer) => { render(o: object): SVGElement };
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const buf = await file.arrayBuffer();
  const info = metafileInfo(new Uint8Array(buf));
  if (!info) throw new Error('This is not an EMF or WMF picture.');
  // Size on screen: the picture's own size in pixels (96 per inch), kept reasonable.
  const k = Math.min(1, 2400 / Math.max(info.width, info.height));
  const w = Math.max(16, Math.round(info.width * k));
  const hgt = Math.max(16, Math.round(info.height * k));
  let svg: SVGElement;
  try {
    if (info.kind === 'emf') {
      const mod = (await import('rtf.js/dist/EMFJS.bundle.min.js')) as { default?: Lib } & Lib;
      svg = new (mod.default ?? mod).Renderer(buf).render({ width: `${w}px`, height: `${hgt}px`, wExt: info.extX, hExt: info.extY, xExt: info.extX, yExt: info.extY, mapMode: 8 });
    } else {
      const mod = (await import('rtf.js/dist/WMFJS.bundle.min.js')) as { default?: Lib } & Lib;
      svg = new (mod.default ?? mod).Renderer(buf).render({ width: `${w}px`, height: `${hgt}px`, xExt: info.extX, yExt: info.extY, mapMode: 8 });
    }
  } catch (err) {
    throw new Error(s('failed').replace('{why}', String((err as Error)?.message ?? err)));
  }
  svg.setAttribute('viewBox', svg.getAttribute('viewBox') ?? `0 0 ${w} ${hgt}`);
  svg.classList.add('mf-svg');
  const stage = h('div', { class: 'mf-stage' }, svg);
  ctx.mount.replaceChildren(h('div', { class: 'view view-metafile' }, stage));
  let fit = true;
  const apply = () => {
    stage.classList.toggle('mf-fit', fit);
    svg.setAttribute('width', fit ? '100%' : `${w}`);
    svg.setAttribute('height', fit ? '100%' : `${hgt}`);
  };
  apply();
  const fitBtn = h('button', { type: 'button', class: 'btn', onclick: () => ((fit = !fit), (fitBtn.textContent = fit ? s('actual') : s('fit')), apply()) }, s('actual'));
  return {
    meta: () => [info.kind.toUpperCase(), `${Math.round(info.width)} × ${Math.round(info.height)}`],
    tools: () => [fitBtn],
  };
}
