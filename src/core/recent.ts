/**
 * "Recent": the files opened lately, under the crystal ball, to open again with one click
 * (Chrome / Edge on a computer). Kept only in this browser (IndexedDB): each file's name,
 * size, when it was opened and a view-only link to it. Never its contents, never sent anywhere.
 * A file that was moved, renamed or deleted cannot be found any more and leaves the list.
 */
import { h } from './dom';
import { lang, strings } from './i18n';
import type { FileLink } from './recent-capture';

const s = strings({
  title: { en: 'Recent', zh: '最近打开' },
  privacy: {
    en: 'Kept only in this browser: the names of the files and a view-only link to each, never their contents.',
    zh: '只保存在这个浏览器里：文件名和每个文件的只读链接，从不保存文件内容。',
  },
  clear: { en: 'Clear', zh: '清除' },
  switchLabel: { en: 'Remember files I open', zh: '记住我打开的文件' },
  switchNote: {
    en: 'Saved only on this device. Works offline.',
    zh: '只保存在本机，离线也能用。',
  },
  empty: {
    en: 'Files you open will show here.',
    zh: '打开的文件会显示在这里。',
  },
  remove: { en: 'Remove from Recent', zh: '从最近列表中移除' },
  open: { en: 'Open {name} again', zh: '再次打开 {name}' },
  gone: {
    en: '{name} was moved, renamed or deleted, so it has left Recent.',
    zh: '{name} 已被移动、重命名或删除，已从最近列表中移除。',
  },
});

/** At most this many files are remembered. */
export const MAX_RECENT = 8;

interface Entry {
  id: string;
  name: string;
  size: number;
  /** Last opened (ms). */
  at: number;
  link: FileLink;
}

// ------------------------------------------------------------------ storage

const DB = 'formatreader-recent';
const STORE = 'files';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = d.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    d.close();
  }
}

/** Newest first. */
export async function listRecent(): Promise<Entry[]> {
  try {
    const all = ((await run<Entry[]>('readonly', (st) => st.getAll())) ?? []) as Entry[];
    return all.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}
// (This browser's own list of recent files; the files themselves are never written.)
const put = (e: Entry) => run('readwrite', (st) => void st.put(e));
const drop = (id: string) => run('readwrite', (st) => void st.delete(id));
const dropAll = () => run('readwrite', (st) => void st.clear());

// ------------------------------------------------------------------ on / off

/** The visitor's choice (off until they turn it on). Off: nothing is recorded and the list is emptied. */
const SWITCH = 'fr.recent';
export function isOn(): boolean {
  try {
    return localStorage.getItem(SWITCH) === 'on';
  } catch {
    return false;
  }
}
function setOn(on: boolean) {
  try {
    localStorage.setItem(SWITCH, on ? 'on' : 'off');
  } catch {
    /* storage unavailable: stays off */
  }
}

// ----------------------------------------------------------------- remember

/** Files a .shp brings along: not listed on their own. */
const SHAPE_SIDECAR = /\.(dbf|prj|cpg|shx|sbn|sbx|qix|fix|qpj|shp\.xml)$/i;

/** Remember files just opened (newest first; the same file moves to the front). */
export async function remember(links: FileLink[]): Promise<void> {
  if (!isOn()) return;
  const shp = links.some((l) => /\.shp$/i.test(l.name));
  const wanted = links.filter((l) => !(shp && SHAPE_SIDECAR.test(l.name))).slice(0, MAX_RECENT);
  if (!wanted.length) return;
  try {
    const list = await listRecent();
    const now = Date.now();
    for (const [i, link] of wanted.entries()) {
      let size = -1;
      try {
        size = (await link.getFile()).size;
      } catch {
        /* still worth remembering */
      }
      let same: Entry | undefined;
      for (const e of list) if (e.name === link.name && (await e.link.isSameEntry(link).catch(() => false))) same = e;
      // The first file of a drop counts as the newest.
      const entry: Entry = {
        id: same?.id ?? newId(),
        name: link.name,
        size,
        at: now - i,
        link,
      };
      await put(entry);
      if (same) list.splice(list.indexOf(same), 1);
      list.unshift(entry);
    }
    for (const old of list.sort((a, b) => b.at - a.at).slice(MAX_RECENT)) await drop(old.id);
  } catch (err) {
    console.warn('Recent files could not be saved', err);
  }
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ------------------------------------------------------------------- shelf

/** Puts the "Recent" shelf on the front page (or refreshes it); nothing when the list is empty. */
export async function recentShelf(landing: HTMLElement, open: (files: File[]) => void): Promise<void> {
  const on = isOn();
  const list = on ? await listRecent() : [];
  if (!landing.isConnected) return;
  const old = landing.querySelector('.recent-shelf');
  const changed = () => landing.dispatchEvent(new Event('shelf')); // the ball keeps clear of it
  const refresh = () => void recentShelf(landing, open);
  const when = new Intl.RelativeTimeFormat(lang() === 'zh' ? 'zh-CN' : 'en', {
    numeric: 'auto',
    style: 'short',
  });
  const ago = (t: number) => {
    const sec = (t - Date.now()) / 1000;
    const steps: Array<[number, Intl.RelativeTimeFormatUnit]> = [
      [60, 'second'],
      [3600, 'minute'],
      [86400, 'hour'],
      [604800, 'day'],
      [2629800, 'week'],
      [31557600, 'month'],
    ];
    if (Math.abs(sec) < 60) return when.format(0, 'second');
    for (let i = 1; i < steps.length; i++) if (Math.abs(sec) < steps[i][0]) return when.format(Math.round(sec / steps[i - 1][0]), steps[i - 1][1]);
    return when.format(Math.round(sec / 31557600), 'year');
  };

  async function reopen(e: Entry) {
    try {
      let ok = await e.link.queryPermission({ mode: 'read' });
      // After the browser restarts it asks once: "Let this site view <file>?"
      if (ok !== 'granted') ok = await e.link.requestPermission({ mode: 'read' });
      if (ok !== 'granted') return;
      const file = await e.link.getFile();
      await put({ ...e, size: file.size, at: Date.now() });
      open([file]);
    } catch {
      // Not there any more (moved, renamed, deleted, or its drive is gone).
      await drop(e.id).catch(() => {});
      note(s('gone').replace('{name}', e.name));
      refresh();
    }
  }

  const ext = (name: string) => {
    const dot = name.lastIndexOf('.');
    return dot > 0 && name.length - dot <= 6 ? name.slice(dot + 1).toUpperCase() : '·';
  };
  // The switch: on records each file opened from now on; off forgets them all.
  const toggle = h(
    'label',
    { class: 'recent-switch', title: s('privacy') },
    h('input', {
      type: 'checkbox',
      role: 'switch',
      class: 'recent-check',
      checked: on,
      onchange: (e: Event) => {
        const want = (e.currentTarget as HTMLInputElement).checked;
        setOn(want);
        if (want) refresh();
        else void dropAll().then(refresh, refresh);
      },
    }),
    ribbon('recent-ribbon-switch'),
    h('span', { class: 'recent-knob', 'aria-hidden': 'true' }),
    h('span', { class: 'recent-label' }, s('switchLabel')),
    h('span', { class: 'recent-note' }, s('switchNote')),
  );
  const shelf = h(
    'section',
    {
      class: `recent-shelf${on ? ' recent-on' : ''}`,
      'aria-label': s('title'),
    },
    on
      ? h(
          'div',
          { class: 'recent-head', title: s('privacy') },
          h('span', { class: 'recent-rule', 'aria-hidden': 'true' }),
          h('h2', { class: 'recent-title' }, ribbon('recent-ribbon-title'), s('title')),
          h('span', { class: 'recent-rule', 'aria-hidden': 'true' }),
        )
      : null,
    on && !list.length ? h('p', { class: 'recent-empty' }, s('empty')) : null,
    !list.length
      ? null
      : h(
          'ul',
          { class: 'recent-list' },
          ...list.map((e, i) =>
            h(
              'li',
              { class: 'recent-item', style: `--i:${i}` },
              h(
                'button',
                {
                  type: 'button',
                  class: 'recent-open',
                  title: `${e.name} · ${ago(e.at)}`,
                  'aria-label': s('open').replace('{name}', e.name),
                  onclick: () => void reopen(e),
                },
                h('span', { class: 'recent-ext', 'aria-hidden': 'true' }, ext(e.name)),
                h('span', { class: 'recent-name' }, e.name),
                h('span', { class: 'recent-when' }, ago(e.at)),
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'recent-x',
                  title: s('remove'),
                  'aria-label': `${s('remove')}: ${e.name}`,
                  onclick: () => void drop(e.id).then(refresh, refresh),
                },
                '×',
              ),
            ),
          ),
        ),
    h(
      'div',
      { class: 'recent-foot' },
      toggle,
      list.length
        ? h(
            'button',
            {
              type: 'button',
              class: 'recent-clear',
              onclick: () => void dropAll().then(refresh, refresh),
            },
            s('clear'),
          )
        : null,
    ),
  );
  if (old) old.replaceWith(shelf);
  else landing.append(shelf);
  changed();
}

/** The bookmark ribbon (a gold silk ribbon with a swallowtail end): "remember where it is". */
let ribbons = 0;
function ribbon(cls: string): HTMLElement {
  const id = `fr-ribbon-${++ribbons}`;
  const el = h('span', { class: `recent-ribbon ${cls}`, 'aria-hidden': 'true' });
  el.innerHTML =
    `<svg viewBox="0 0 14 20" width="14" height="20"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
    '<stop offset="0" stop-color="#f6e3b4"/><stop offset=".5" stop-color="#c9a96e"/><stop offset="1" stop-color="#9c7c40"/></linearGradient></defs>' +
    `<path class="ribbon-silk" d="M2 1.5h10a.5.5 0 0 1 .5.5v16.2l-5.5-4.1-5.5 4.1V2a.5.5 0 0 1 .5-.5z" fill="url(#${id})" stroke="#b8995c" stroke-width=".9" stroke-linejoin="round"/>` +
    '<path class="ribbon-sheen" d="M4.2 2.6v11.6" stroke="#fff" stroke-opacity=".55" stroke-width="1" stroke-linecap="round"/></svg>';
  return el;
}

function note(text: string) {
  document.querySelector('.tab-toast')?.remove();
  const el = h('div', { class: 'tab-toast', role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 7000);
}
