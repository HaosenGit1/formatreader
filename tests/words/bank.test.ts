// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { bankKind, parseBank, summarise } from '../../src/categories/words/bank/parse';

const read = (f: string) => readFileSync(`samples/bank/${f}`, 'utf8');

describe('bank statements: detected by content, then read', () => {
  test('MT940', () => {
    const b = parseBank(read('mt940-statement.sta'))!;
    expect(b.format).toBe('mt940');
    const st = b.statements[0];
    expect(st).toMatchObject({ account: 'DE89370400440532013000', currency: 'EUR', opening: { amount: 12500 }, closing: { amount: 13833.6 } });
    expect(st.entries).toHaveLength(3);
    expect(st.entries[0]).toMatchObject({ date: '2026-11-18', amount: 2310, counterparty: 'Kuestenstrom Energie AG', counterAccount: 'DE44500105175407324931' });
    expect(st.entries[0].description).toContain('Stromverkauf Oktober');
    expect(st.entries[1].amount).toBe(-856.4);
    expect(st.entries[2]).toMatchObject({ amount: -120, counterparty: 'Hausbank' });
    expect(summarise(st)).toMatchObject({ moneyIn: 2310, moneyOut: 976.4, difference: 0 });
  });

  test('camt.053', () => {
    const b = parseBank(read('camt053-statement.xml'))!;
    const st = b.statements[0];
    expect(b.format).toBe('camt');
    expect(st).toMatchObject({ account: 'CN1200001234567890123456', accountName: '新疆某某新能源有限公司 基本户', bank: '中国银行乌鲁木齐分行', currency: 'CNY', from: '2026-11-18' });
    expect(st.entries[0]).toMatchObject({ amount: 120000, counterparty: '国网新疆电力有限公司', description: '10月上网电费', reference: 'E2E-ELEC-10' });
    expect(st.entries[1]).toMatchObject({ amount: -100000, counterparty: '江苏某某风电设备有限公司' });
    expect(summarise(st).difference).toBe(0);
  });

  test('OFX (SGML)', () => {
    const b = parseBank(read('checking.ofx'))!;
    const st = b.statements[0];
    expect(b.format).toBe('ofx');
    expect(st).toMatchObject({ account: '4100123456', currency: 'USD', from: '2026-11-01', to: '2026-11-18', closing: { amount: 64299.25 } });
    expect(st.entries.map((e) => e.amount)).toEqual([18450, -3200.75, -950]);
    expect(st.entries[2]).toMatchObject({ counterparty: 'County Tax Office', description: 'Check 1042', type: 'CHECK' });
    expect(st.opening!.amount).toBe(50000);
  });

  test('BAI2', () => {
    const b = parseBank(read('bai2-statement.bai'))!;
    const st = b.statements[0];
    expect(b.format).toBe('bai2');
    expect(st).toMatchObject({ account: '4100987654', currency: 'USD', opening: { amount: 50000 }, closing: { amount: 61500 } });
    expect(st.entries.map((e) => e.amount)).toEqual([15000, -3500]);
    expect(st.entries[1].description).toContain('WTG-03 maintenance');
    expect(summarise(st).difference).toBe(0);
  });

  test('a balance that does not add up is reported', () => {
    const text = read('mt940-statement.sta').replace(':62F:C261118EUR13833,60', ':62F:C261118EUR13900,00');
    expect(summarise(parseBank(text)!.statements[0]).difference).toBe(66.4);
  });

  test('ordinary text is not taken for a statement', () => {
    expect(bankKind('Meeting notes\n:20: agenda items\nnothing else')).toBeNull();
    expect(bankKind('time,turbine,power\n01,02,03')).toBeNull();
  });
});
