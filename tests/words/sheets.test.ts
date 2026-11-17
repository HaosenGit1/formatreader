import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import { parseDelimited, sniffDelimiter } from '../../src/categories/words/sheets/delimited';
import { isSpreadsheetXml } from '../../src/categories/words/sheets/formats';
import { columnName } from '../../src/categories/words/shared/grid';

describe('Sheets: delimited text', () => {
  test('sniffs semicolons (European Excel)', () => {
    expect(sniffDelimiter('name;age;city\nAnna;30;Berlin\nBen;25;Paris')).toBe(';');
  });
  test('sniffs tabs', () => {
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });
  test('quotes, escaped quotes, embedded newlines, CRLF, BOM', () => {
    const rows = parseDelimited('﻿a,b,c\n"x, y","he said ""hi""","line1\nline2"\r\n1,2,3', ',');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'he said "hi"', 'line1\nline2'],
      ['1', '2', '3'],
    ]);
  });
});

describe('Sheets: grid helpers', () => {
  test('Excel column names', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });
});

describe('Sheets: SpreadsheetML detection', () => {
  test('Excel 2003 XML is recognised, ordinary XML is not', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(isSpreadsheetXml(enc('<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook/>'))).toBe(true);
    expect(isSpreadsheetXml(enc('<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"/>'))).toBe(true);
    expect(isSpreadsheetXml(enc('<?xml version="1.0"?><rss/>'))).toBe(false);
  });
});

describe('Sheets: SheetJS round-trip (the engine the viewer uses)', () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['风机', '功率 kW', '日期'],
    ['WTG-01', 2410.5, new Date(Date.UTC(2026, 10, 17))],
    ['WTG-02', 0, new Date(Date.UTC(2026, 10, 17))],
  ]);
  ws['D2'] = { t: 'n', f: 'B2*2', v: 4821 };
  ws['!ref'] = 'A1:D3';
  ws['!merges'] = [{ s: { r: 2, c: 2 }, e: { r: 2, c: 3 } }];
  XLSX.utils.book_append_sheet(wb, ws, '数据');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['note']]), 'Notes');

  for (const bookType of ['xlsx', 'xls', 'ods'] as const) {
    test(bookType, () => {
      const bytes = XLSX.write(wb, { type: 'array', bookType });
      const back = XLSX.read(bytes, { type: 'array', cellFormula: true, cellDates: true });
      expect(back.SheetNames).toEqual(['数据', 'Notes']);
      const s1 = back.Sheets['数据'];
      expect(s1['A1'].v).toBe('风机');
      expect(s1['B2'].v).toBe(2410.5);
      // SheetJS's legacy .xls writer does not store formulas; its reader does.
      if (bookType !== 'xls') expect(s1['D2'].f).toBe('B2*2');
    });
  }
});
