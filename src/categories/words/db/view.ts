/**
 * Database viewer: Microsoft Access (.mdb/.accdb) and SQLite. One tab per
 * table (and view), rows shown in the shared spreadsheet grid. Read-only.
 */
import '../sheets/sheets.css';
import './db.css';
import { formatCount, h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { renderGrid, type GridCell } from '../shared/grid';

const s = strings({
  tables: { en: 'tables', zh: '个表' },
  rows: { en: 'rows', zh: '行' },
  view: { en: 'view', zh: '视图' },
  empty: { en: 'This table is empty.', zh: '这个表是空的。' },
  noTables: { en: 'This database has no tables.', zh: '这个数据库没有表。' },
  capped: { en: 'Showing the first {n} rows.', zh: '只显示前 {n} 行。' },
  password: { en: 'This database is password-protected and cannot be opened.', zh: '这个数据库设置了密码，无法打开。' },
  binary: { en: 'binary', zh: '二进制' },
});

/** Rows loaded per table (keeps huge tables fast; the count shows the full size). */
const ROW_LIMIT = 20000;

interface TableData {
  name: string;
  isView?: boolean;
  total: number;
  columns: string[];
  rows: unknown[][];
}

interface Source {
  kind: 'Access' | 'SQLite';
  names: Array<{ name: string; isView?: boolean }>;
  load(name: string): TableData;
  close?(): void;
}

function cellOf(v: unknown): GridCell {
  if (v === null || v === undefined) return { text: '' };
  if (typeof v === 'number' || typeof v === 'bigint') return { text: String(v), numeric: true };
  if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE' };
  if (v instanceof Date) return { text: v.toLocaleString(), numeric: true };
  if (v instanceof Uint8Array) return { text: `(${s('binary')} · ${v.length} B)` };
  if (typeof v === 'object') return { text: JSON.stringify(v) };
  return { text: String(v) };
}

// ------------------------------------------------------------------ Access

async function openAccess(data: ArrayBuffer): Promise<Source> {
  // mdb-reader (and an old streams library under it) expects Node's Buffer and
  // a few `process` fields: provide browser stand-ins before it loads. The
  // shim says "browser" and has no versions.node, so nothing mistakes it for Node.
  const { Buffer } = await import('buffer');
  const g = globalThis as { Buffer?: unknown; process?: unknown };
  g.Buffer ??= Buffer;
  g.process ??= {
    browser: true,
    version: '',
    versions: {},
    env: {},
    nextTick: (fn: (...a: unknown[]) => void, ...args: unknown[]) => queueMicrotask(() => fn(...args)),
  };
  const { default: MDBReader } = await import('mdb-reader');
  let reader: InstanceType<typeof MDBReader>;
  try {
    reader = new MDBReader(Buffer.from(data));
    reader.getTableNames();
  } catch (e) {
    if (/password|encrypt/i.test(String((e as Error)?.message))) throw new Error(s('password'));
    throw e;
  }
  return {
    kind: 'Access',
    names: reader.getTableNames().map((name) => ({ name })),
    load(name) {
      const table = reader.getTable(name);
      const columns = table.getColumnNames();
      const objects = table.getData({ rowLimit: ROW_LIMIT }) as Array<Record<string, unknown>>;
      return { name, total: table.rowCount, columns, rows: objects.map((o) => columns.map((c) => o[c])) };
    },
  };
}

// ------------------------------------------------------------------ SQLite

async function openSqlite(data: ArrayBuffer): Promise<Source> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database(new Uint8Array(data));
  const quote = (n: string) => `"${n.replace(/"/g, '""')}"`;
  const list = db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type DESC, name");
  const names = (list[0]?.values ?? []).map(([name, type]) => ({ name: String(name), isView: type === 'view' }));
  return {
    kind: 'SQLite',
    names,
    load(name) {
      const total = Number(db.exec(`SELECT count(*) FROM ${quote(name)}`)[0]?.values[0]?.[0] ?? 0);
      const res = db.exec(`SELECT * FROM ${quote(name)} LIMIT ${ROW_LIMIT}`)[0];
      const columns = res?.columns ?? (db.exec(`PRAGMA table_info(${quote(name)})`)[0]?.values.map((r) => String(r[1])) ?? []);
      return { name, isView: names.find((n) => n.name === name)?.isView, total, columns, rows: res?.values ?? [] };
    },
    close: () => db.close(),
  };
}

// -------------------------------------------------------------------- view

export const preload = () => Promise.all([import('sql.js'), import('mdb-reader')]);

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const data = await file.arrayBuffer();
  const src = ctx.format?.id === 'sqlite' ? await openSqlite(data) : await openAccess(data);

  const tabs = h('div', { class: 'sheet-tabs db-tabs', role: 'tablist' });
  const note = h('div', { class: 'db-note' });
  const body = h('div', { class: 'sheet-body' });
  ctx.mount.replaceChildren(h('div', { class: 'view view-sheet view-db' }, tabs, note, body));

  let active = 0;
  let current: TableData | null = null;
  const cache = new Map<string, TableData>();

  const draw = () => {
    tabs.replaceChildren(
      ...src.names.map((t, i) =>
        h(
          'button',
          { type: 'button', role: 'tab', class: `sheet-tab${i === active ? ' active' : ''}`, 'aria-selected': String(i === active), onclick: () => { active = i; draw(); ctx.refreshChrome(); } },
          t.name,
          t.isView ? h('span', { class: 'db-view-tag' }, s('view')) : null,
        ),
      ),
    );
    if (!src.names.length) {
      body.replaceChildren(h('div', { class: 'sheet-empty' }, s('noTables')));
      note.textContent = '';
      return;
    }
    const name = src.names[active].name;
    if (!cache.has(name)) cache.set(name, src.load(name));
    current = cache.get(name)!;
    const t = current;
    note.textContent = t.total > t.rows.length ? s('capped').replace('{n}', formatCount(t.rows.length)) : '';
    if (!t.rows.length) {
      body.replaceChildren(h('div', { class: 'sheet-empty' }, s('empty')));
      return;
    }
    body.replaceChildren(
      renderGrid({
        rows: t.rows.length + 1,
        cols: t.columns.length,
        header: 'first-row',
        cell: (r, c) => (r === 0 ? t.columns[c] : cellOf(t.rows[r - 1][c])),
      }),
    );
  };
  draw();

  return {
    meta: () => [
      src.kind,
      `${src.names.length} ${s('tables')}`,
      ...(current ? [`${current.name}: ${formatCount(current.total)} ${s('rows')}`] : []),
    ],
    onFontScale: () => {},
    onLangChange: () => draw(),
    destroy: () => src.close?.(),
  };
}
