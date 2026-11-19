/**
 * Geometry shared by the DXF and DWG readers: hatch boundary loops (lines, arcs,
 * ellipse arcs, splines → points), image/wipeout boundaries, and the hatch pattern
 * lines clipped to their boundary.
 */

export interface Pt {
  x: number;
  y: number;
}

/** A hatch boundary edge, angles in radians. */
export type Edge =
  | { type: 1; start: Pt; end: Pt }
  | { type: 2; center: Pt; radius: number; startAngle: number; endAngle: number; ccw: boolean }
  | { type: 3; center: Pt; end: Pt; ratio: number; startAngle: number; endAngle: number; ccw: boolean }
  | { type: 4; degree: number; knots: number[]; controlPoints: Pt[]; fitPoints: Pt[] };

/** A hatch pattern line family (already scaled and rotated, as DXF/DWG store it). */
export interface PatternLine {
  angle: number; // radians
  base: Pt;
  offset: Pt;
  dashes: number[];
}

const SEG = 72;

function arc(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw: boolean, out: number[]) {
  // Clockwise edges store angles mirrored: walk −a0 → −a1 downwards.
  let s = ccw ? a0 : -a0;
  let e = ccw ? a1 : -a1;
  if (ccw) while (e <= s) e += Math.PI * 2;
  else while (e >= s) e -= Math.PI * 2;
  const n = Math.max(2, Math.ceil((SEG * Math.abs(e - s)) / (Math.PI * 2)));
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const t = s + ((e - s) * i) / n;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    out.push(cx + x * cr - y * sr, cy + x * sr + y * cr);
  }
}

/** de Boor B-spline (falls back to fit points / control polygon). */
export function bspline(ctrl: Pt[], knots: number[], p: number, fit: Pt[] = []): number[] {
  const out: number[] = [];
  if (ctrl.length > p && knots.length === ctrl.length + p + 1) {
    const lo = knots[p];
    const hi = knots[knots.length - p - 1];
    const n = Math.max(16, ctrl.length * 8);
    for (let s = 0; s <= n; s++) {
      const t = lo + ((hi - lo) * s) / n;
      let k = p;
      while (k < knots.length - p - 2 && t >= knots[k + 1]) k++;
      const d = Array.from({ length: p + 1 }, (_, j) => ({ ...ctrl[j + k - p] }));
      for (let r = 1; r <= p; r++)
        for (let j = p; j >= r; j--) {
          const i = j + k - p;
          const den = knots[i + p - r + 1] - knots[i];
          const a = den ? (t - knots[i]) / den : 0;
          d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y };
        }
      out.push(d[p].x, d[p].y);
    }
    return out;
  }
  for (const q of fit.length ? fit : ctrl) out.push(q.x, q.y);
  return out;
}

/** Edges of one boundary loop → one closed point list. */
export function edgeLoop(edges: Edge[]): number[] {
  const out: number[] = [];
  const push = (pts: number[]) => {
    let i = 0;
    const n = out.length;
    // Skip a first point that repeats the previous edge's end.
    if (n >= 2 && pts.length >= 2 && Math.abs(out[n - 2] - pts[0]) < 1e-9 && Math.abs(out[n - 1] - pts[1]) < 1e-9) i = 2;
    for (; i < pts.length; i++) out.push(pts[i]);
  };
  for (const e of edges) {
    const pts: number[] = [];
    if (e.type === 1) pts.push(e.start.x, e.start.y, e.end.x, e.end.y);
    else if (e.type === 2) arc(e.center.x, e.center.y, e.radius, e.radius, 0, e.startAngle, e.endAngle, e.ccw, pts);
    else if (e.type === 3) {
      const a = Math.hypot(e.end.x, e.end.y);
      arc(e.center.x, e.center.y, a, a * e.ratio, Math.atan2(e.end.y, e.end.x), e.startAngle, e.endAngle, e.ccw, pts);
    } else pts.push(...bspline(e.controlPoints, e.knots, e.degree, e.fitPoints));
    push(pts);
  }
  return out;
}

/** Polyline loop with bulges → points. */
export function bulgeLoop(v: Array<Pt & { bulge?: number }>, closed = true): number[] {
  const out: number[] = [];
  const n = v.length;
  for (let i = 0; i < n; i++) {
    const p = v[i];
    const q = v[(i + 1) % n];
    out.push(p.x, p.y);
    if ((i === n - 1 && !closed) || !p.bulge) continue;
    const theta = 4 * Math.atan(p.bulge);
    const chord = Math.hypot(q.x - p.x, q.y - p.y);
    if (!chord) continue;
    const r = chord / (2 * Math.sin(theta / 2));
    const h = r * Math.cos(theta / 2);
    const cx = (p.x + q.x) / 2 - ((q.y - p.y) / chord) * h;
    const cy = (p.y + q.y) / 2 + ((q.x - p.x) / chord) * h;
    const a0 = Math.atan2(p.y - cy, p.x - cx);
    const steps = Math.max(2, Math.ceil((SEG * Math.abs(theta)) / (Math.PI * 2)));
    for (let k = 1; k < steps; k++) {
      const t = a0 + (theta * k) / steps;
      out.push(cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t));
    }
  }
  return out;
}

/**
 * Image / wipeout boundary in drawing coordinates. Boundary points are in pixel
 * coordinates (origin at the top-left pixel's centre, y down); none → the whole image.
 */
export function imageBoundary(pos: Pt, u: Pt, v: Pt, size: Pt, path: Pt[] = []): Pt[] {
  const at = (px: number, py: number): Pt => {
    const x = px + 0.5;
    const y = size.y - (py + 0.5);
    return { x: pos.x + u.x * x + v.x * y, y: pos.y + u.y * x + v.y * y };
  };
  if (path.length >= 3) return path.map((p) => at(p.x, p.y));
  const [a, b] = path.length === 2 ? path : [{ x: -0.5, y: -0.5 }, { x: size.x - 0.5, y: size.y - 0.5 }];
  return [at(a.x, a.y), at(b.x, a.y), at(b.x, b.y), at(a.x, b.y)];
}

/**
 * Hatch pattern lines clipped to the loops (odd-even, like AutoCAD's normal style).
 * Returns line pieces as [x0, y0, x1, y1] lists, or null when the pattern is too dense
 * to draw line by line (then the area is shown as a light tint).
 */
export function patternPieces(loops: number[][], lines: PatternLine[], budget = 40000): number[][] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of loops)
    for (let i = 0; i < l.length; i += 2) {
      if (l[i] < minX) minX = l[i];
      if (l[i] > maxX) maxX = l[i];
      if (l[i + 1] < minY) minY = l[i + 1];
      if (l[i + 1] > maxY) maxY = l[i + 1];
    }
  if (!Number.isFinite(minX)) return [];
  const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
  const out: number[][] = [];
  let used = 0;
  for (const pl of lines) {
    const dx = Math.cos(pl.angle);
    const dy = Math.sin(pl.angle);
    const nx = -dy;
    const ny = dx;
    const spacing = pl.offset.x * nx + pl.offset.y * ny;
    const shift = pl.offset.x * dx + pl.offset.y * dy;
    if (Math.abs(spacing) < 1e-12) continue;
    const proj = corners.map(([x, y]) => ((x - pl.base.x) * nx + (y - pl.base.y) * ny) / spacing);
    const k0 = Math.floor(Math.min(...proj));
    const k1 = Math.ceil(Math.max(...proj));
    if (k1 - k0 > 4000) return null;
    const period = pl.dashes.reduce((s, d) => s + Math.abs(d), 0);
    for (let k = k0; k <= k1; k++) {
      const ox = pl.base.x + pl.offset.x * k;
      const oy = pl.base.y + pl.offset.y * k;
      const ts: number[] = [];
      for (const l of loops) {
        const n = l.length / 2;
        for (let i = 0; i < n; i++) {
          const x1 = l[i * 2];
          const y1 = l[i * 2 + 1];
          const x2 = l[((i + 1) % n) * 2];
          const y2 = l[((i + 1) % n) * 2 + 1];
          const ex = x2 - x1;
          const ey = y2 - y1;
          const den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-12) continue;
          const wx = x1 - ox;
          const wy = y1 - oy;
          const s = (wx * dy - wy * dx) / den;
          if (s < 0 || s >= 1) continue;
          ts.push((wx * ey - wy * ex) / den);
        }
      }
      ts.sort((a, b) => a - b);
      for (let i = 0; i + 1 < ts.length; i += 2) {
        const a = ts[i];
        const b = ts[i + 1];
        const piece = (t0: number, t1: number) => {
          out.push([ox + dx * t0, oy + dy * t0, ox + dx * t1, oy + dy * t1]);
          used++;
        };
        if (!pl.dashes.length || period <= 0) piece(a, b);
        else {
          // Dash pattern repeats along the line; each line k starts shifted by k·shift.
          const phase = k * shift;
          let t = Math.floor((a - phase) / period) * period + phase;
          while (t < b && used < budget) {
            for (const d of pl.dashes) {
              const len = Math.abs(d);
              const t0 = Math.max(t, a);
              const t1 = Math.min(t + (d === 0 ? period * 0.01 : len), b);
              if (d >= 0 && t1 > t0) piece(t0, t1);
              t += len;
              if (t >= b) break;
            }
          }
        }
        if (used >= budget) return null;
      }
    }
  }
  return out;
}
