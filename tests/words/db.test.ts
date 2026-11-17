import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import MDBReader from 'mdb-reader';
import initSqlJs from 'sql.js';
import { describe, expect, test } from 'vitest';
import { detectFormat } from '../../src/core/detect-format';

const dir = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'samples', 'db');
const read = (n: string) => readFileSync(join(dir, n));

describe('Database viewer: formats are recognised', () => {
  test.each([
    ['access-2000.mdb', 'mdb'],
    ['access-2010.accdb', 'accdb'],
    ['wind-farm.sqlite', 'sqlite'],
  ])('%s → %s', async (name, id) => {
    expect((await detectFormat(new Blob([new Uint8Array(read(name))]), name))?.id).toBe(id);
  });
});

describe('Database viewer: engines read the samples', () => {
  for (const name of ['access-2000.mdb', 'access-2010.accdb']) {
    test(name, () => {
      const reader = new MDBReader(read(name));
      const tables = reader.getTableNames();
      expect(tables.length).toBeGreaterThan(0);
      const t = reader.getTable(tables[0]);
      expect(t.getColumnNames().length).toBeGreaterThan(0);
      expect(t.getData({ rowLimit: 5 }).length).toBeLessThanOrEqual(5);
    });
  }

  test('wind-farm.sqlite', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database(new Uint8Array(read('wind-farm.sqlite')));
    const names = db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name")[0].values.map((r) => `${r[0]}:${r[1]}`);
    expect(names).toEqual(['daily_energy:view', 'events:table', 'readings:table', 'turbines:table']);
    expect(db.exec('SELECT count(*) FROM readings')[0].values[0][0]).toBe(600);
    expect(db.exec("SELECT site FROM turbines WHERE id='WTG-01'")[0].values[0][0]).toBe('风场 A');
    db.close();
  });
});
