/**
 * The "Extract all" dialog: suggests a new folder (name editable) in the last-used place
 * (Downloads the first time), asks before extracting, shows progress, then says where the
 * files are. In browsers without folder access, the same steps save one ZIP.
 */
import { formatBytes, h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import { allowWrite, canWriteFolder, extractToFolder, extractToZip, freeName, lastFolder, pickFolder, rememberFolder, safeParts, saveZip, type DirHandle, type ExtractEntry, type ExtractResult } from './extract-all';

const s = strings({
  title: { en: 'Extract all', zh: '全部解压' },
  summary: { en: '{n} files · {size}', zh: '{n} 个文件 · {size}' },
  folderName: { en: 'New folder', zh: '新文件夹' },
  zipName: { en: 'ZIP file name', zh: 'ZIP 文件名' },
  location: { en: 'In', zh: '位置' },
  downloads: { en: 'Downloads (recommended)', zh: '下载（推荐）' },
  change: { en: 'Change…', zh: '更改…' },
  goesTo: { en: 'The files will be put in: {path}', zh: '文件将放在：{path}' },
  firstTime: { en: 'Your browser will ask you once to confirm the folder.', zh: '浏览器会请你确认一次这个文件夹。' },
  zipNote: { en: 'All files are saved as one ZIP in your Downloads folder, with their folders and readable names. Open the ZIP to get them.', zh: '所有文件会保存为一个 ZIP，放在“下载”文件夹里，保留子文件夹，文件名正常显示。打开这个 ZIP 即可得到文件。' },
  cancel: { en: 'Cancel', zh: '取消' },
  extract: { en: 'Extract', zh: '解压' },
  save: { en: 'Save ZIP', zh: '保存 ZIP' },
  working: { en: 'Extracting {n} of {total}…', zh: '正在解压 {n} / {total}…' },
  doneTitle: { en: '✓ Done', zh: '✓ 完成' },
  doneFolder: { en: '{n} files were extracted to:', zh: '{n} 个文件已解压到：' },
  doneZip: { en: '{n} files were saved as “{name}” in your Downloads folder.', zh: '{n} 个文件已保存为“{name}”，在“下载”文件夹里。' },
  failed: { en: '{n} could not be extracted (for example, encrypted):', zh: '{n} 个无法解压（例如已加密）：' },
  ok: { en: 'OK', zh: '好' },
  again: { en: 'Please press Extract again to confirm the folder.', zh: '请再按一次“解压”来确认文件夹。' },
  error: { en: 'Something went wrong:', zh: '出错了：' },
});

export async function openExtractDialog(entries: ExtractEntry[], baseName: string): Promise<void> {
  const folderMode = canWriteFolder();
  let place: DirHandle | null = folderMode ? ((await lastFolder()) ?? null) : null;
  const total = entries.reduce((n, e) => n + (e.size || 0), 0);

  const dialog = h('dialog', { class: 'x-dialog' }) as HTMLDialogElement;
  let busy = false;
  dialog.addEventListener('cancel', (e) => busy && e.preventDefault());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);

  // ---- step 1: where, and confirm
  const nameInput = h('input', { type: 'text', class: 'x-name', value: safeParts(baseName)[0] ?? 'archive', spellcheck: 'false' }) as HTMLInputElement;
  const placeLabel = h('span', { class: 'x-place' });
  const pathLine = h('p', { class: 'x-path' });
  const hint = h('p', { class: 'x-hint' });
  const showPlace = async () => {
    placeLabel.textContent = place ? place.name : s('downloads');
    hint.textContent = place ? '' : s('firstTime');
    let name = safeParts(nameInput.value)[0] ?? 'archive';
    // Show the real new name ("report (2)") when the folder is already accessible.
    if (place && (await place.queryPermission?.({ mode: 'readwrite' })) === 'granted') name = await freeName(place, name).catch(() => name);
    pathLine.textContent = s('goesTo').replace('{path}', `${place ? place.name : s('downloads').replace(/ \(.*\)|（.*）/, '')} › ${name}`);
  };
  nameInput.addEventListener('input', () => void showPlace());

  const change = async () => {
    try {
      place = await pickFolder(place);
      void rememberFolder(place);
      await showPlace();
    } catch {
      /* chooser closed */
    }
  };

  const go = async () => {
    const name = safeParts(nameInput.value)[0] ?? 'archive';
    if (folderMode) {
      try {
        if (!place) {
          place = await pickFolder(null);
          void rememberFolder(place);
        } else if (!(await allowWrite(place))) {
          place = await pickFolder(place);
          void rememberFolder(place);
        }
      } catch {
        // Closed the chooser, or the browser wants a fresh click before showing it.
        hint.textContent = s('again');
        return;
      }
    }
    await run(name);
  };

  const confirmView = () =>
    h(
      'form',
      { method: 'dialog', class: 'x-body', onsubmit: (e: Event) => (e.preventDefault(), void go()) },
      h('h2', {}, s('title')),
      h('p', { class: 'x-sum' }, s('summary').replace('{n}', String(entries.length)).replace('{size}', formatBytes(total))),
      h('label', { class: 'x-row' }, h('span', {}, folderMode ? s('folderName') : s('zipName')), h('span', { class: 'x-field' }, nameInput, folderMode ? null : h('span', { class: 'x-ext' }, '.zip'))),
      folderMode ? h('div', { class: 'x-row' }, h('span', {}, s('location')), h('span', { class: 'x-field' }, placeLabel, h('button', { type: 'button', class: 'btn', onclick: () => void change() }, s('change')))) : null,
      folderMode ? pathLine : h('p', { class: 'x-hint' }, s('zipNote')),
      hint,
      h('div', { class: 'x-buttons' }, h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, s('cancel')), h('button', { type: 'submit', class: 'btn btn-primary' }, folderMode ? s('extract') : s('save'))),
    );

  // ---- step 2: progress
  const run = async (name: string) => {
    busy = true;
    const bar = h('progress', { class: 'x-bar', max: String(entries.length), value: '0' }) as HTMLProgressElement;
    const text = h('p', {}, s('working').replace('{n}', '0').replace('{total}', String(entries.length)));
    dialog.replaceChildren(h('div', { class: 'x-body' }, h('h2', {}, s('title')), bar, text));
    const progress = (n: number, all: number) => {
      bar.value = n;
      text.textContent = s('working').replace('{n}', String(n)).replace('{total}', String(all));
    };
    let result: ExtractResult;
    try {
      if (folderMode && place) result = await extractToFolder(place, name, entries, progress);
      else {
        const out = await extractToZip(name, entries, progress);
        saveZip(out.blob, out.result.where);
        result = out.result;
      }
    } catch (err) {
      busy = false;
      dialog.replaceChildren(h('div', { class: 'x-body' }, h('h2', {}, s('title')), h('p', {}, `${s('error')} ${String((err as Error)?.message ?? err)}`), h('div', { class: 'x-buttons' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => dialog.close() }, s('ok')))));
      return;
    }
    busy = false;
    done(result);
  };

  // ---- step 3: where the files are
  const done = (r: ExtractResult) => {
    const okBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => dialog.close() }, s('ok'));
    dialog.replaceChildren(
      h(
        'div',
        { class: 'x-body' },
        h('h2', { class: 'x-done' }, s('doneTitle')),
        folderMode && place
          ? h('div', {}, h('p', {}, s('doneFolder').replace('{n}', String(r.written))), h('p', { class: 'x-path x-strong' }, `${place.name} › ${r.where}`))
          : h('p', {}, s('doneZip').replace('{n}', String(r.written)).replace('{name}', r.where)),
        r.failed.length ? h('div', { class: 'x-failed' }, h('p', {}, s('failed').replace('{n}', String(r.failed.length))), h('ul', {}, ...r.failed.slice(0, 20).map((f) => h('li', {}, f)))) : null,
        h('div', { class: 'x-buttons' }, okBtn),
      ),
    );
    okBtn.focus();
  };

  dialog.replaceChildren(confirmView());
  await showPlace();
  dialog.showModal();
  nameInput.select();
}
