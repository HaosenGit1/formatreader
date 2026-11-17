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
import { DELIMITED_EXT } from './formats';
import { parseDelimited, sniffDelimiter } from './delimited';

const s = strings({
  rows: { en: 'rows', zh: '行' },
  columns: { en: 'columns', zh: '列' },
  sheets: { en: 'sheets', zh: '个工作表' },
  hidden: { en: 'hidden', zh: '隐藏' },
  empty: { en: 'This sheet is empty.', zh: '这个工作表是空的。' },
  password: { en: 'This spreadsheet is password-protected and cannot be opened.', zh: '这个表格设置了密码，无法打开。' },
  partial: { en: 'Charts and pictures inside the sheet are not shown yet. Formulas show their saved results (hover a cell to see the formula).', zh: '表格中的图表和图片暂不显示。公式显示保存时的结果（鼠标悬停可查看公式）。' },
  comma: { en: 'Comma', zh: '逗号' },
  tab: { en: 'Tab', zh: '制表符' },
});

const extOf = (name: string) => /\.([a-z0-9]{1,8})$/i.exec(name)?.[1]?.toLowerCase() ?? '';

// ---------------------------------------------------------------------------
// CSV / TSV
// ---------------------------------------------------------------------------

async function openDelimited(file: File, ctx: OpenContext): Promise<OpenedView> {
  const src = await readText(file, ctx.mount);
  if (!isSource(src)) return src;
  const ext = extOf(file.name);
  let delimiter = ',';
  let rows: string[][] = [];

  const draw = () => {
    const text = src.text;
    delimiter = ext === 'tsv' || ext === 'tab' ? '\t' : ext === 'psv' ? '|' : sniffDelimiter(text.slice(0, 20000));
    rows = parseDelimited(text, delimiter, 1_000_000);
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
  return {
    meta: () => [
      delimiter === '\t' ? 'TSV' : 'CSV',
      `${formatCount(Math.max(0, rows.length - 1))} ${s('rows')}`,
      delimName(),
    ],
    tools: () => {
      const enc = src.tool(changed);
      return enc ? [enc] : [];
    },
    notices: () => src.notices(changed),
    onFontScale: () => {},
    onLangChange: () => draw(),
  };
}

// ---------------------------------------------------------------------------
// Spreadsheets via SheetJS
// ---------------------------------------------------------------------------

/** Formats that may store text in legacy code pages (need SheetJS's code-page tables). */
const NEEDS_CODEPAGES = new Set(['xls', 'et', 'xlw', 'dbf', 'wk1', 'wk3', 'wk4', 'wks', 'wq1', 'qpw', 'dif', 'slk', 'sylk', 'prn', 'xlt']);

type XLSXModule = typeof import('xlsx');
type WorkSheet = import('xlsx').WorkSheet;

/** Last row/column that actually has content (sheets often claim huge empty ranges). */
function usedSize(XLSX: XLSXModule, ws: WorkSheet): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue;
    const cell = ws[key];
    if (cell == null || (cell.v === undefined && !cell.f)) continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (r + 1 > rows) rows = r + 1;
    if (c + 1 > cols) cols = c + 1;
  }
  for (const m of (ws['!merges'] ?? []) as Array<{ e: { r: number; c: number } }>) {
    rows = Math.max(rows, m.e.r + 1);
    cols = Math.max(cols, m.e.c + 1);
  }
  return { rows, cols };
}

async function openWorkbook(file: File, ctx: OpenContext): Promise<OpenedView> {
  const ext = extOf(file.name);
  const XLSX = await import('xlsx');
  if (NEEDS_CODEPAGES.has(ext)) {
    const cptable = await import('xlsx/dist/cpexcel.full.mjs');
    XLSX.set_cptable(cptable);
  }

  let wb: import('xlsx').WorkBook;
  try {
    wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellFormula: true, cellStyles: false, dense: false });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/password|encrypt/i.test(msg)) throw new Error(s('password'));
    throw e;
  }

  const names = wb.SheetNames;
  const hiddenFlags = (wb.Workbook?.Sheets ?? []).map((sh) => !!sh.Hidden);
  let active = Math.max(0, hiddenFlags.findIndex((hdn) => !hdn));
  const tabs = h('div', { class: 'sheet-tabs', role: 'tablist' });
  const body = h('div', { class: 'sheet-body' });
  ctx.mount.replaceChildren(h('div', { class: 'view view-sheet' }, body, names.length > 1 ? tabs : null));
  let size = { rows: 0, cols: 0 };

  const cellOf = (ws: WorkSheet, r: number, c: number): GridCell | null => {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (!cell) return null;
    let text: string;
    if (cell.w !== undefined) text = cell.w;
    else if (cell.v instanceof Date) text = cell.v.toLocaleString();
    else text = cell.v == null ? '' : String(cell.v);
    return { text, numeric: cell.t === 'n' || cell.t === 'd', title: cell.f ? `=${cell.f}` : undefined };
  };

  const drawSheet = () => {
    const ws = wb.Sheets[names[active]];
    size = ws ? usedSize(XLSX, ws) : { rows: 0, cols: 0 };
    if (!ws || size.rows === 0) {
      body.replaceChildren(h('div', { class: 'sheet-empty' }, s('empty')));
    } else {
      const widths = ((ws['!cols'] ?? []) as Array<{ wch?: number; width?: number } | undefined>).map((col) => col?.wch ?? col?.width);
      body.replaceChildren(
        renderGrid({
          rows: size.rows,
          cols: size.cols,
          header: 'letters',
          cell: (r, c) => cellOf(ws, r, c),
          merges: ws['!merges'] as GridCellMerge[] | undefined,
          widths,
        }),
      );
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
    notices: () => [h('div', { class: 'notice subtle' }, s('partial'))],
    onFontScale: () => {},
    onLangChange: () => drawSheet(),
  };
}

type GridCellMerge = { s: { r: number; c: number }; e: { r: number; c: number } };

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const ext = extOf(file.name);
  if (DELIMITED_EXT.has(ext)) return openDelimited(file, ctx);
  return openWorkbook(file, ctx);
}
