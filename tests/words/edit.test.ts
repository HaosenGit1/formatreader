// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { TextSource } from '../../src/categories/words/shared/text-source';
import { encodeLike, eolOf, unencodable, copyName } from '../../src/categories/words/shared/edit/save';
import { rebuild, records } from '../../src/categories/words/shared/edit/csv';

/** What the editor would save if nothing was changed: must be the original, byte for byte. */
async function unchangedCopy(path: string) {
  const bytes = new Uint8Array(readFileSync(path));
  const src = (await TextSource.fromBytes(bytes))!;
  const text = src.original.replace(/\r\n|\r/g, '\n');
  return { bytes, out: encodeLike(text, { encoding: src.encoding, bom: !!src.about().bom, eol: eolOf(src.original) }) };
}

describe('Save a copy keeps the file exactly as it was', () => {
  const files = [
    ...readdirSync('samples/text').filter((f) => !/README|double-encoded/.test(f)).map((f) => `samples/text/${f}`),
    'samples/sheets/sales-gbk.csv',
    'samples/sheets/report-utf8-bom.csv',
    'samples/sheets/european-semicolon.csv',
  ];
  for (const f of files) {
    test(f, async () => {
      const { bytes, out } = await unchangedCopy(f);
      expect(out, `${f} could not be encoded`).not.toBeNull();
      expect(Buffer.from(out!).equals(Buffer.from(bytes)), `${f} changed`).toBe(true);
    });
  }

  test('a character the encoding cannot store is reported, not replaced', () => {
    expect(encodeLike('风机 😀', { encoding: 'gb18030', bom: false, eol: '\n' })).toBeNull();
    expect(unencodable('风机 😀', 'gb18030')).toEqual(['😀']);
    expect(unencodable('anything 😀', 'utf-8')).toEqual([]);
  });

  test('copy names', () => {
    expect(copyName('维护清单.csv')).toBe('维护清单 (edited).csv');
    expect(copyName('README')).toBe('README (edited).txt');
  });
});

describe('CSV editing touches only the rows you change', () => {
  const text = 'name,note,amount\n"Smith, J","said ""hi""",10\nWTG-01,"two\nlines",  20 \nlast,x,30\n';
  const { list, trailingBreak } = records(text, ',');

  test('records keep their exact text', () => {
    expect(list.map((r) => r.cells)).toEqual([['name', 'note', 'amount'], ['Smith, J', 'said "hi"', '10'], ['WTG-01', 'two\nlines', '  20 '], ['last', 'x', '30']]);
    expect(rebuild(list, list.map((r, i) => ({ origin: i, cells: [...r.cells] })), ',', trailingBreak)).toBe(text);
  });

  test('one changed cell re-writes only its row; untouched quoting stays', () => {
    const rows = list.map((r, i) => ({ origin: i as number | null, cells: [...r.cells] }));
    rows[3].cells[2] = '31';
    rows.push({ origin: null, cells: ['new', 'has, comma', '5'] });
    rows.splice(0, 0);
    const out = rebuild(list, rows, ',', trailingBreak);
    expect(out).toBe('name,note,amount\n"Smith, J","said ""hi""",10\nWTG-01,"two\nlines",  20 \nlast,x,31\nnew,"has, comma",5\n');
  });

  test('deleted rows disappear, the rest is unchanged', () => {
    const rows = list.map((r, i) => ({ origin: i as number | null, cells: [...r.cells] })).filter((_, i) => i !== 1);
    expect(rebuild(list, rows, ',', trailingBreak)).toBe('name,note,amount\nWTG-01,"two\nlines",  20 \nlast,x,30\n');
  });
});
