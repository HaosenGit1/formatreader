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
  count: { en: '{n} of {t} ready', zh: '{n}/{t} 可用' },
  title: { en: 'Works without internet', zh: '无网络也能用' },
  explain: {
    en: '✓ opens with no connection in this browser. ◐ the common types do; some need the internet once. ○ needs the internet the first time.',
    zh: '✓ 在这个浏览器里无需联网即可打开。◐ 常见类型可以，部分需要联网一次。○ 第一次打开时需要联网。',
  },
  makeAll: { en: 'Make everything available offline · {size}', zh: '全部设为离线可用 · {size}' },
  working: { en: 'Downloading…', zh: '正在下载…' },
  allReady: { en: 'Everything is available offline.', zh: '全部都可以离线使用。' },
  failed: { en: 'Not finished: connect to the internet and try again.', zh: '未完成：请联网后再试。' },
  close: { en: 'Close', zh: '关闭' },
});

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
        `${s('offline')} · ${s('count').replace('{n}', String(ready)).replace('{t}', String(ids.length))}`,
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
      h('p', { class: 'offline-note' }, s('explain')),
      note,
      button,
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
