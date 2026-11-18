// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { invoiceKind, parseInvoice } from '../../src/categories/words/invoice/parse';

const read = (f: string) => readFileSync(`samples/invoices/${f}`, 'utf8');

describe('e-invoices', () => {
  test('Chinese 数电票', () => {
    const inv = parseInvoice(read('cn-einvoice.xml'))!;
    expect(inv.standard).toBe('cn');
    expect(inv.number).toBe('26112000000012345678');
    expect(inv.kind).toContain('增值税专用发票');
    expect(inv.seller).toMatchObject({ name: '江苏某某风电设备有限公司', taxId: '91320000MA1XXXXX0Q' });
    expect(inv.buyer.name).toBe('新疆某某新能源有限公司');
    expect(inv.lines).toHaveLength(2);
    expect(inv.lines[0]).toMatchObject({ name: '*机械设备*变桨轴承', quantity: '2', amount: '70796.46', taxRate: '0.13', tax: '9203.54' });
    expect([inv.net, inv.tax, inv.gross, inv.inWords]).toEqual(['88495.58', '11504.42', '100000.00', '壹拾万圆整']);
    expect(inv.allFields.length).toBeGreaterThan(20);
  });

  test('UBL (Peppol)', () => {
    const inv = parseInvoice(read('ubl-invoice.xml'))!;
    expect(inv).toMatchObject({ standard: 'ubl', number: 'INV-2026-0042', date: '2026-11-18', dueDate: '2026-12-18', currency: 'EUR', tax: '456.00', payable: '2856.00' });
    expect(inv.seller).toMatchObject({ name: 'Nordwind Service GmbH', taxId: 'DE123456789' });
    expect(inv.buyer.name).toBe('Küstenstrom Energie AG');
    expect(inv.lines[1]).toMatchObject({ name: 'Pitch bearing seal', quantity: '4', unit: 'C62', price: '120.00', amount: '480.00', taxRate: '19' });
  });

  test('CII (Factur-X / ZUGFeRD)', () => {
    const inv = parseInvoice(read('cii-facturx.xml'))!;
    expect(inv).toMatchObject({ standard: 'cii', number: 'FX-2026-981', date: '20261118', dueDate: '20261218', currency: 'EUR', net: '1500.00', tax: '300.00', gross: '1800.00' });
    expect(inv.seller).toMatchObject({ name: 'Éole Services SAS', taxId: 'FR12345678901' });
    expect(inv.lines[0]).toMatchObject({ name: 'Contrat de maintenance éolienne', amount: '1500.00', taxRate: '20' });
  });

  test('other XML is not taken for an invoice', () => {
    expect(invoiceKind('<?xml version="1.0"?><config><item/></config>')).toBeNull();
    expect(parseInvoice('<config/>')).toBeNull();
  });
});
