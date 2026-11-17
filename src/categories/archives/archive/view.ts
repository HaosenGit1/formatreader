/**
 * Archives (ZIP, RAR, 7Z, TAR, ISO, CAB, XZ, BZ2…) with libarchive in a
 * background worker: a file list where any file opens in FormatReader.
 * CBR/CB7 comics: the pages are repacked as CBZ and open in the book reader.
 */
import './archive.css';
import { formatBytes, h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import pkg from 'libarchive.js/package.json';

const s = strings({
  files: { en: 'files', zh: '个文件' },
  hint: { en: 'Click a file to open it here. Nothing is uploaded.', zh: '点击文件即可在这里打开，不会上传任何内容。' },
  password: { en: 'This archive is password-protected.', zh: '这个压缩包设置了密码。' },
  enter: { en: 'Password', zh: '密码' },
  unlock: { en: 'Open', zh: '打开' },
  wrong: { en: 'That password did not work.', zh: '密码不正确。' },
  empty: { en: 'This archive is empty.', zh: '这个压缩包是空的。' },
  name: { en: 'Name', zh: '名称' },
  size: { en: 'Size', zh: '大小' },
  noPages: { en: 'No comic pages (images) were found in this archive.', zh: '这个压缩包里没有找到漫画页（图片）。' },
  cannot: { en: 'This file could not be extracted:', zh: '无法解压这个文件：' },
  encrypted: { en: 'It is encrypted in a way that cannot be opened here (e.g. encrypted RAR5).', zh: '它使用了这里无法打开的加密方式（例如加密的 RAR5）。' },
});

type LibArchive = typeof import('libarchive.js');
let lib: Promise<LibArchive['Archive']> | null = null;
function archiveLib() {
  lib ??= import('libarchive.js').then(({ Archive }) => {
    // The worker and its WebAssembly are copied to /vendor by scripts/copy-vendor.mjs.
    Archive.init({ workerUrl: new URL(`vendor/libarchive-js-${pkg.version}/worker-bundle.js`, document.baseURI).href });
    return Archive;
  });
  return lib;
}

export const preload = () => archiveLib();

const IMAGE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
/** Natural order: page2 before page10. */
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

interface Entry {
  path: string;
  name: string;
  size: number;
  extract(): Promise<File>;
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const Archive = await archiveLib();
  const archive = await Archive.open(file);
  const isComic = ['cbr', 'cb7', 'cbt'].includes(ctx.format?.id ?? '') || /\.(cbr|cb7|cbt)$/i.test(file.name);

  const list = async (): Promise<Entry[]> =>
    (await archive.getFilesArray()).map(({ file: f, path }) => {
      const cf = f as unknown as { name: string; size: number; extract(): Promise<File> };
      return { path: `${path}${cf.name}`, name: cf.name, size: cf.size, extract: () => cf.extract() };
    });

  const body = h('div', { class: 'archive-body' });
  ctx.mount.replaceChildren(h('div', { class: 'view view-archive' }, body));
  let entries: Entry[] = [];

  const error = h('p', { class: 'archive-error', role: 'alert' });
  const openEntry = async (e: Entry) => {
    error.textContent = '';
    try {
      ctx.openFile(await e.extract());
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      error.textContent = `${s('cannot')} ${e.name}. ${/encrypt|password|block header|passphrase/i.test(msg) ? s('encrypted') : msg}`;
    }
  };

  const showList = () => {
    if (!entries.length) {
      body.replaceChildren(h('p', { class: 'archive-empty' }, s('empty')));
      return;
    }
    const sorted = [...entries].sort((a, b) => natural(a.path, b.path));
    body.replaceChildren(
      h('p', { class: 'archive-hint' }, s('hint')),
      error,
      h(
        'table',
        { class: 'archive-list' },
        h('thead', {}, h('tr', {}, h('th', {}, s('name')), h('th', { class: 'num' }, s('size')))),
        h(
          'tbody',
          {},
          ...sorted.map((e) =>
            h(
              'tr',
              {},
              h('td', {}, h('button', { type: 'button', class: 'archive-open', title: e.path, onclick: () => openEntry(e) }, h('span', { class: 'archive-dir' }, e.path.slice(0, e.path.length - e.name.length)), e.name)),
              h('td', { class: 'num' }, formatBytes(e.size)),
            ),
          ),
        ),
      ),
    );
  };

  const openComic = async () => {
    const pages = entries.filter((e) => IMAGE.test(e.name)).sort((a, b) => natural(a.path, b.path));
    if (!pages.length) throw new Error(s('noPages'));
    const { zipSync } = await import('fflate');
    const contents: Record<string, [Uint8Array, { level: 0 }]> = {};
    for (const [i, p] of pages.entries()) {
      const data = new Uint8Array(await (await p.extract()).arrayBuffer());
      contents[`${String(i + 1).padStart(4, '0')}-${p.name}`] = [data, { level: 0 }];
    }
    const cbz = zipSync(contents);
    ctx.openFile(new File([cbz as BlobPart], file.name.replace(/\.(cbr|cb7|cbt)$/i, '') + '.cbz'));
  };

  const load = async () => {
    if (!entries.length) entries = await list();
    if (isComic) await openComic();
    else showList();
  };

  const passwordForm = (onUnlocked: () => Promise<void>) => {
    const input = h('input', { type: 'password', class: 'archive-pass', 'aria-label': s('enter'), placeholder: s('enter') }) as HTMLInputElement;
    const msg = h('p', { class: 'archive-error' });
    const form = h(
      'form',
      {
        class: 'archive-lock',
        onsubmit: async (e: Event) => {
          e.preventDefault();
          try {
            await archive.usePassword(input.value);
            // Prove the password by extracting the first file.
            if (entries[0]) await entries[0].extract();
            await onUnlocked();
          } catch {
            msg.textContent = s('wrong');
          }
        },
      },
      h('p', {}, s('password')),
      input,
      h('button', { type: 'submit', class: 'btn btn-primary' }, s('unlock')),
      msg,
    );
    body.replaceChildren(form);
    setTimeout(() => input.focus(), 0);
  };

  // Names may be readable while contents are encrypted: ask before opening anything.
  entries = await list();
  if ((await archive.hasEncryptedData()) === true) passwordForm(load);
  else await load();

  const kind = (ctx.format?.name ?? 'Archive').replace(/ archive$/i, '');
  return {
    meta: () => [kind, ...(entries.length ? [`${entries.length} ${s('files')}`] : [])],
    destroy: () => void archive.close(),
  };
}
