/**
 * "Offline" on the front page: which kinds of files open with no internet in
 * this browser right now, and a button to store everything.
 * Readiness comes live from the service worker (it differs per visitor).
 */
import { h } from '../core/dom';
import { lang, strings } from '../core/i18n';
import { VIEWER_LABELS } from './labels';

const s = strings({
  offline: { en: 'Offline', zh: '离线' },
  title: { en: 'Use offline', zh: '离线使用' },
  lead: { en: 'Files are never uploaded. Download once, use offline.', zh: '文件从不上传。下载一次，离线可用。' },
  makeAll: { en: 'Download · {size}', zh: '下载 · {size}' },
  working: { en: 'Downloading…', zh: '正在下载…' },
  allReady: { en: 'Ready to use offline.', zh: '已可离线使用。' },
  failed: { en: 'Not finished. Connect and try again.', zh: '未完成，请联网后重试。' },
  legend: { en: '✓ offline   ◐ mostly   ○ needs internet', zh: '✓ 可离线   ◐ 大部分   ○ 需联网' },
  safari: { en: 'Safari: add to Home Screen to keep it.', zh: 'Safari：添加到主屏幕才能长期保留。' },
  close: { en: 'Close', zh: '关闭' },
});

/** Safari (and every iPhone/iPad browser) deletes a site's stored data after ~7 days unused, unless installed. */
function safariMayForget(): boolean {
  const ua = navigator.userAgent;
  const installed = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || (/Safari\//.test(ua) && /Macintosh/.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua));
  return apple && !installed;
}

interface Status {
  core: boolean;
  ready: Record<string, 'full' | 'partly' | 'none'>;
  totalBytes: number;
}

function ask<T>(message: unknown): Promise<T | null> {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve(e.data as T);
    worker.postMessage(message, [channel.port2]);
  });
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

/** The small "Offline · n of t ready" line, or an empty placeholder until offline support is active. */
export function offlineLine(): HTMLElement {
  const slot = h('div', { class: 'offline-slot' });
  if (!('serviceWorker' in navigator)) return slot;

  const render = async () => {
    const status = await ask<Status>('status');
    if (!status || !slot.isConnected) return;
    const ids = Object.keys(VIEWER_LABELS).filter((id) => id in status.ready);
    const ready = ids.filter((id) => status.ready[id] !== 'none').length;
    const full = ids.every((id) => status.ready[id] === 'full');
    slot.replaceChildren(
      h(
        'button',
        { type: 'button', class: 'offline-line', onclick: () => openPanel(status, ids, render) },
        h('span', { class: `offline-dot${full ? ' full' : ready ? ' some' : ''}`, 'aria-hidden': 'true' }),
        `${s('offline')} · ${ready}/${ids.length}`,
      ),
    );
  };
  if (navigator.serviceWorker.controller) void render();
  navigator.serviceWorker.addEventListener('controllerchange', () => void render(), { once: true });
  // The first visit stores files in the background: refresh the count once that has had time to finish.
  setTimeout(() => void render(), 8000);
  return slot;
}

const rank = { full: 0, partly: 1, none: 2 } as const;

function openPanel(status: Status, ids: string[], refresh: () => Promise<void>) {
  const zh = lang() === 'zh';
  const list = h(
    'ul',
    { class: 'offline-list' },
    ...[...ids]
      .sort((a, b) => rank[status.ready[a]] - rank[status.ready[b]])
      .map((id) => {
        const l = VIEWER_LABELS[id];
        const st = status.ready[id];
        return h(
          'li',
          { class: st === 'full' ? 'ready' : st === 'partly' ? 'partly' : 'missing' },
          h('span', { class: 'offline-mark', 'aria-label': st }, st === 'full' ? '✓' : st === 'partly' ? '◐' : '○'),
          h('span', { class: 'offline-name' }, zh ? l.zh : l.en),
          h('span', { class: 'offline-ext' }, l.ext),
        );
      }),
  );
  const all = ids.every((id) => status.ready[id] === 'full');
  const note = h('p', { class: 'offline-note' }, all ? s('allReady') : '');
  const button = all
    ? null
    : (h(
        'button',
        {
          type: 'button',
          class: 'btn offline-all',
          onclick: async () => {
            button!.setAttribute('disabled', '');
            button!.textContent = s('working');
            // The visitor asked to keep it: ask the browser not to clear it when space runs low.
            void navigator.storage?.persist?.().catch(() => false);
            const res = await ask<{ done: boolean }>('cache-all');
            dialog.close();
            await refresh();
            if (res && !res.done) alertNote(s('failed'));
          },
        },
        s('makeAll').replace('{size}', mb(status.totalBytes)),
      ) as HTMLButtonElement);
  const dialog = h(
    'dialog',
    { class: 'offline-panel', onclick: (e: Event) => e.target === dialog && dialog.close() },
    h(
      'div',
      { class: 'offline-inner' },
      h('div', { class: 'offline-head' }, h('h2', {}, s('title')), h('button', { type: 'button', class: 'offline-close', 'aria-label': s('close'), onclick: () => dialog.close() }, '×')),
      h('p', { class: 'offline-lead' }, s('lead')),
      note,
      button,
      safariMayForget() ? h('p', { class: 'offline-note' }, s('safari')) : null,
      h('p', { class: 'offline-legend' }, s('legend')),
      list,
    ),
  ) as HTMLDialogElement;
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function alertNote(text: string) {
  const el = h('div', { class: 'offline-toast', role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 5000);
}
