// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { label, parseReport } from '../../src/categories/words/xbrl/parse';

test('XBRL instance: facts, periods, units, dimensions, cover page', () => {
  const r = parseReport(readFileSync('samples/xbrl/windco-2025.xbrl', 'utf8'))!;
  expect(r).toMatchObject({ inline: false, entity: 'WindCo Renewables Inc.', documentType: '10-K', periodEnd: '2025-12-31' });
  const rev = r.facts.filter((f) => f.local === 'Revenues');
  expect(rev).toHaveLength(3);
  expect(rev[0]).toMatchObject({ num: 482150000, unit: 'USD', period: { start: '2025-01-01', end: '2025-12-31' } });
  expect(rev[2].dims).toEqual([['srt:StatementGeographicalAxis', 'wind:TexasMember']]);
  expect(r.facts.find((f) => f.local === 'EarningsPerShareBasic')).toMatchObject({ num: 1.53, unit: 'USD/shares' });
  expect(r.facts.find((f) => f.local === 'Assets')!.period.instant).toBe('2025-12-31');
});

test('Inline XBRL: comma decimals, scale and sign', () => {
  const r = parseReport(readFileSync('samples/xbrl/windco-2025-ixbrl.xhtml', 'utf8'))!;
  expect(r.inline).toBe(true);
  expect(r.entity).toBe('Éolia Énergie SA');
  expect(r.facts.find((f) => f.local === 'Revenue')).toMatchObject({ num: 215430000, unit: 'EUR' });
  expect(r.facts.find((f) => f.local === 'Assets')!.num).toBe(1204100000);
  expect(r.facts.find((f) => f.local === 'ImpairmentLoss')!.num).toBe(-2100000);
});

test('labels from concept names', () => {
  expect(label('CashAndCashEquivalentsAtCarryingValue')).toBe('Cash and cash equivalents at carrying value');
  expect(label('NetCashProvidedByUsedInOperatingActivities')).toBe('Net cash provided by used in operating activities');
});
