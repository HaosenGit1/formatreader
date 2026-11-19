/**
 * Circuit-board manufacturing files: Gerber (RS-274X / X2: copper, solder mask, silkscreen,
 * outline layers) and Excellon drill files. Turned into filled shapes the CAD viewer draws,
 * in millimetres: traces as rounded strokes of the aperture's width, pads (flashes) as
 * circles / rectangles / obrounds / polygons, regions (G36/G37) as filled areas, clear
 * polarity (LPC) as cut-outs, drill hits as circles.
 *
 * Aperture macros (AM) are drawn as a circle of their first size parameter (an approximation).
 */
import type { Built, Prim } from './build';

const COPPER = 0xc8963e;
const DRILL = 0x4d79c7;

export { looksExcellon, looksGerber } from './gerber-sniff';
import { looksExcellon } from './gerber-sniff';

type Ap = { shape: 'C' | 'R' | 'O' | 'P'; a: number; b: number; sides?: number; rot?: number };

export function buildGerber(bytes: Uint8Array, name = 'Board'): Built {
  const text = new TextDecoder('latin1').decode(bytes);
  if (looksExcellon(text)) return buildExcellon(text, name);
  const prims: Prim[] = [];
  const layer = name;
  let scale = 1; // file units → mm
  let xInt = 2;
  let xDec = 4;
  let yDec = 4;
  let trailing = false;
  const aps = new Map<number, Ap>();
  const macros = new Map<string, number>();
  let ap: Ap | undefined;
  let x = 0;
  let y = 0;
  let mode: 1 | 2 | 3 = 1;
  let region: number[][] | null = null;
  let contour: number[] = [];
  let clear = false;
  let multi = true;

  const num = (s: string, dec: number) => {
    if (s.includes('.')) return Number(s) * scale;
    const neg = s.startsWith('-');
    let d = s.replace(/^[+-]/, '');
    if (trailing) d = d.padEnd(xInt + dec, '0');
    return (neg ? -1 : 1) * (Number(d) / 10 ** dec) * scale;
  };
  const fill = (pts: number[]) => prims.push({ kind: 'poly', pts, closed: true, color: COPPER, layer, fill: clear ? 3 : 4 });
  const circle = (cx: number, cy: number, r: number, seg = 24) => {
    const p: number[] = [];
    for (let i = 0; i < seg; i++) p.push(cx + r * Math.cos((i / seg) * Math.PI * 2), cy + r * Math.sin((i / seg) * Math.PI * 2));
    return p;
  };
  const flash = (cx: number, cy: number, a: Ap) => {
    if (a.shape === 'C') fill(circle(cx, cy, a.a / 2));
    else if (a.shape === 'R') fill([cx - a.a / 2, cy - a.b / 2, cx + a.a / 2, cy - a.b / 2, cx + a.a / 2, cy + a.b / 2, cx - a.a / 2, cy + a.b / 2]);
    else if (a.shape === 'O') fill(capsule(cx - Math.max(0, a.a - a.b) / 2, cy - Math.max(0, a.b - a.a) / 2, cx + Math.max(0, a.a - a.b) / 2, cy + Math.max(0, a.b - a.a) / 2, Math.min(a.a, a.b) / 2));
    else {
      const n = a.sides ?? 6;
      const rot = ((a.rot ?? 0) * Math.PI) / 180;
      const p: number[] = [];
      for (let i = 0; i < n; i++) p.push(cx + (a.a / 2) * Math.cos(rot + (i / n) * Math.PI * 2), cy + (a.a / 2) * Math.sin(rot + (i / n) * Math.PI * 2));
      fill(p);
    }
  };
  /** A stroke of width 2r from (x0,y0) to (x1,y1) with round ends. */
  const capsule = (x0: number, y0: number, x1: number, y1: number, r: number) => {
    const a = Math.atan2(y1 - y0, x1 - x0);
    const p: number[] = [];
    const seg = 10;
    for (let i = 0; i <= seg; i++) {
      const t = a + Math.PI / 2 + (i / seg) * Math.PI;
      p.push(x0 + r * Math.cos(t), y0 + r * Math.sin(t));
    }
    for (let i = 0; i <= seg; i++) {
      const t = a - Math.PI / 2 + (i / seg) * Math.PI;
      p.push(x1 + r * Math.cos(t), y1 + r * Math.sin(t));
    }
    return p;
  };
  const arcPts = (x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, cw: boolean) => {
    const r = Math.hypot(x0 - cx, y0 - cy);
    let a0 = Math.atan2(y0 - cy, x0 - cx);
    let a1 = Math.atan2(y1 - cy, x1 - cx);
    if (cw) {
      while (a1 >= a0) a1 -= Math.PI * 2;
    } else while (a1 <= a0) a1 += Math.PI * 2;
    if (Math.abs(x1 - x0) < 1e-9 && Math.abs(y1 - y0) < 1e-9 && multi) a1 = a0 + (cw ? -1 : 1) * Math.PI * 2;
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 24)));
    const out: number[] = [];
    for (let i = 1; i <= n; i++) out.push(cx + r * Math.cos(a0 + ((a1 - a0) * i) / n), cy + r * Math.sin(a0 + ((a1 - a0) * i) / n));
    return out;
  };

  // Split into extended (%…%) blocks and ordinary word blocks ending in '*'.
  for (const m of text.matchAll(/%([^%]*)%|([^%*]*)\*/g)) {
    if (m[1] !== undefined) {
      for (const cmd of m[1].split('*').map((c) => c.trim()).filter(Boolean)) {
        const fs = /^FS([LT])?([AI])?X(\d)(\d)Y(\d)(\d)/.exec(cmd);
        if (fs) {
          trailing = fs[1] === 'T';
          xInt = Number(fs[3]);
          xDec = Number(fs[4]);
          yDec = Number(fs[6]);
        } else if (cmd === 'MOIN') scale = 25.4;
        else if (cmd === 'MOMM') scale = 1;
        else if (cmd === 'LPC') clear = true;
        else if (cmd === 'LPD') clear = false;
        else if (cmd.startsWith('AM')) macros.set(cmd.slice(2).split(/[*\s]/)[0], 1);
        else {
          const ad = /^ADD(\d+)([A-Za-z_.$][\w.$]*),?([^*]*)/.exec(cmd);
          if (ad) {
            const ps = ad[3].split('X').map(Number).filter(Number.isFinite).map((v) => v * scale);
            const t = ad[2];
            if (t === 'C') aps.set(Number(ad[1]), { shape: 'C', a: ps[0] ?? 0, b: ps[0] ?? 0 });
            else if (t === 'R') aps.set(Number(ad[1]), { shape: 'R', a: ps[0] ?? 0, b: ps[1] ?? ps[0] ?? 0 });
            else if (t === 'O') aps.set(Number(ad[1]), { shape: 'O', a: ps[0] ?? 0, b: ps[1] ?? ps[0] ?? 0 });
            else if (t === 'P') aps.set(Number(ad[1]), { shape: 'P', a: ps[0] ?? 0, b: ps[0] ?? 0, sides: (ps[1] ?? 6 * scale) / scale, rot: (ps[2] ?? 0) / scale });
            else aps.set(Number(ad[1]), { shape: 'C', a: ps[0] ?? 0.2, b: ps[0] ?? 0.2 }); // macro: approximate
          }
        }
      }
      continue;
    }
    const w = (m[2] ?? '').replace(/\s+/g, '');
    if (!w || w.startsWith('G04')) continue;
    if (/^M0?2$/.test(w)) break;
    const g = /G0?([1-3]|36|37|74|75)(?!\d)/.exec(w);
    if (g) {
      const c = Number(g[1]);
      if (c === 1 || c === 2 || c === 3) mode = c as 1 | 2 | 3;
      else if (c === 36) (region = []), (contour = []);
      else if (c === 37) {
        if (contour.length >= 6) region?.push(contour);
        for (const p of region ?? []) fill(p);
        region = null;
        contour = [];
      } else if (c === 74) multi = false;
      else if (c === 75) multi = true;
    }
    const sel = /^(?:G54)?D(\d{2,})$/.exec(w);
    if (sel && Number(sel[1]) >= 10) {
      ap = aps.get(Number(sel[1]));
      continue;
    }
    const X = /X([+-]?[\d.]+)/.exec(w);
    const Y = /Y([+-]?[\d.]+)/.exec(w);
    const I = /I([+-]?[\d.]+)/.exec(w);
    const J = /J([+-]?[\d.]+)/.exec(w);
    const D = /D0?([123])(?!\d)/.exec(w);
    const nx = X ? num(X[1], xDec) : x;
    const ny = Y ? num(Y[1], yDec) : y;
    const op = D ? Number(D[1]) : X || Y ? 1 : 0;
    if (!op) continue;
    if (op === 2) {
      if (region && contour.length >= 6) region.push(contour);
      contour = region ? [nx, ny] : [];
    } else if (op === 3) {
      if (ap) flash(nx, ny, ap);
    } else {
      const path = mode === 1 ? [nx, ny] : arcPts(x, y, nx, ny, x + (I ? num(I[1], xDec) : 0), y + (J ? num(J[1], yDec) : 0), mode === 2);
      if (region) {
        if (!contour.length) contour.push(x, y);
        contour.push(...path);
      } else if (ap) {
        const r = Math.max(ap.a, 0.01) / 2;
        let px = x;
        let py = y;
        for (let k = 0; k < path.length; k += 2) {
          fill(capsule(px, py, path[k], path[k + 1], r));
          px = path[k];
          py = path[k + 1];
        }
      }
    }
    x = nx;
    y = ny;
  }
  return finish(prims, layer, COPPER);
}

/** Excellon drill file: tools (diameters) and the holes drilled with each. */
function buildExcellon(text: string, name: string): Built {
  const prims: Prim[] = [];
  let scale = 25.4;
  let decimals = 4;
  let lead = true;
  const tools = new Map<number, number>();
  let dia = 0.8;
  let x = 0;
  let y = 0;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (/^METRIC/i.test(l)) (scale = 1), (decimals = 3), (lead = !/TZ/.test(l));
    else if (/^INCH/i.test(l)) (scale = 25.4), (decimals = 4), (lead = !/TZ/.test(l));
    const td = /^T(\d+)(?:F\d+)?(?:S\d+)?C([\d.]+)/.exec(l);
    if (td) {
      tools.set(Number(td[1]), Number(td[2]) * scale);
      continue;
    }
    const ts = /^T(\d+)$/.exec(l);
    if (ts) {
      dia = tools.get(Number(ts[1])) ?? dia;
      continue;
    }
    const X = /X([+-]?[\d.]+)/.exec(l);
    const Y = /Y([+-]?[\d.]+)/.exec(l);
    if (!X && !Y) continue;
    const v = (s: string) => (s.includes('.') ? Number(s) * scale : (Number(lead ? s : s.replace(/^([+-]?)(\d+)$/, (_m, sg, d) => sg + d.padEnd(decimals + 2, '0'))) / 10 ** decimals) * scale);
    if (X) x = v(X[1]);
    if (Y) y = v(Y[1]);
    const r = dia / 2;
    const p: number[] = [];
    for (let i = 0; i < 20; i++) p.push(x + r * Math.cos((i / 20) * Math.PI * 2), y + r * Math.sin((i / 20) * Math.PI * 2));
    prims.push({ kind: 'poly', pts: p, closed: true, color: DRILL, layer: name, fill: 4 });
  }
  return finish(prims, name, DRILL);
}

function finish(prims: Prim[], layer: string, color: number): Built {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; // prettier-ignore
  for (const p of prims)
    if (p.kind === 'poly')
      for (let k = 0; k < p.pts.length; k += 2) {
        minX = Math.min(minX, p.pts[k]); maxX = Math.max(maxX, p.pts[k]); minY = Math.min(minY, p.pts[k + 1]); maxY = Math.max(maxY, p.pts[k + 1]); // prettier-ignore
      }
  return { prims, layouts: [], units: 4, layers: new Map([[layer, { color, visible: true }]]), bounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null, entityCount: prims.length, skipped: new Map() };
}
