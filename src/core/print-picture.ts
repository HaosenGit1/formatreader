/**
 * Printing one picture: only the picture, centred and as large as fits on one page
 * (landscape paper for a wide picture), turned as it is shown on screen.
 */
import { h } from './dom';

/** The picture as an image address, turned by `turns` quarter turns clockwise. */
export function pictureSource(el: HTMLElement, turns: number): { src: string; wide: boolean } | null {
  const w = el instanceof HTMLImageElement ? el.naturalWidth : el instanceof HTMLCanvasElement ? el.width : 0;
  const ht = el instanceof HTMLImageElement ? el.naturalHeight : el instanceof HTMLCanvasElement ? el.height : 0;
  if (!w || !ht) return null;
  const q = ((turns % 4) + 4) % 4;
  if (!q && el instanceof HTMLImageElement) return { src: el.currentSrc || el.src, wide: w > ht };
  try {
    const c = document.createElement('canvas');
    const side = q % 2 === 1;
    c.width = side ? ht : w;
    c.height = side ? w : ht;
    const g = c.getContext('2d')!;
    g.translate(c.width / 2, c.height / 2);
    g.rotate((q * Math.PI) / 2);
    g.drawImage(el as CanvasImageSource, -w / 2, -ht / 2);
    return { src: c.toDataURL('image/png'), wide: c.width > c.height };
  } catch {
    return el instanceof HTMLImageElement ? { src: el.currentSrc || el.src, wide: w > ht } : null;
  }
}

/** A drawing made of SVG (vector pictures, Lottie animations at the current frame), as an image address. */
export function svgSource(svg: SVGSVGElement): { src: string; wide: boolean } {
  const box = svg.viewBox?.baseVal;
  const w = box?.width || svg.getBoundingClientRect().width || 1;
  const ht = box?.height || svg.getBoundingClientRect().height || 1;
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(w));
  copy.setAttribute('height', String(ht));
  copy.removeAttribute('style');
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`, wide: w > ht };
}

export function printPicture(src: string, wide: boolean): void {
  const img = h('img', { src, alt: '' }) as HTMLImageElement;
  const holder = h('div', { class: 'print-only print-picture' }, img);
  // A small picture (an icon, a scan thumbnail) is enlarged to fill the page: keep its pixels crisp.
  img.addEventListener('load', () => img.classList.toggle('print-pixels', !src.startsWith('data:image/svg') && Math.max(img.naturalWidth, img.naturalHeight) < 400), { once: true });
  const page = h('style', {}, `@page { size: ${wide ? 'landscape' : 'portrait'}; margin: 10mm; }`);
  document.body.append(holder);
  document.head.append(page);
  document.documentElement.classList.add('fr-print-picture');
  const done = () => {
    holder.remove();
    page.remove();
    document.documentElement.classList.remove('fr-print-picture');
    removeEventListener('afterprint', done);
  };
  addEventListener('afterprint', done);
  void img
    .decode()
    .catch(() => undefined)
    .then(() => window.print());
}
