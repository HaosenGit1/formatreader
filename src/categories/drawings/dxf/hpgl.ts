/**
 * HP-GL and HP-GL/2 plot files (.plt, .hpgl): the language pen plotters and large-format
 * printers speak — engineering prints, CNC and vinyl cutters, garment patterns. The pen
 * moves are turned into the same lines and texts the DXF viewer draws, one layer per pen,
 * in millimetres (1 plotter unit = 0.025 mm).
 *
 * Covers IN, SP, PU, PD, PA, PR, PE (HP-GL/2 encoded polylines), CI, AA, AR, EA, ER, RA, RR,
 * LB (with DT terminator), DI, SI; the PCL / PJL wrapper printers put around HP-GL is skipped.
 */
import type { Built, Label, Prim } from './build';

const MM = 0.025;
const PEN_COLORS = [-1, -1, 0xd9480f, 0x2b8a3e, 0x1c7ed6, 0xae3ec9, 0xf08c00, 0x0c8599, 0x868e96];

export { looksHpgl } from './hpgl-sniff';

export function buildHpgl(bytes: Uint8Array): Built {
  const src = new TextDecoder('latin1').decode(bytes);
  const prims: Prim[] = [];
  const layers = new Map<string, { color: number; visible: boolean }>();
  let pen = 1;
  let down = false;
  let relative = false;
  let x = 0;
  let y = 0;
  let line: number[] = [];
  let terminator = '\x03';
  let dir = 0; // label direction (radians)
  let charH = 3.75; // mm
  let count = 0;

  const layer = () => {
    const name = `Pen ${pen}`;
    if (!layers.has(name)) layers.set(name, { color: PEN_COLORS[pen] ?? -1, visible: true });
    return name;
  };
  const flush = () => {
    if (line.length >= 4) prims.push({ kind: 'poly', pts: line.map((v) => v * MM), closed: false, color: layers.get(layer())!.color, layer: layer() });
    line = [];
  };
  const moveTo = (nx: number, ny: number) => {
    if (down) {
      if (!line.length) line.push(x, y);
      line.push(nx, ny);
    } else flush();
    x = nx;
    y = ny;
  };
  const poly = (pts: number[], closed: boolean, fill = false) => {
    flush();
    const l = layer();
    prims.push(fill ? { kind: 'poly', pts: pts.map((v) => v * MM), closed: true, color: layers.get(l)!.color, layer: l, fill: 1 } : { kind: 'poly', pts: pts.map((v) => v * MM), closed, color: layers.get(l)!.color, layer: l });
  };
  const arc = (cx: number, cy: number, startDeg: number, sweepDeg: number): number[] => {
    const r = Math.hypot(x - cx, y - cy);
    const a0 = Math.atan2(y - cy, x - cx);
    const sweep = (sweepDeg * Math.PI) / 180;
    const n = Math.max(4, Math.ceil(Math.abs(sweepDeg) / 5));
    const out: number[] = [];
    for (let i = 0; i <= n; i++) out.push(cx + r * Math.cos(a0 + (sweep * i) / n), cy + r * Math.sin(a0 + (sweep * i) / n));
    void startDeg;
    return out;
  };

  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\x1b') {
      // PCL escape: ESC%#B / ESC%#A / ESCE … — skip to the terminating letter.
      i++;
      while (i < n && !/[A-Za-z@]/.test(src[i])) i++;
      i++;
      continue;
    }
    if (!/[A-Za-z]/.test(c) || !/[A-Za-z]/.test(src[i + 1] ?? '')) {
      i++;
      continue;
    }
    const cmd = (c + src[i + 1]).toUpperCase();
    i += 2;
    if (cmd === 'LB') {
      const end = src.indexOf(terminator, i);
      const text = src.slice(i, end < 0 ? n : end).replace(/[\r\n]+$/, '');
      i = end < 0 ? n : end + 1;
      flush();
      if (text.trim()) prims.push({ kind: 'text', x: x * MM, y: y * MM, height: charH, rotation: dir, text, align: 'left', baseline: 'alphabetic', color: layers.get(layer())?.color ?? -1, layer: layer() } as Label);
      continue;
    }
    if (cmd === 'DT') {
      terminator = src[i] && src[i] !== ';' ? src[i] : '\x03';
      i++;
      continue;
    }
    if (cmd === 'PE') {
      i = readPe(src, i, (dx, dy, abs, penUp) => {
        if (penUp) {
          flush();
          x = abs ? dx : x + dx;
          y = abs ? dy : y + dy;
          return;
        }
        const was = down;
        down = true;
        moveTo(abs ? dx : x + dx, abs ? dy : y + dy);
        down = was;
      }, (p) => {
        flush();
        pen = p;
      });
      continue;
    }
    // Numeric parameters up to the next command / terminator.
    let j = i;
    while (j < n && !/[A-Za-z;\x1b]/.test(src[j])) j++;
    const args = src.slice(i, j).split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
    i = src[j] === ';' ? j + 1 : j;
    count++;
    switch (cmd) {
      case 'IN':
        flush();
        (pen = 1), (down = false), (relative = false), (x = 0), (y = 0), (dir = 0), (charH = 3.75);
        break;
      case 'SP':
        flush();
        pen = args[0] ?? 0;
        break;
      case 'PU':
      case 'PD':
      case 'PA':
      case 'PR': {
        if (cmd === 'PU') (flush(), (down = false));
        if (cmd === 'PD') down = true;
        if (cmd === 'PA') relative = false;
        if (cmd === 'PR') relative = true;
        for (let k = 0; k + 1 < args.length; k += 2) moveTo(relative ? x + args[k] : args[k], relative ? y + args[k + 1] : args[k + 1]);
        break;
      }
      case 'CI': {
        const r = args[0] ?? 0;
        const pts: number[] = [];
        for (let k = 0; k <= 72; k++) pts.push(x + r * Math.cos((k * Math.PI) / 36), y + r * Math.sin((k * Math.PI) / 36));
        poly(pts, true);
        break;
      }
      case 'AA':
      case 'AR': {
        const [ax, ay, sweep] = args;
        const cx = cmd === 'AR' ? x + ax : ax;
        const cy = cmd === 'AR' ? y + ay : ay;
        const pts = arc(cx, cy, 0, sweep ?? 0);
        if (down) poly(pts, false);
        [x, y] = [pts[pts.length - 2], pts[pts.length - 1]];
        break;
      }
      case 'EA':
      case 'ER':
      case 'RA':
      case 'RR': {
        const [ax, ay] = args;
        const x2 = cmd.endsWith('A') ? ax : x + ax;
        const y2 = cmd.endsWith('A') ? ay : y + ay;
        poly([x, y, x2, y, x2, y2, x, y2], true, cmd[0] === 'R');
        break;
      }
      case 'DI':
        dir = args.length >= 2 ? Math.atan2(args[1], args[0]) : 0;
        break;
      case 'SI':
        if (args.length >= 2) charH = args[1] * 10; // cm → mm
        break;
    }
  }
  flush();
  if (!prims.length && !count) throw new Error('No HP-GL plot commands found in this file.');

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; // prettier-ignore
  for (const p of prims) {
    const pts = p.kind === 'poly' ? p.pts : [p.x, p.y];
    for (let k = 0; k < pts.length; k += 2) {
      minX = Math.min(minX, pts[k]); maxX = Math.max(maxX, pts[k]); minY = Math.min(minY, pts[k + 1]); maxY = Math.max(maxY, pts[k + 1]); // prettier-ignore
    }
  }
  return { prims, layouts: [], units: 4, layers, bounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null, entityCount: prims.length, skipped: new Map() };
}

/**
 * HP-GL/2 PE (polyline encoded): flags '<' pen up, '=' absolute, '7' 7-bit mode, ':' pen,
 * '>' fraction bits; numbers are base-64 (or base-32 in 7-bit mode), least significant
 * digit first, sign in the lowest bit.
 */
function readPe(src: string, i: number, point: (x: number, y: number, abs: boolean, up: boolean) => void, setPen: (p: number) => void): number {
  let base32 = false;
  let frac = 0;
  let up = false;
  let abs = false;
  const num = (): number | null => {
    let v = 0;
    let mul = 1;
    while (i < src.length) {
      const c = src.charCodeAt(i);
      if (base32 ? c >= 63 && c <= 94 : c >= 63 && c <= 126) {
        v += (c - 63) * mul;
        mul *= base32 ? 32 : 64;
        i++;
      } else if (base32 ? c >= 95 && c <= 126 : c >= 191 && c <= 254) {
        v += (c - (base32 ? 95 : 191)) * mul;
        i++;
        const mag = Math.floor(v / 2);
        return (v & 1 ? -mag : mag) / 2 ** frac;
      } else return null;
    }
    return null;
  };
  while (i < src.length && src[i] !== ';') {
    const c = src[i];
    if (c === '7') (base32 = true), i++;
    else if (c === '<') (up = true), i++;
    else if (c === '=') (abs = true), i++;
    else if (c === '>') (i++, (frac = num() ?? 0));
    else if (c === ':') {
      i++;
      setPen(num() ?? 1);
    } else if (/[\r\n ]/.test(c)) i++;
    else {
      const x = num();
      const y = num();
      if (x === null || y === null) {
        i++;
        continue;
      }
      point(x, y, abs, up);
      up = false;
      abs = false;
    }
  }
  return i + 1;
}
