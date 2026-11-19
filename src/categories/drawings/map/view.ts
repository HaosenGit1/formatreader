/**
 * Map viewer for KML / KMZ, GPX, GeoJSON and Shapefiles: points, lines and areas drawn
 * on a canvas (longitude/latitude in Web Mercator, projected data in its own units),
 * coloured by folder / layer, with a scale bar, a details panel for the clicked feature
 * and a table of every feature's attributes (copyable to Excel).
 *
 * No map background is downloaded (nothing leaves the computer); "OpenStreetMap" opens
 * the same place on openstreetmap.org in a new tab, only when the visitor asks.
 */
import './map.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { isShp, parseGeoJson, parseGpx, parseKml, parseKmz, parseShapefile, type Feature, type MapData } from './parse';

const s = strings({
  fit: { en: 'Fit', zh: '适应窗口' },
  table: { en: 'Table', zh: '属性表' },
  osm: { en: 'OpenStreetMap', zh: 'OpenStreetMap' },
  osmTitle: { en: 'Open this place on openstreetmap.org (new tab)', zh: '在 openstreetmap.org 上打开这个位置（新标签页）' },
  points: { en: 'points', zh: '个点' },
  lines: { en: 'lines', zh: '条线' },
  areas: { en: 'areas', zh: '个区域' },
  onePoint: { en: 'point', zh: '个点' },
  oneLine: { en: 'line', zh: '条线' },
  oneArea: { en: 'area', zh: '个区域' },
  wgs: { en: 'Longitude / latitude (WGS 84)', zh: '经纬度（WGS 84）' },
  units: { en: 'units', zh: '单位' },
  copy: { en: 'Copy', zh: '复制' },
  copied: { en: 'Copied', zh: '已复制' },
  filter: { en: 'Filter', zh: '筛选' },
  close: { en: 'Close', zh: '关闭' },
  name: { en: 'Name', zh: '名称' },
  group: { en: 'Folder / layer', zh: '文件夹 / 图层' },
  kind: { en: 'Type', zh: '类型' },
  point: { en: 'Point', zh: '点' },
  line: { en: 'Line', zh: '线' },
  area: { en: 'Area', zh: '区域' },
  length: { en: 'Length', zh: '长度' },
  size: { en: 'Area', zh: '面积' },
  empty: { en: 'This file has no places, lines or areas to show.', zh: '这个文件没有可显示的点、线或区域。' },
  noDbf: { en: 'Only the shapes are shown: the attributes are in the .dbf file next to it. Open the folder or ZIP that holds both (or drop the .shp, .dbf and .prj together).', zh: '只显示了图形：属性保存在旁边的 .dbf 文件里。请打开同时包含两者的文件夹或 ZIP（或把 .shp、.dbf、.prj 一起拖进来）。' },
  hint: { en: 'Scroll to zoom · drag to move · click a feature for details', zh: '滚轮缩放 · 拖动平移 · 点击要素查看详情' },
  more: { en: '… {n} more rows (copy to get them all)', zh: '……还有 {n} 行（复制可得到全部）' },
});

const PALETTE = ['#2f6fdf', '#d9480f', '#2b8a3e', '#ae3ec9', '#e8590c', '#0c8599', '#c2255c', '#5c940d', '#1864ab', '#862e9c'];
const R = 6371008.8;
const toRad = Math.PI / 180;

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const data = await read(file, ctx.format?.id);
  const lonLat = data.lonLat;
  // World coordinates: Web Mercator (in degrees-like units) for lon/lat, else as stored.
  const proj = (x: number, y: number): [number, number] => (lonLat ? [x, Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, y)) * toRad) / 2)) / toRad] : [x, y]);
  const unproj = (x: number, y: number): [number, number] => (lonLat ? [x, (2 * Math.atan(Math.exp(y * toRad)) - Math.PI / 2) / toRad] : [x, y]);

  const groups = [...new Set(data.features.map((f) => f.group ?? ''))];
  const colorOf = (f: Feature) => PALETTE[groups.indexOf(f.group ?? '') % PALETTE.length];
  const world = data.features.map((f) => f.parts.map((p) => {
    const out = new Array<number>(p.length);
    for (let i = 0; i < p.length; i += 2) [out[i], out[i + 1]] = proj(p[i], p[i + 1]);
    return out;
  }));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; // prettier-ignore
  for (const parts of world) for (const p of parts) for (let i = 0; i < p.length; i += 2) {
    minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]); // prettier-ignore
  }
  const hasData = Number.isFinite(minX);

  const canvas = document.createElement('canvas');
  const scaleBar = h('div', { class: 'mp-scale' });
  const stage = h('div', { class: 'mp-stage', tabindex: '0' }, canvas, scaleBar, h('div', { class: 'mp-hint' }, s('hint')));
  const side = h('aside', { class: 'mp-side', hidden: true });
  const tableBox = h('div', { class: 'mp-table', hidden: true });
  ctx.mount.replaceChildren(h('div', { class: 'view view-map' }, h('div', { class: 'mp-main' }, stage, side), tableBox));
  if (!hasData) stage.append(h('div', { class: 'mp-empty' }, s('empty')));

  let scale = 1;
  let ox = 0;
  let oy = 0;
  let fitted = true;
  let selected = -1;
  const size = () => stage.getBoundingClientRect();
  const fit = () => {
    const r = size();
    if (!hasData || !r.width) return;
    const w = Math.max(maxX - minX, 1e-9);
    const hgt = Math.max(maxY - minY, 1e-9);
    scale = Math.min(r.width / w, r.height / hgt) * 0.8;
    // A single point: a sensible neighbourhood instead of an infinite zoom.
    if (w < 1e-6 && hgt < 1e-6) scale = lonLat ? r.width / 0.02 : r.width / 100;
    ox = (minX + maxX) / 2 - r.width / 2 / scale;
    oy = (minY + maxY) / 2 + r.height / 2 / scale;
    fitted = true;
    draw();
  };

  let pending = 0;
  const draw = () => {
    if (!pending) pending = requestAnimationFrame(() => ((pending = 0), paint()));
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
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    g.fillStyle = dark ? '#16181d' : '#f4f6f8';
    g.fillRect(0, 0, r.width, r.height);
    drawGraticule(g, r.width, r.height, dark);
    const sx = (x: number) => (x - ox) * scale;
    const sy = (y: number) => (oy - y) * scale;
    const path = (p: number[], close: boolean) => {
      g.moveTo(sx(p[0]), sy(p[1]));
      for (let i = 2; i < p.length; i += 2) g.lineTo(sx(p[i]), sy(p[i + 1]));
      if (close) g.closePath();
    };
    const order = [...data.features.keys()].sort((a, b) => rank(data.features[a]) - rank(data.features[b]));
    const pointCount = data.features.filter((f) => f.kind === 'point').length;
    const labels: Array<[number, number, string]> = [];
    for (const i of order) {
      const f = data.features[i];
      const col = colorOf(f);
      const sel = i === selected;
      g.lineWidth = sel ? 4 : 2;
      g.strokeStyle = sel ? '#ffd43b' : col;
      if (f.kind === 'area') {
        g.beginPath();
        for (const p of world[i]) path(p, true);
        g.globalAlpha = sel ? 0.45 : 0.22;
        g.fillStyle = col;
        g.fill('evenodd');
        g.globalAlpha = 1;
        g.stroke();
      } else if (f.kind === 'line') {
        g.beginPath();
        for (const p of world[i]) path(p, false);
        g.stroke();
      } else {
        for (const p of world[i]) {
          const x = sx(p[0]);
          const y = sy(p[1]);
          g.beginPath();
          g.arc(x, y, sel ? 7 : 5, 0, Math.PI * 2);
          g.fillStyle = col;
          g.fill();
          g.lineWidth = 2;
          g.strokeStyle = sel ? '#ffd43b' : dark ? '#16181d' : '#fff';
          g.stroke();
          if (f.name && (pointCount <= 300 || sel)) labels.push([x + 8, y + 4, f.name]);
        }
      }
    }
    g.font = '12px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
    g.lineWidth = 3;
    g.strokeStyle = dark ? '#16181d' : '#fff';
    g.fillStyle = dark ? '#e9ecef' : '#212529';
    for (const [x, y, t] of labels) {
      g.strokeText(t, x, y);
      g.fillText(t, x, y);
    }
    updateScale();
  };

  /** Faint lines every round number of degrees (or units), so the map has a frame of reference. */
  const drawGraticule = (g: CanvasRenderingContext2D, w: number, hgt: number, dark: boolean) => {
    const [x0, y0] = unproj(ox, oy - hgt / scale);
    const [x1, y1] = unproj(ox + w / scale, oy);
    const span = Math.max(x1 - x0, 1e-12);
    const step = niceStep(span / 6);
    g.strokeStyle = dark ? '#262a31' : '#e3e7eb';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      const px = (x - ox) * scale;
      g.moveTo(px, 0);
      g.lineTo(px, hgt);
    }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      const py = (oy - proj(0, y)[1]) * scale;
      g.moveTo(0, py);
      g.lineTo(w, py);
    }
    g.stroke();
  };

  const updateScale = () => {
    // Ground distance of 100 px at the view's centre.
    const lat = unproj(0, oy - size().height / 2 / scale)[1];
    // One Mercator unit is one degree of longitude: R·π/180·cos(latitude) metres there.
    const perPx = lonLat ? (R * toRad * Math.cos(lat * toRad)) / scale : 1 / scale;
    const target = niceStep(perPx * 100);
    const px = target / perPx;
    scaleBar.style.width = `${px}px`;
    scaleBar.textContent = lonLat ? (target >= 1000 ? `${target / 1000} km` : `${target} m`) : `${target} ${s('units')}`;
  };

  // ---- pan / zoom / pick
  const zoomAt = (factor: number, cx: number, cy: number) => {
    const wx = ox + cx / scale;
    const wy = oy - cy / scale;
    scale *= factor;
    ox = wx - cx / scale;
    oy = wy + cy / scale;
    fitted = false;
    draw();
  };
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = size();
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false }); // prettier-ignore
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  let downAt: { x: number; y: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt = pointers.size === 1 ? { x: e.clientX, y: e.clientY } : null;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
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
      if (pinch) zoomAt(d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch = d;
      return;
    }
    ox -= (e.clientX - prev.x) / scale;
    oy += (e.clientY - prev.y) / scale;
    fitted = false;
    draw();
  });
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (downAt && e.type === 'pointerup' && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) {
      const r = size();
      select(pick(ox + (e.clientX - r.left) / scale, oy - (e.clientY - r.top) / scale, 8 / scale));
    }
    downAt = null;
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('dblclick', fit);
  const ro = new ResizeObserver(() => (fitted ? fit() : draw()));
  ro.observe(stage);

  /** The feature under a point: dots first, then lines, then areas. */
  const pick = (x: number, y: number, tol: number): number => {
    let best = -1;
    let bestD = Infinity;
    data.features.forEach((f, i) => {
      for (const p of world[i]) {
        if (f.kind === 'point') {
          const d = Math.hypot(p[0] - x, p[1] - y);
          if (d < tol * 1.5 && d < bestD) (best = i), (bestD = d);
        } else if (f.kind === 'line') {
          for (let k = 2; k < p.length; k += 2) {
            const d = segDist(x, y, p[k - 2], p[k - 1], p[k], p[k + 1]);
            if (d < tol && d + tol < bestD) (best = i), (bestD = d + tol);
          }
        }
      }
    });
    if (best >= 0) return best;
    data.features.forEach((f, i) => {
      if (f.kind === 'area' && best < 0 && inside(world[i], x, y)) best = i;
    });
    return best;
  };

  const select = (i: number) => {
    selected = i;
    draw();
    if (i < 0) return void (side.hidden = true);
    const f = data.features[i];
    const rows: Array<[string, string]> = [];
    rows.push([s('kind'), s(f.kind)]);
    if (f.group) rows.push([s('group'), f.group]);
    if (f.kind === 'point') {
      const [x, y] = [f.parts[0][0], f.parts[0][1]];
      rows.push(lonLat ? ['Lat, Lon', `${y.toFixed(6)}, ${x.toFixed(6)}`] : ['X, Y', `${x}, ${y}`]);
    } else if (lonLat) {
      if (f.kind === 'line') rows.push([s('length'), dist(f.parts.reduce((t, p) => t + lineLength(p), 0))]);
      else rows.push([s('size'), areaText(f.parts.reduce((t, p, k) => t + (k ? -1 : 1) * ringArea(p), 0))]);
    }
    for (const [k, v] of Object.entries(f.props)) if (v !== '') rows.push([k, v]);
    side.hidden = false;
    side.replaceChildren(
      h('div', { class: 'mp-side-head' }, h('strong', {}, f.name ?? s(f.kind)), h('button', { type: 'button', class: 'btn', onclick: () => select(-1), 'aria-label': s('close') }, '×')),
      h('dl', { class: 'mp-props' }, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      ...(lonLat && f.kind === 'point' ? [osmLink(f.parts[0][1], f.parts[0][0], 17)] : []),
    );
  };

  // ---- attribute table
  const keys = [...new Set(data.features.flatMap((f) => Object.keys(f.props)))].slice(0, 40);
  const filter = h('input', { type: 'search', class: 'mp-filter', placeholder: s('filter'), 'aria-label': s('filter') }) as HTMLInputElement;
  const columns = [s('name'), s('kind'), ...(groups.length > 1 ? [s('group')] : []), ...(lonLat ? ['Lat', 'Lon'] : ['X', 'Y']), ...keys];
  const rowOf = (f: Feature) => {
    const [x, y] = f.kind === 'point' ? [f.parts[0][0], f.parts[0][1]] : centroid(f.parts);
    return [f.name ?? '', s(f.kind), ...(groups.length > 1 ? [f.group ?? ''] : []), lonLat ? y.toFixed(6) : String(y), lonLat ? x.toFixed(6) : String(x), ...keys.map((k) => f.props[k] ?? '')];
  };
  const fillTable = () => {
    const q = filter.value.trim().toLowerCase();
    const idx = [...data.features.keys()].filter((i) => !q || rowOf(data.features[i]).some((c) => c.toLowerCase().includes(q)));
    const copyBtn = h('button', { type: 'button', class: 'btn' }, s('copy')) as HTMLButtonElement;
    copyBtn.addEventListener('click', () => {
      const tsv = [columns, ...idx.map((i) => rowOf(data.features[i]))].map((r) => r.map((c) => c.replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
      void navigator.clipboard?.writeText(tsv).then(() => ((copyBtn.textContent = s('copied')), setTimeout(() => (copyBtn.textContent = s('copy')), 1500)));
    });
    const LIMIT = 2000;
    tableBox.replaceChildren(
      h('div', { class: 'mp-table-bar' }, filter, h('span', { class: 'mp-count' }, String(idx.length)), copyBtn),
      h('div', { class: 'mp-table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ...columns.map((c) => h('th', {}, c)))),
        h('tbody', {}, ...idx.slice(0, LIMIT).map((i) => h('tr', { class: i === selected ? 'sel' : '', onclick: () => (select(i), zoomTo(i)) }, ...rowOf(data.features[i]).map((c) => h('td', {}, c))))),
      )), // prettier-ignore
      ...(idx.length > LIMIT ? [h('p', { class: 'mp-more' }, s('more').replace('{n}', String(idx.length - LIMIT)))] : []),
    );
    filter.focus({ preventScroll: true });
  };
  filter.addEventListener('input', fillTable);
  const zoomTo = (i: number) => {
    const pts = world[i].flat();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; // prettier-ignore
    for (let k = 0; k < pts.length; k += 2) (x0 = Math.min(x0, pts[k])), (x1 = Math.max(x1, pts[k])), (y0 = Math.min(y0, pts[k + 1])), (y1 = Math.max(y1, pts[k + 1]));
    const r = size();
    const w = Math.max(x1 - x0, 1e-9);
    const hh = Math.max(y1 - y0, 1e-9);
    scale = Math.min(scale * 4, Math.min(r.width / w, r.height / hh) * 0.5);
    if (w < 1e-6) scale = Math.max(scale, lonLat ? r.width / 0.01 : scale);
    ox = (x0 + x1) / 2 - r.width / 2 / scale;
    oy = (y0 + y1) / 2 + r.height / 2 / scale;
    fitted = false;
    draw();
  };
  const tableBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false', onclick: () => {
    tableBox.hidden = !tableBox.hidden;
    tableBtn.setAttribute('aria-pressed', String(!tableBox.hidden));
    if (!tableBox.hidden) fillTable();
  } }, s('table')); // prettier-ignore

  const osmLink = (lat: number, lon: number, zoom: number) =>
    h('a', { class: 'btn', href: `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=${zoom}/${lat.toFixed(5)}/${lon.toFixed(5)}`, target: '_blank', rel: 'noopener noreferrer', title: s('osmTitle') }, s('osm'));
  const osmView = () => {
    const r = size();
    const [lon, lat] = unproj(ox + r.width / 2 / scale, oy - r.height / 2 / scale);
    const zoom = Math.max(1, Math.min(19, Math.round(Math.log2((scale * 360) / 256))));
    window.open(`https://www.openstreetmap.org/#map=${zoom}/${lat.toFixed(5)}/${lon.toFixed(5)}`, '_blank', 'noopener,noreferrer');
  };

  const tools = [
    h('button', { type: 'button', class: 'btn', onclick: fit }, s('fit')),
    tableBtn,
    ...(lonLat && hasData ? [h('button', { type: 'button', class: 'btn', title: s('osmTitle'), onclick: osmView }, s('osm'))] : []),
  ];
  requestAnimationFrame(fit);

  const counts = (['point', 'line', 'area'] as const).map((k) => [k, data.features.filter((f) => f.kind === k).length] as const).filter(([, n]) => n);
  const missingDbf = data.format === 'Shapefile' && !(file as File & { shapeParts?: { dbf?: File } }).shapeParts?.dbf;
  return {
    title: data.title,
    meta: () => [data.format, ...counts.map(([k, n]) => `${n.toLocaleString()} ${s(n === 1 ? (k === 'point' ? 'onePoint' : k === 'line' ? 'oneLine' : 'oneArea') : k === 'point' ? 'points' : k === 'line' ? 'lines' : 'areas')}`), lonLat ? s('wgs') : data.crs ?? s('units')],
    tools: () => tools,
    notices: () => (missingDbf ? [h('div', { class: 'notice subtle' }, s('noDbf'))] : []),
    destroy: () => {
      ro.disconnect();
      cancelAnimationFrame(pending);
    },
  };
}

/** Reads the file in its format; a Shapefile brings its .dbf / .prj / .cpg when they came along. */
async function read(file: File, id?: string): Promise<MapData> {
  const name = file.name.toLowerCase();
  if (id === 'kmz' || name.endsWith('.kmz')) return parseKmz(new Uint8Array(await file.arrayBuffer()));
  const head = new Uint8Array(await file.slice(0, 100).arrayBuffer());
  if (isShp(head)) {
    const parts = (file as File & { shapeParts?: { dbf?: File; prj?: File; cpg?: File } }).shapeParts ?? {};
    return parseShapefile({ shp: await file.arrayBuffer(), dbf: await parts.dbf?.arrayBuffer(), prj: await parts.prj?.text(), cpg: await parts.cpg?.text() });
  }
  const text = await file.text();
  if (/<gpx[\s>]/.test(text.slice(0, 4096))) return parseGpx(text);
  if (/<kml[\s>]/.test(text.slice(0, 4096))) return parseKml(text);
  return parseGeoJson(text);
}

const rank = (f: Feature) => (f.kind === 'area' ? 0 : f.kind === 'line' ? 1 : 2);

function niceStep(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}

function inside(rings: number[][], x: number, y: number): boolean {
  let c = false;
  for (const p of rings)
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2)
      if (p[i + 1] > y !== p[j + 1] > y && x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  return c;
}

function centroid(parts: number[][]): [number, number] {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const p of parts) for (let i = 0; i < p.length; i += 2) (x += p[i]), (y += p[i + 1]), n++;
  return n ? [x / n, y / n] : [0, 0];
}

/** Great-circle length of a lon/lat line, metres. */
export function lineLength(p: number[]): number {
  let t = 0;
  for (let i = 2; i < p.length; i += 2) {
    const [lon1, lat1, lon2, lat2] = [p[i - 2], p[i - 1], p[i], p[i + 1]].map((v) => v * toRad);
    const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
    t += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return t;
}

/** Area of a lon/lat ring on the sphere, m² (absolute). */
export function ringArea(p: number[]): number {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const [lon1, lat1] = [p[i * 2] * toRad, p[i * 2 + 1] * toRad];
    const [lon2, lat2] = [p[((i + 1) % n) * 2] * toRad, p[((i + 1) % n) * 2 + 1] * toRad];
    a += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((a * R * R) / 2);
}

const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(1)} m`);
const areaText = (m2: number) => (m2 >= 1e6 ? `${(m2 / 1e6).toFixed(3)} km²` : m2 >= 1e4 ? `${(m2 / 1e4).toFixed(2)} ha` : `${m2.toFixed(0)} m²`);
