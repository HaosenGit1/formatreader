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
  empty: { en: 'This table has no rows.', zh: '这个表没有数据。' },
  emptyTables: { en: '{n} empty', zh: '{n} 个空表' },
  skipped: { en: 'Columns not shown (attachments, multi-value or unsupported fields): {cols}', zh: '未显示的列（附件、多值或暂不支持的字段）：{cols}' },
  linkedTag: { en: 'linked', zh: '链接' },
  notShown: { en: '(not shown)', zh: '（未显示）' },
  linked: { en: 'This is a linked table: its rows are stored in another file ({target}). Open that file to see them.', zh: '这是链接表：数据保存在另一个文件中（{target}）。打开那个文件即可查看。' },
  unreadable: { en: 'This table could not be read: {why}', zh: '无法读取这个表：{why}' },
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
  /** Columns the reader cannot decode (Access attachments, multi-value fields). */
  skipped?: string[];
  /** Why the table cannot be shown at all (linked elsewhere, unreadable). */
  message?: string;
}

interface TableName {
  name: string;
  isView?: boolean;
  /** Row count when cheap to know: lets empty tables be marked and skipped at start. */
  count?: number;
  /** Rows live in another database file. */
  linked?: boolean;
}

interface Source {
  kind: 'Access' | 'SQLite';
  names: TableName[];
  load(name: string): TableData;
  close?(): void;
}

/** Marks a cell in a column the reader cannot decode. */
const NOT_SHOWN = Symbol('not shown');

// Access stores dates as local wall-clock time with no zone; mdb-reader turns
// them into Dates as if they were UTC, so they must be shown in UTC (otherwise
// 16 Nov 1994 becomes "15 Nov 1994, 6:00 PM" in Chicago).
const dateFmt = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function cellOf(v: unknown): GridCell {
  if (v === NOT_SHOWN) return { text: s('notShown') };
  if (v === null || v === undefined) return { text: '' };
  if (typeof v === 'number' || typeof v === 'bigint') return { text: String(v), numeric: true };
  if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE' };
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return { text: '' };
    return { text: (v.getTime() % 86400000 === 0 ? dateFmt : dateTimeFmt).format(v), numeric: true };
  }
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
  const normal = reader.getTableNames();
  const normalSet = new Set(normal);
  // Linked tables (a split "front-end" database) hold no rows here: list them anyway, saying where the rows live.
  const linkedTo = new Map<string, string>();
  try {
    const all = reader.getTableNames({ normalTables: true, linkedTables: true, systemTables: false });
    const linked = all.filter((n) => !normalSet.has(n));
    if (linked.length) {
      const objects = reader.getTable('MSysObjects').getData({ columns: ['Name', 'Type', 'Database', 'ForeignName', 'Connect'] }) as Array<Record<string, unknown>>;
      for (const n of linked) {
        const o = objects.find((x) => x.Name === n && (x.Type === 6 || x.Type === 4));
        const where = String(o?.Database ?? o?.Connect ?? '').trim();
        linkedTo.set(n, [where, o?.ForeignName && o.ForeignName !== n ? `→ ${o.ForeignName}` : ''].filter(Boolean).join(' ') || '?');
      }
    }
  } catch {
    /* no link information: show the local tables only */
  }

  const countOf = (name: string) => {
    try {
      return reader.getTable(name).rowCount;
    } catch {
      return undefined;
    }
  };

  return {
    kind: 'Access',
    names: [...normal.map((name) => ({ name, count: countOf(name) })), ...[...linkedTo.keys()].map((name) => ({ name, linked: true }))],
    load(name) {
      if (linkedTo.has(name)) return { name, total: 0, columns: [], rows: [], message: s('linked').replace('{target}', linkedTo.get(name)!) };
      const table = reader.getTable(name);
      const defs = table.getColumns();
      const columns = defs.map((c) => c.name);
      let objects: Array<Record<string, unknown>>;
      // Column types the reader does not know (named "unsupported-0x…" by scripts/patch-deps.mjs).
      const skipped: string[] = defs.filter((c) => String(c.type).startsWith('unsupported')).map((c) => c.name);
      try {
        objects = table.getData({ rowLimit: ROW_LIMIT }) as Array<Record<string, unknown>>;
      } catch (err) {
        // One undecodable column (attachment, multi-value…) must not hide the whole table:
        // find the columns that fail and read the rest.
        const good = columns.filter((c) => {
          if (skipped.includes(c)) return false;
          try {
            table.getData({ columns: [c], rowLimit: ROW_LIMIT });
            return true;
          } catch {
            skipped.push(c);
            return false;
          }
        });
        if (!good.length) throw err;
        objects = table.getData({ columns: good, rowLimit: ROW_LIMIT }) as Array<Record<string, unknown>>;
      }
      const bad = new Set(skipped);
      return {
        name,
        total: objects.length < ROW_LIMIT ? objects.length : table.rowCount,
        columns,
        rows: objects.map((o) => columns.map((c) => (bad.has(c) ? NOT_SHOWN : o[c]))),
        skipped,
      };
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
  const names: TableName[] = (list[0]?.values ?? []).map(([name, type]) => ({ name: String(name), isView: type === 'view' }));
  // Row counts mark empty tables; skipped for views and for databases with very many tables.
  if (names.length <= 200)
    for (const t of names)
      if (!t.isView)
        try {
          t.count = Number(db.exec(`SELECT count(*) FROM ${quote(t.name)}`)[0]?.values[0]?.[0] ?? 0);
        } catch {
          /* leave unknown */
        }
  return {
    kind: 'SQLite',
    names,
    load(name) {
      const total = names.find((n) => n.name === name)?.count ?? Number(db.exec(`SELECT count(*) FROM ${quote(name)}`)[0]?.values[0]?.[0] ?? 0);
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

  // Start on the first table that has rows: many databases begin with empty ones.
  let active = Math.max(0, src.names.findIndex((t) => !t.linked && (t.count === undefined || t.count > 0)));
  let current: TableData | null = null;
  const cache = new Map<string, TableData>();
  const emptyCount = src.names.filter((t) => t.count === 0).length;

  const loadSafe = (name: string): TableData => {
    try {
      return src.load(name);
    } catch (err) {
      console.error(`Could not read table ${name}`, err);
      return { name, total: 0, columns: [], rows: [], message: s('unreadable').replace('{why}', String((err as Error)?.message ?? err)) };
    }
  };

  const draw = () => {
    tabs.replaceChildren(
      ...src.names.map((t, i) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: `sheet-tab${i === active ? ' active' : ''}${t.count === 0 ? ' db-tab-empty' : ''}`,
            'aria-selected': String(i === active),
            onclick: () => {
              active = i;
              draw();
              ctx.refreshChrome();
            },
          },
          t.name,
          t.isView ? h('span', { class: 'db-view-tag' }, s('view')) : null,
          t.linked ? h('span', { class: 'db-view-tag' }, s('linkedTag')) : null,
          t.count !== undefined ? h('span', { class: 'db-count' }, formatCount(t.count)) : null,
        ),
      ),
    );
    if (!src.names.length) {
      body.replaceChildren(h('div', { class: 'sheet-empty' }, s('noTables')));
      note.textContent = '';
      return;
    }
    const name = src.names[active].name;
    if (!cache.has(name)) cache.set(name, loadSafe(name));
    current = cache.get(name)!;
    const t = current;
    const notes: string[] = [];
    if (t.total > t.rows.length) notes.push(s('capped').replace('{n}', formatCount(t.rows.length)));
    if (t.skipped?.length) notes.push(s('skipped').replace('{cols}', t.skipped.join(', ')));
    if (!t.message && !t.rows.length) notes.push(s('empty'));
    note.textContent = notes.join(' · ');
    if (t.message) {
      body.replaceChildren(h('div', { class: 'sheet-empty' }, t.message));
      return;
    }
    // Columns sized to their content (numbers and codes stay on one line), within limits.
    const widths = t.columns.map((c, ci) => {
      let w = Math.min(c.length, 24);
      for (let r = 0; r < Math.min(t.rows.length, 200); r++) w = Math.max(w, Math.min(cellOf(t.rows[r][ci]).text.length, 32));
      return w + 1;
    });
    // An empty table still shows its column names.
    body.replaceChildren(
      renderGrid({
        rows: t.rows.length + 1,
        cols: t.columns.length,
        header: 'first-row',
        widths,
        cell: (r, c) => (r === 0 ? t.columns[c] : cellOf(t.rows[r - 1][c])),
      }),
    );
  };
  draw();

  return {
    meta: () => [
      src.kind,
      `${src.names.length} ${s('tables')}${emptyCount ? ` (${s('emptyTables').replace('{n}', String(emptyCount))})` : ''}`,
      ...(current ? [`${current.name}: ${formatCount(current.total)} ${s('rows')}`] : []),
    ],
    onFontScale: () => {},
    onLangChange: () => draw(),
    destroy: () => src.close?.(),
  };
}
