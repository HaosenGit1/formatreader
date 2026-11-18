/**
 * Pictures, charts and text boxes in an Excel workbook (.xlsx/.xlsm): where they are anchored
 * (cell + offset, like Excel) and what they show. Charts are redrawn from the values saved in
 * the file (chart.ts). Only the drawing parts are unzipped, never the (possibly huge) sheet data.
 */

const EMU_PER_PX = 9525;

export interface Anchor {
  /** Top-left cell and offset in pixels. */
  from: { row: number; col: number; dx: number; dy: number };
  /** Bottom-right cell and offset, or a size in pixels. */
  to?: { row: number; col: number; dx: number; dy: number };
  size?: { w: number; h: number };
}

export interface ChartSeries {
  name: string;
  categories: string[];
  values: number[];
  /** X values (scatter charts). */
  xs?: number[];
  color?: string;
}

export interface ChartData {
  type: 'bar' | 'column' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter' | 'radar' | 'unknown';
  title: string;
  stacked: boolean;
  series: ChartSeries[];
}

export type Drawing =
  | ({ kind: 'picture'; url: string; name: string; blob: Blob } & Anchor)
  | ({ kind: 'chart'; chart: ChartData } & Anchor)
  | ({ kind: 'text'; text: string } & Anchor);

type Files = Record<string, Uint8Array>;

const dec = new TextDecoder();
const xml = (files: Files, path: string) => (files[path] ? new DOMParser().parseFromString(dec.decode(files[path]), 'application/xml') : null);
// Matched by local name (prefixes differ between writers: xdr:, c:, a: or none).
const all = (el: Element | Document, local: string) => Array.from(el.getElementsByTagName('*')).filter((e) => e.localName === local);
const first = (el: Element | Document, local: string) => all(el, local)[0] ?? null;
const kids = (el: Element, local: string) => Array.from(el.children).filter((c) => c.localName === local);
const relId = (el: Element) => el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ?? el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? el.getAttribute('r:embed') ?? el.getAttribute('r:id');

/** "../media/image1.png" from "xl/drawings/drawing1.xml" → "xl/media/image1.png". */
function resolve(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const p of target.split('/')) {
    if (p === '..') parts.pop();
    else if (p !== '.') parts.push(p);
  }
  return parts.join('/');
}

function rels(files: Files, part: string): Map<string, { target: string; type: string }> {
  const slash = part.lastIndexOf('/');
  const doc = xml(files, `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`);
  const out = new Map<string, { target: string; type: string }>();
  if (!doc) return out;
  for (const r of all(doc, 'Relationship')) out.set(r.getAttribute('Id') ?? '', { target: resolve(part, r.getAttribute('Target') ?? ''), type: r.getAttribute('Type') ?? '' });
  return out;
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf' };

function cellPos(el: Element | null) {
  if (!el) return undefined;
  const n = (name: string) => Number(first(el, name)?.textContent ?? 0);
  return { col: n('col'), row: n('row'), dx: n('colOff') / EMU_PER_PX, dy: n('rowOff') / EMU_PER_PX };
}

function anchorOf(a: Element): Anchor {
  const from = cellPos(kids(a, 'from')[0] ?? null) ?? { col: 0, row: 0, dx: 0, dy: 0 };
  const to = cellPos(kids(a, 'to')[0] ?? null);
  const ext = kids(a, 'ext')[0];
  const size = ext ? { w: Number(ext.getAttribute('cx')) / EMU_PER_PX, h: Number(ext.getAttribute('cy')) / EMU_PER_PX } : undefined;
  return { from, to, size };
}

// ------------------------------------------------------------------ charts

const text = (el: Element | null) => (el ? all(el, 't').map((t) => t.textContent ?? '').join('') : '');

function cache(el: Element | null): string[] {
  if (!el) return [];
  const pts = all(el, 'pt');
  const count = Number(first(el, 'ptCount')?.getAttribute('val') ?? pts.length);
  const out = new Array<string>(count).fill('');
  for (const p of pts) out[Number(p.getAttribute('idx') ?? 0)] = first(p, 'v')?.textContent ?? '';
  return out;
}

function seriesColor(ser: Element): string | undefined {
  const sp = kids(ser, 'spPr')[0];
  const rgb = sp && first(sp, 'srgbClr');
  return rgb ? `#${rgb.getAttribute('val')}` : undefined;
}

export function parseChart(doc: Document): ChartData {
  const plot = first(doc, 'plotArea');
  const title = text(first(doc, 'title')) || '';
  const kinds: Array<[string, ChartData['type']]> = [['barChart', 'bar'], ['bar3DChart', 'bar'], ['lineChart', 'line'], ['line3DChart', 'line'], ['areaChart', 'area'], ['area3DChart', 'area'], ['pieChart', 'pie'], ['pie3DChart', 'pie'], ['ofPieChart', 'pie'], ['doughnutChart', 'doughnut'], ['scatterChart', 'scatter'], ['bubbleChart', 'scatter'], ['radarChart', 'radar']];
  let type: ChartData['type'] = 'unknown';
  let stacked = false;
  const series: ChartSeries[] = [];
  for (const [tag, t] of kinds) {
    for (const group of plot ? kids(plot, tag) : []) {
      if (type === 'unknown') {
        type = t === 'bar' && first(group, 'barDir')?.getAttribute('val') !== 'bar' ? 'column' : t;
        stacked = /stacked/i.test(first(group, 'grouping')?.getAttribute('val') ?? '');
      }
      for (const ser of kids(group, 'ser')) {
        const name = text(kids(ser, 'tx')[0] ?? null) || cache(first(kids(ser, 'tx')[0] ?? ser, 'strCache'))[0] || `Series ${series.length + 1}`;
        const cat = kids(ser, 'cat')[0] ?? kids(ser, 'xVal')[0] ?? null;
        const val = kids(ser, 'val')[0] ?? kids(ser, 'yVal')[0] ?? null;
        const categories = cat ? cache(first(cat, 'strCache') ?? first(cat, 'numCache') ?? first(cat, 'multiLvlStrCache')) : [];
        const values = (val ? cache(first(val, 'numCache')) : []).map((v) => (v === '' ? NaN : Number(v)));
        const xs = t === 'scatter' && cat ? categories.map(Number) : undefined;
        series.push({ name, categories, values, xs, color: seriesColor(ser) });
      }
    }
  }
  return { type, title, stacked, series };
}

// ------------------------------------------------------------------ the workbook

/** Drawings per sheet name. Pictures become object URLs (release them with `revoke`). */
export async function readDrawings(file: Blob): Promise<{ bySheet: Map<string, Drawing[]>; revoke(): void }> {
  const { unzipSync } = await import('fflate');
  const buf = new Uint8Array(await file.arrayBuffer());
  // Everything except the sheet data and shared strings (which can be hundreds of MB).
  const files = unzipSync(buf, { filter: (f) => !/^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|calcChain\.xml)$/i.test(f.name) && f.originalSize < 50 * 1024 * 1024 });
  const urls: string[] = [];
  const bySheet = new Map<string, Drawing[]>();
  const wb = xml(files, 'xl/workbook.xml');
  if (!wb) return { bySheet, revoke: () => {} };
  const wbRels = rels(files, 'xl/workbook.xml');
  for (const sheet of all(wb, 'sheet')) {
    const name = sheet.getAttribute('name') ?? '';
    const part = wbRels.get(relId(sheet) ?? '')?.target;
    if (!part) continue;
    const drawingPart = [...rels(files, part).values()].find((r) => /\/drawing$/.test(r.type))?.target;
    const doc = drawingPart ? xml(files, drawingPart) : null;
    if (!doc || !drawingPart) continue;
    const dRels = rels(files, drawingPart);
    const list: Drawing[] = [];
    for (const a of Array.from(doc.documentElement.children)) {
      if (!/Anchor$/.test(a.localName)) continue;
      const anchor = anchorOf(a);
      const blip = first(a, 'blip');
      const chartRef = all(a, 'chart').find((c) => relId(c));
      if (blip) {
        const target = dRels.get(relId(blip) ?? '')?.target;
        const data = target && files[target];
        if (data) {
          const ext = target.split('.').pop()!.toLowerCase();
          const blob = new Blob([data as BlobPart], { type: MIME[ext] ?? 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          urls.push(url);
          list.push({ kind: 'picture', url, blob, name: target.split('/').pop()!, ...anchor });
        }
      } else if (chartRef) {
        const target = dRels.get(relId(chartRef) ?? '')?.target;
        const chartDoc = target ? xml(files, target) : null;
        if (chartDoc) list.push({ kind: 'chart', chart: parseChart(chartDoc), ...anchor });
      } else {
        const body = first(a, 'txBody');
        const t = body ? all(body, 'p').map((p) => text(p)).join('\n').trim() : '';
        if (t) list.push({ kind: 'text', text: t, ...anchor });
      }
    }
    if (list.length) bySheet.set(name, list);
  }
  return { bySheet, revoke: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}

/** The last row/column any drawing reaches (the grid must extend that far). */
export function drawingExtent(list: Drawing[]): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  for (const d of list) {
    const end = d.to ?? d.from;
    rows = Math.max(rows, end.row + 1 + (d.to ? 0 : Math.ceil((d.size?.h ?? 0) / 20)));
    cols = Math.max(cols, end.col + 1 + (d.to ? 0 : Math.ceil((d.size?.w ?? 0) / 64)));
  }
  return { rows, cols };
}
