/**
 * DXF viewer: draws the drawing on a canvas (lines, arcs, circles, ellipses,
 * splines, polylines, text, blocks, dimensions), with zoom/pan, fit, layers
 * on/off and a dark (CAD-style) or light background.
 */
import './dxf.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { ACAD_VERSIONS } from '../shared/acad';
import { dwgPreview } from '../shared/dwg-preview';
import { type Built, type Label, type Prim, type Viewport } from './build';
import type { Packed, Report } from './drawing-job';
import { runWorker } from '../../../core/progress';
import { looksExcellon, looksGerber } from './gerber-sniff';

const s = strings({
  fit: { en: 'Fit', zh: '适应窗口' },
  layers: { en: 'Layers', zh: '图层' },
  step_parse: { en: 'Reading the drawing…', zh: '正在读取图纸…' },
  step_build: { en: 'Building the drawing…', zh: '正在生成图形…' },
  step_dwg: { en: 'Reading the DWG file…', zh: '正在读取 DWG 文件…' },
  step_pack: { en: 'Almost done…', zh: '马上就好…' },
  dark: { en: 'Dark', zh: '深色' },
  entities: { en: 'objects', zh: '个对象' },
  layerCount: { en: 'layers', zh: '个图层' },
  layerOne: { en: 'layer', zh: '个图层' },
  empty: { en: 'This drawing has nothing to draw.', zh: '这个图纸没有可显示的内容。' },
  binary: { en: 'This is a binary DXF, which is not supported yet. Save it as an ASCII DXF.', zh: '这是二进制 DXF，暂不支持。请另存为 ASCII DXF。' },
  dwgFallback: {
    en: 'This DWG could not be read in full ({why}). Showing the preview picture AutoCAD saved in it.',
    zh: '无法完整读取这个 DWG（{why}）。显示 AutoCAD 保存在其中的预览图。',
  },
  dwgNothing: { en: 'This DWG could not be read ({why}) and has no saved preview picture.', zh: '无法读取这个 DWG（{why}），文件中也没有预览图。' },
  skipped: { en: 'Not drawn yet: {list}.', zh: '暂未绘制：{list}。' },
  hint: { en: 'Scroll to zoom · drag to move · double-click to fit', zh: '滚轮缩放 · 拖动平移 · 双击适应窗口' },
  model: { en: 'Model', zh: '模型' },
  spaces: { en: 'Model and layouts', zh: '模型和布局' },
  layoutCount: { en: 'layouts', zh: '个布局' },
  layoutOne: { en: 'layout', zh: '个布局' },
  measure: { en: 'Measure', zh: '测量' },
  measureFirst: { en: 'Click the first point (snaps to corners).', zh: '点击第一个点（自动吸附到端点）。' },
  measureSecond: { en: 'Click the second point.', zh: '点击第二个点。' },
  distance: { en: 'Distance', zh: '距离' },
  search: { en: 'Find text', zh: '查找文字' },
  noMatch: { en: 'Not found', zh: '未找到' },
  print: { en: 'Print', zh: '打印' },
  printTitle: { en: 'Print what you see, or save it as PDF', zh: '打印当前画面，或另存为 PDF' },
});

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 65536));
  const isDwg = ctx.format?.id === 'dwg';
  const fileExt = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  const isHpgl = !isDwg && /^(plt|hpgl|hgl|hpg|plo)$/.test(fileExt);
  const isGerber = !isDwg && !isHpgl && (looksGerber(head) || looksExcellon(head));
  const isDrill = isGerber && /^\s*M48\b/m.test(head);
  const version = isDwg ? head.slice(0, 6) : /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/.exec(head)?.[1];
  if (!isDwg && !isHpgl && !isGerber && head.startsWith('AutoCAD Binary DXF')) throw new Error(s('binary'));
  const report: Report = (step, fraction) => ctx.progress?.(s(`step_${step}`), fraction);
  let built: Built;
  try {
    built = await buildDrawing(isDwg ? bytes.slice() : bytes, isDwg ? 'dwg' : isHpgl ? 'hpgl' : isGerber ? 'gerber' : 'dxf', report, ctx.signal, file.name);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    if (isDwg) return dwgFallback(bytes, version ?? '', String((err as Error)?.message ?? err), ctx);
    throw err;
  }
  // A DWG with no drawing data (only a saved preview): show the preview.
  if (isDwg && !built.bounds) return dwgFallback(bytes, version ?? '', 'no drawing data', ctx);

  const canvas = document.createElement('canvas');
  const readout = h('div', { class: 'dx-readout', hidden: true });
  const stage = h('div', { class: 'dx-stage', tabindex: '0' }, canvas, readout, h('div', { class: 'dx-hint' }, s('hint')));
  const layerPanel = h('aside', { class: 'dx-layers', hidden: true });
  ctx.mount.replaceChildren(h('div', { class: 'view view-dxf' }, stage, layerPanel));

  let dark = matchMedia('(prefers-color-scheme: dark)').matches;
  // -1 = model space, otherwise the index of a paper-space layout.
  let space = -1;
  const current = (): { prims: Prim[]; bounds: Built['bounds']; viewports: Viewport[] } =>
    space < 0 ? { prims: built.prims, bounds: built.bounds, viewports: [] } : built.layouts[space];
  // View: screen = (world − origin) × scale, with y flipped.
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let fitted = true;

  // Measuring and search state.
  let measuring = false;
  let mPts: Array<{ x: number; y: number }> = [];
  let hit: { x: number; y: number; r: number; until: number } | null = null;

  const size = () => stage.getBoundingClientRect();
  const fit = () => {
    const b = current().bounds;
    const r = size();
    if (!b || !r.width) return;
    const w = Math.max(b.maxX - b.minX, 1e-9);
    const hgt = Math.max(b.maxY - b.minY, 1e-9);
    scale = Math.min(r.width / w, r.height / hgt) * 0.92;
    ox = b.minX - (r.width / scale - w) / 2;
    oy = b.maxY + (r.height / scale - hgt) / 2;
    fitted = true;
    draw();
  };

  let pending = 0;
  const draw = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      paint();
    });
  };

  /** Draws the current space into `g` (w × h CSS pixels) with the given view. */
  const render = (g: CanvasRenderingContext2D, w: number, hgt: number, view: { scale: number; ox: number; oy: number }, onDark: boolean) => {
    const bg = onDark ? '#1e1f24' : '#ffffff';
    g.fillStyle = bg;
    g.fillRect(0, 0, w, hgt);
    const colors = { fg: onDark ? '#f2f2f2' : '#111111', bg, dark: onDark };
    const base: Affine = { a: view.scale, b: 0, c: 0, d: -view.scale, e: -view.ox * view.scale, f: view.oy * view.scale };
    const cur = current();
    if (space >= 0) {
      // Viewports: the model, clipped to each window on the sheet.
      for (const vp of cur.viewports) {
        const k = vp.h / vp.vh;
        const cs = Math.cos(vp.twist);
        const sn = Math.sin(vp.twist);
        // model → paper: p = k·R(twist)·(m − v) + c
        const toPaper: Affine = { a: k * cs, b: k * sn, c: -k * sn, d: k * cs, e: vp.cx - k * (cs * vp.vx - sn * vp.vy), f: vp.cy - k * (sn * vp.vx + cs * vp.vy) };
        const [x0, y0] = at(base, vp.cx - vp.w / 2, vp.cy + vp.h / 2);
        const [x1, y1] = at(base, vp.cx + vp.w / 2, vp.cy - vp.h / 2);
        g.save();
        g.beginPath();
        g.rect(x0, y0, x1 - x0, y1 - y0);
        g.clip();
        drawPrims(g, built.prims, compose(base, toPaper), built.layers, colors);
        g.restore();
        g.strokeStyle = onDark ? '#555' : '#bbb';
        g.lineWidth = 1;
        g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    drawPrims(g, cur.prims, base, built.layers, colors);
  };

  const paint = () => {
    const r = size();
    const dpr = Math.min(devicePixelRatio, 2);
    if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(g, r.width, r.height, { scale, ox, oy }, dark);
    // Overlays: measured points and the last search hit.
    const sx = (x: number) => (x - ox) * scale;
    const sy = (y: number) => (oy - y) * scale;
    const accent = '#e8590c';
    if (mPts.length) {
      g.strokeStyle = accent;
      g.fillStyle = accent;
      g.lineWidth = 2;
      g.beginPath();
      mPts.forEach((p, i) => (i ? g.lineTo(sx(p.x), sy(p.y)) : g.moveTo(sx(p.x), sy(p.y))));
      g.stroke();
      for (const p of mPts) {
        g.beginPath();
        g.arc(sx(p.x), sy(p.y), 4, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (hit && hit.until > performance.now()) {
      g.strokeStyle = accent;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(sx(hit.x), sy(hit.y), Math.max(14, hit.r * scale), 0, Math.PI * 2);
      g.stroke();
      draw();
    }
  };

  // ---- zoom / pan
  const zoomAt = (factor: number, cx: number, cy: number) => {
    const wx = ox + cx / scale;
    const wy = oy - cy / scale;
    scale *= factor;
    ox = wx - cx / scale;
    oy = wy + cy / scale;
    fitted = false;
    draw();
  };
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = size();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let downAt: { x: number; y: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt = pointers.size === 1 ? { x: e.clientX, y: e.clientY } : null;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = size();
      if (pinchDist) zoomAt(d / pinchDist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinchDist = d;
      return;
    }
    ox -= (e.clientX - prev.x) / scale;
    oy += (e.clientY - prev.y) / scale;
    fitted = false;
    draw();
  });
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    // A click (not a drag) while measuring: add a point, snapped to the nearest corner.
    if (measuring && downAt && e.type === 'pointerup' && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) {
      const r = size();
      const p = snap(current().prims, ox + (e.clientX - r.left) / scale, oy - (e.clientY - r.top) / scale, 10 / scale);
      mPts = mPts.length >= 2 ? [p] : [...mPts, p];
      showMeasure();
      draw();
    }
    downAt = null;
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('dblclick', fit);
  const ro = new ResizeObserver(() => (fitted ? fit() : draw()));
  ro.observe(stage);

  // ---- measure
  const unit = UNITS[built.units ?? 0] ?? '';
  const fmt = (v: number) => `${Number(v.toPrecision(7)).toLocaleString(undefined, { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ''}`;
  const showMeasure = () => {
    readout.hidden = !measuring;
    if (!measuring) return;
    if (mPts.length < 2) {
      readout.textContent = s(mPts.length ? 'measureSecond' : 'measureFirst');
      return;
    }
    const [a, b] = mPts;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ang = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    readout.textContent = `${s('distance')} ${fmt(Math.hypot(dx, dy))} · ΔX ${fmt(Math.abs(dx))} · ΔY ${fmt(Math.abs(dy))} · ${ang.toFixed(1)}°`;
  };
  const measureBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false', onclick: () => {
    measuring = !measuring;
    mPts = [];
    measureBtn.setAttribute('aria-pressed', String(measuring));
    stage.classList.toggle('dx-measuring', measuring);
    showMeasure();
    draw();
  } }, s('measure'));

  // ---- search texts
  let found: Label[] = [];
  let foundAt = -1;
  const count = h('span', { class: 'dx-count' });
  const search = h('input', { type: 'search', class: 'dx-search', placeholder: s('search'), 'aria-label': s('search') }) as HTMLInputElement;
  const runSearch = (next: boolean) => {
    const q = search.value.trim().toLowerCase();
    if (!q) {
      found = [];
      count.textContent = '';
      return;
    }
    if (!next || !found.length) {
      found = current().prims.filter((p): p is Label => p.kind === 'text' && p.text.toLowerCase().includes(q) && !!built.layers.get(p.layer)?.visible);
      foundAt = -1;
    }
    if (!found.length) {
      count.textContent = s('noMatch');
      return;
    }
    foundAt = (foundAt + 1) % found.length;
    const t = found[foundAt];
    count.textContent = `${foundAt + 1}/${found.length}`;
    // Zoom so the text is comfortably readable, centred.
    const r = size();
    scale = Math.max(scale, 28 / Math.max(t.height, 1e-9));
    ox = t.x - r.width / 2 / scale;
    oy = t.y + r.height / 2 / scale;
    fitted = false;
    hit = { x: t.x, y: t.y, r: t.height * 1.5, until: performance.now() + 1800 };
    draw();
  };
  search.addEventListener('input', () => runSearch(false));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch(true);
  });

  // ---- print (the browser's print dialog also offers "Save as PDF")
  const print = () => {
    const r = size();
    const k = 3;
    const c = document.createElement('canvas');
    c.width = Math.round(r.width * k);
    c.height = Math.round(r.height * k);
    const g = c.getContext('2d')!;
    g.setTransform(k, 0, 0, k, 0, 0);
    render(g, r.width, r.height, { scale, ox, oy }, false);
    const sheet = h('div', { class: 'dx-print' }, h('img', { src: c.toDataURL('image/png'), alt: file.name }));
    document.body.append(sheet);
    document.body.classList.add('dx-printing');
    const done = () => {
      sheet.remove();
      document.body.classList.remove('dx-printing');
      removeEventListener('afterprint', done);
    };
    addEventListener('afterprint', done);
    setTimeout(() => print_(), 50);
  };
  const print_ = () => window.print();

  // ---- layers
  const fillLayers = () => {
    const names = [...built.layers.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    layerPanel.replaceChildren(
      ...names.map((name) => {
        const l = built.layers.get(name)!;
        const box = h('input', { type: 'checkbox', checked: l.visible, onchange: () => { l.visible = box.checked; found = []; draw(); } }) as HTMLInputElement;
        const swatch = h('span', { class: 'dx-swatch', style: `background:${l.color < 0 ? (dark ? '#f2f2f2' : '#111') : `#${l.color.toString(16).padStart(6, '0')}`}` });
        return h('label', { class: 'dx-layer' }, box, swatch, name);
      }),
    );
  };
  fillLayers();

  // ---- model / layouts
  const spaces = built.layouts.length
    ? h('div', { class: 'seg', role: 'group', 'aria-label': s('spaces') },
        ...[{ name: s('model'), i: -1 }, ...built.layouts.map((l, i) => ({ name: l.name, i }))].map(({ name, i }) =>
          h('button', { type: 'button', class: i === -1 ? 'active' : '', onclick: (e: Event) => {
            space = i;
            mPts = [];
            found = [];
            showMeasure();
            for (const b of (e.currentTarget as HTMLElement).parentElement!.children) b.classList.toggle('active', b === e.currentTarget);
            fit();
          } }, name),
        ),
      )
    : null;

  const layersBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false', onclick: () => { layerPanel.hidden = !layerPanel.hidden; layersBtn.setAttribute('aria-pressed', String(!layerPanel.hidden)); } }, s('layers'));
  const darkBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': String(dark), onclick: () => { dark = !dark; darkBtn.setAttribute('aria-pressed', String(dark)); fillLayers(); draw(); } }, s('dark'));
  const tools = [
    ...(spaces ? [spaces] : []),
    h('button', { type: 'button', class: 'btn', onclick: fit }, s('fit')),
    layersBtn,
    measureBtn,
    search,
    count,
    darkBtn,
    h('button', { type: 'button', class: 'btn', title: s('printTitle'), onclick: print }, s('print')),
  ];

  if (!built.bounds) stage.append(h('div', { class: 'dx-empty' }, s('empty')));
  requestAnimationFrame(fit);

  const skipped = [...built.skipped.entries()].filter(([t]) => !['VIEWPORT', 'ATTRIB', 'SEQEND', 'ATTRIB_HIDDEN'].includes(t));
  return {
    meta: () => [isDwg ? 'DWG' : isHpgl ? 'HP-GL plot' : isDrill ? 'Excellon drill' : isGerber ? 'Gerber' : 'DXF', ...(version ? [`AutoCAD ${ACAD_VERSIONS[version] ?? version}`] : []), `${built.entityCount.toLocaleString()} ${s('entities')}`, `${built.layers.size} ${s(built.layers.size === 1 ? 'layerOne' : 'layerCount')}`, ...(built.layouts.length ? [`${built.layouts.length} ${s(built.layouts.length === 1 ? 'layoutOne' : 'layoutCount')}`] : [])],
    tools: () => tools,
    notices: () => (skipped.length ? [h('div', { class: 'notice subtle' }, s('skipped').replace('{list}', skipped.map(([t, n]) => `${t} (${n})`).join(', ')))] : []),
    destroy: () => {
      ro.disconnect();
      cancelAnimationFrame(pending);
    },
  };
}

/** x' = a·x + c·y + e, y' = b·x + d·y + f */
interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
const at = (m: Affine, x: number, y: number): [number, number] => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
/** m ∘ n (apply n first). */
const compose = (m: Affine, n: Affine): Affine => ({
  a: m.a * n.a + m.c * n.b,
  b: m.b * n.a + m.d * n.b,
  c: m.a * n.c + m.c * n.d,
  d: m.b * n.c + m.d * n.d,
  e: m.a * n.e + m.c * n.f + m.e,
  f: m.b * n.e + m.d * n.f + m.f,
});

const UNITS: Record<number, string> = { 1: 'in', 2: 'ft', 3: 'mi', 4: 'mm', 5: 'cm', 6: 'm', 7: 'km', 8: 'µin', 9: 'mil', 10: 'yd', 14: 'dm' };

/** Nearest corner within `tol` (drawing units), else the point itself. */
function snap(prims: Prim[], x: number, y: number, tol: number): { x: number; y: number } {
  let best = { x, y };
  let bestD = tol * tol;
  for (const p of prims) {
    if (p.kind !== 'poly') continue;
    for (let i = 0; i < p.pts.length; i += 2) {
      const d = (p.pts[i] - x) ** 2 + (p.pts[i + 1] - y) ** 2;
      if (d < bestD) (bestD = d), (best = { x: p.pts[i], y: p.pts[i + 1] });
    }
  }
  return best;
}

/**
 * Draws shapes in file order with one transform. Strokes and fills are batched by colour
 * (much faster than one call per object); a wipeout flushes the batches first so it
 * hides what was drawn before it, as in AutoCAD.
 */
function drawPrims(g: CanvasRenderingContext2D, prims: Prim[], m: Affine, layers: Built['layers'], c: { fg: string; bg: string; dark: boolean }) {
  const css = (col: number) => (col < 0 ? c.fg : c.dark || !isPale(col) ? `#${col.toString(16).padStart(6, '0')}` : darken(col));
  const k = Math.hypot(m.a, m.b);
  const rot = Math.atan2(m.b, m.a);
  let strokes = new Map<string, Path2D>();
  let fills = new Map<string, Path2D>();
  const trace = (path: Path2D, pts: number[], closed: boolean) => {
    path.moveTo(m.a * pts[0] + m.c * pts[1] + m.e, m.b * pts[0] + m.d * pts[1] + m.f);
    for (let i = 2; i < pts.length; i += 2) path.lineTo(m.a * pts[i] + m.c * pts[i + 1] + m.e, m.b * pts[i] + m.d * pts[i + 1] + m.f);
    if (closed) path.closePath();
  };
  const flush = () => {
    for (const [key, path] of fills) {
      const [col, kind] = key.split('|');
      g.globalAlpha = kind === 't' ? 0.22 : 1;
      g.fillStyle = col;
      g.fill(path, kind === 'n' ? 'nonzero' : 'evenodd');
    }
    g.globalAlpha = 1;
    g.lineWidth = 1;
    g.lineJoin = 'round';
    for (const [col, path] of strokes) {
      g.strokeStyle = col;
      g.stroke(path);
    }
    strokes = new Map();
    fills = new Map();
  };
  const texts: Label[] = [];
  for (const p of prims) {
    if (!layers.get(p.layer)?.visible) continue;
    if (p.kind === 'text') {
      texts.push(p);
      continue;
    }
    if (p.fill === 3) {
      flush();
      const path = new Path2D();
      trace(path, p.pts, true);
      g.fillStyle = c.bg;
      g.fill(path);
      continue;
    }
    const col = css(p.color);
    if (p.fill) {
      const key = p.fill === 2 ? `${col}|t` : p.fill === 4 ? `${col}|n` : col;
      let path = fills.get(key);
      if (!path) fills.set(key, (path = new Path2D()));
      trace(path, p.pts, true);
      continue;
    }
    let path = strokes.get(col);
    if (!path) strokes.set(col, (path = new Path2D()));
    trace(path, p.pts, p.closed);
  }
  flush();
  for (const t of texts) {
    const px = t.height * k;
    if (px < 3) continue; // too small to read at this zoom
    const [x, y] = at(m, t.x, t.y);
    g.save();
    g.translate(x, y);
    g.rotate(-(t.rotation + rot));
    g.fillStyle = css(t.color);
    g.font = `${px}px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`;
    g.textAlign = t.align;
    g.textBaseline = t.baseline;
    const lines = t.width ? wrap(g, t.text, t.width * k) : t.text.split('\n');
    lines.forEach((line, i) => g.fillText(line, 0, i * px * 1.35));
    g.restore();
  }
}

/** A DWG LibreDWG can't read: show the preview AutoCAD saved in it, with the reason. */
/** Parse and build in the background worker (website) or on the page (portable file). */
async function buildDrawing(bytes: Uint8Array, kind: 'dxf' | 'dwg' | 'hpgl' | 'gerber', report: Report, signal?: AbortSignal, name?: string): Promise<Built> {
  if (import.meta.env.MODE === 'portable') {
    const job = await import('./drawing-job');
    if (kind === 'gerber') return job.buildGerberBytes(bytes, report, name);
    return (kind === 'dwg' ? job.buildDwgBytes : kind === 'hpgl' ? job.buildHpglBytes : job.buildDxfBytes)(bytes, report);
  }
  const [{ startDrawingWorker }, { unpack }] = await Promise.all([import('./drawing-worker-host'), import('./drawing-job')]);
  const packed = await runWorker<Packed>(startDrawingWorker(), { bytes, dwg: kind === 'dwg', kind, name }, [bytes.buffer], (step, f) => report(step as Parameters<Report>[0], f), signal);
  return unpack(packed);
}

function dwgFallback(bytes: Uint8Array, version: string, why: string, ctx: OpenContext): OpenedView {
  const preview = dwgPreview(bytes);
  const url = preview ? URL.createObjectURL(preview.blob) : '';
  ctx.mount.replaceChildren(
    h('div', { class: 'view dx-fallback' }, preview ? h('img', { src: url, alt: '' }) : h('p', {}, s('dwgNothing').replace('{why}', why))),
  );
  return {
    meta: () => ['DWG', `AutoCAD ${ACAD_VERSIONS[version] ?? version}`],
    notices: () => (preview ? [h('div', { class: 'notice' }, s('dwgFallback').replace('{why}', why))] : []),
    destroy: () => url && URL.revokeObjectURL(url),
  };
}

/** MTEXT wraps at its box width (words; CJK text can break anywhere). */
function wrap(g: CanvasRenderingContext2D, text: string, maxPx: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const token of para.match(/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]|\S+\s*|\s+/g) ?? ['']) {
      if (line && g.measureText(line + token).width > maxPx) {
        out.push(line.trimEnd());
        line = token.trimStart();
      } else line += token;
    }
    out.push(line);
  }
  return out;
}

/** Light colours (yellow, cyan, bright green) are hard to read on white: darken them there. */
const isPale = (c: number) => ((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114 > 140;
const darken = (c: number) => `rgb(${((c >> 16) & 255) * 0.6},${((c >> 8) & 255) * 0.6},${(c & 255) * 0.6})`;
