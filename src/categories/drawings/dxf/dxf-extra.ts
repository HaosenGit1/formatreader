/**
 * DXF objects dxf-parser 1.1.2 doesn't read: HATCH, LEADER, MULTILEADER, ATTRIB (block
 * attribute values), VIEWPORT, WIPEOUT, IMAGE, XLINE, RAY, ACAD_TABLE, MLINE. Each
 * becomes the same plain shape the DWG reader produces (see build.ts).
 * Also: layout (paper space) names from the OBJECTS section.
 */
import ACI from 'dxf-parser/dist/AutoCadColorIndex.js';
import { edgeLoop, bulgeLoop, imageBoundary, type Edge, type PatternLine, type Pt } from './shapes';

type G = [number, string | number];
type Obj = Record<string, unknown>;
const RAD = Math.PI / 180;

interface Scanner {
  next(): { code: number; value: string | number };
  isEOF(): boolean;
  lastReadGroup: { code: number; value: unknown };
}

/** A handler that collects the object's groups, then converts them. */
function handler(name: string, convert: (g: G[], e: Obj) => Obj | void) {
  return class {
    ForEntityName = name;
    parseEntity(scanner: Scanner) {
      const g: G[] = [];
      let curr = scanner.next();
      while (!scanner.isEOF() && curr.code !== 0) {
        g.push([curr.code, curr.value]);
        curr = scanner.next();
      }
      const e: Obj = { type: name };
      for (const [c, v] of g) {
        if (c === 8) e.layer ??= v;
        else if (c === 62) (e.colorIndex = v), (e.color = (ACI as number[])[Math.abs(v as number)]);
        else if (c === 420) e.color = v;
        else if (c === 67) e.inPaperSpace = v !== 0;
        else if (c === 5) e.handle ??= v;
      }
      return convert(g, e) ?? e;
    }
  };
}

const num = (g: G[], code: number, from = 0, def = 0) => {
  for (let i = from; i < g.length; i++) if (g[i][0] === code) return Number(g[i][1]);
  return def;
};
const pt = (g: G[], code: number, from = 0): Pt | undefined => {
  for (let i = from; i < g.length; i++) if (g[i][0] === code && g[i + 1]?.[0] === code + 10) return { x: Number(g[i][1]), y: Number(g[i + 1][1]) };
  return undefined;
};
const pts = (g: G[], code: number): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < g.length; i++) if (g[i][0] === code && g[i + 1]?.[0] === code + 10) out.push({ x: Number(g[i][1]), y: Number(g[i + 1][1]) });
  return out;
};

/** HATCH: boundary loops (in order), solid flag and pattern line families. */
const Hatch = handler('HATCH', (g, e) => {
  let i = 0;
  const at = (code: number) => {
    while (i < g.length && g[i][0] !== code) i++;
    return i < g.length ? Number(g[i++][1]) : 0;
  };
  const peek = (code: number) => g[i]?.[0] === code;
  const xy = (code: number): Pt => {
    const x = at(code);
    const y = at(code + 10);
    return { x, y };
  };
  e.solid = num(g, 70) === 1;
  const loops: number[][] = [];
  const nLoops = at(91);
  for (let l = 0; l < nLoops && i < g.length; l++) {
    const flag = at(92);
    if (flag & 2) {
      const bulged = at(72) !== 0;
      at(73);
      const n = at(93);
      const v: Array<Pt & { bulge?: number }> = [];
      for (let k = 0; k < n; k++) {
        const p: Pt & { bulge?: number } = xy(10);
        if (bulged && peek(42)) p.bulge = Number(g[i++][1]);
        v.push(p);
      }
      loops.push(bulgeLoop(v));
    } else {
      const n = at(93);
      const edges: Edge[] = [];
      for (let k = 0; k < n; k++) {
        const type = at(72);
        if (type === 1) edges.push({ type: 1, start: xy(10), end: xy(11) });
        else if (type === 2) {
          const center = xy(10);
          const radius = at(40);
          const s = at(50) * RAD;
          const en = at(51) * RAD;
          edges.push({ type: 2, center, radius, startAngle: s, endAngle: en, ccw: at(73) !== 0 });
        } else if (type === 3) {
          const center = xy(10);
          const end = xy(11);
          const ratio = at(40);
          const s = at(50) * RAD;
          const en = at(51) * RAD;
          edges.push({ type: 3, center, end, ratio, startAngle: s, endAngle: en, ccw: at(73) !== 0 });
        } else if (type === 4) {
          const degree = at(94);
          const rational = at(73) !== 0;
          at(74);
          const nk = at(95);
          const nc = at(96);
          const knots: number[] = [];
          for (let q = 0; q < nk; q++) knots.push(at(40));
          const controlPoints: Pt[] = [];
          for (let q = 0; q < nc; q++) {
            controlPoints.push(xy(10));
            if (rational && peek(42)) i++;
          }
          const fitPoints: Pt[] = [];
          if (peek(97)) {
            const nf = at(97);
            for (let q = 0; q < nf; q++) fitPoints.push(xy(11));
            if (nf && peek(12)) (xy(12), xy(13));
          }
          edges.push({ type: 4, degree, knots, controlPoints, fitPoints });
        }
      }
      loops.push(edgeLoop(edges));
    }
    // Source-object references closing the loop.
    if (peek(97)) {
      const refs = at(97);
      for (let k = 0; k < refs && peek(330); k++) i++;
    }
  }
  e.loops = loops;
  const lines: PatternLine[] = [];
  const nl = g.findIndex(([c], k) => c === 78 && k >= i);
  if (!e.solid && nl >= 0) {
    i = nl;
    const count = at(78);
    for (let k = 0; k < count; k++) {
      const angle = at(53) * RAD;
      const base = { x: at(43), y: at(44) };
      const offset = { x: at(45), y: at(46) };
      const nd = at(79);
      const dashes: number[] = [];
      for (let q = 0; q < nd; q++) dashes.push(at(49));
      lines.push({ angle, base, offset, dashes });
    }
  }
  e.patternLines = lines;
});

const Leader = handler('LEADER', (g, e) => {
  e.vertices = pts(g, 10);
  e.arrow = num(g, 71, 0, 1) !== 0;
  e.textHeight = num(g, 40, 0, 0) || undefined;
});

/** MULTILEADER: leader lines (with their landing point), text, arrow size. */
const MLeader = handler('MULTILEADER', (g, e) => {
  const lines: Pt[][] = [];
  let line: Pt[] | null = null;
  let last: Pt | null = null;
  let inLeader = false;
  let text = '';
  for (let i = 0; i < g.length; i++) {
    const [c, v] = g[i];
    if (c === 302 && v === 'LEADER{') (inLeader = true), (last = null);
    else if (c === 303) inLeader = false;
    else if (c === 304 && v === 'LEADER_LINE{') line = [];
    else if (c === 305 && line) {
      if (last) line.push(last);
      lines.push(line);
      line = null;
    } else if (c === 304) text = String(v);
    else if (c === 10 && g[i + 1]?.[0] === 20) {
      const p = { x: Number(v), y: Number(g[i + 1][1]) };
      if (line) line.push(p);
      else if (inLeader) last = p;
    }
  }
  e.lines = lines;
  e.text = text;
  e.textPos = pt(g, 12);
  e.textHeight = num(g, 41, 0, 0) || undefined;
  e.arrowSize = num(g, 140, 0, 0) || undefined;
});

/** ATTRIB: a block attribute's value, already placed in drawing coordinates. */
const Attrib = handler('ATTRIB', (g, e) => {
  if (num(g, 70) & 1) return { type: 'ATTRIB_HIDDEN' };
  return {
    ...e,
    type: 'TEXT',
    startPoint: pt(g, 10),
    endPoint: pt(g, 11),
    textHeight: num(g, 40, 0, 2.5),
    rotation: num(g, 50),
    text: String(g.find(([c]) => c === 1)?.[1] ?? ''),
    halign: num(g, 72),
    valign: num(g, 74),
  };
});

const Viewport = handler('VIEWPORT', (g, e) => {
  Object.assign(e, { center: pt(g, 10), width: num(g, 40), height: num(g, 41), id: num(g, 69), viewCenter: pt(g, 12), viewHeight: num(g, 45), twist: num(g, 51) * RAD, off: (num(g, 90) & 131072) !== 0 || num(g, 68, 0, 1) === 0 });
});

const boundary = (g: G[]) => imageBoundary(pt(g, 10) ?? { x: 0, y: 0 }, pt(g, 11) ?? { x: 1, y: 0 }, pt(g, 12) ?? { x: 0, y: 1 }, pt(g, 13) ?? { x: 1, y: 1 }, pts(g, 14));
const Wipeout = handler('WIPEOUT', (g, e) => void (e.boundary = boundary(g)));
const Image = handler('IMAGE', (g, e) => void (e.boundary = boundary(g)));
const Xline = handler('XLINE', (g, e) => Object.assign(e, { first: pt(g, 10), dir: pt(g, 11) }));
const Ray = handler('RAY', (g, e) => Object.assign(e, { first: pt(g, 10), dir: pt(g, 11) }));
const Table = handler('ACAD_TABLE', (g, e) => void (e.block = String(g.find(([c]) => c === 2)?.[1] ?? '')));
const Mline = handler('MLINE', (g, e) => Object.assign(e, { type: 'LWPOLYLINE', vertices: pts(g, 11), shape: (num(g, 71) & 2) !== 0 }));

/** Adds the handlers to a dxf-parser instance. */
export function registerExtra(parser: { registerEntityHandler(h: unknown): void }) {
  for (const h of [Hatch, Leader, MLeader, Attrib, Viewport, Wipeout, Image, Xline, Ray, Table, Mline]) parser.registerEntityHandler(h);
}

/**
 * Layout names from the OBJECTS section: block record handle → { name, tab order }.
 * dxf-parser keeps each block's record handle as `ownerHandle`, which links the two.
 */
export function dxfLayouts(text: string): Map<string, { name: string; order: number }> {
  const out = new Map<string, { name: string; order: number }>();
  const start = text.search(/\n\s*2\r?\n\s*OBJECTS\r?\n/);
  if (start < 0) return out;
  const lines = text.slice(start, text.indexOf('ENDSEC', start)).split(/\r\n|\r|\n/);
  // Step one line at a time: the slice may not start on a code line.
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i].trim() !== '0' || lines[i + 1].trim() !== 'LAYOUT') continue;
    let name = '';
    let order = 0;
    let record = '';
    let inLayout = false;
    for (let k = i + 2; k + 1 < lines.length && lines[k].trim() !== '0'; k += 2) {
      const code = lines[k].trim();
      const v = lines[k + 1].trim();
      if (code === '100' && v === 'AcDbLayout') inLayout = true;
      else if (code === '1' && inLayout) name = v;
      else if (code === '71' && inLayout) order = Number(v);
      else if (code === '330' && inLayout && !record) record = v;
    }
    if (record) out.set(record.toUpperCase(), { name, order });
  }
  return out;
}
