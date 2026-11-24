/**
 * "Recent": the files opened lately, under the crystal ball, to open again with one click
 * (Chrome / Edge on a computer). Kept only in this browser (IndexedDB): each file's name,
 * size, when it was opened and a view-only link to it. Never its contents, never sent anywhere.
 * A file that was moved, renamed or deleted cannot be found any more and leaves the list.
 */
import { h } from './dom';
import { lang, strings } from './i18n';
import { FolderSource } from './folder-source';
import type { FileLink, FolderLink } from './recent-capture';

const s = strings({
  title: { en: 'Frequent files & folders', zh: '常用文件和文件夹' },
  privacy: {
    en: 'Kept only in this browser: the names of the files and a view-only link to each, never their contents.',
    zh: '只保存在这个浏览器里：文件名和每个文件的只读链接，从不保存文件内容。',
  },
  clear: { en: 'Clear', zh: '清除' },
  switchLabel: { en: 'Quick access', zh: '快捷打开' },
  switchNote: { en: 'Paths only, on this device', zh: '仅记路径，存于本机' },
  empty: {
    en: 'Your usual files and folders, one click away.',
    zh: '打开过的文件和文件夹，下次一键直达。',
  },
  remove: { en: 'Remove from the list', zh: '从列表中移除' },
  open: { en: 'Open {name} again', zh: '再次打开 {name}' },
  gone: {
    en: '{name} was moved, renamed or deleted, so it has left the list.',
    zh: '{name} 已被移动、重命名或删除，已从列表中移除。',
  },
});

/** At most this many files are remembered. */
export const MAX_RECENT = 8;

export interface Entry {
  id: string;
  name: string;
  size: number;
  /** Last opened (ms). */
  at: number;
  link: FileLink | FolderLink;
}

// ------------------------------------------------------------------ storage

const DB = 'formatreader-recent';
const STORE = 'files';
/** No longer used (a folder chosen during a short trial); kept so the list opens, and emptied. */
const FOLDER = 'folder';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(FOLDER)) d.createObjectStore(FOLDER, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void, name = STORE): Promise<T | undefined> {
  const d = await db();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = d.transaction(name, mode);
      const req = work(tx.objectStore(name));
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

/** Forget a folder kept during the short trial of a folder panel (nothing reads it now). */
const clearFolder = () => run('readwrite', (st) => void st.clear(), FOLDER).catch(() => undefined);

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
export async function remember(links: Array<FileLink | FolderLink>): Promise<void> {
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
        if (link.kind === 'file') size = (await link.getFile()).size;
      } catch {
        /* still worth remembering */
      }
      let same: Entry | undefined;
      for (const e of list) if (e.name === link.name && e.link.kind === link.kind && (await (e.link as FileLink).isSameEntry(link as FileLink).catch(() => false))) same = e;
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
export async function recentShelf(landing: HTMLElement, open: (what: File[] | FolderSource) => void): Promise<void> {
  const on = isOn();
  void clearFolder();
  const list = on ? await listRecent() : [];
  if (!landing.isConnected) return;
  const old = landing.querySelector('.recent-shelf');
  const changed = () => landing.dispatchEvent(new Event('shelf')); // the ball keeps clear of it
  const refresh = () => void recentShelf(landing, open);

  const reopen = (e: Entry) => reopenEntry(e, open, refresh);
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
                h('span', { class: `recent-ext${e.link.kind === 'directory' ? ' recent-ext-dir' : ''}`, 'aria-hidden': 'true' }, e.link.kind === 'directory' ? folderIcon() : ext(e.name)),
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

/** Open a remembered file again (asking once for permission after a browser restart). */
export async function reopenEntry(e: Entry, open: (what: File[] | FolderSource) => void, after: () => void): Promise<void> {
  try {
    let ok = await e.link.queryPermission({ mode: 'read' });
    // After the browser restarts it asks once: "Let this site view <file>?"
    if (ok !== 'granted') ok = await e.link.requestPermission({ mode: 'read' });
    if (ok !== 'granted') return;
    if (e.link.kind === 'directory') {
      const link = e.link;
      // Still there? (listing fails for a folder that was moved or deleted)
      for await (const first of link.values()) {
        void first;
        break;
      }
      await put({ ...e, at: Date.now() });
      open(new FolderSource(folderEntry(link, `/${link.name}`)));
      return;
    }
    const file = await e.link.getFile();
    await put({ ...e, size: file.size, at: Date.now() });
    open([file]);
  } catch {
    // Not there any more (moved, renamed, deleted, or its drive is gone).
    await drop(e.id).catch(() => {});
    note(s('gone').replace('{name}', e.name));
    after();
  }
}

/** "PDF", "CSV"… for the gold badge. */
export function ext(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && name.length - dot <= 6 ? name.slice(dot + 1).toUpperCase() : '·';
}

/** "2 h ago", "yesterday"… */
export function ago(t: number): string {
  const when = new Intl.RelativeTimeFormat(lang() === 'zh' ? 'zh-CN' : 'en', { numeric: 'auto', style: 'short' });
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
}

/** The bookmark ribbon (a gold silk ribbon with a swallowtail end): "remember where it is". */
let ribbons = 0;
export function ribbon(cls: string): HTMLElement {
  const id = `fr-ribbon-${++ribbons}`;
  const el = h('span', { class: `recent-ribbon ${cls}`, 'aria-hidden': 'true' });
  el.innerHTML =
    `<svg viewBox="0 0 14 20" width="14" height="20"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">` +
    '<stop offset="0" stop-color="#f6e3b4"/><stop offset=".5" stop-color="#c9a96e"/><stop offset="1" stop-color="#9c7c40"/></linearGradient></defs>' +
    `<path class="ribbon-silk" d="M2 1.5h10a.5.5 0 0 1 .5.5v16.2l-5.5-4.1-5.5 4.1V2a.5.5 0 0 1 .5-.5z" fill="url(#${id})" stroke="#b8995c" stroke-width=".9" stroke-linejoin="round"/>` +
    '<path class="ribbon-sheen" d="M4.2 2.6v11.6" stroke="#fff" stroke-opacity=".55" stroke-width="1" stroke-linecap="round"/></svg>';
  return el;
}

export function note(text: string) {
  document.querySelector('.tab-toast')?.remove();
  const el = h('div', { class: 'tab-toast', role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 7000);
}

/** A small gold-on-midnight folder for the badge of a remembered folder. */
function folderIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '13');
  svg.innerHTML = '<path d="M1.5 3.2A1.7 1.7 0 0 1 3.2 1.5h4.2l1.9 2h7.5a1.7 1.7 0 0 1 1.7 1.7v7.6a1.7 1.7 0 0 1-1.7 1.7H3.2a1.7 1.7 0 0 1-1.7-1.7z" fill="#14203a"/><path d="M1.5 6h17" stroke="#c9a96e" stroke-width="1.1"/>';
  return svg;
}

// ------------------------------------------------- a remembered folder, shown again

/*
 * The folder view reads folders the way a drop gives them (directory "entries"). A remembered
 * folder is a view-only link instead, so it is presented the same way: listing its contents
 * and reading its files, nothing else.
 */
type Ok<T> = (v: T) => void;
type Fail = (e: unknown) => void;

function fileEntry(link: FileLink, path: string) {
  return { name: link.name, fullPath: path, isFile: true, isDirectory: false, file: (ok: Ok<File>, fail?: Fail) => void link.getFile().then(ok, fail) };
}

async function find(dir: FolderLink, parts: string[]): Promise<FileLink> {
  let here: FileLink | FolderLink = dir;
  for (const part of parts) {
    if (here.kind !== 'directory') break;
    let next: FileLink | FolderLink | null = null;
    for await (const it of here.values())
      if (it.name === part) {
        next = it;
        break;
      }
    if (!next) throw new Error(`Not found: ${parts.join('/')}`);
    here = next;
  }
  if (here.kind !== 'file') throw new Error(`Not a file: ${parts.join('/')}`);
  return here;
}

function folderEntry(link: FolderLink, path: string): FileSystemDirectoryEntry {
  const entry = {
    name: link.name,
    fullPath: path,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let done = false;
      return {
        readEntries(ok: Ok<unknown[]>, fail?: Fail) {
          if (done) return ok([]);
          done = true;
          void (async () => {
            const out: unknown[] = [];
            for await (const it of link.values()) out.push(it.kind === 'directory' ? folderEntry(it, `${path}/${it.name}`) : fileEntry(it, `${path}/${it.name}`));
            return out;
          })().then(ok, fail);
        },
      };
    },
    getFile(rel: string, _o: unknown, ok?: Ok<unknown>, fail?: Fail) {
      void find(link, rel.split('/').filter(Boolean)).then((f) => ok?.(fileEntry(f, `${path}/${rel}`)), fail);
    },
  };
  return entry as unknown as FileSystemDirectoryEntry;
}
