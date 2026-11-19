/**
 * Sheets viewer: CSV/TSV (with encoding detection) and spreadsheets
 * (XLSX/XLSM/XLSB/XLS/ODS/Numbers/WPS ET/DBF/SYLK/DIF/Lotus/SpreadsheetML…).
 */
import './sheets.css';
import { formatCount, h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { renderGrid, type GridCell } from '../shared/grid';
import { isSource, readText } from '../shared/read';
import { editing } from '../shared/edit/editor';
import { DELIMITED_EXT } from './formats';
import { CHUNK_ROWS, type RowChunk, type SheetInfo, type SheetReport } from './sheet-job';
import { runWorker } from '../../../core/progress';
import { drawingExtent as drawingExtentOf } from './drawings';
import { layDrawings } from './drawings-layer';
import { parseDelimited, sniffDelimiter } from './delimited';
import { limit } from '../../../core/limits';

const s = strings({
  rows: { en: 'rows', zh: '行' },
  columns: { en: 'columns', zh: '列' },
  sheets: { en: 'sheets', zh: '个工作表' },
  hidden: { en: 'hidden', zh: '隐藏' },
  empty: { en: 'This sheet is empty.', zh: '这个工作表是空的。' },
  password: { en: 'This spreadsheet is password-protected. Enter its password to open it here (it stays on this computer).', zh: '这个表格设置了密码。输入密码即可在这里打开（密码只留在这台电脑上）。' },
  passwordLabel: { en: 'Password', zh: '密码' },
  unlock: { en: 'Open', zh: '打开' },
  wrongPassword: { en: 'That password is not right.', zh: '密码不正确。' },
  firstRows: { en: 'Large workbook: only the first {n} rows of each sheet are read on this device, so it opens smoothly.', zh: '大工作簿：在这台设备上每个工作表只读取前 {n} 行，以便流畅打开。' },
  allRows: { en: 'Load all rows', zh: '加载全部行' },
  stepParse: { en: 'Reading the workbook…', zh: '正在读取工作簿…' },
  stepRows: { en: 'Preparing rows…', zh: '正在准备数据行…' },
  partial: { en: 'Formulas show their saved results (hover a cell to see the formula).', zh: '公式显示保存时的结果（鼠标悬停可查看公式）。' },
  partialOld: { en: 'Pictures and charts in this file format are not shown yet. Formulas show their saved results (hover a cell to see the formula).', zh: '这种格式中的图片和图表暂不显示。公式显示保存时的结果（鼠标悬停可查看公式）。' },
  drawn: { en: 'Pictures and charts are shown where they sit in the sheet (click a picture to open it full size). Charts are redrawn from their saved values, so styling may differ a little. Formulas show their saved results.', zh: '图片和图表显示在表格中原来的位置（点击图片可放大查看）。图表按保存的数据重新绘制，样式可能略有不同。公式显示保存时的结果。' },
  comma: { en: 'Comma', zh: '逗号' },
  tab: { en: 'Tab', zh: '制表符' },
});

const extOf = (name: string) => /\.([a-z0-9]{1,8})$/i.exec(name)?.[1]?.toLowerCase() ?? '';

// ---------------------------------------------------------------------------
// CSV / TSV
// ---------------------------------------------------------------------------

async function openDelimited(file: File, ctx: OpenContext): Promise<OpenedView> {
  const src = await readText(file, ctx.mount, () => ctx.openFile(file, { replace: true }), ctx.progress);
  if (!isSource(src)) return src;
  const ext = extOf(file.name);
  let delimiter = ',';
  let rows: string[][] = [];

  const draw = () => {
    const text = src.text;
    // Excel writes "sep=;" as the first line to name the delimiter: honour it, don't show it.
    const sep = /^\uFEFF?sep=(.)\s*(?:\r?\n|$)/i.exec(text.slice(0, 20));
    delimiter = sep ? sep[1] : ext === 'tsv' || ext === 'tab' ? '\t' : ext === 'psv' ? '|' : sniffDelimiter(text.slice(0, 20000));
    rows = parseDelimited(sep ? text.slice(sep[0].length) : text, delimiter, 1_000_000);
    while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
    const cols = Math.max(0, ...rows.slice(0, 2000).map((r) => r.length));
    ctx.mount.replaceChildren(
      h(
        'div',
        { class: 'view view-sheet' },
        renderGrid({ rows: rows.length, cols, header: 'first-row', cell: (r, c) => rows[r]?.[c] ?? '' }),
      ),
    );
  };
  const changed = () => {
    draw();
    ctx.refreshChrome();
  };
  draw();

  const delimName = () => (delimiter === '\t' ? s('tab') : delimiter === ',' ? s('comma') : `"${delimiter}"`);
  const ed = editing({ src, name: file.name, mount: ctx.mount, mode: 'table', get delimiter() { return delimiter; }, redraw: draw, refreshChrome: ctx.refreshChrome, openFile: (f) => void ctx.openFile(f) });
  return {
    meta: () => [
      delimiter === '\t' ? 'TSV' : 'CSV',
      `${formatCount(Math.max(0, rows.length - 1))} ${s('rows')}`,
      delimName(),
    ],
    tools: () => {
      if (ed.active()) return ed.tools();
      const enc = src.tool(changed);
      return [...ed.tools(), ...(enc ? [enc] : [])];
    },
    about: () => src.about(),
    notices: () => (ed.active() ? [ed.notice()].filter((n): n is HTMLElement => !!n) : src.notices(changed)),
    unsaved: () => ed.unsaved(),
    onFontScale: () => {},
    onLangChange: () => draw(),
  };
}

// ---------------------------------------------------------------------------
// Spreadsheets via SheetJS
// ---------------------------------------------------------------------------

/** Formats that may store text in legacy code pages (need SheetJS's code-page tables). */


/** Workbooks the user asked to read in full (kept while the page is open). */
const allRows = new WeakSet<File>();

async function openWorkbook(file: File, ctx: OpenContext, password?: string): Promise<OpenedView> {
  const ext = extOf(file.name);
  // Large workbook on a phone or tablet: read only the first rows of each sheet (core/limits.ts).
  const rowCap = !allRows.has(file) && file.size > limit('sheetPreview') ? limit('sheetPreviewRows') : 0;
  const data = await file.arrayBuffer();
  // Read in the background (website) or on the page (portable file), rows arriving in chunks.
  let infos: SheetInfo[] = [];
  const chunks: RowChunk[][] = [];
  const onInfo = (x: SheetInfo[]) => {
    infos = x;
    x.forEach((_, i) => (chunks[i] = []));
  };
  const onChunk = (c: RowChunk) => (chunks[c.sheet][c.index] = c);
  const report: SheetReport = (step, fraction) => ctx.progress?.(s(step === 'parse' ? 'stepParse' : 'stepRows'), fraction);
  // Pictures, charts and text boxes (Excel 2007+ files), read alongside the cells.
  const drawingsJob = /^(xlsx|xlsm|xltx|xltm)$/.test(ext) ? import('./drawings').then((m) => m.readDrawings(file)).catch(() => null) : Promise.resolve(null);
  try {
    if (import.meta.env.MODE === 'portable') {
      const { readSheets } = await import('./sheet-job');
      await readSheets(data, ext, report, onInfo, onChunk, password, rowCap);
    } else {
      const { startSheetWorker } = await import('./sheet-worker-host');
      await runWorker(startSheetWorker(), { data, ext, password, rows: rowCap }, [data], (step, f) => report(step as 'parse' | 'rows', f), ctx.signal, (m) => {
        const msg = m as { sheets?: SheetInfo[]; chunk?: RowChunk };
        if (msg.sheets) onInfo(msg.sheets);
        if (msg.chunk) onChunk(msg.chunk);
      });
    }
  } catch (e) {
    const msg = (e as Error)?.message;
    // An old .xls with a password: ask for it and read again.
    if (msg === 'PASSWORD' || msg === 'WRONG_PASSWORD') return askPassword(file, ctx, msg === 'WRONG_PASSWORD');
    throw e;
  }

  const drawings = await drawingsJob;
  let undraw = () => {};
  const names = infos.map((x) => x.name);
  const hiddenFlags = infos.map((x) => x.hidden);
  let active = Math.max(0, hiddenFlags.findIndex((hdn) => !hdn));
  const tabs = h('div', { class: 'sheet-tabs', role: 'tablist' });
  const body = h('div', { class: 'sheet-body' });
  ctx.mount.replaceChildren(h('div', { class: 'view view-sheet' }, body, names.length > 1 ? tabs : null));
  let size = { rows: 0, cols: 0 };

  const cellOf = (si: number, r: number, c: number): GridCell | null => {
    if (r >= infos[si].rows || c >= infos[si].cols) return null; // beyond the data (room for a chart)
    const chunk = chunks[si]?.[Math.floor(r / CHUNK_ROWS)];
    if (!chunk) return null;
    const i = (r % CHUNK_ROWS) * infos[si].cols + c;
    const text = chunk.text[i];
    const f = chunk.formulas[i];
    if (!text && !f) return null;
    return { text, numeric: chunk.flags[i] === 1, title: f };
  };

  const drawSheet = () => {
    undraw();
    undraw = () => {};
    const info = infos[active];
    const items = (info && drawings?.bySheet.get(info.name)) || [];
    size = info ? { rows: info.rows, cols: info.cols } : { rows: 0, cols: 0 };
    // The grid reaches far enough for every picture and chart.
    const reach = items.length ? (drawingExtentOf(items)) : { rows: 0, cols: 0 };
    const gridSize = { rows: Math.max(size.rows, reach.rows), cols: Math.max(size.cols, reach.cols) };
    if (!info || gridSize.rows === 0) {
      body.replaceChildren(h('div', { class: 'sheet-empty' }, s('empty')));
    } else {
      const si = active;
      body.replaceChildren(
        renderGrid({
          rows: gridSize.rows,
          cols: gridSize.cols,
          header: 'letters',
          cell: (r, c) => cellOf(si, r, c),
          merges: info.merges as GridCellMerge[] | undefined,
          // Columns without a saved width get Excel's default (8.43 characters), so pictures and
          // charts over empty columns keep their shape.
          widths: items.length ? Array.from({ length: gridSize.cols }, (_, c) => info.widths[c] ?? 8.43) : info.widths,
        }),
      );
      const wrap = body.querySelector<HTMLElement>('.table-wrap');
      if (wrap && items.length) {
        undraw = layDrawings(wrap, items, (pic) => ctx.openFile(new File([pic.blob], pic.name, { type: pic.blob.type })));
      }
    }
    tabs.replaceChildren(
      ...names.map((name, i) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: `sheet-tab${i === active ? ' active' : ''}${hiddenFlags[i] ? ' is-hidden' : ''}`,
            'aria-selected': String(i === active),
            title: hiddenFlags[i] ? `${name} (${s('hidden')})` : name,
            onclick: () => {
              active = i;
              drawSheet();
              ctx.refreshChrome();
            },
          },
          name,
        ),
      ),
    );
  };
  drawSheet();

  const label = ext === 'ods' || ext === 'fods' ? 'OpenDocument' : ext === 'numbers' ? 'Numbers' : ext === 'et' ? 'WPS' : 'Excel';
  return {
    meta: () => [
      label,
      ...(names.length > 1 ? [`${names.length} ${s('sheets')}`] : []),
      `${formatCount(size.rows)} ${s('rows')} × ${size.cols} ${s('columns')}`,
    ],
    notices: () => [
      ...(rowCap
        ? [h('div', { class: 'notice' }, s('firstRows').replace('{n}', formatCount(rowCap)), ' ', h('button', { type: 'button', class: 'link', onclick: () => (allRows.add(file), ctx.openFile(file, { replace: true })) }, s('allRows')))]
        : []),
      h('div', { class: 'notice subtle' }, drawings?.bySheet.size ? s('drawn') : /^(xlsx|xlsm|xltx|xltm)$/.test(ext) ? s('partial') : s('partialOld')),
    ],
    destroy: () => {
      undraw();
      drawings?.revoke();
    },
    onFontScale: () => {},
    onLangChange: () => drawSheet(),
  };
}

/** Password form for old .xls files (newer locked files are handled by the "locked" viewer). */
function askPassword(file: File, ctx: OpenContext, wrong: boolean): Promise<OpenedView> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'password', class: 'locked-input', autocomplete: 'off', placeholder: s('passwordLabel'), 'aria-label': s('passwordLabel') }) as HTMLInputElement;
    const form = h(
      'form',
      {
        class: 'sheet-password',
        onsubmit: (e: Event) => {
          e.preventDefault();
          if (input.value) resolve(openWorkbook(file, ctx, input.value));
        },
      },
      h('p', {}, s('password')),
      h('div', { class: 'sheet-password-row' }, input, h('button', { type: 'submit', class: 'btn btn-primary' }, s('unlock'))),
      wrong ? h('p', { class: 'sheet-password-wrong', role: 'alert' }, s('wrongPassword')) : null,
    );
    ctx.mount.replaceChildren(h('div', { class: 'view view-sheet-locked' }, form));
    setTimeout(() => input.focus(), 0);
  });
}

type GridCellMerge = { s: { r: number; c: number }; e: { r: number; c: number } };

/** Start downloading the spreadsheet engine early (e.g. while a file is dragged). */
export const preload = () => (import.meta.env.MODE === 'portable' ? import('xlsx') : Promise.resolve());

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const ext = extOf(file.name);
  // An empty file (any table extension) opens as an empty table you can type into.
  if (DELIMITED_EXT.has(ext) || file.size === 0) return openDelimited(file, ctx);
  // Many systems (banks, ERPs) save tab-separated text and call it .xls: read it as text, with
  // encoding detection (GBK, Big5, Shift-JIS…), instead of guessing Western encoding.
  if (/^xls[xmb]?$/.test(ext) && isPlainTable(new Uint8Array(await file.slice(0, 4096).arrayBuffer()))) return openDelimited(file, ctx);
  return openWorkbook(file, ctx);
}

/** Text that is not Excel binary, ZIP, XML or HTML: a delimited table saved under an Excel name. */
export function isPlainTable(b: Uint8Array): boolean {
  if (b.length < 4) return false;
  if ((b[0] === 0xd0 && b[1] === 0xcf) || (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0x09 && b[1] === 0x08)) return false; // OLE, ZIP, BIFF
  const utf16 = (b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff);
  const text = utf16 ? new TextDecoder(b[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(b) : new TextDecoder('latin1').decode(b);
  const t = text.replace(/^\uFEFF/, '').trimStart();
  if (/^</.test(t)) return false; // HTML / SpreadsheetML: the workbook reader handles those
  if (!utf16 && b.subarray(0, 2048).includes(0)) return false;
  const lines = t.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  return lines.length >= 1 && lines.filter((l) => /[\t,;|]/.test(l)).length >= Math.min(2, lines.length);
}
