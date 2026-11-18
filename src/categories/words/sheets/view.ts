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
import { CHUNK_ROWS, type RowChunk, type SheetInfo, type SheetReport } from './sheet-job';
import { runWorker } from '../../../core/progress';
import { parseDelimited, sniffDelimiter } from './delimited';

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
  stepParse: { en: 'Reading the workbook…', zh: '正在读取工作簿…' },
  stepRows: { en: 'Preparing rows…', zh: '正在准备数据行…' },
  partial: { en: 'Charts and pictures inside the sheet are not shown yet. Formulas show their saved results (hover a cell to see the formula).', zh: '表格中的图表和图片暂不显示。公式显示保存时的结果（鼠标悬停可查看公式）。' },
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
    about: () => src.about(),
    notices: () => src.notices(changed),
    onFontScale: () => {},
    onLangChange: () => draw(),
  };
}

// ---------------------------------------------------------------------------
// Spreadsheets via SheetJS
// ---------------------------------------------------------------------------

/** Formats that may store text in legacy code pages (need SheetJS's code-page tables). */


async function openWorkbook(file: File, ctx: OpenContext, password?: string): Promise<OpenedView> {
  const ext = extOf(file.name);
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
  try {
    if (import.meta.env.MODE === 'portable') {
      const { readSheets } = await import('./sheet-job');
      await readSheets(data, ext, report, onInfo, onChunk, password);
    } else {
      const { startSheetWorker } = await import('./sheet-worker-host');
      await runWorker(startSheetWorker(), { data, ext, password }, [data], (step, f) => report(step as 'parse' | 'rows', f), ctx.signal, (m) => {
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

  const names = infos.map((x) => x.name);
  const hiddenFlags = infos.map((x) => x.hidden);
  let active = Math.max(0, hiddenFlags.findIndex((hdn) => !hdn));
  const tabs = h('div', { class: 'sheet-tabs', role: 'tablist' });
  const body = h('div', { class: 'sheet-body' });
  ctx.mount.replaceChildren(h('div', { class: 'view view-sheet' }, body, names.length > 1 ? tabs : null));
  let size = { rows: 0, cols: 0 };

  const cellOf = (si: number, r: number, c: number): GridCell | null => {
    const chunk = chunks[si]?.[Math.floor(r / CHUNK_ROWS)];
    if (!chunk) return null;
    const i = (r % CHUNK_ROWS) * infos[si].cols + c;
    const text = chunk.text[i];
    const f = chunk.formulas[i];
    if (!text && !f) return null;
    return { text, numeric: chunk.flags[i] === 1, title: f };
  };

  const drawSheet = () => {
    const info = infos[active];
    size = info ? { rows: info.rows, cols: info.cols } : { rows: 0, cols: 0 };
    if (!info || size.rows === 0) {
      body.replaceChildren(h('div', { class: 'sheet-empty' }, s('empty')));
    } else {
      const si = active;
      body.replaceChildren(
        renderGrid({
          rows: size.rows,
          cols: size.cols,
          header: 'letters',
          cell: (r, c) => cellOf(si, r, c),
          merges: info.merges as GridCellMerge[] | undefined,
          widths: info.widths,
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
  if (DELIMITED_EXT.has(ext)) return openDelimited(file, ctx);
  return openWorkbook(file, ctx);
}
