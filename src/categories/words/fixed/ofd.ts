/**
 * OFD (GB/T 33190, China's fixed-layout document format) → fixed pages.
 * OFD.xml → Document.xml → pages (and their templates) → Content.xml:
 * TextObject/TextCode, PathObject/AbstractData, ImageObject. Units are mm.
 */
import { strFromU8 } from 'fflate';
import { children, els, toDataUrl, type FixedDocument, type FixedItem, type FixedPage } from './model';

type Files = Record<string, Uint8Array>;

const join = (base: string, ref: string) => {
  if (ref.startsWith('/')) return ref.slice(1);
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const out: string[] = [];
  for (const p of (dir + ref).split('/')) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
};
const xml = (files: Files, path: string) => {
  const data = files[path] ?? files[Object.keys(files).find((k) => k.toLowerCase() === path.toLowerCase()) ?? ''];
  return data ? new DOMParser().parseFromString(strFromU8(data), 'application/xml') : null;
};
const nums = (v: string | null | undefined) => (v ?? '').trim().split(/\s+/).filter(Boolean).map(Number);

/** "r g b" (0–255) → CSS colour. */
const rgb = (el: Element | undefined) => {
  const v = el?.getAttribute('Value');
  const n = nums(v);
  return n.length >= 3 ? `rgb(${n[0]},${n[1]},${n[2]})` : undefined;
};

/** OFD AbstractData: M, L, B (cubic), Q, A (arc), C (close) with space-separated numbers. */
function pathData(d: string, dx: number, dy: number): string {
  const t = d.trim().split(/\s+/);
  const out: string[] = [];
  let i = 0;
  const p = () => Number(t[i++]);
  const pt = () => `${p() + dx} ${p() + dy}`;
  while (i < t.length) {
    const cmd = t[i++];
    switch (cmd) {
      case 'S': case 'M': out.push(`M ${pt()}`); break;
      case 'L': out.push(`L ${pt()}`); break;
      case 'B': out.push(`C ${pt()} ${pt()} ${pt()}`); break;
      case 'Q': out.push(`Q ${pt()} ${pt()}`); break;
      case 'A': { const rx = p(), ry = p(), rot = p(), large = p(), sweep = p(); out.push(`A ${rx} ${ry} ${rot} ${large} ${sweep} ${pt()}`); break; }
      case 'C': out.push('Z'); break;
      default: break;
    }
  }
  return out.join(' ');
}

/** DeltaX/DeltaY may use "g N d" (repeat d N times). */
function deltas(v: string | null): number[] {
  const t = (v ?? '').trim().split(/\s+/).filter(Boolean);
  const out: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === 'g') {
      const n = Number(t[i + 1]);
      const d = Number(t[i + 2]);
      for (let k = 0; k < n; k++) out.push(d);
      i += 2;
    } else out.push(Number(t[i]));
  }
  return out;
}

export function parseOfd(files: Files): FixedDocument {
  const root = xml(files, 'OFD.xml');
  if (!root) throw new Error('OFD.xml is missing');
  const docRoot = els(root, 'DocRoot')[0]?.textContent?.trim();
  if (!docRoot) throw new Error('No document in this OFD');
  const docPath = docRoot.replace(/^\//, '');
  const doc = xml(files, docPath);
  if (!doc) throw new Error(`${docPath} is missing`);
  const title = els(root, 'Title')[0]?.textContent?.trim();

  // Resources (images, fonts) from DocumentRes / PublicRes.
  const media = new Map<string, string>();
  const fonts = new Map<string, { bold: boolean; family?: string }>();
  for (const resEl of [...els(doc, 'DocumentRes'), ...els(doc, 'PublicRes')]) {
    const resPath = join(docPath, resEl.textContent?.trim() ?? '');
    const res = xml(files, resPath);
    if (!res) continue;
    const base = res.documentElement.getAttribute('BaseLoc') ?? '';
    for (const mm of els(res, 'MultiMedia')) {
      const file = els(mm, 'MediaFile')[0]?.textContent?.trim();
      if (!file) continue;
      const path = join(resPath, base ? `${base.replace(/\/?$/, '/')}${file}` : file);
      const data = files[path] ?? files[join(docPath, file)];
      if (data) media.set(mm.getAttribute('ID') ?? '', toDataUrl(data, file));
    }
    for (const f of els(res, 'Font')) fonts.set(f.getAttribute('ID') ?? '', { bold: f.getAttribute('Bold') === 'true', family: f.getAttribute('FamilyName') ?? undefined });
  }

  const defaultBox = nums(els(doc, 'PhysicalBox')[0]?.textContent);
  const templates = new Map<string, string>();
  for (const t of els(doc, 'TemplatePage')) templates.set(t.getAttribute('ID') ?? '', join(docPath, t.getAttribute('BaseLoc') ?? ''));

  const readContent = (path: string, page: FixedPage) => {
    const c = xml(files, path);
    if (!c) return;
    for (const layer of els(c, 'Layer')) {
      const walk = (container: Element) => {
        for (const obj of Array.from(container.children)) {
          const box = nums(obj.getAttribute('Boundary'));
          const [bx = 0, by = 0, bw = 0, bh = 0] = box;
          switch (obj.localName) {
            case 'PageBlock':
              walk(obj);
              break;
            case 'TextObject': {
              const size = Number(obj.getAttribute('Size') ?? 3.5);
              const fill = rgb(children(obj, 'FillColor')[0]) ?? '#000';
              const font = fonts.get(obj.getAttribute('Font') ?? '');
              const bold = font?.bold || Number(obj.getAttribute('Weight') ?? 400) >= 600;
              for (const code of children(obj, 'TextCode')) {
                const text = code.textContent ?? '';
                if (!text.trim()) continue;
                const x = Number(code.getAttribute('X') ?? 0);
                const dx = deltas(code.getAttribute('DeltaX'));
                const xs: number[] = [bx + x];
                for (const d of dx.slice(0, text.length - 1)) xs.push(xs[xs.length - 1] + d);
                page.items.push({ kind: 'text', x: bx + x, y: by + Number(code.getAttribute('Y') ?? 0), size, text, fill, xs: dx.length ? xs : undefined, bold });
              }
              break;
            }
            case 'PathObject': {
              const data = children(obj, 'AbstractData')[0]?.textContent;
              if (!data) break;
              const filled = obj.getAttribute('Fill') === 'true';
              const stroked = obj.getAttribute('Stroke') !== 'false';
              page.items.push({
                kind: 'path',
                d: pathData(data, bx, by),
                fill: filled ? rgb(children(obj, 'FillColor')[0]) ?? '#000' : 'none',
                stroke: stroked ? rgb(children(obj, 'StrokeColor')[0]) ?? '#000' : undefined,
                strokeWidth: Number(obj.getAttribute('LineWidth') ?? 0.353),
              });
              break;
            }
            case 'ImageObject': {
              const href = media.get(obj.getAttribute('ResourceID') ?? '');
              if (href) page.items.push({ kind: 'image', x: bx, y: by, w: bw, h: bh, href });
              break;
            }
            default:
              break;
          }
        }
      };
      walk(layer);
    }
  };

  const pages: FixedPage[] = [];
  for (const p of els(doc, 'Page')) {
    const pagePath = join(docPath, p.getAttribute('BaseLoc') ?? '');
    const pageXml = xml(files, pagePath);
    const box = nums(pageXml ? els(pageXml, 'PhysicalBox')[0]?.textContent : undefined);
    const [, , w, hgt] = box.length === 4 ? box : defaultBox.length === 4 ? defaultBox : [0, 0, 210, 297];
    const page: FixedPage = { width: w, height: hgt, items: [] };
    // Template (letterhead, seals…) first, then the page's own content.
    if (pageXml) for (const t of els(pageXml, 'Template')) { const tp = templates.get(t.getAttribute('TemplateID') ?? ''); if (tp) readContent(tp, page); }
    readContent(pagePath, page);
    pages.push(page);
  }
  return { kind: 'OFD', pages, title };
}

export type { FixedItem };
