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
import { buildDxf, dxfEncoding, type Built, type Prim } from './build';

const s = strings({
  fit: { en: 'Fit', zh: '适应窗口' },
  layers: { en: 'Layers', zh: '图层' },
  dark: { en: 'Dark', zh: '深色' },
  entities: { en: 'objects', zh: '个对象' },
  layerCount: { en: 'layers', zh: '个图层' },
  empty: { en: 'This drawing has nothing to draw.', zh: '这个图纸没有可显示的内容。' },
  binary: { en: 'This is a binary DXF, which is not supported yet. Save it as an ASCII DXF.', zh: '这是二进制 DXF，暂不支持。请另存为 ASCII DXF。' },
  dwgFallback: {
    en: 'This DWG could not be read in full ({why}). Showing the preview picture AutoCAD saved in it.',
    zh: '无法完整读取这个 DWG（{why}）。显示 AutoCAD 保存在其中的预览图。',
  },
  dwgNothing: { en: 'This DWG could not be read ({why}) and has no saved preview picture.', zh: '无法读取这个 DWG（{why}），文件中也没有预览图。' },
  skipped: { en: 'Not drawn yet: {list}.', zh: '暂未绘制：{list}。' },
  hint: { en: 'Scroll to zoom · drag to move · double-click to fit', zh: '滚轮缩放 · 拖动平移 · 双击适应窗口' },
});

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 65536));
  const isDwg = ctx.format?.id === 'dwg';
  let version: string | undefined;
  let parsed: unknown;
  if (isDwg) {
    version = head.slice(0, 6);
    try {
      const { readDwgAsDxf } = await import('./dwg');
      parsed = await readDwgAsDxf(bytes.slice());
    } catch (err) {
      return dwgFallback(bytes, version, String((err as Error)?.message ?? err), ctx);
    }
  } else {
    if (head.startsWith('AutoCAD Binary DXF')) throw new Error(s('binary'));
    const text = new TextDecoder(dxfEncoding(head)).decode(bytes);
    version = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/.exec(head)?.[1];
    const { default: DxfParser } = await import('dxf-parser');
    parsed = new DxfParser().parseSync(text);
  }
  const built: Built = buildDxf(parsed as never);
  // A DWG with no drawing data (only a saved preview): show the preview.
  if (isDwg && !built.bounds) return dwgFallback(bytes, version ?? '', 'no drawing data', ctx);

  const canvas = document.createElement('canvas');
  const stage = h('div', { class: 'dx-stage', tabindex: '0' }, canvas, h('div', { class: 'dx-hint' }, s('hint')));
  const layerPanel = h('aside', { class: 'dx-layers', hidden: true });
  ctx.mount.replaceChildren(h('div', { class: 'view view-dxf' }, stage, layerPanel));

  let dark = matchMedia('(prefers-color-scheme: dark)').matches;
  // View: screen = (world − origin) × scale, with y flipped.
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let fitted = true;

  const size = () => stage.getBoundingClientRect();
  const fit = () => {
    const b = built.bounds;
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
    pending = requestAnimationFrame(paint);
  };
  const paint = () => {
    pending = 0;
    const r = size();
    const dpr = Math.min(devicePixelRatio, 2);
    if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = dark ? '#1e1f24' : '#ffffff';
    g.fillRect(0, 0, r.width, r.height);
    const fg = dark ? '#f2f2f2' : '#111111';
    const css = (c: number) => (c < 0 ? fg : dark || !isPale(c) ? `#${c.toString(16).padStart(6, '0')}` : darken(c));
    g.lineWidth = 1;
    g.lineJoin = 'round';
    // Batch strokes by colour (much faster than one stroke per object).
    const batches = new Map<string, Path2D>();
    const texts: Prim[] = [];
    const sx = (x: number) => (x - ox) * scale;
    const sy = (y: number) => (oy - y) * scale;
    for (const p of built.prims) {
      if (!built.layers.get(p.layer)?.visible) continue;
      if (p.kind === 'text') {
        texts.push(p);
        continue;
      }
      const key = css(p.color);
      let path = batches.get(key);
      if (!path) batches.set(key, (path = new Path2D()));
      path.moveTo(sx(p.pts[0]), sy(p.pts[1]));
      for (let i = 2; i < p.pts.length; i += 2) path.lineTo(sx(p.pts[i]), sy(p.pts[i + 1]));
      if (p.closed) path.closePath();
    }
    for (const [color, path] of batches) {
      g.strokeStyle = color;
      g.stroke(path);
    }
    for (const t of texts) {
      if (t.kind !== 'text') continue;
      const px = t.height * scale;
      if (px < 3) continue; // too small to read at this zoom
      g.save();
      g.translate(sx(t.x), sy(t.y));
      g.rotate(-t.rotation);
      g.fillStyle = css(t.color);
      g.font = `${px}px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`;
      g.textAlign = t.align;
      g.textBaseline = t.baseline;
      const lines = t.width ? wrap(g, t.text, t.width * scale) : t.text.split('\n');
      lines.forEach((line, i) => g.fillText(line, 0, i * px * 1.35));
      g.restore();
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
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('dblclick', fit);
  const ro = new ResizeObserver(() => (fitted ? fit() : draw()));
  ro.observe(stage);

  // ---- layers
  const fillLayers = () => {
    const names = [...built.layers.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    layerPanel.replaceChildren(
      ...names.map((name) => {
        const l = built.layers.get(name)!;
        const box = h('input', { type: 'checkbox', checked: l.visible, onchange: () => { l.visible = box.checked; draw(); } }) as HTMLInputElement;
        const swatch = h('span', { class: 'dx-swatch', style: `background:${l.color < 0 ? (dark ? '#f2f2f2' : '#111') : `#${l.color.toString(16).padStart(6, '0')}`}` });
        return h('label', { class: 'dx-layer' }, box, swatch, name);
      }),
    );
  };
  fillLayers();

  const layersBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false', onclick: () => { layerPanel.hidden = !layerPanel.hidden; layersBtn.setAttribute('aria-pressed', String(!layerPanel.hidden)); } }, s('layers'));
  const darkBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': String(dark), onclick: () => { dark = !dark; darkBtn.setAttribute('aria-pressed', String(dark)); fillLayers(); draw(); } }, s('dark'));
  const tools = [h('button', { type: 'button', class: 'btn', onclick: fit }, s('fit')), layersBtn, darkBtn];

  if (!built.bounds) stage.append(h('div', { class: 'dx-empty' }, s('empty')));
  requestAnimationFrame(fit);

  const skipped = [...built.skipped.entries()].filter(([t]) => !['VIEWPORT', 'ATTRIB', 'SEQEND'].includes(t));
  return {
    meta: () => [isDwg ? 'DWG' : 'DXF', ...(version ? [`AutoCAD ${ACAD_VERSIONS[version] ?? version}`] : []), `${built.entityCount.toLocaleString()} ${s('entities')}`, `${built.layers.size} ${s('layerCount')}`],
    tools: () => tools,
    notices: () => (skipped.length ? [h('div', { class: 'notice subtle' }, s('skipped').replace('{list}', skipped.map(([t, n]) => `${t} (${n})`).join(', ')))] : []),
    destroy: () => {
      ro.disconnect();
      cancelAnimationFrame(pending);
    },
  };
}

/** A DWG LibreDWG can't read: show the preview AutoCAD saved in it, with the reason. */
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
