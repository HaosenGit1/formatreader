/**
 * Reading a workbook (xlsx, xls, ods, numbers…) and turning each sheet into compact rows of
 * display text — the heavy part, run in a worker on the website so the page stays responsive,
 * with progress, and Stop works. In the portable file it runs on the page.
 */

export const CHUNK_ROWS = 20000;

export interface SheetInfo {
  name: string;
  hidden: boolean;
  rows: number;
  cols: number;
  merges?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  widths: Array<number | undefined>;
}

/** CHUNK_ROWS rows of one sheet: text per cell (row-major), flags (1 = number/date), formulas by index. */
export interface RowChunk {
  sheet: number;
  index: number;
  text: string[];
  flags: Uint8Array;
  formulas: Record<number, string>;
}

export type SheetReport = (step: 'parse' | 'rows', fraction?: number) => void;

export const NEEDS_CODEPAGES = new Set(['xls', 'et', 'xlw', 'dbf', 'wk1', 'wk3', 'wk4', 'wks', 'wq1', 'qpw', 'dif', 'slk', 'sylk', 'prn', 'xlt']);

type WorkSheet = import('xlsx').WorkSheet;
type XLSXModule = typeof import('xlsx');

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

export async function readSheets(data: ArrayBuffer, ext: string, report: SheetReport, emitInfo: (sheets: SheetInfo[]) => void, emitChunk: (c: RowChunk) => void): Promise<void> {
  const [XLSX, cptable] = await Promise.all([import('xlsx'), NEEDS_CODEPAGES.has(ext) ? import('xlsx/dist/cpexcel.full.mjs') : Promise.resolve(null)]);
  if (cptable) XLSX.set_cptable(cptable);
  report('parse');
  let wb: import('xlsx').WorkBook;
  try {
    // cellHTML off: the HTML copy of each cell is never used and costs ~20% of the reading time.
    wb = XLSX.read(data, { type: 'array', cellDates: true, cellFormula: true, cellStyles: false, cellHTML: false, dense: false });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    throw new Error(/password|encrypt/i.test(msg) ? 'PASSWORD' : msg);
  }
  const hidden = (wb.Workbook?.Sheets ?? []).map((sh) => !!sh.Hidden);
  const infos: SheetInfo[] = wb.SheetNames.map((name, i) => {
    const ws = wb.Sheets[name];
    const size = ws ? usedSize(XLSX, ws) : { rows: 0, cols: 0 };
    const widths = ((ws?.['!cols'] ?? []) as Array<{ wch?: number; width?: number } | undefined>).map((col) => col?.wch ?? col?.width);
    return { name, hidden: !!hidden[i], ...size, merges: ws?.['!merges'] as SheetInfo['merges'], widths };
  });
  emitInfo(infos);

  // The first visible sheet first: it is the one shown.
  const first = Math.max(0, infos.findIndex((x) => !x.hidden));
  const order = [first, ...infos.map((_, i) => i).filter((i) => i !== first)];
  const totalRows = infos.reduce((n, x) => n + x.rows, 0) || 1;
  let doneRows = 0;
  for (const si of order) {
    const info = infos[si];
    const ws = wb.Sheets[info.name];
    if (!ws || !info.rows) continue;
    for (let r0 = 0, index = 0; r0 < info.rows; r0 += CHUNK_ROWS, index++) {
      const r1 = Math.min(info.rows, r0 + CHUNK_ROWS);
      const n = (r1 - r0) * info.cols;
      const text = new Array<string>(n).fill('');
      const flags = new Uint8Array(n);
      const formulas: Record<number, string> = {};
      for (let r = r0; r < r1; r++) {
        for (let c = 0; c < info.cols; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (!cell) continue;
          const i = (r - r0) * info.cols + c;
          if (cell.w !== undefined) text[i] = cell.w;
          else if (cell.v instanceof Date) text[i] = cell.v.toLocaleString();
          else text[i] = cell.v == null ? '' : String(cell.v);
          if (cell.t === 'n' || cell.t === 'd') flags[i] = 1;
          if (cell.f) formulas[i] = `=${cell.f}`;
        }
      }
      emitChunk({ sheet: si, index, text, flags, formulas });
      doneRows += r1 - r0;
      report('rows', doneRows / totalRows);
    }
  }
}
