// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { ledgerKind, parseLedger } from '../../src/categories/words/ledger/parse';

test('SAF-T: header, trial balance, journal totals and record tables', () => {
  const l = parseLedger(readFileSync('samples/ledger/saft-windco.xml', 'utf8'))!;
  expect(l).toMatchObject({ kind: 'saft', company: 'Vindkraft Nord AS', taxId: '987654321', period: '2025-01-01 – 2025-12-31', currency: 'NOK', entries: 2, debit: 62500, credit: 62500, statedDebit: 62500, statedCredit: 62500 });
  expect(l.software).toContain('FjordLedger');
  expect(l.accounts.map((a) => [a.id, a.closing])).toEqual([['1920', 287500], ['3000', -50000], ['6300', 12500]]);
  const lines = l.tables.find((t) => t.path.endsWith('Transaction › Line'))!;
  expect(lines.rows).toHaveLength(4);
  expect(lines.columns).toContain('Transaction.TransactionID');
  expect(l.tables.some((t) => t.path.endsWith('Customer') && t.rows.length === 2)).toBe(true);
});

test('GB/T 24589 style Chinese accounting data', () => {
  const l = parseLedger(readFileSync('samples/ledger/gbt24589-export.xml', 'utf8'))!;
  expect(l).toMatchObject({ kind: 'gbt', company: '新疆某某新能源有限公司', taxId: '91650000MA7YYYYY2K', currency: 'CNY', entries: 2, debit: 220000, credit: 220000 });
  expect(l.accounts.map((a) => a.name)).toEqual(['银行存款', '主营业务收入', '预付账款']);
  const lines = l.tables.find((t) => t.path.endsWith('记账凭证 › 分录'))!;
  expect(lines.rows).toHaveLength(4);
  expect(lines.columns).toEqual(expect.arrayContaining(['记账凭证.凭证日期', '记账凭证.凭证编号', '摘要', '借方金额']));
});

test('unbalanced journal is visible; other XML is not taken for accounting data', () => {
  const text = readFileSync('samples/ledger/saft-windco.xml', 'utf8').replace('<Amount>12500.00</Amount></CreditAmount>', '<Amount>12000.00</Amount></CreditAmount>');
  const l = parseLedger(text)!;
  expect(l.debit - l.credit).toBe(500);
  expect(ledgerKind('<?xml version="1.0"?><config><item>1</item></config>')).toBeNull();
});
