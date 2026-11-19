import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { isPlainTable } from '../../src/categories/words/sheets/view';

const head = (n: string) => new Uint8Array(readFileSync(`samples/sheets-variants/${n}`)).subarray(0, 4096);

test('plain-text tables saved as .xls go to the text table reader (encoding detection)', () => {
  expect(isPlainTable(head('report-tab-gbk.xls'))).toBe(true);
  expect(isPlainTable(head('unicode-text.xls'))).toBe(true);
});

test('real workbooks, HTML and SpreadsheetML stay with the workbook reader', () => {
  expect(isPlainTable(head('bank-export-html.xls'))).toBe(false);
  expect(isPlainTable(head('spreadsheetml-2003.xls'))).toBe(false);
  expect(isPlainTable(new Uint8Array(readFileSync('samples/sheets/locked-password-1234.xlsx')).subarray(0, 4096))).toBe(false);
});
