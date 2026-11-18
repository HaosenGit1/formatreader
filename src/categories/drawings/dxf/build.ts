/**
 * DXF → flat list of things to draw, in drawing units: polylines (lines,
 * arcs, circles, ellipses, splines, polyline bulges all become points) and
 * texts. Blocks (INSERT) are expanded with their position, scale and rotation,
 * nested up to a sane depth. Colours resolve BYLAYER / BYBLOCK.
 */

export interface Poly {
  kind: 'poly';
  pts: number[]; // x0, y0, x1, y1, …
  closed: boolean;
  color: number; // 0xRRGGBB, or -1 for "foreground" (ACI 7: black on white, white on black)
  layer: string;
}
export interface Label {
  kind: 'text';
  x: number;
  y: number;
  height: number;
  rotation: number; // radians
  text: string;
  align: 'left' | 'center' | 'right';
  baseline: 'alphabetic' | 'middle' | 'top' | 'bottom';
  /** MTEXT box width (drawing units): the text wraps to it. */
  width?: number;
  color: number;
  layer: string;
}
export type Prim = Poly | Label;

export interface Built {
  prims: Prim[];
  layers: Map<string, { color: number; visible: boolean }>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  entityCount: number;
  skipped: Map<string, number>;
}

interface Pt {
  x: number;
  y: number;
}
type Entity = Record<string, unknown> & { type: string; layer?: string; color?: number; colorIndex?: number };
interface Dxf {
  entities?: Entity[];
  blocks?: Record<string, { entities?: Entity[]; position?: Pt; name?: string }>;
  tables?: { layer?: { layers?: Record<string, { color?: number; colorIndex?: number; visible?: boolean; frozen?: boolean }> } };
}

/** A 2D affine transform: x' = a·x + c·y + e, y' = b·x + d·y + f. */
interface M {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
const I: M = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const mul = (m: M, n: M): M => ({
  a: m.a * n.a + m.c * n.b,
  b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d,
  d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e,
  f: m.b * n.e + m.d * n.f + m.f,
});
const apply = (m: M, x: number, y: number): [number, number] => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];

const FOREGROUND = -1;
const SEGMENTS = 72; // per full circle

function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, out: number[]) {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += Math.PI * 2;
  const n = Math.max(2, Math.ceil((SEGMENTS * sweep) / (Math.PI * 2)));
  for (let i = 0; i <= n; i++) {
    const t = a0 + (sweep * i) / n;
    out.push(cx + r * Math.cos(t), cy + r * Math.sin(t));
  }
}

/** Polyline with bulges (each bulge = tan(θ/4) of the arc to the next vertex). */
function bulgePoints(vertices: Array<Pt & { bulge?: number }>, closed: boolean): number[] {
  const out: number[] = [];
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const p = vertices[i];
    const q = vertices[(i + 1) % n];
    out.push(p.x, p.y);
    if ((i === n - 1 && !closed) || !p.bulge) continue;
    const theta = 4 * Math.atan(p.bulge);
    const chord = Math.hypot(q.x - p.x, q.y - p.y);
    if (!chord) continue;
    const r = chord / (2 * Math.sin(theta / 2));
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const h = r * Math.cos(theta / 2);
    // Centre lies perpendicular to the chord, on the side given by the bulge's sign.
    const ux = -(q.y - p.y) / chord;
    const uy = (q.x - p.x) / chord;
    const cx = mx + ux * h;
    const cy = my + uy * h;
    const a0 = Math.atan2(p.y - cy, p.x - cx);
    const steps = Math.max(2, Math.ceil((SEGMENTS * Math.abs(theta)) / (Math.PI * 2)));
    for (let k = 1; k < steps; k++) {
      const t = a0 + (theta * k) / steps;
      out.push(cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t));
    }
  }
  return out;
}

/** B-spline evaluation (de Boor), falling back to fit points or the control polygon. */
function splinePoints(e: Entity): number[] {
  const ctrl = (e.controlPoints as Pt[] | undefined) ?? [];
  const knots = (e.knotValues as number[] | undefined) ?? [];
  const p = (e.degreeOfSplineCurve as number | undefined) ?? 3;
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
      for (let r = 1; r <= p; r++) {
        for (let j = p; j >= r; j--) {
          const i = j + k - p;
          const den = knots[i + p - r + 1] - knots[i];
          const alpha = den ? (t - knots[i]) / den : 0;
          d[j] = { x: (1 - alpha) * d[j - 1].x + alpha * d[j].x, y: (1 - alpha) * d[j - 1].y + alpha * d[j].y };
        }
      }
      out.push(d[p].x, d[p].y);
    }
    return out;
  }
  const pts = (e.fitPoints as Pt[] | undefined)?.length ? (e.fitPoints as Pt[]) : ctrl;
  for (const q of pts) out.push(q.x, q.y);
  return out;
}

/** MTEXT formatting codes → plain text (\P new paragraph, {\f…;} fonts, \U+XXXX …). */
export function plainMtext(raw: string): string {
  return raw
    .replace(/\\U\+([0-9a-f]{4})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\P/g, '\n')
    .replace(/\\~/g, ' ')
    .replace(/\\[ACFHQTWfcpha][^;\\{}]*;/g, '')
    .replace(/\\S([^;]*?)[#^/]([^;]*);/g, '$1/$2')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/\\([\\{}])/g, '\u0000$1')
    .replace(/[{}]/g, '')
    .replace(/\u0000/g, '')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±');
}

export function buildDxf(dxf: Dxf): Built {
  const prims: Prim[] = [];
  const skipped = new Map<string, number>();
  const layers = new Map<string, { color: number; visible: boolean }>();
  for (const [name, l] of Object.entries(dxf.tables?.layer?.layers ?? {})) {
    layers.set(name, { color: l.colorIndex === 7 || l.color === 0xffffff ? FOREGROUND : (l.color ?? FOREGROUND), visible: l.visible !== false && !l.frozen });
  }
  const layerOf = (name: string) => {
    if (!layers.has(name)) layers.set(name, { color: FOREGROUND, visible: true });
    return layers.get(name)!;
  };

  let entityCount = 0;
  const colorOf = (e: Entity, layer: string, blockColor: number) => {
    if (e.colorIndex === 256 || e.colorIndex === undefined) return layerOf(layer).color; // BYLAYER
    if (e.colorIndex === 0) return blockColor; // BYBLOCK
    if (e.colorIndex === 7 || e.color === 0xffffff) return FOREGROUND;
    return e.color ?? FOREGROUND;
  };

  const emitPoly = (m: M, local: number[], closed: boolean, color: number, layer: string) => {
    if (local.length < 4) return;
    const pts = new Array<number>(local.length);
    for (let i = 0; i < local.length; i += 2) [pts[i], pts[i + 1]] = apply(m, local[i], local[i + 1]);
    prims.push({ kind: 'poly', pts, closed, color, layer });
  };

  const walk = (entities: Entity[], m: M, insertLayer: string | null, blockColor: number, depth: number) => {
    for (const e of entities) {
      entityCount++;
      // Entities on layer "0" inside a block take the layer of the block reference.
      const layer = insertLayer && (!e.layer || e.layer === '0') ? insertLayer : (e.layer ?? '0');
      const color = colorOf(e, layer, blockColor);
      switch (e.type) {
        case 'LINE': {
          const v = e.vertices as Pt[];
          emitPoly(m, [v[0].x, v[0].y, v[1].x, v[1].y], false, color, layer);
          break;
        }
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const v = (e.vertices as Array<Pt & { bulge?: number }>) ?? [];
          const closed = !!e.shape || !!e.closed;
          emitPoly(m, bulgePoints(v, closed), closed, color, layer);
          break;
        }
        case 'CIRCLE': {
          const c = e.center as Pt;
          const out: number[] = [];
          arcPoints(c.x, c.y, e.radius as number, 0, Math.PI * 2, out);
          emitPoly(m, out, true, color, layer);
          break;
        }
        case 'ARC': {
          const c = e.center as Pt;
          const out: number[] = [];
          arcPoints(c.x, c.y, e.radius as number, e.startAngle as number, e.endAngle as number, out);
          emitPoly(m, out, false, color, layer);
          break;
        }
        case 'ELLIPSE': {
          const c = e.center as Pt;
          const maj = e.majorAxisEndPoint as Pt;
          const ratio = (e.axisRatio as number) ?? 1;
          const a = Math.hypot(maj.x, maj.y);
          const rot = Math.atan2(maj.y, maj.x);
          const t0 = (e.startAngle as number) ?? 0;
          let t1 = (e.endAngle as number) ?? Math.PI * 2;
          if (t1 <= t0) t1 += Math.PI * 2;
          const full = Math.abs(t1 - t0 - Math.PI * 2) < 1e-6;
          const out: number[] = [];
          const n = Math.max(8, Math.ceil((SEGMENTS * (t1 - t0)) / (Math.PI * 2)));
          for (let i = 0; i <= n; i++) {
            const t = t0 + ((t1 - t0) * i) / n;
            const x = a * Math.cos(t);
            const y = a * ratio * Math.sin(t);
            out.push(c.x + x * Math.cos(rot) - y * Math.sin(rot), c.y + x * Math.sin(rot) + y * Math.cos(rot));
          }
          emitPoly(m, out, full, color, layer);
          break;
        }
        case 'SPLINE':
          emitPoly(m, splinePoints(e), !!e.closed, color, layer);
          break;
        case 'SOLID':
        case '3DFACE': {
          const v = ((e.points ?? e.vertices) as Pt[] | undefined) ?? [];
          // SOLID corners are stored in "Z" order: 1, 2, 4, 3.
          const order = e.type === 'SOLID' && v.length === 4 ? [v[0], v[1], v[3], v[2]] : v;
          emitPoly(m, order.flatMap((q) => [q.x, q.y]), true, color, layer);
          break;
        }
        case 'POINT': {
          const p = e.position as Pt;
          const r = 0.5;
          emitPoly(m, [p.x - r, p.y, p.x + r, p.y], false, color, layer);
          emitPoly(m, [p.x, p.y - r, p.x, p.y + r], false, color, layer);
          break;
        }
        case 'TEXT':
        case 'ATTDEF':
        case 'MTEXT': {
          const isM = e.type === 'MTEXT';
          const hAlign = (e.halign as number) ?? 0;
          const aligned = !isM && (hAlign || (e.valign as number)) && e.endPoint;
          const at = ((isM ? e.position : aligned ? e.endPoint : e.startPoint) as Pt | undefined) ?? { x: 0, y: 0 };
          const [x, y] = apply(m, at.x, at.y);
          const scale = Math.hypot(m.a, m.b);
          const rot = (((e.rotation as number) ?? 0) * Math.PI) / 180 + Math.atan2(m.b, m.a);
          const text = plainMtext(String(e.text ?? ''));
          if (!text.trim() || e.type === 'ATTDEF') break;
          // MTEXT attachment: 1-3 top, 4-6 middle, 7-9 bottom; left/centre/right in each row.
          const ap = (e.attachmentPoint as number) ?? 1;
          const align = isM ? (['left', 'center', 'right'] as const)[(ap - 1) % 3] : hAlign === 1 || hAlign === 4 ? 'center' : hAlign === 2 ? 'right' : 'left';
          const baseline = isM ? (ap <= 3 ? 'top' : ap <= 6 ? 'middle' : 'bottom') : (e.valign as number) === 2 ? 'middle' : (e.valign as number) === 3 ? 'top' : 'alphabetic';
          const width = isM && (e.width as number) > 0 ? (e.width as number) * scale : undefined;
          prims.push({ kind: 'text', x, y, height: (((isM ? e.height : e.textHeight) as number) || 2.5) * scale, rotation: rot, text, align, baseline, width, color, layer });
          break;
        }
        case 'INSERT':
        case 'DIMENSION': {
          const name = String(e.type === 'DIMENSION' ? e.block : e.name);
          const block = dxf.blocks?.[name];
          if (!block?.entities?.length || depth > 8) break;
          const base = block.position ?? { x: 0, y: 0 };
          if (e.type === 'DIMENSION') {
            // Dimension blocks are already drawn in drawing coordinates.
            walk(block.entities, m, layer, color, depth + 1);
            break;
          }
          const p = (e.position as Pt) ?? { x: 0, y: 0 };
          const sx = (e.xScale as number) ?? 1;
          const sy = (e.yScale as number) ?? 1;
          const r = (((e.rotation as number) ?? 0) * Math.PI) / 180;
          const cols = Math.max(1, (e.columnCount as number) ?? 1);
          const rows = Math.max(1, (e.rowCount as number) ?? 1);
          for (let row = 0; row < rows; row++)
            for (let col = 0; col < cols; col++) {
              const ox = col * ((e.columnSpacing as number) ?? 0);
              const oy = row * ((e.rowSpacing as number) ?? 0);
              // place: translate(p) · rotate(r) · translate(array offset) · scale(sx, sy) · translate(−base)
              const local: M = mul(
                mul({ a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: p.x, f: p.y }, { ...I, e: ox, f: oy }),
                { a: sx, b: 0, c: 0, d: sy, e: -base.x * sx, f: -base.y * sy },
              );
              walk(block.entities, mul(m, local), layer, color, depth + 1);
            }
          break;
        }
        default:
          skipped.set(e.type, (skipped.get(e.type) ?? 0) + 1);
      }
    }
  };
  walk(dxf.entities ?? [], I, null, FOREGROUND, 0);

  // A file with block definitions only (a symbol library): show every block side by side, named.
  if (!dxf.entities?.length) {
    const names = Object.keys(dxf.blocks ?? {}).filter((n) => !n.startsWith('*') && dxf.blocks![n].entities?.length);
    const perRow = Math.max(1, Math.ceil(Math.sqrt(names.length)));
    let cx = 0;
    let cy = 0;
    let rowH = 0;
    names.forEach((name, i) => {
      const start = prims.length;
      walk([{ type: 'INSERT', name, position: { x: 0, y: 0 } }], I, null, FOREGROUND, 0);
      const own = prims.splice(start);
      const b = boundsOf(own);
      if (!b) return;
      const w = Math.max(b.maxX - b.minX, 1e-9);
      const hgt = Math.max(b.maxY - b.minY, 1e-9);
      const gap = Math.max(w, hgt) * 0.25;
      const dx = cx - b.minX;
      const dy = cy - b.maxY;
      for (const p of own) {
        if (p.kind === 'poly') for (let k = 0; k < p.pts.length; k += 2) { p.pts[k] += dx; p.pts[k + 1] += dy; }
        else { p.x += dx; p.y += dy; }
        prims.push(p);
      }
      prims.push({ kind: 'text', x: cx, y: cy - hgt - gap * 0.3, height: Math.max(w, hgt) * 0.06, rotation: 0, text: name, align: 'left', baseline: 'top', color: FOREGROUND, layer: '0' });
      rowH = Math.max(rowH, hgt + gap);
      cx += w + gap;
      if ((i + 1) % perRow === 0) {
        cx = 0;
        cy -= rowH;
        rowH = 0;
      }
    });
  }

  return { prims, layers, bounds: robustBounds(prims), entityCount, skipped };
}

/**
 * Extents for "fit": the region where the drawing actually is. A few stray or
 * mis-scaled objects far away (common in real files) would otherwise shrink
 * everything to a dot. Objects whose box sits far outside the box holding the
 * middle 90% of objects are ignored for fitting (they are still drawn).
 */
function robustBounds(prims: Prim[]): Built['bounds'] {
  const all = boundsOf(prims);
  if (!all || prims.length < 10) return all;
  const boxes = prims.map((p) => boundsOf([p])).filter((b): b is NonNullable<Built['bounds']> => !!b);
  const pct = (vals: number[], q: number) => vals.sort((a, b) => a - b)[Math.floor((vals.length - 1) * q)];
  const cx = boxes.map((b) => (b.minX + b.maxX) / 2);
  const cy = boxes.map((b) => (b.minY + b.maxY) / 2);
  const x0 = pct([...cx], 0.05);
  const x1 = pct([...cx], 0.95);
  const y0 = pct([...cy], 0.05);
  const y1 = pct([...cy], 0.95);
  const span = Math.max(x1 - x0, y1 - y0, 1e-9);
  const lo = { x: x0 - span * 2, y: y0 - span * 2 };
  const hi = { x: x1 + span * 2, y: y1 + span * 2 };
  const kept = boxes.filter((b) => b.minX >= lo.x && b.maxX <= hi.x && b.minY >= lo.y && b.maxY <= hi.y);
  if (kept.length < boxes.length * 0.8) return all; // not a few outliers: fit everything
  // A loop, not Math.min(...list): drawings can have millions of objects (too many arguments).
  const out = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const b of kept) {
    if (b.minX < out.minX) out.minX = b.minX;
    if (b.minY < out.minY) out.minY = b.minY;
    if (b.maxX > out.maxX) out.maxX = b.maxX;
    if (b.maxY > out.maxY) out.maxY = b.maxY;
  }
  return out;
}

/** Extents of everything drawn (texts by an estimate of their box). */
function boundsOf(prims: Prim[]): Built['bounds'] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const p of prims) {
    if (p.kind === 'poly') {
      for (let i = 0; i < p.pts.length; i += 2) add(p.pts[i], p.pts[i + 1]);
      continue;
    }
    const longest = Math.max(...p.text.split('\n').map((l) => l.length));
    const w = p.width ?? longest * p.height * 0.6;
    const lines = p.width ? Math.max(1, Math.ceil((p.text.length * p.height * 0.55) / p.width)) : p.text.split('\n').length;
    const left = p.align === 'center' ? p.x - w / 2 : p.align === 'right' ? p.x - w : p.x;
    add(left, p.y + p.height);
    add(left + w, p.y - lines * p.height * 1.35);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** Text encoding of a DXF: UTF-8 from AutoCAD 2007 (AC1021) on, else the drawing's code page. */
export function dxfEncoding(head: string): string {
  const ver = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/.exec(head)?.[1];
  if (ver && ver >= 'AC1021') return 'utf-8';
  const cp = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/.exec(head)?.[1]?.toUpperCase() ?? '';
  const map: Record<string, string> = {
    ANSI_936: 'gbk', ANSI_950: 'big5', ANSI_932: 'shift_jis', ANSI_949: 'euc-kr', ANSI_1250: 'windows-1250', ANSI_1251: 'windows-1251',
    ANSI_1252: 'windows-1252', ANSI_1253: 'windows-1253', ANSI_1254: 'windows-1254', ANSI_1255: 'windows-1255', ANSI_1256: 'windows-1256', ANSI_1257: 'windows-1257', ANSI_874: 'windows-874',
  };
  return map[cp] ?? 'windows-1252';
}
