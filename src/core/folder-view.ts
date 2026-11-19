/**
 * A dropped folder, shown like an archive: a tree (folders first, natural
 * order), each subfolder read when opened. Clicking a file opens it in
 * FormatReader with the folder on the trail, so ← / Back return here.
 * Files are read only when clicked; nothing is uploaded.
 */
import './folder-view.css';
import { formatBytes, h } from './dom';
import { strings } from './i18n';
import { messageView } from './info-view';
import { isJunkPath } from './junk';
import type { FolderSource } from './folder-source';
import type { OpenContext, OpenedView } from './viewer';

const s = strings({
  hint: { en: 'Click a file to open it here. Nothing is uploaded.', zh: '点击文件即可在这里打开。不会上传任何内容。' },
  missing: { en: 'A piece of this playlist is not in the folder:', zh: '播放列表中的这个片段不在文件夹里：' },
  encryptedStream: { en: 'This playlist is encrypted (DRM / AES key): it can only be played by the app that downloaded it.', zh: '这个播放列表是加密的（DRM / AES 密钥），只能在下载它的 App 里播放。' },
  emptyPlaylist: { en: 'This playlist lists no video pieces.', zh: '这个播放列表里没有视频片段。' },
  onlinePlaylist: { en: 'This playlist points to video pieces on the internet. FormatReader only plays pieces saved in this folder (it never downloads anything).', zh: '这个播放列表指向网上的视频片段。FormatReader 只播放保存在这个文件夹里的片段（不会下载任何内容）。' },
  folder: { en: 'Folder', zh: '文件夹' },
  items: { en: 'items', zh: '项' },
  empty: { en: 'This folder is empty.', zh: '这个文件夹是空的。' },
  cannot: { en: 'This folder could not be read.', zh: '无法读取这个文件夹。' },
  cannotTitle: { en: 'Can’t open folders here', zh: '这里无法打开文件夹' },
  fromDisk: {
    en: 'Browsers don’t let a page opened from a file on disk look inside folders. Drop a single file instead, or zip the folder and drop the zip. (On formatreader.com, folders open directly.)',
    zh: '浏览器不允许从本地文件打开的页面查看文件夹内容。请拖入单个文件，或把文件夹压缩成 zip 再拖入。（在 formatreader.com 上可以直接打开文件夹。）',
  },
});

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** All entries of a directory (readEntries returns them in batches). */
async function readAll(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const out: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    out.push(...batch);
  }
  return out.filter((e) => !isJunkPath(e.fullPath)).sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || natural(a.name, b.name));
}

import { attachShapeParts } from './companions';

const fileOf = (e: FileSystemFileEntry) => new Promise<File>((resolve, reject) => e.file(resolve, reject));

/** Remembered per folder while the visitor goes in and out (which subfolders were open). */
const openState = new Map<string, Set<string>>();

/** A file inside a folder, relative to it ("seg/001.ts"). */
function fileAt(dir: FileSystemDirectoryEntry, path: string): Promise<File> {
  return new Promise((resolve, reject) => dir.getFile(path, {}, (e) => (e as FileSystemFileEntry).file(resolve, reject), () => reject(new Error(`${s('missing')} ${path}`))));
}

/**
 * What to open when a file in a folder is clicked. Usually the file itself, but:
 *  - a .m3u8 playlist (downloaded live streams, app caches): its pieces joined in order
 *    (.ts pieces, or fMP4 pieces after their init file) and played as one video;
 *  - B站 (bilibili) caches keep picture and sound apart (video.m4s + audio.m4s): the sound
 *    is attached so the video plays with it.
 */
export async function openEntry(fe: FileSystemFileEntry, siblings: FileSystemEntry[], dir: FileSystemDirectoryEntry): Promise<File> {
  const file = await fileOf(fe);
  if (/\.m3u8?$/i.test(fe.name)) {
    const text = await file.text();
    if (/#EXT-X-KEY:.*METHOD=(AES|SAMPLE)/i.test(text) && !/METHOD=NONE/i.test(text)) throw new Error(s('encryptedStream'));
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const init = /#EXT-X-MAP:.*URI="([^"]+)"/i.exec(text)?.[1];
    const pieces = lines.filter((l) => l && !l.startsWith('#'));
    if (!pieces.length) throw new Error(s('emptyPlaylist'));
    if (pieces.some((p) => /^[a-z]+:\/\//i.test(p))) throw new Error(s('onlinePlaylist'));
    const parts = await Promise.all([...(init ? [init] : []), ...pieces].map((p) => fileAt(dir, decodeURIComponent(p.split('?')[0]))));
    const mp4 = !!init || /\.(m4s|mp4|m4v)$/i.test(pieces[0]);
    return new File(parts, fe.name.replace(/\.m3u8?$/i, mp4 ? '.mp4' : '.ts'), { type: mp4 ? 'video/mp4' : 'video/mp2t' });
  }
  if (/\.shp$/i.test(fe.name)) {
    const files = siblings.filter((e) => e.isFile);
    return attachShapeParts(file, fe.name, files.map((e) => e.name), async (n) => fileOf(files.find((e) => e.name === n) as FileSystemFileEntry));
  }
  if (/\.m4s$/i.test(fe.name) && /video/i.test(fe.name)) {
    const audio = siblings.find((e) => e.isFile && /\.m4s$/i.test(e.name) && /audio/i.test(e.name));
    if (audio) Object.defineProperty(file, 'companionAudio', { value: await fileOf(audio as FileSystemFileEntry) });
  }
  return file;
}

function alertBox(ctx: OpenContext, message: string) {
  const note = ctx.mount.querySelector('.fv-hint');
  if (note) note.textContent = message;
}

export async function openFolder(source: FolderSource, ctx: OpenContext): Promise<OpenedView> {
  const opened = openState.get(source.entry.fullPath) ?? new Set<string>();
  openState.set(source.entry.fullPath, opened);
  let top: FileSystemEntry[];
  try {
    top = await readAll(source.entry);
  } catch {
    ctx.mount.replaceChildren(messageView(s('cannotTitle'), location.protocol === 'file:' ? s('fromDisk') : s('cannot')));
    return { meta: () => [s('folder')] };
  }

  const list = async (entries: FileSystemEntry[], depth: number, dirOf: FileSystemDirectoryEntry = source.entry): Promise<HTMLElement> => {
    const ul = h('ul', { class: 'fv-list' });
    for (const e of entries) {
      if (e.isDirectory) {
        const dir = e as FileSystemDirectoryEntry;
        const details = h('details', { open: opened.has(dir.fullPath) || (depth === 0 && entries.length === 1) }) as HTMLDetailsElement;
        const count = h('span', { class: 'fv-count' });
        details.append(h('summary', {}, h('span', { class: 'fv-folder-icon', 'aria-hidden': 'true' }, '📁'), h('span', { class: 'fv-name' }, dir.name), count));
        let filled = false;
        const fill = async () => {
          if (filled) return;
          filled = true;
          const kids = await readAll(dir).catch(() => []);
          count.textContent = String(kids.length);
          details.append(kids.length ? await list(kids, depth + 1, dir) : h('p', { class: 'fv-empty' }, s('empty')));
        };
        details.addEventListener('toggle', () => {
          if (details.open) {
            opened.add(dir.fullPath);
            void fill();
          } else opened.delete(dir.fullPath);
        });
        if (details.open) void fill();
        ul.append(h('li', {}, details));
      } else {
        const fe = e as FileSystemFileEntry;
        const size = h('span', { class: 'fv-size' });
        void fileOf(fe).then((f) => (size.textContent = formatBytes(f.size))).catch(() => {});
        ul.append(
          h('li', {}, h('button', { type: 'button', class: 'fv-file', onclick: () => void openEntry(fe, entries, dirOf).then((f) => ctx.openFile(f)).catch((err) => alertBox(ctx, String((err as Error)?.message ?? err))) }, h('span', { class: 'fv-name' }, fe.name), size)),
        );
      }
    }
    return ul;
  };

  ctx.mount.replaceChildren(
    h('div', { class: 'view view-folder' }, h('p', { class: 'fv-hint' }, s('hint')), top.length ? await list(top, 0) : h('p', { class: 'fv-empty' }, s('empty'))),
  );
  return { meta: () => [s('folder'), `${top.length} ${s('items')}`] };
}

/** Not used for files (the shell calls openFolder); present to satisfy the viewer contract. */
export async function open(): Promise<OpenedView> {
  throw new Error('folder view opens folders only');
}
