/**
 * XPS / OXPS → fixed pages. Reads FixedDocumentSequence → FixedDocument →
 * FixedPage XML: Glyphs (text), Path (vector + image brushes), Canvas
 * (groups with transforms). Units are 1/96 inch. Embedded (obfuscated)
 * fonts are not used; text is shown in a similar system font.
 */
import { strFromU8 } from 'fflate';
import { children, els, toDataUrl, type FixedDocument, type FixedItem, type FixedPage } from './model';

type Files = Record<string, Uint8Array>;

const norm = (p: string) => p.replace(/^\//, '').replace(/\\/g, '/');
const resolve = (base: string, ref: string) => {
  if (ref.startsWith('/')) return norm(ref);
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const parts = (dir + ref).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.') out.push(p);
  }
  return out.join('/');
};
const find = (files: Files, path: string) => files[path] ?? files[Object.keys(files).find((k) => k.toLowerCase() === path.toLowerCase()) ?? ''];

/** XPS colours are #AARRGGBB or #RRGGBB (also sc# floats, rare). */
function color(v: string | null): string | undefined {
  if (!v) return undefined;
  const m = /^#([0-9a-f]{2})?([0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return undefined;
  const a = m[1] ? parseInt(m[1], 16) / 255 : 1;
  if (a === 0) return 'none';
  const hex = `#${m[2]}`;
  return a < 1 ? `color-mix(in srgb, ${hex} ${Math.round(a * 100)}%, transparent)` : hex;
}

const matrix = (v: string | null) => {
  const n = v?.split(/[ ,]+/).map(Number);
  return n && n.length === 6 && n.every((x) => !isNaN(x)) ? `matrix(${n.join(' ')})` : undefined;
};

/** XPS path syntax ≈ SVG; strip the fill-rule prefix (F0/F1). */
const pathData = (d: string) => d.replace(/^\s*F\s*[01]\s*/i, '');

function parsePage(xml: string, pagePath: string, files: Files): FixedPage {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  const page: FixedPage = { width: Number(root.getAttribute('Width') ?? 816), height: Number(root.getAttribute('Height') ?? 1056), items: [] };

  const walk = (el: Element, transform?: string) => {
    for (const child of Array.from(el.children)) {
      const own = matrix(child.getAttribute('RenderTransform'));
      const t = [transform, own].filter(Boolean).join(' ') || undefined;
      switch (child.localName) {
        case 'Canvas':
          walk(child, t);
          break;
        case 'Glyphs': {
          const text = child.getAttribute('UnicodeString')?.replace(/^\{\}/, '') ?? '';
          if (!text.trim()) break;
          page.items.push({
            kind: 'text',
            x: Number(child.getAttribute('OriginX') ?? 0),
            y: Number(child.getAttribute('OriginY') ?? 0),
            size: Number(child.getAttribute('FontRenderingEmSize') ?? 12),
            text,
            fill: color(child.getAttribute('Fill')) ?? '#000',
            bold: /Bold/.test(child.getAttribute('StyleSimulations') ?? ''),
            transform: t,
          });
          break;
        }
        case 'Path': {
          const d = child.getAttribute('Data');
          const brush = els(child, 'ImageBrush')[0];
          if (brush) {
            const src = brush.getAttribute('ImageSource');
            const vp = brush.getAttribute('Viewport')?.split(/[ ,]+/).map(Number);
            const data = src ? find(files, resolve(pagePath, src)) : undefined;
            if (data && vp?.length === 4) {
              page.items.push({ kind: 'image', x: vp[0], y: vp[1], w: vp[2], h: vp[3], href: toDataUrl(data, src!), transform: t });
            }
            break;
          }
          if (!d) break;
          page.items.push({
            kind: 'path',
            d: pathData(d),
            fill: color(child.getAttribute('Fill')) ?? 'none',
            stroke: color(child.getAttribute('Stroke')),
            strokeWidth: Number(child.getAttribute('StrokeThickness') ?? 1),
            transform: t,
          });
          break;
        }
        default:
          break;
      }
    }
  };
  walk(root);
  return page;
}

export function parseXps(files: Files): FixedDocument {
  // Find the sequence via the root relationship, else by name.
  const seqName = Object.keys(files).find((k) => /\.fdseq$/i.test(k));
  const pages: FixedPage[] = [];
  const docRefs: string[] = [];
  if (seqName) {
    const seq = new DOMParser().parseFromString(strFromU8(files[seqName]), 'application/xml');
    for (const ref of els(seq, 'DocumentReference')) {
      const src = ref.getAttribute('Source');
      if (src) docRefs.push(resolve(seqName, src));
    }
  } else {
    docRefs.push(...Object.keys(files).filter((k) => /\.fdoc$/i.test(k)));
  }
  for (const docPath of docRefs) {
    const data = find(files, docPath);
    if (!data) continue;
    const fdoc = new DOMParser().parseFromString(strFromU8(data), 'application/xml');
    for (const pc of els(fdoc, 'PageContent')) {
      const src = pc.getAttribute('Source');
      if (!src) continue;
      const pagePath = resolve(docPath, src);
      const xml = find(files, pagePath);
      if (xml) pages.push(parsePage(strFromU8(xml), pagePath, files));
    }
  }
  void children;
  return { kind: 'XPS', pages: pages as FixedPage[] };
}

export type { FixedItem };
