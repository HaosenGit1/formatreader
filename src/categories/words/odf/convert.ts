/**
 * OpenDocument (ODT text, ODP presentations) → shared document model.
 * Works on the XML inside the ZIP; uses DOMParser (browser or happy-dom).
 */
import type { Block, Para, Run } from '../shared/doc-model';

interface TextStyle {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  strike?: boolean;
  sizePt?: number;
  color?: string;
  align?: Para['align'];
  sup?: boolean;
  sub?: boolean;
}

const attr = (el: Element, name: string) => el.getAttribute(name) ?? undefined;
const local = (el: Element) => el.localName || el.nodeName.replace(/^.*:/, '');

function ptFrom(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = /^([\d.]+)(pt|cm|mm|in|px)?$/.exec(v.trim());
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return { pt: n, cm: n * 28.3465, mm: n * 2.83465, in: n * 72, px: n * 0.75 }[m[2] ?? 'pt'];
}

/** Reads <style:style> definitions (automatic and named) into a lookup. */
function readStyles(docs: Document[]): Map<string, TextStyle> {
  const styles = new Map<string, TextStyle & { parent?: string }>();
  for (const doc of docs) {
    for (const st of doc.getElementsByTagName('style:style')) {
      const name = attr(st, 'style:name');
      if (!name) continue;
      const out: TextStyle & { parent?: string } = { parent: attr(st, 'style:parent-style-name') };
      for (const tp of st.getElementsByTagName('style:text-properties')) {
        const w = attr(tp, 'fo:font-weight');
        if (w) out.b = w === 'bold' || Number(w) >= 600;
        const fs = attr(tp, 'fo:font-style');
        if (fs) out.i = fs === 'italic' || fs === 'oblique';
        const ul = attr(tp, 'style:text-underline-style');
        if (ul) out.u = ul !== 'none';
        const lt = attr(tp, 'style:text-line-through-style');
        if (lt) out.strike = lt !== 'none';
        const size = ptFrom(attr(tp, 'fo:font-size'));
        if (size) out.sizePt = size;
        const color = attr(tp, 'fo:color');
        if (color) out.color = color;
        const pos = attr(tp, 'style:text-position');
        if (pos?.startsWith('super')) out.sup = true;
        if (pos?.startsWith('sub')) out.sub = true;
      }
      for (const pp of st.getElementsByTagName('style:paragraph-properties')) {
        const a = attr(pp, 'fo:text-align');
        if (a) out.align = a === 'center' ? 'center' : a === 'end' || a === 'right' ? 'right' : a === 'justify' ? 'justify' : 'left';
      }
      styles.set(name, out);
    }
  }
  // Resolve inheritance once.
  const resolved = new Map<string, TextStyle>();
  const resolve = (name: string | undefined, depth = 0): TextStyle => {
    if (!name || depth > 10) return {};
    if (resolved.has(name)) return resolved.get(name)!;
    const st = styles.get(name);
    if (!st) return {};
    const { parent, ...own } = st;
    const merged = { ...resolve(parent, depth + 1), ...Object.fromEntries(Object.entries(own).filter(([, v]) => v !== undefined)) };
    resolved.set(name, merged);
    return merged;
  };
  for (const name of styles.keys()) resolve(name);
  return resolved;
}

export interface OdfInput {
  content: string;
  styles?: string;
  /** Pictures inside the ZIP, by path (e.g. 'Pictures/x.png'). */
  pictures: Map<string, Uint8Array>;
}

const mimeOf = (path: string) => (/\.png$/i.test(path) ? 'image/png' : /\.gif$/i.test(path) ? 'image/gif' : /\.svg$/i.test(path) ? 'image/svg+xml' : 'image/jpeg');

class Converter {
  private styles: Map<string, TextStyle>;

  constructor(
    private input: OdfInput,
    docs: Document[],
  ) {
    this.styles = readStyles(docs);
  }

  style(name: string | undefined): TextStyle {
    return (name && this.styles.get(name)) || {};
  }

  /** Inline content of a paragraph/heading/span → runs (and pictures found inline). */
  inline(el: Element, inherited: TextStyle, runs: Run[], pictures: Block[]) {
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        const text = (node.textContent ?? '').replace(/\s+/g, ' ');
        if (text) runs.push({ text, ...pick(inherited) });
        continue;
      }
      if (node.nodeType !== 1) continue;
      const child = node as Element;
      switch (local(child)) {
        case 'span':
          this.inline(child, { ...inherited, ...this.style(attr(child, 'text:style-name')) }, runs, pictures);
          break;
        case 'a':
          this.inline(child, inherited, runs, pictures);
          break;
        case 's':
          runs.push({ text: ' '.repeat(Number(attr(child, 'text:c') ?? 1)), ...pick(inherited) });
          break;
        case 'tab':
          runs.push({ text: '\t', ...pick(inherited) });
          break;
        case 'line-break':
          runs.push({ text: '\n', ...pick(inherited) });
          break;
        case 'frame':
          for (const img of child.getElementsByTagName('draw:image')) {
            const href = attr(img, 'xlink:href');
            const data = href ? this.input.pictures.get(href) : undefined;
            if (data && href) pictures.push({ type: 'picture', mime: mimeOf(href), data, widthPt: ptFrom(attr(child, 'svg:width')) });
          }
          break;
        case 'note':
        case 'annotation':
        case 'bookmark':
        case 'bookmark-start':
        case 'bookmark-end':
        case 'soft-page-break':
          break;
        default:
          this.inline(child, inherited, runs, pictures);
      }
    }
  }

  paragraph(el: Element, listItem?: string): Block[] {
    const st = this.style(attr(el, 'text:style-name'));
    const runs: Run[] = [];
    const pictures: Block[] = [];
    this.inline(el, st, runs, pictures);
    const para: Para = { type: 'para', runs: trim(runs), align: st.align };
    if (local(el) === 'h') para.heading = Number(attr(el, 'text:outline-level') ?? 1);
    if (listItem) para.listItem = listItem;
    return [para, ...pictures];
  }

  blocks(container: Element, depth = 0): Block[] {
    const out: Block[] = [];
    for (const node of container.children) {
      switch (local(node)) {
        case 'p':
        case 'h':
          out.push(...this.paragraph(node));
          break;
        case 'list': {
          let n = 0;
          for (const item of node.children) {
            if (local(item) !== 'list-item') continue;
            n++;
            let first = true;
            for (const part of item.children) {
              if (local(part) === 'p' || local(part) === 'h') {
                out.push(...this.paragraph(part, first ? (depth % 2 ? '◦' : '•') : ' '));
                first = false;
              } else if (local(part) === 'list') {
                out.push(...this.blocks(wrap(part), depth + 1));
              }
            }
            void n;
          }
          break;
        }
        case 'table': {
          const rows: Para[][][] = [];
          for (const row of node.getElementsByTagName('table:table-row')) {
            const cells: Para[][] = [];
            for (const cell of row.children) {
              if (local(cell) !== 'table-cell') continue;
              cells.push(this.blocks(cell).filter((b): b is Para => b.type === 'para'));
            }
            rows.push(cells);
          }
          out.push({ type: 'table', rows });
          break;
        }
        case 'section':
        case 'index-body':
        case 'table-of-content':
          out.push(...this.blocks(node, depth));
          break;
        default:
          break;
      }
    }
    return out;
  }
}

const pick = (s: TextStyle): Omit<Run, 'text'> => ({ b: s.b, i: s.i, u: s.u, strike: s.strike, sizePt: s.sizePt, color: s.color, sup: s.sup, sub: s.sub });
const trim = (runs: Run[]) => runs.filter((r) => r.text.length);
/** Wrap a nested list so blocks() can iterate it as a child. */
const wrap = (list: Element) => ({ children: [list] }) as unknown as Element;

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

export function odtToBlocks(input: OdfInput): Block[] {
  const content = parse(input.content);
  const docs = [content, ...(input.styles ? [parse(input.styles)] : [])];
  const body = content.getElementsByTagName('office:text')[0];
  if (!body) return [];
  return new Converter(input, docs).blocks(body);
}

export interface OdpFrame {
  x: number; // % of slide width
  y: number;
  w: number;
  h: number;
  blocks: Block[];
}
export interface OdpSlide {
  name: string;
  frames: OdpFrame[];
}

export function odpToSlides(input: OdfInput): { slides: OdpSlide[]; aspect: number; widthPt: number } {
  const content = parse(input.content);
  const stylesDoc = input.styles ? parse(input.styles) : null;
  const conv = new Converter(input, [content, ...(stylesDoc ? [stylesDoc] : [])]);
  // Slide size from the page layout (defaults to 16:9).
  let width = 28;
  let height = 15.75;
  const layout = stylesDoc?.getElementsByTagName('style:page-layout-properties')[0];
  if (layout) {
    width = (ptFrom(attr(layout, 'fo:page-width')) ?? width * 28.3465) / 28.3465;
    height = (ptFrom(attr(layout, 'fo:page-height')) ?? height * 28.3465) / 28.3465;
  }
  const cm = (v: string | undefined) => (ptFrom(v) ?? 0) / 28.3465;
  const slides: OdpSlide[] = [];
  for (const page of content.getElementsByTagName('draw:page')) {
    const frames: OdpFrame[] = [];
    for (const frame of page.children) {
      const name = local(frame);
      if (!['frame', 'custom-shape', 'rect'].includes(name)) continue;
      const pos = { x: (cm(attr(frame, 'svg:x')) / width) * 100, y: (cm(attr(frame, 'svg:y')) / height) * 100, w: (cm(attr(frame, 'svg:width')) / width) * 100, h: (cm(attr(frame, 'svg:height')) / height) * 100 };
      const blocks: Block[] = [];
      for (const box of frame.children) {
        if (local(box) === 'text-box') blocks.push(...conv.blocks(box));
        if (local(box) === 'image') {
          const href = attr(box, 'xlink:href');
          const data = href ? input.pictures.get(href) : undefined;
          if (data && href) blocks.push({ type: 'picture', mime: mimeOf(href), data });
        }
        if (local(box) === 'p' || local(box) === 'list') blocks.push(...conv.blocks(wrap(box)));
      }
      if (name !== 'frame') blocks.push(...conv.blocks(frame));
      if (blocks.length) frames.push({ ...pos, blocks });
    }
    slides.push({ name: attr(page, 'draw:name') ?? '', frames });
  }
  return { slides, aspect: width / height, widthPt: width * 28.3465 };
}
