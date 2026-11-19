/**
 * Apache Parquet tables (data pipelines, historians, pandas/Spark exports). Only the parts
 * of the file that are needed are read (the footer, then the first rows), so even large
 * files open quickly; more rows load on request. Snappy, gzip, zstd and brotli supported.
 */
import { formatCount, h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import { limit } from '../../../core/limits';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { renderGrid, type GridCell } from '../shared/grid';

const s = strings({
  rows: { en: 'rows', zh: '行' },
  columns: { en: 'columns', zh: '列' },
  shown: { en: 'Showing the first {n} of {total} rows.', zh: '显示了 {total} 行中的前 {n} 行。' },
  more: { en: 'Load {n} more', zh: '再加载 {n} 行' },
  data: { en: 'Data', zh: '数据' },
  schema: { en: 'Columns', zh: '列结构' },
  name: { en: 'Name', zh: '名称' },
  type: { en: 'Type', zh: '类型' },
  optional: { en: 'May be empty', zh: '可为空' },
  yes: { en: 'yes', zh: '是' },
  stepMeta: { en: 'Reading the table layout…', zh: '正在读取表结构…' },
  stepRows: { en: 'Reading rows…', zh: '正在读取行…' },
});

interface SchemaNode {
  element: { name: string; type?: string; repetition_type?: string; logical_type?: { type: string; unit?: string }; converted_type?: string };
  children: SchemaNode[];
}

function typeName(n: SchemaNode): string {
  const e = n.element;
  if (n.children.length) return e.logical_type?.type ?? e.converted_type ?? 'GROUP';
  const logical = e.logical_type?.type;
  return logical && logical !== e.type ? `${logical} (${e.type})` : (e.converted_type ?? e.type ?? '');
}

/** `single`: a 32-bit float column — shown with the ~7 digits it really holds (8.05, not 8.050000190734863). */
function show(v: unknown, single = false): GridCell | string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return { text: Number.isInteger(v) ? String(v) : String(+v.toPrecision(single ? 7 : 15)), numeric: true };
  if (typeof v === 'bigint') return { text: v.toString(), numeric: true };
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return { text: Number.isNaN(+v) ? '' : v.toISOString().replace('T', ' ').replace(/\.000Z$|Z$/, ''), numeric: true };
  if (v instanceof Uint8Array) return Array.from(v.subarray(0, 32), (b) => b.toString(16).padStart(2, '0')).join(' ') + (v.length > 32 ? ' …' : '');
  if (typeof v === 'object') {
    try {
      const text = JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x instanceof Uint8Array ? `<${x.length} bytes>` : x));
      return text.length > 300 ? `${text.slice(0, 300)}…` : text;
    } catch {
      return String(v);
    }
  }
  const text = String(v);
  return text.length > 1000 ? `${text.slice(0, 1000)}…` : text;
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const [{ parquetMetadataAsync, parquetSchema, parquetRead }, { compressors }] = await Promise.all([import('hyparquet'), import('hyparquet-compressors')]);
  // Reads only the byte ranges it asks for: the whole file is never loaded at once.
  const buffer = { byteLength: file.size, slice: (start: number, end?: number) => file.slice(start, end).arrayBuffer() };
  ctx.progress?.(s('stepMeta'));
  const meta = await parquetMetadataAsync(buffer);
  const tree = parquetSchema(meta) as unknown as SchemaNode;
  const cols = tree.children;
  const names = cols.map((c) => c.element.name);
  const single = cols.map((c) => c.element.type === 'FLOAT');
  const total = Number(meta.num_rows);
  const step = limit('parquetRows');

  let rows: unknown[][] = [];
  const readTo = async (end: number) => {
    ctx.progress?.(s('stepRows'));
    const more = await new Promise<unknown[][]>((resolve, reject) => {
      parquetRead({ file: buffer, metadata: meta, compressors, rowStart: rows.length, rowEnd: Math.min(end, total), rowFormat: 'array', onComplete: (r: unknown[][]) => resolve(r) }).catch(reject);
    });
    rows = rows.concat(more);
  };
  await readTo(step);

  let mode: 'data' | 'schema' = 'data';
  const draw = () => {
    const grid =
      mode === 'data'
        ? renderGrid({ rows: rows.length + 1, cols: names.length, header: 'first-row', cell: (r, c) => (r === 0 ? names[c] : show(rows[r - 1]?.[c], single[c])) })
        : renderGrid({
            rows: cols.length + 1,
            cols: 3,
            header: 'first-row',
            cell: (r, c) => (r === 0 ? [s('name'), s('type'), s('optional')][c] : c === 0 ? cols[r - 1].element.name : c === 1 ? typeName(cols[r - 1]) : cols[r - 1].element.repetition_type === 'OPTIONAL' ? s('yes') : ''),
          });
    ctx.mount.replaceChildren(h('div', { class: 'view view-sheet' }, grid));
  };
  draw();

  const createdBy = meta.created_by?.replace(/\s*\(build [^)]*\)/, '');
  return {
    meta: () => ['Parquet', `${formatCount(total)} ${s('rows')} × ${names.length} ${s('columns')}`, ...(createdBy ? [createdBy] : [])],
    tools: () => {
      const btn = (m: typeof mode, label: string) => h('button', { type: 'button', class: mode === m ? 'active' : '', 'aria-pressed': String(mode === m), onclick: () => ((mode = m), draw(), ctx.refreshChrome()) }, label);
      return [h('div', { class: 'seg', role: 'group' }, btn('data', s('data')), btn('schema', s('schema')))];
    },
    notices: () =>
      mode === 'data' && rows.length < total
        ? [
            h(
              'div',
              { class: 'notice' },
              s('shown').replace('{n}', formatCount(rows.length)).replace('{total}', formatCount(total)),
              ' ',
              h('button', { type: 'button', class: 'link', onclick: async () => (await readTo(rows.length + step), draw(), ctx.refreshChrome()) }, s('more').replace('{n}', formatCount(Math.min(step, total - rows.length)))),
            ),
          ]
        : [],
    onLangChange: () => draw(),
  };
}
