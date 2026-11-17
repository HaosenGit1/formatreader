/**
 * COMTRADE viewer: recording details, one stacked plot per analog channel
 * (shared time axis), digital channels as step lanes, trigger marker,
 * crosshair readout, drag-to-zoom, and a table of the samples.
 * Accepts .cff, a .zip holding the .cfg/.dat pair, or a lone .cfg (details only).
 */
import './comtrade.css';
import { formatCount, h, renderProgressively } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { parseCff, parseCfg, parseDat, type ComtradeConfig, type ComtradeData } from './parse';

const s = strings({
  station: { en: 'Station', zh: '厂站' },
  device: { en: 'Recorder', zh: '录波装置' },
  revision: { en: 'COMTRADE', zh: 'COMTRADE 版本' },
  start: { en: 'Start', zh: '开始时间' },
  trigger: { en: 'Trigger', zh: '触发时间' },
  rate: { en: 'Sample rate', zh: '采样率' },
  frequency: { en: 'Line frequency', zh: '系统频率' },
  duration: { en: 'Duration', zh: '时长' },
  channels: { en: 'Channels', zh: '通道' },
  analog: { en: 'analog', zh: '模拟量' },
  digital: { en: 'digital', zh: '开关量' },
  waveforms: { en: 'Waveforms', zh: '波形' },
  table: { en: 'Table', zh: '表格' },
  reset: { en: 'Reset zoom', zh: '恢复缩放' },
  hint: { en: 'Drag across a chart to zoom · double-click to reset', zh: '在图上拖动可放大 · 双击恢复' },
  cfgOnly: {
    en: 'This is only the configuration (.cfg). The samples are in the matching .dat file — open a .cff file, or a .zip containing both the .cfg and .dat, to see the waveforms.',
    zh: '这只是配置文件（.cfg）。采样数据在对应的 .dat 文件中——请打开 .cff 文件，或同时包含 .cfg 和 .dat 的 .zip 文件来查看波形。',
  },
  time: { en: 'Time (ms)', zh: '时间（毫秒）' },
  name: { en: 'Channel', zh: '通道' },
  phase: { en: 'Phase', zh: '相' },
  unit: { en: 'Unit', zh: '单位' },
  scale: { en: 'Scale (a·x+b)', zh: '系数 (a·x+b)' },
  noData: { en: 'No .cfg/.dat pair found in this ZIP.', zh: '这个 ZIP 中没有找到 .cfg/.dat 文件对。' },
  samples: { en: 'samples', zh: '个采样点' },
});

// ------------------------------------------------------------------ loading

async function load(file: File): Promise<{ cfg: ComtradeConfig; data: ComtradeData | null }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = (b: Uint8Array) => {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(b);
    } catch {
      return new TextDecoder('windows-1252').decode(b);
    }
  };
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  if (ext === 'cff') {
    const { cfg, dat } = parseCff(bytes);
    return { cfg, data: parseDat(cfg, dat) };
  }
  if (ext === 'cfg') return { cfg: parseCfg(text(bytes)), data: null };
  // ZIP with the pair
  const { unzipSync } = await import('fflate');
  const files = unzipSync(bytes, { filter: (f) => /\.(cfg|dat)$/i.test(f.name) });
  const names = Object.keys(files);
  const cfgName = names.find((n) => /\.cfg$/i.test(n) && names.some((d) => d.toLowerCase() === `${n.slice(0, -4).toLowerCase()}.dat`));
  if (!cfgName) throw new Error(s('noData'));
  const datName = names.find((d) => d.toLowerCase() === `${cfgName.slice(0, -4).toLowerCase()}.dat`)!;
  const cfg = parseCfg(text(files[cfgName]));
  return { cfg, data: parseDat(cfg, files[datName]) };
}

// ------------------------------------------------------------------ charts

interface View {
  t0: number;
  t1: number;
}

const css = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim();

/** Index of the first sample at or after time t (time is increasing). */
function lowerBound(time: Float64Array, t: number): number {
  let lo = 0;
  let hi = time.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (time[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function fmtValue(v: number): string {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  return a >= 1000 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3);
}

function sizeCanvas(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const hgt = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hgt * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(hgt * dpr);
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function renderCharts(cfg: ComtradeConfig, data: ComtradeData, root: HTMLElement, onZoom: (zoomed: boolean) => void) {
  const { time } = data;
  const full: View = { t0: time[0] ?? 0, t1: time[time.length - 1] ?? 1 };
  const view: View = { ...full };
  let cursor: number | null = null;
  let drag: { start: number; now: number } | null = null;

  // Per-channel value range (fixed while zooming, so shapes stay comparable).
  const ranges = data.analog.map((vals) => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const v of vals) if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
    if (!isFinite(mn)) { mn = -1; mx = 1; }
    if (mn === mx) { mn -= 1; mx += 1; }
    const pad = (mx - mn) * 0.08;
    return { mn: mn - pad, mx: mx + pad };
  });

  const rows: Array<{ canvas: HTMLCanvasElement; value: HTMLElement; kind: 'a' | 'd'; index: number }> = [];
  const plots = h('div', { class: 'ct-plots' });
  cfg.analog.forEach((ch, i) => {
    const value = h('span', { class: 'ct-value' });
    const canvas = h('canvas', { class: 'ct-canvas ct-analog', role: 'img', 'aria-label': `${ch.id} ${ch.unit}` }) as HTMLCanvasElement;
    plots.append(h('div', { class: 'ct-row' }, h('div', { class: 'ct-label' }, h('strong', {}, ch.id), h('span', { class: 'ct-meta' }, [ch.phase, ch.unit].filter(Boolean).join(' · ')), value), canvas));
    rows.push({ canvas, value, kind: 'a', index: i });
  });
  cfg.digital.forEach((ch, i) => {
    const value = h('span', { class: 'ct-value' });
    const canvas = h('canvas', { class: 'ct-canvas ct-digital', role: 'img', 'aria-label': ch.id }) as HTMLCanvasElement;
    plots.append(h('div', { class: 'ct-row ct-row-d' }, h('div', { class: 'ct-label' }, h('strong', {}, ch.id), value), canvas));
    rows.push({ canvas, value, kind: 'd', index: i });
  });
  const axis = h('canvas', { class: 'ct-canvas ct-axis', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  plots.append(h('div', { class: 'ct-row ct-row-axis' }, h('div', { class: 'ct-label ct-time' }), axis));
  const timeLabel = plots.querySelector('.ct-time') as HTMLElement;
  root.append(plots);

  const x = (t: number, w: number) => ((t - view.t0) / (view.t1 - view.t0)) * w;
  const tAt = (px: number, w: number) => view.t0 + (px / w) * (view.t1 - view.t0);

  const draw = () => {
    const ink = css(root, '--ct-series');
    const grid = css(root, '--ct-grid');
    const muted = css(root, '--ct-muted');
    const sel = css(root, '--ct-select');
    const i0 = Math.max(0, lowerBound(time, view.t0) - 1);
    const i1 = Math.min(time.length - 1, lowerBound(time, view.t1) + 1);

    for (const row of rows) {
      const ctx = sizeCanvas(row.canvas);
      const w = row.canvas.clientWidth;
      const hh = row.canvas.clientHeight;
      ctx.clearRect(0, 0, w, hh);
      if (drag) {
        const a = Math.min(drag.start, drag.now);
        const b = Math.max(drag.start, drag.now);
        ctx.fillStyle = sel;
        ctx.fillRect(x(a, w), 0, x(b, w) - x(a, w), hh);
      }
      if (row.kind === 'a') {
        const vals = data.analog[row.index];
        const { mn, mx } = ranges[row.index];
        const y = (v: number) => hh - ((v - mn) / (mx - mn)) * hh;
        // zero line
        ctx.strokeStyle = grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y(0)) + 0.5);
        ctx.lineTo(w, Math.round(y(0)) + 0.5);
        ctx.stroke();
        // min/max per pixel column: fast for any number of samples
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const perPx = (i1 - i0) / w;
        if (perPx > 2) {
          let col = -1;
          let lo = Infinity;
          let hi = -Infinity;
          for (let k = i0; k <= i1; k++) {
            const c = Math.floor(x(time[k], w));
            if (c !== col) {
              if (col >= 0 && isFinite(lo)) { ctx.moveTo(col + 0.5, y(hi)); ctx.lineTo(col + 0.5, y(lo)); }
              col = c; lo = Infinity; hi = -Infinity;
            }
            const v = vals[k];
            if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
          }
          if (isFinite(lo)) { ctx.moveTo(col + 0.5, y(hi)); ctx.lineTo(col + 0.5, y(lo)); }
        } else {
          let pen = false;
          for (let k = i0; k <= i1; k++) {
            const v = vals[k];
            if (!isFinite(v)) { pen = false; continue; }
            if (pen) ctx.lineTo(x(time[k], w), y(v));
            else { ctx.moveTo(x(time[k], w), y(v)); pen = true; }
          }
        }
        ctx.stroke();
        // scale labels
        ctx.fillStyle = muted;
        ctx.font = '10px ui-monospace, Menlo, monospace';
        ctx.fillText(fmtValue(mx), 4, 11);
        ctx.fillText(fmtValue(mn), 4, hh - 3);
      } else {
        const vals = data.digital[row.index];
        ctx.fillStyle = ink;
        ctx.globalAlpha = 0.85;
        let runStart: number | null = null;
        for (let k = i0; k <= i1 + 1; k++) {
          const on = k <= i1 && vals[k] === 1;
          if (on && runStart === null) runStart = time[k];
          if (!on && runStart !== null) {
            const xa = Math.max(0, x(runStart, w));
            const xb = Math.min(w, x(time[Math.min(k, i1)], w));
            ctx.fillRect(xa, 4, Math.max(1, xb - xa), hh - 8);
            runStart = null;
          }
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = grid;
        ctx.beginPath();
        ctx.moveTo(0, hh - 0.5);
        ctx.lineTo(w, hh - 0.5);
        ctx.stroke();
      }
      // trigger
      if (data.triggerAt !== null && data.triggerAt >= view.t0 && data.triggerAt <= view.t1) {
        ctx.strokeStyle = muted;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        const tx = Math.round(x(data.triggerAt, w)) + 0.5;
        ctx.moveTo(tx, 0);
        ctx.lineTo(tx, hh);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // crosshair
      if (cursor !== null) {
        ctx.strokeStyle = css(root, '--ct-cursor');
        ctx.lineWidth = 1;
        ctx.beginPath();
        const cx = Math.round(x(cursor, w)) + 0.5;
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, hh);
        ctx.stroke();
      }
    }

    // time axis (ms)
    const actx = sizeCanvas(axis);
    const w = axis.clientWidth;
    actx.clearRect(0, 0, w, axis.clientHeight);
    actx.fillStyle = muted;
    actx.font = '11px ui-monospace, Menlo, monospace';
    const spanMs = (view.t1 - view.t0) * 1000;
    const rough = spanMs / Math.max(2, Math.floor(w / 90));
    const pow = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10].map((m) => m * pow).find((st) => st >= rough) ?? rough;
    for (let ms = Math.ceil((view.t0 * 1000) / step) * step; ms <= view.t1 * 1000; ms += step) {
      const px = x(ms / 1000, w);
      actx.fillRect(Math.round(px), 0, 1, 5);
      const label = `${+ms.toFixed(6)}`;
      actx.fillText(label, Math.min(w - actx.measureText(label).width, Math.max(0, px - actx.measureText(label).width / 2)), 17);
    }
    if (data.triggerAt !== null && data.triggerAt >= view.t0 && data.triggerAt <= view.t1) {
      actx.fillText(`▲ ${s('trigger')}`, Math.min(w - 70, x(data.triggerAt, w) + 3), 30);
    }

    // readout
    if (cursor !== null) {
      const k = Math.min(time.length - 1, lowerBound(time, cursor));
      timeLabel.textContent = `${(time[k] * 1000).toFixed(3)} ms`;
      for (const row of rows) row.value.textContent = row.kind === 'a' ? fmtValue(data.analog[row.index][k]) : String(data.digital[row.index][k] ?? '');
    } else {
      timeLabel.textContent = s('time');
      for (const row of rows) row.value.textContent = '';
    }
  };

  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); });
  };

  const pointerTime = (e: PointerEvent | MouseEvent) => {
    const c = e.currentTarget as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return tAt(Math.min(r.width, Math.max(0, e.clientX - r.left)), r.width);
  };
  for (const row of rows) {
    const c = row.canvas;
    c.addEventListener('pointermove', (e) => {
      cursor = pointerTime(e);
      if (drag) drag.now = cursor;
      schedule();
    });
    c.addEventListener('pointerleave', () => {
      cursor = null;
      schedule();
    });
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const t = pointerTime(e);
      drag = { start: t, now: t };
    });
    c.addEventListener('pointerup', () => {
      if (drag && Math.abs(drag.now - drag.start) > (view.t1 - view.t0) / 200) {
        view.t0 = Math.min(drag.start, drag.now);
        view.t1 = Math.max(drag.start, drag.now);
        onZoom(true);
      }
      drag = null;
      schedule();
    });
    c.addEventListener('dblclick', () => reset());
  }
  const reset = () => {
    view.t0 = full.t0;
    view.t1 = full.t1;
    onZoom(false);
    schedule();
  };

  const ro = new ResizeObserver(schedule);
  ro.observe(plots);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', schedule);
  draw();
  return { reset, destroy: () => { ro.disconnect(); mq.removeEventListener('change', schedule); } };
}

function renderTable(cfg: ComtradeConfig, data: ComtradeData): HTMLElement {
  const cols = [s('time'), ...cfg.analog.map((c) => `${c.id}${c.unit ? ` (${c.unit})` : ''}`), ...cfg.digital.map((c) => c.id)];
  const tbody = h('tbody');
  const idx = Array.from({ length: data.time.length }, (_, i) => i);
  renderProgressively(tbody, idx, (k) =>
    h('tr', {}, h('td', { class: 'num' }, (data.time[k] * 1000).toFixed(3)), ...data.analog.map((a) => h('td', { class: 'num' }, fmtValue(a[k]))), ...data.digital.map((d) => h('td', { class: 'num' }, String(d[k])))),
  200);
  return h('div', { class: 'ct-table-wrap' }, h('table', { class: 'ct-table' }, h('thead', {}, h('tr', {}, ...cols.map((c) => h('th', {}, c)))), tbody));
}

function details(cfg: ComtradeConfig, data: ComtradeData | null): HTMLElement {
  const rate = cfg.rates.find((r) => r.rate > 0)?.rate;
  const duration = data && data.time.length ? data.time[data.time.length - 1] : null;
  const items: Array<[string, string]> = [
    [s('station'), cfg.station],
    [s('device'), cfg.device],
    [s('revision'), cfg.revision],
    [s('start'), cfg.start],
    [s('trigger'), cfg.trigger],
    [s('rate'), rate ? `${formatCount(rate)} Hz` : '—'],
    [s('frequency'), `${cfg.lineFrequency} Hz`],
    [s('channels'), `${cfg.analog.length} ${s('analog')} · ${cfg.digital.length} ${s('digital')}`],
    ...(duration !== null ? ([[s('duration'), `${(duration * 1000).toFixed(1)} ms · ${formatCount(data!.time.length)} ${s('samples')}`]] as Array<[string, string]>) : []),
  ];
  return h('dl', { class: 'ct-details' }, ...items.filter(([, v]) => v).flatMap(([k, v]) => [h('dt', {}, k), h('dd', { dir: 'auto' }, v)]));
}

function channelTable(cfg: ComtradeConfig): HTMLElement {
  return h(
    'table',
    { class: 'ct-table ct-channels' },
    h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, s('name')), h('th', {}, s('phase')), h('th', {}, s('unit')), h('th', {}, s('scale')))),
    h(
      'tbody',
      {},
      ...cfg.analog.map((c) => h('tr', {}, h('td', {}, String(c.index)), h('td', {}, c.id), h('td', {}, c.phase), h('td', {}, c.unit), h('td', { class: 'num' }, `${c.a}·x + ${c.b}`))),
      ...cfg.digital.map((c) => h('tr', {}, h('td', {}, String(c.index)), h('td', {}, c.id), h('td', {}, c.phase), h('td', {}, ''), h('td', {}, ''))),
    ),
  );
}

export const preload = () => import('fflate');

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const { cfg, data } = await load(file);
  const root = h('div', { class: 'view view-comtrade' });
  ctx.mount.replaceChildren(root);

  if (!data) {
    root.append(details(cfg, null), h('p', { class: 'ct-note' }, s('cfgOnly')), channelTable(cfg));
    return { meta: () => ['COMTRADE (.cfg)', `${cfg.analog.length + cfg.digital.length} ${s('channels').toLowerCase()}`] };
  }

  let mode: 'chart' | 'table' = 'chart';
  let zoomed = false;
  let charts: ReturnType<typeof renderCharts> | null = null;
  const body = h('div', { class: 'ct-body' });
  root.append(details(cfg, data), body);
  const show = () => {
    charts?.destroy();
    charts = null;
    if (mode === 'chart') {
      body.replaceChildren(h('p', { class: 'ct-hint' }, s('hint')));
      charts = renderCharts(cfg, data, body, (z) => {
        zoomed = z;
        ctx.refreshChrome();
      });
    } else body.replaceChildren(renderTable(cfg, data));
  };
  show();

  return {
    title: cfg.station ? `${cfg.station} — ${cfg.device}` : undefined,
    meta: () => ['COMTRADE', `${cfg.analog.length} ${s('analog')} · ${cfg.digital.length} ${s('digital')}`],
    tools: () => {
      const btn = (m: typeof mode, label: string) =>
        h('button', { type: 'button', class: mode === m ? 'active' : '', 'aria-pressed': String(mode === m), onclick: () => { mode = m; zoomed = false; show(); ctx.refreshChrome(); } }, label);
      const out: HTMLElement[] = [h('div', { class: 'seg', role: 'group' }, btn('chart', s('waveforms')), btn('table', s('table')))];
      if (mode === 'chart' && zoomed) out.unshift(h('button', { type: 'button', class: 'btn', onclick: () => charts?.reset() }, s('reset')));
      return out;
    },
    onLangChange: () => show(),
    destroy: () => charts?.destroy(),
  };
}
