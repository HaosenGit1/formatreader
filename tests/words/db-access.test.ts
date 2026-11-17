import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import MDBReader from 'mdb-reader';
import { describe, expect, test } from 'vitest';

const sample = (name: string) => new MDBReader(readFileSync(join(process.cwd(), 'samples/db', name)));

describe('Access edge cases', () => {
  test('an unknown column type no longer hides the table (scripts/patch-deps.mjs)', () => {
    const t = sample('unknown-column-types.accdb').getTable('Test');
    const types = t.getColumns().map((c) => String(c.type));
    expect(types.some((x) => x.startsWith('unsupported-0x'))).toBe(true);
    const readable = t.getColumns().filter((c) => !String(c.type).startsWith('unsupported') && c.type !== 'complex').map((c) => c.name);
    expect(t.getData({ columns: readable }).length).toBe(t.rowCount);
  });
  test('a table with attachment / multi-value columns still has readable columns', () => {
    const t = sample('attachments-multivalue.accdb').getTable('Table1');
    expect(() => t.getData()).toThrow();
    expect(t.getData({ columns: ['id', 'memo-data'] }).length).toBe(4);
  });
  test('linked tables are listed separately from local ones', () => {
    const r = sample('linked-table.accdb');
    expect(r.getTableNames()).toEqual(['Table1']);
    expect(r.getTableNames({ normalTables: true, linkedTables: true, systemTables: false })).toContain('Table2');
  });
});
