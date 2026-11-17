/**
 * Spreadsheet-style grid used by the Sheets viewer (CSV and Excel).
 * Renders rows progressively so a million-row sheet appears instantly.
 */
import { h, renderProgressively } from '../../../core/dom';

export interface GridCell {
  text: string;
  /** Right-align (numbers, dates). */
  numeric?: boolean;
  /** Tooltip, e.g. the formula behind a value. */
  title?: string;
}

export interface GridOptions {
  rows: number;
  cols: number;
  cell(r: number, c: number): GridCell | string | null;
  /** 'letters' = A, B, C… like Excel; 'first-row' = the first data row is the header (CSV). */
  header: 'letters' | 'first-row';
  /** Merged ranges (Excel). */
  merges?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
  /** Column widths in characters, if known. */
  widths?: Array<number | undefined>;
}

export function columnName(c: number): string {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function renderGrid(opts: GridOptions): HTMLElement {
  const { rows, cols } = opts;

  // Merged cells: the top-left cell spans, the others are skipped.
  const spans = new Map<string, { rs: number; cs: number }>();
  const covered = new Set<string>();
  for (const m of opts.merges ?? []) {
    if (m.s.r >= rows || m.s.c >= cols) continue;
    spans.set(`${m.s.r},${m.s.c}`, { rs: m.e.r - m.s.r + 1, cs: Math.min(cols, m.e.c + 1) - m.s.c });
    for (let r = m.s.r; r <= m.e.r; r++)
      for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered.add(`${r},${c}`);
  }

  const toCell = (v: GridCell | string | null): GridCell => (v == null ? { text: '' } : typeof v === 'string' ? { text: v } : v);
  const firstRow = opts.header === 'first-row';
  const bodyStart = firstRow ? 1 : 0;

  const headCells: HTMLElement[] = [h('th', { class: 'rownum corner' }, '')];
  for (let c = 0; c < cols; c++) {
    const width = opts.widths?.[c];
    const style = width ? `min-width:${Math.min(60, Math.max(4, width))}ch` : undefined;
    headCells.push(h('th', { dir: 'auto', style }, firstRow ? toCell(opts.cell(0, c)).text : columnName(c)));
  }
  const thead = h('thead', {}, h('tr', {}, ...headCells));

  const tbody = h('tbody');
  const indices = Array.from({ length: Math.max(0, rows - bodyStart) }, (_, i) => i + bodyStart);
  renderProgressively(
    tbody,
    indices,
    (r) => {
      const tr = h('tr', {}, h('td', { class: 'rownum' }, String(firstRow ? r : r + 1)));
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        if (covered.has(key)) continue;
        const cell = toCell(opts.cell(r, c));
        const span = spans.get(key);
        tr.append(
          h(
            'td',
            {
              dir: 'auto',
              class: cell.numeric ? 'num' : undefined,
              title: cell.title,
              rowspan: span && span.rs > 1 ? span.rs : undefined,
              colspan: span && span.cs > 1 ? span.cs : undefined,
            },
            cell.text,
          ),
        );
      }
      return tr;
    },
    100,
  );

  return h('div', { class: 'table-wrap' }, h('table', { class: 'grid' }, thead, tbody));
}
