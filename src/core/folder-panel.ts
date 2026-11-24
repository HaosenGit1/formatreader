/**
 * Quick access: clicking the crystal ball (with Quick access on) opens this glass panel instead
 * of the browser's file chooser: the frequent files, then the usual folder's files to open with
 * one click, and "Elsewhere…" for the ordinary chooser. View only; names are shown on this device
 * and never kept or sent. Loaded only when used.
 */
import { formatBytes, h } from './dom';
import { strings } from './i18n';
import { ago, ext, getFolder, listRecent, note, pickFolder, remember, reopenEntry, ribbon } from './recent';
import type { FileLink, FolderLink } from './recent-capture';

const s = strings({
  title: { en: 'Quick access', zh: '快捷打开' },
  frequent: { en: 'Frequent files', zh: '常用文件' },
  choose: { en: 'Choose a usual folder', zh: '选常用文件夹' },
  change: { en: 'Change', zh: '更换' },
  allow: { en: 'Allow viewing “{name}”', zh: '允许查看「{name}」' },
  missing: { en: 'Folder not found', zh: '找不到这个文件夹' },
  emptyDir: { en: 'Empty folder', zh: '空文件夹' },
  more: { en: '{n} more not shown', zh: '另有 {n} 项未显示' },
  elsewhere: { en: 'Elsewhere…', zh: '其他位置…' },
  close: { en: 'Close', zh: '关闭' },
  failed: { en: 'This file could not be read.', zh: '无法读取这个文件。' },
});

/** Rows drawn at most (a huge folder stays quick). */
const SHOWN = 500;

type Item = FileLink | FolderLink;

export async function openQuickPanel(o: { open: (files: File[]) => void; elsewhere: () => void }): Promise<void> {
  document.querySelector('dialog.quick-panel')?.remove();
  const body = h('div', { class: 'quick-body' });
  const dialog = h(
    'dialog',
    { class: 'quick-panel', 'aria-label': s('title'), onclick: (e: Event) => e.target === dialog && dialog.close() },
    h(
      'div',
      { class: 'quick-inner' },
      h(
        'div',
        { class: 'quick-head' },
        h('h2', { class: 'quick-title' }, ribbon('quick-ribbon'), s('title')),
        h('button', { type: 'button', class: 'quick-x', 'aria-label': s('close'), title: s('close'), onclick: () => dialog.close() }, '×'),
      ),
      body,
      h(
        'button',
        {
          type: 'button',
          class: 'quick-elsewhere',
          onclick: () => {
            dialog.close();
            o.elsewhere();
          },
        },
        s('elsewhere'),
      ),
    ),
  ) as HTMLDialogElement;
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();

  const openFile = async (link: FileLink) => {
    try {
      const file = await link.getFile();
      void remember([link]);
      dialog.close();
      o.open([file]);
    } catch {
      note(s('failed'));
    }
  };

  // ---- frequent files
  const frequent = h('section', { class: 'quick-frequent' });
  const drawFrequent = async () => {
    const list = await listRecent();
    frequent.replaceChildren(
      ...(list.length
        ? [
            h('h3', { class: 'quick-label' }, s('frequent')),
            h(
              'ul',
              { class: 'quick-chips' },
              ...list.map((e) =>
                h(
                  'li',
                  {},
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'quick-chip',
                      title: `${e.name} · ${ago(e.at)}`,
                      onclick: () =>
                        void reopenEntry(
                          e,
                          (files) => {
                            dialog.close();
                            o.open(files);
                          },
                          () => void drawFrequent(),
                        ),
                    },
                    h('span', { class: 'recent-ext', 'aria-hidden': 'true' }, ext(e.name)),
                    h('span', { class: 'quick-chip-name' }, e.name),
                  ),
                ),
              ),
            ),
          ]
        : []),
    );
  };

  // ---- the usual folder
  const folderBox = h('section', { class: 'quick-folder' });
  let trail: FolderLink[] = [];

  const chooseButton = () =>
    h(
      'button',
      {
        type: 'button',
        class: 'quick-choose',
        onclick: () =>
          void pickFolder().then((ok) => {
            if (ok) void showFolder();
          }),
      },
      '📁 ',
      s('choose'),
    );

  const crumbs = () =>
    h(
      'div',
      { class: 'quick-crumbs' },
      h(
        'nav',
        { class: 'quick-path' },
        ...trail.flatMap((f, i) => [
          i ? h('span', { class: 'quick-sep', 'aria-hidden': 'true' }, '›') : h('span', { class: 'quick-folder-icon', 'aria-hidden': 'true' }, '📁'),
          i < trail.length - 1
            ? h('button', { type: 'button', class: 'quick-crumb', onclick: () => ((trail = trail.slice(0, i + 1)), void list()) }, f.name)
            : h('span', { class: 'quick-crumb quick-here' }, f.name),
        ]),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'quick-change',
          onclick: () =>
            void pickFolder().then((ok) => {
              if (ok) void showFolder();
            }),
        },
        s('change'),
      ),
    );

  async function list() {
    const here = trail[trail.length - 1];
    const rows = h('ul', { class: 'quick-list', role: 'list' });
    folderBox.replaceChildren(crumbs(), rows);
    const items: Item[] = [];
    try {
      for await (const it of here.values()) {
        if (!it.name.startsWith('.')) items.push(it);
        if (items.length > 5000) break;
      }
    } catch {
      folderBox.replaceChildren(h('p', { class: 'quick-msg' }, s('missing')), chooseButton());
      return;
    }
    const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    items.sort((a, b) => (a.kind === b.kind ? byName.compare(a.name, b.name) : a.kind === 'directory' ? -1 : 1));
    if (!items.length) rows.append(h('li', { class: 'quick-msg' }, s('emptyDir')));
    const facts: Array<[FileLink, HTMLElement]> = [];
    for (const it of items.slice(0, SHOWN)) {
      const meta = h('span', { class: 'quick-meta' });
      if (it.kind === 'file') facts.push([it as FileLink, meta]);
      rows.append(
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: `quick-row${it.kind === 'directory' ? ' quick-dir' : ''}`,
              title: it.name,
              onclick: () => {
                if (it.kind === 'directory') {
                  trail.push(it as FolderLink);
                  void list();
                } else void openFile(it as FileLink);
              },
            },
            it.kind === 'directory' ? h('span', { class: 'quick-dir-icon', 'aria-hidden': 'true' }, '📁') : h('span', { class: 'recent-ext', 'aria-hidden': 'true' }, ext(it.name)),
            h('span', { class: 'quick-name' }, it.name),
            meta,
          ),
        ),
      );
    }
    if (items.length > SHOWN) rows.append(h('li', { class: 'quick-msg' }, s('more').replace('{n}', String(items.length - SHOWN))));
    // Size and date, filled in after the names show (a few at a time).
    for (let i = 0; i < facts.length && rows.isConnected; i += 24) {
      await Promise.all(
        facts.slice(i, i + 24).map(async ([link, meta]) => {
          try {
            const f = await link.getFile();
            meta.textContent = `${formatBytes(f.size)} · ${new Date(f.lastModified).toLocaleDateString()}`;
          } catch {
            /* leave it blank */
          }
        }),
      );
    }
  }

  async function showFolder() {
    const folder = await getFolder();
    if (!folder) {
      folderBox.replaceChildren(chooseButton());
      return;
    }
    let ok: PermissionState = 'denied';
    try {
      ok = await folder.queryPermission({ mode: 'read' });
    } catch {
      folderBox.replaceChildren(h('p', { class: 'quick-msg' }, s('missing')), chooseButton());
      return;
    }
    trail = [folder];
    if (ok === 'granted') return void list();
    // After a browser restart the browser asks once (it needs a click).
    folderBox.replaceChildren(
      h(
        'button',
        {
          type: 'button',
          class: 'quick-choose',
          onclick: async () => {
            const got = await folder.requestPermission({ mode: 'read' }).catch(() => 'denied' as PermissionState);
            if (got === 'granted') void list();
          },
        },
        '📁 ',
        s('allow').replace('{name}', folder.name),
      ),
    );
  }

  body.append(frequent, folderBox);
  await Promise.all([drawFrequent(), showFolder()]);
}
