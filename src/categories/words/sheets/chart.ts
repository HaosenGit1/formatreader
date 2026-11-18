/**
 * Draws an Excel chart (bar, column, line, area, pie, doughnut, scatter) as SVG from the
 * values saved in the file. Colours: the series' own colour from the file, otherwise Excel's
 * default Office palette in Excel's order — so it looks like the chart people know.
 */
import type { ChartData } from './drawings';

const OFFICE = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9E480E', '#636363', '#997300', '#255E91', '#43682B'];
const NS = 'http://www.w3.org/2000/svg';

function el(name: string, attrs: Record<string, string | number>, ...children: Array<SVGElement | string>): SVGElement {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const c of children) e.append(c);
  return e;
}
const tip = (text: string) => el('title', {}, text);
const fmt = (v: number) => (Math.abs(v) >= 1e6 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(2) : Number(v.toFixed(2)).toLocaleString());

/** Round axis steps: 1, 2, 5 × 10^n. */
function ticks(min: number, max: number, count = 5): number[] {
  if (min === max) (min -= 1), (max += 1);
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

export function renderChart(chart: ChartData, width: number, height: number): SVGElement {
  const W = Math.max(200, width);
  const H = Math.max(140, height);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'xl-chart', role: 'img', 'aria-label': chart.title || 'Chart' });
  svg.append(el('rect', { x: 0, y: 0, width: W, height: H, class: 'xl-chart-bg' }));
  let top = 8;
  if (chart.title) {
    svg.append(el('text', { x: W / 2, y: 22, 'text-anchor': 'middle', class: 'xl-chart-title' }, chart.title));
    top = 34;
  }
  const series = chart.series.filter((s) => s.values.length);
  const color = (i: number) => series[i]?.color ?? OFFICE[i % OFFICE.length];
  if (!series.length) {
    svg.append(el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'xl-chart-axis' }, 'Chart (no saved values)'));
    return svg;
  }

  // Legend along the bottom: series names (or categories for pie charts).
  const pie = chart.type === 'pie' || chart.type === 'doughnut';
  const legendItems = pie ? (series[0].categories.length ? series[0].categories : series[0].values.map((_, i) => String(i + 1))) : series.map((s) => s.name);
  const legendColor = (i: number) => (pie ? OFFICE[i % OFFICE.length] : color(i));
  let bottom = H - 8;
  if (legendItems.length > 1 || pie) {
    const legend = el('g', { class: 'xl-chart-legend' });
    let x = 10;
    let y = H - 10;
    const rows: SVGElement[][] = [[]];
    for (const [i, name] of legendItems.slice(0, 24).entries()) {
      const label = name.length > 24 ? `${name.slice(0, 23)}…` : name;
      const w = 18 + label.length * 6.5;
      if (x + w > W - 10 && rows[rows.length - 1].length) {
        rows.push([]);
        x = 10;
      }
      rows[rows.length - 1].push(el('g', { transform: `translate(${x},0)` }, el('rect', { x: 0, y: -8, width: 10, height: 10, rx: 2, fill: legendColor(i) }), el('text', { x: 14, y: 1 }, label)));
      x += w;
    }
    y = H - 8 - (rows.length - 1) * 16;
    for (const [r, items] of rows.entries()) legend.append(el('g', { transform: `translate(0,${y + r * 16})` }, ...items));
    svg.append(legend);
    bottom = y - 18;
  }

  if (pie) {
    const vals = series[0].values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const r = Math.max(20, Math.min(W - 20, bottom - top) / 2 - 4);
    const cx = W / 2;
    const cy = top + (bottom - top) / 2;
    const inner = chart.type === 'doughnut' ? r * 0.55 : 0;
    let a0 = -Math.PI / 2;
    for (const [i, v] of vals.entries()) {
      if (!v) continue;
      const a1 = a0 + (v / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number, rr: number) => `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
      const d = vals.filter(Boolean).length === 1
        ? `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`
        : inner
          ? `M${p(a0, r)}A${r},${r} 0 ${large} 1 ${p(a1, r)}L${p(a1, inner)}A${inner},${inner} 0 ${large} 0 ${p(a0, inner)}Z`
          : `M${cx},${cy}L${p(a0, r)}A${r},${r} 0 ${large} 1 ${p(a1, r)}Z`;
      const label = legendItems[i] ?? String(i + 1);
      svg.append(el('path', { d, fill: OFFICE[i % OFFICE.length], class: 'xl-chart-slice' }, tip(`${label}: ${fmt(v)} (${((v / total) * 100).toFixed(1)}%)`)));
      a0 = a1;
    }
    return svg;
  }

  // Axes charts.
  const horizontal = chart.type === 'bar';
  const scatter = chart.type === 'scatter';
  const n = Math.max(...series.map((s) => s.values.length));
  const cats = series[0].categories.length ? series[0].categories : Array.from({ length: n }, (_, i) => String(i + 1));
  const stackedSums = chart.stacked ? Array.from({ length: n }, (_, i) => series.reduce((a, s) => a + (Number.isFinite(s.values[i]) ? s.values[i] : 0), 0)) : [];
  const vals = chart.stacked ? stackedSums : series.flatMap((s) => s.values.filter(Number.isFinite));
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const yt = ticks(lo, hi);
  const y0 = yt[0];
  const y1 = yt[yt.length - 1];
  const left = horizontal ? Math.min(140, 10 + Math.max(...cats.map((c) => c.length)) * 6.5) : 14 + Math.max(...yt.map((t) => fmt(t).length)) * 6.5;
  const plot = { x: left, y: top, w: W - left - 14, h: bottom - top - (horizontal ? 18 : 22) };
  const val = (v: number) => (horizontal ? plot.x + ((v - y0) / (y1 - y0)) * plot.w : plot.y + plot.h - ((v - y0) / (y1 - y0)) * plot.h);

  // Grid lines and value labels.
  for (const t of yt) {
    const p = val(t);
    if (horizontal) {
      svg.append(el('line', { x1: p, x2: p, y1: plot.y, y2: plot.y + plot.h, class: t === 0 ? 'xl-chart-zero' : 'xl-chart-grid' }));
      svg.append(el('text', { x: p, y: plot.y + plot.h + 14, 'text-anchor': 'middle', class: 'xl-chart-axis' }, fmt(t)));
    } else {
      svg.append(el('line', { x1: plot.x, x2: plot.x + plot.w, y1: p, y2: p, class: t === 0 ? 'xl-chart-zero' : 'xl-chart-grid' }));
      svg.append(el('text', { x: plot.x - 6, y: p + 4, 'text-anchor': 'end', class: 'xl-chart-axis' }, fmt(t)));
    }
  }

  if (scatter) {
    const xs = series.flatMap((s) => (s.xs ?? s.values.map((_, i) => i + 1)).filter(Number.isFinite));
    const xt = ticks(Math.min(...xs), Math.max(...xs));
    const sx = (x: number) => plot.x + ((x - xt[0]) / (xt[xt.length - 1] - xt[0])) * plot.w;
    for (const t of xt) svg.append(el('text', { x: sx(t), y: plot.y + plot.h + 16, 'text-anchor': 'middle', class: 'xl-chart-axis' }, fmt(t)));
    for (const [si, s] of series.entries()) {
      for (const [i, v] of s.values.entries()) {
        const x = s.xs?.[i] ?? i + 1;
        if (Number.isFinite(v) && Number.isFinite(x)) svg.append(el('circle', { cx: sx(x), cy: val(v), r: 4, fill: color(si), class: 'xl-chart-dot' }, tip(`${s.name}: ${fmt(x)}, ${fmt(v)}`)));
      }
    }
    return svg;
  }

  // Category labels (every k-th when crowded).
  const slot = (horizontal ? plot.h : plot.w) / n;
  const every = Math.max(1, Math.ceil((horizontal ? 14 : 48) / slot));
  for (let i = 0; i < n; i += every) {
    const label = (cats[i] ?? '').length > 18 ? `${cats[i].slice(0, 17)}…` : (cats[i] ?? '');
    if (horizontal) svg.append(el('text', { x: plot.x - 6, y: plot.y + slot * (i + 0.5) + 4, 'text-anchor': 'end', class: 'xl-chart-axis' }, label));
    else svg.append(el('text', { x: plot.x + slot * (i + 0.5), y: plot.y + plot.h + 16, 'text-anchor': 'middle', class: 'xl-chart-axis' }, label));
  }

  if (chart.type === 'line' || chart.type === 'area' || chart.type === 'radar') {
    const bottomY = val(Math.max(y0, Math.min(0, y1)));
    for (const [si, s] of series.entries()) {
      const pts = s.values.map((v, i) => (Number.isFinite(v) ? `${plot.x + slot * (i + 0.5)},${val(v)}` : null)).filter(Boolean) as string[];
      if (!pts.length) continue;
      if (chart.type === 'area') {
        const firstX = pts[0].split(',')[0];
        const lastX = pts[pts.length - 1].split(',')[0];
        svg.append(el('polygon', { points: `${firstX},${bottomY} ${pts.join(' ')} ${lastX},${bottomY}`, fill: color(si), 'fill-opacity': 0.35, stroke: color(si), 'stroke-width': 2 }));
      } else svg.append(el('polyline', { points: pts.join(' '), fill: 'none', stroke: color(si), 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      if (n <= 60) for (const [i, v] of s.values.entries()) if (Number.isFinite(v)) svg.append(el('circle', { cx: plot.x + slot * (i + 0.5), cy: val(v), r: 3, fill: color(si) }, tip(`${s.name} · ${cats[i] ?? i + 1}: ${fmt(v)}`)));
    }
    return svg;
  }

  // Bars / columns, side by side or stacked, with a small gap between bars.
  const groupW = slot * 0.75;
  const barW = chart.stacked ? groupW : groupW / series.length;
  const base = new Array<number>(n).fill(0);
  const baseNeg = new Array<number>(n).fill(0);
  for (const [si, s] of series.entries()) {
    for (const [i, v] of s.values.entries()) {
      if (!Number.isFinite(v)) continue;
      let from = 0;
      let to = v;
      if (chart.stacked) {
        const acc = v >= 0 ? base : baseNeg;
        from = acc[i];
        to = acc[i] + v;
        acc[i] = to;
      }
      const offset = slot * i + (slot - groupW) / 2 + (chart.stacked ? 0 : si * barW);
      const a = val(Math.min(from, to));
      const b = val(Math.max(from, to));
      const rect = horizontal
        ? { x: a, y: plot.y + offset + 1, width: Math.max(1, b - a), height: Math.max(1, barW - 2) }
        : { x: plot.x + offset + 1, y: b, width: Math.max(1, barW - 2), height: Math.max(1, a - b) };
      svg.append(el('rect', { ...rect, rx: 2, fill: color(si), class: 'xl-chart-bar' }, tip(`${s.name} · ${cats[i] ?? i + 1}: ${fmt(v)}`)));
    }
  }
  return svg;
}
