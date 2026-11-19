/**
 * The heavy part of opening a drawing — DXF text → parsed entities → things to draw, or
 * DWG → LibreDWG → the same — with progress. Runs in a worker on the website (the page
 * stays responsive and Stop works) and on the page in the portable file.
 *
 * The result is packed into number arrays: copying millions of small objects out of a
 * worker takes longer than building them (measured: 5 s for 2.7 million lines).
 */
import DxfArrayScanner from 'dxf-parser/dist/DxfArrayScanner.js';
import { buildDxf, dxfEncoding, splitDxfLayouts, type Built, type Label, type Layout, type Prim } from './build';
import { dxfLayouts, registerExtra } from './dxf-extra';

export type Report = (step: 'parse' | 'build' | 'dwg' | 'pack', fraction?: number) => void;

/** Reports how far the DXF parser has read (it walks the file's lines through this scanner). */
function watchScanner(report: Report): () => void {
  const proto = DxfArrayScanner.prototype as unknown as { next(): unknown; _pointer: number; _data: unknown[] };
  const original = proto.next;
  proto.next = function (this: typeof proto) {
    if (this._pointer % 400000 === 0) report('parse', this._pointer / this._data.length);
    return original.call(this);
  };
  return () => {
    proto.next = original;
  };
}

export async function buildDxfBytes(bytes: Uint8Array, report: Report): Promise<Built> {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 65536));
  report('parse'); // no percentage until the parser starts walking the lines
  const text = new TextDecoder(dxfEncoding(head)).decode(bytes);
  const { default: DxfParser } = await import('dxf-parser');
  const unwatch = watchScanner(report);
  let parsed: unknown;
  try {
    const parser = new DxfParser();
    registerExtra(parser as never);
    parsed = parser.parseSync(text);
  } finally {
    unwatch();
  }
  report('build', 0);
  const split = splitDxfLayouts(parsed as never, dxfLayouts(text));
  return buildDxf(split, (f) => report('build', f));
}

export async function buildHpglBytes(bytes: Uint8Array, report: Report): Promise<Built> {
  report('parse');
  const { buildHpgl } = await import('./hpgl');
  return buildHpgl(bytes);
}

export async function buildGerberBytes(bytes: Uint8Array, report: Report, name?: string): Promise<Built> {
  report('parse');
  const { buildGerber } = await import('./gerber');
  return buildGerber(bytes, name);
}

export async function buildDwgBytes(bytes: Uint8Array, report: Report): Promise<Built> {
  report('dwg');
  const [{ readDwg }, { dwgToDxf }] = await Promise.all([import('./dwg-engine'), import('./dwg')]);
  const db = await readDwg(bytes);
  report('build', 0);
  return buildDxf(dwgToDxf(db as never) as never, (f) => report('build', f));
}

// ---------------------------------------------------------------- packing

export interface Packed {
  /** All polyline points, x0 y0 x1 y1 … */
  pts: Float64Array;
  /** Per polyline: start index in pts, number of values, color, layer index, flags (bit 0 closed, bits 1-2 fill). */
  start: Uint32Array;
  count: Uint32Array;
  color: Int32Array;
  layer: Uint32Array;
  closed: Uint8Array;
  /** Texts are few: kept as objects, with their position in drawing order. */
  labels: Array<[number, Label]>;
  layerNames: string[];
  /** Paper-space layouts are small: kept as objects. */
  layouts: Layout[];
  units?: number;
  layers: Array<[string, { color: number; visible: boolean }]>;
  bounds: Built['bounds'];
  entityCount: number;
  skipped: Array<[string, number]>;
}

export function pack(b: Built): { packed: Packed; transfer: Transferable[] } {
  let n = 0;
  let values = 0;
  for (const p of b.prims) if (p.kind === 'poly') (n++, (values += p.pts.length));
  const pts = new Float64Array(values);
  const start = new Uint32Array(n);
  const count = new Uint32Array(n);
  const color = new Int32Array(n);
  const layer = new Uint32Array(n);
  const closed = new Uint8Array(n);
  const layerIndex = new Map<string, number>();
  const layerNames: string[] = [];
  const labels: Array<[number, Label]> = [];
  let i = 0;
  let at = 0;
  for (const [order, p] of b.prims.entries()) {
    if (p.kind === 'text') {
      labels.push([order, p]);
      continue;
    }
    let li = layerIndex.get(p.layer);
    if (li === undefined) layerIndex.set(p.layer, (li = layerNames.push(p.layer) - 1));
    start[i] = at;
    count[i] = p.pts.length;
    color[i] = p.color;
    layer[i] = li;
    closed[i] = (p.closed ? 1 : 0) | ((p.fill ?? 0) << 1);
    pts.set(p.pts, at);
    at += p.pts.length;
    i++;
  }
  return {
    packed: { pts, start, count, color, layer, closed, labels, layerNames, layouts: b.layouts, units: b.units, layers: [...b.layers], bounds: b.bounds, entityCount: b.entityCount, skipped: [...b.skipped] },
    transfer: [pts.buffer, start.buffer, count.buffer, color.buffer, layer.buffer, closed.buffer],
  };
}

export function unpack(p: Packed): Built {
  const prims: Prim[] = new Array(p.start.length + p.labels.length);
  let li = 0;
  let pi = 0;
  for (let order = 0; order < prims.length; order++) {
    if (li < p.labels.length && p.labels[li][0] === order) {
      prims[order] = p.labels[li++][1];
      continue;
    }
    const s = p.start[pi];
    const f = p.closed[pi];
    prims[order] = { kind: 'poly', pts: p.pts.subarray(s, s + p.count[pi]) as unknown as number[], closed: (f & 1) === 1, color: p.color[pi], layer: p.layerNames[p.layer[pi]], ...(f >> 1 ? { fill: (f >> 1) as 1 | 2 | 3 | 4 } : {}) };
    pi++;
  }
  return { prims, layouts: p.layouts, units: p.units, layers: new Map(p.layers), bounds: p.bounds, entityCount: p.entityCount, skipped: new Map(p.skipped) };
}
