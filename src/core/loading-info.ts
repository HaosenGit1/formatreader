/** The loading screen's progress area (see shell.ts). */
import { formatBytes, h } from './dom';

/**
 * Under the loading animation: the step, a real percentage when known, the file and a timer.
 * Appears after a moment (small files open before it would flash). After 30 s without
 * progress: "Still working" with Keep waiting / Stop.
 */
export function loadingInfo(cover: HTMLElement, name: string, size: number, text: { slow: string; keepWaiting: string; stop: string }, onStop: () => void) {
  const step = h('p', { class: 'loading-step' });
  const fill = h('span', {});
  const bar = h('div', { class: 'loading-bar', hidden: true }, fill);
  const clock = h('span', {});
  const fileLine = h('p', { class: 'loading-file' }, name, size >= 0 ? ` · ${formatBytes(size)}` : '', ' · ', clock);
  const watch = h(
    'div',
    { class: 'loading-watch', hidden: true },
    h('p', {}, text.slow),
    h('button', { type: 'button', class: 'btn', onclick: () => ((watch.hidden = true), (quietUntil = Date.now() + 30000)) }, text.keepWaiting),
    h('button', { type: 'button', class: 'btn', onclick: onStop }, text.stop),
  );
  const box = h('div', { class: 'loading-info', hidden: true }, step, bar, fileLine, watch);
  cover.append(box);
  const t0 = Date.now();
  let lastChange = t0;
  let quietUntil = t0 + 30000;
  let lastText = '';
  const tick = () => {
    const sec = Math.floor((Date.now() - t0) / 1000);
    clock.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    if (Date.now() - t0 > 700 || size > 30 * 1024 * 1024) box.hidden = false;
    if (Date.now() > quietUntil && Date.now() - lastChange > 15000) watch.hidden = false;
  };
  const timer = setInterval(tick, 250);
  return {
    set: (text: string, fraction?: number) => {
      if (!cover.isConnected) return;
      const pct = fraction === undefined ? null : Math.max(0, Math.min(100, Math.floor(fraction * 100)));
      const label = pct === null ? text : `${text} ${pct}%`;
      if (label !== lastText) {
        lastText = label;
        lastChange = Date.now();
        watch.hidden = true;
      }
      step.textContent = label;
      bar.hidden = pct === null;
      fill.style.width = `${pct ?? 0}%`;
      tick();
    },
    done: () => clearInterval(timer),
  };
}
