/**
 * Basic editing for simple text formats (text, logs, Markdown, JSON/XML/YAML/INI, subtitles,
 * code, CSV/TSV). Safe first:
 *  - the original file is never changed: "Save a copy" writes a new file;
 *  - the copy keeps the original's encoding, byte-order mark and line endings;
 *  - CSV rows you did not touch are written back exactly as they were;
 *  - characters the original encoding cannot store are reported, never replaced by "?";
 *  - leaving with unsaved changes asks first.
 */
import './edit.css';
import { h } from '../../../../core/dom';
import { strings } from '../../../../core/i18n';
import type { TextSource } from '../text-source';
import { rebuild, records, type Record } from './csv';
import { copyName, downloadCopy, encodeLike, eolOf, unencodable, type TextFormat } from './save';

const s = strings({
  edit: { en: 'Edit', zh: '编辑' },
  editTitle: { en: 'Edit this file; your changes are saved as a new copy, the original is never changed', zh: '编辑这个文件；修改会另存为新副本，原文件不会被改动' },
  save: { en: 'Save a copy', zh: '另存副本' },
  cancel: { en: 'Cancel', zh: '取消' },
  done: { en: 'Done', zh: '完成' },
  addRow: { en: '+ Add row', zh: '+ 添加一行' },
  deleteRow: { en: 'Delete this row', zh: '删除这一行' },
  editing: { en: 'Editing — the original file stays unchanged. “Save a copy” saves {name} in {enc}.', zh: '正在编辑——原文件保持不变。“另存副本”会保存为 {name}（{enc}）。' },
  saved: { en: 'Saved {name} (see your downloads). The original file is unchanged.', zh: '已保存 {name}（见“下载”文件夹）。原文件未改动。' },
  repairedNote: { en: 'The repaired text is saved as UTF-8.', zh: '修复后的文字将保存为 UTF-8。' },
  badChars: { en: 'These characters cannot be saved in {enc}: {chars}\n\nSave the copy as UTF-8 instead? (Most programs read UTF-8; the original stays as it is.)', zh: '这些字符无法保存为 {enc}：{chars}\n\n改为把副本保存为 UTF-8 吗？（大多数软件都能读 UTF-8；原文件保持不变。）' },
  leave: { en: 'You have unsaved changes. Leave without saving a copy?', zh: '有未保存的修改。不另存副本就离开吗？' },
  tooBig: { en: 'Files over 20 MB are not edited here (the browser would be slow).', zh: '超过 20 MB 的文件不在这里编辑（浏览器会很慢）。' },
  tableTooBig: { en: 'Large table: edited as text.', zh: '表格较大：以文本方式编辑。' },
});

export const EDIT_LIMIT = 20 * 1024 * 1024;
const TABLE_LIMIT = 5000;

export interface EditOptions {
  src: TextSource;
  name: string;
  mount: HTMLElement;
  /** 'table' for CSV/TSV (cells), 'text' for everything else. */
  mode: 'text' | 'table';
  delimiter?: string;
  /** Redraw the normal (reading) view. */
  redraw(): void | Promise<void>;
  refreshChrome(): void;
}

export interface Editing {
  /** Toolbar controls: "Edit", or "Save a copy" + "Cancel" while editing. */
  tools(): HTMLElement[];
  notice(): HTMLElement | null;
  unsaved(): boolean;
  active(): boolean;
}

/** Is this source editable here? (shown in full, not too large) */
export function canEdit(src: TextSource): boolean {
  return !src.partial && (src.bytes?.length ?? src.text.length) <= EDIT_LIMIT;
}

export function editing(o: EditOptions): Editing {
  let active = false;
  let dirty = false;
  let lastSaved = '';
  let getText: () => string = () => '';
  let message: HTMLElement | null = null;

  // What is edited and how it is saved: the file's own text in its own encoding, or —
  // when FormatReader repaired 乱码 — the repaired text, saved as UTF-8.
  const repaired = !!o.src.repair && !o.src.showOriginal;
  const startText = () => (repaired ? o.src.text : o.src.original).replace(/\r\n|\r/g, '\n');
  const format = (): TextFormat => {
    const about = o.src.about();
    return repaired ? { encoding: 'utf-8', bom: false, eol: eolOf(o.src.original) } : { encoding: o.src.encoding, bom: !!about.bom, eol: eolOf(o.src.original) };
  };
  const encName = () => format().encoding.toUpperCase().replace('GB18030', 'GBK');

  const guard = (e: BeforeUnloadEvent) => {
    if (dirty) e.preventDefault();
  };

  const start = () => {
    active = true;
    dirty = false;
    window.addEventListener('beforeunload', guard);
    const text = startText();
    const onInput = () => {
      dirty = true;
      message = null;
    };
    if (o.mode === 'table' && o.delimiter) {
      const { list, trailingBreak } = records(text, o.delimiter);
      if (list.length <= TABLE_LIMIT) {
        getText = tableEditor(o.mount, list, o.delimiter, trailingBreak, onInput);
      } else {
        getText = textEditor(o.mount, text, onInput);
        message = h('div', { class: 'notice subtle' }, s('tableTooBig'));
      }
    } else getText = textEditor(o.mount, text, onInput);
    o.refreshChrome();
  };

  const stop = async () => {
    if (dirty && !confirm(s('leave'))) return;
    active = false;
    dirty = false;
    message = null;
    window.removeEventListener('beforeunload', guard);
    await o.redraw();
    o.refreshChrome();
  };

  const save = () => {
    const text = getText();
    let f = format();
    let bytes = encodeLike(text, f);
    if (!bytes) {
      const bad = unencodable(text, f.encoding).slice(0, 12).join(' ');
      if (!confirm(s('badChars').replace(/\{enc\}/g, encName()).replace('{chars}', bad))) return;
      f = { ...f, encoding: 'utf-8', bom: true };
      bytes = encodeLike(text, f)!;
    }
    const name = copyName(o.name || 'pasted.txt', o.src.bytes?.length === 0, o.mode === 'table');
    downloadCopy(bytes, name, o.mode === 'table' ? 'text/csv' : 'text/plain');
    dirty = false;
    lastSaved = name;
    message = h('div', { class: 'notice' }, s('saved').replace('{name}', name));
    o.refreshChrome();
  };

  return {
    tools: () => {
      if (!canEdit(o.src)) return [];
      if (!active) return [h('button', { type: 'button', class: 'btn', title: s('editTitle'), onclick: start }, '✏️ ', s('edit'))];
      return [
        h('button', { type: 'button', class: 'btn btn-primary', onclick: save }, s('save')),
        h('button', { type: 'button', class: 'btn', onclick: () => void stop() }, lastSaved && !dirty ? s('done') : s('cancel')),
      ];
    },
    notice: () => {
      if (!active) return null;
      if (message) return message;
      const text = s('editing').replace('{name}', copyName(o.name || 'pasted.txt', o.src.bytes?.length === 0, o.mode === 'table')).replace('{enc}', encName());
      return h('div', { class: 'notice subtle' }, repaired ? `${text} ${s('repairedNote')}` : text);
    },
    unsaved: () => active && dirty,
    active: () => active,
  };
}

function textEditor(mount: HTMLElement, text: string, onInput: () => void): () => string {
  const area = h('textarea', { class: 'ed-text', spellcheck: 'false', wrap: 'off', 'aria-label': s('edit') }) as HTMLTextAreaElement;
  area.value = text;
  area.addEventListener('input', onInput);
  // Tab inserts a tab (code, TSV) instead of leaving the editor.
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      area.setRangeText('\t', area.selectionStart, area.selectionEnd, 'end');
      onInput();
    }
  });
  mount.replaceChildren(h('div', { class: 'view view-edit' }, area));
  area.focus({ preventScroll: true });
  return () => area.value;
}

function tableEditor(mount: HTMLElement, list: Record[], delim: string, trailingBreak: boolean, onInput: () => void): () => string {
  // Each row remembers which original record it came from (null = new row).
  const rows: Array<{ origin: number | null; cells: string[] }> = list.map((r, i) => ({ origin: i, cells: [...r.cells] }));
  const cols = Math.max(1, ...rows.map((r) => r.cells.length));
  const tbody = h('tbody');
  const rowEl = (row: (typeof rows)[number]) => {
    const tr = h('tr', {}, h('td', { class: 'ed-rownum' }, h('button', { type: 'button', class: 'ed-del', title: s('deleteRow'), 'aria-label': s('deleteRow') }, '×')));
    tr.querySelector('.ed-del')!.addEventListener('click', () => {
      rows.splice(rows.indexOf(row), 1);
      tr.remove();
      onInput();
    });
    for (let c = 0; c < Math.max(cols, row.cells.length); c++) {
      const td = h('td', { contenteditable: 'plaintext-only', class: 'ed-cell' }, row.cells[c] ?? '');
      td.addEventListener('input', () => {
        while (row.cells.length <= c) row.cells.push('');
        row.cells[c] = td.innerText.replace(/\n$/, '');
        onInput();
      });
      tr.append(td);
    }
    return tr;
  };
  for (const row of rows) tbody.append(rowEl(row));
  const add = h('button', { type: 'button', class: 'btn ed-add' }, s('addRow'));
  add.addEventListener('click', () => {
    const row = { origin: null, cells: new Array<string>(cols).fill('') };
    rows.push(row);
    const tr = rowEl(row);
    tbody.append(tr);
    (tr.querySelector('.ed-cell') as HTMLElement | null)?.focus();
    onInput();
  });
  mount.replaceChildren(h('div', { class: 'view view-edit' }, h('div', { class: 'ed-table-wrap' }, h('table', { class: 'ed-table' }, tbody)), add));
  return () => rebuild(list, rows, delim, trailingBreak);
}
