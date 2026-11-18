/**
 * E-invoices (XML): shown as an invoice — seller, buyer, lines, totals — with "Copy lines"
 * for pasting into Excel, and every field of the file listed underneath.
 */
import './invoice.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { isSource, readText } from '../shared/read';
import { parseInvoice, type Invoice, type Line, type Party } from './parse';

const s = strings({
  invoice: { en: 'Invoice', zh: '发票' },
  number: { en: 'No.', zh: '号码' },
  date: { en: 'Date', zh: '开票日期' },
  due: { en: 'Due', zh: '付款期限' },
  seller: { en: 'Seller', zh: '销售方' },
  buyer: { en: 'Buyer', zh: '购买方' },
  taxId: { en: 'Tax ID', zh: '纳税人识别号' },
  address: { en: 'Address', zh: '地址' },
  bank: { en: 'Bank', zh: '开户行' },
  item: { en: 'Item', zh: '项目名称' },
  spec: { en: 'Spec', zh: '规格型号' },
  unit: { en: 'Unit', zh: '单位' },
  qty: { en: 'Qty', zh: '数量' },
  price: { en: 'Price', zh: '单价' },
  amount: { en: 'Amount', zh: '金额' },
  rate: { en: 'Tax rate', zh: '税率' },
  tax: { en: 'Tax', zh: '税额' },
  net: { en: 'Total without tax', zh: '合计金额' },
  taxTotal: { en: 'Total tax', zh: '合计税额' },
  gross: { en: 'Total with tax', zh: '价税合计' },
  payable: { en: 'Amount due', zh: '应付金额' },
  inWords: { en: 'In words', zh: '大写' },
  issuer: { en: 'Issued by', zh: '开票人' },
  note: { en: 'Note', zh: '备注' },
  copyLines: { en: 'Copy lines', zh: '复制明细' },
  copyLinesTitle: { en: 'Copy the invoice lines as a table, to paste into Excel', zh: '把发票明细复制为表格，可直接粘贴到 Excel' },
  copied: { en: 'Copied', zh: '已复制' },
  all: { en: 'All fields in the file', zh: '文件中的全部字段' },
  cn: { en: 'Chinese e-invoice (数电票)', zh: '数电票 / 全电发票' },
  ubl: { en: 'UBL e-invoice (Peppol, XRechnung)', zh: 'UBL 电子发票（Peppol、XRechnung）' },
  cii: { en: 'CII e-invoice (ZUGFeRD, Factur-X, XRechnung)', zh: 'CII 电子发票（ZUGFeRD、Factur-X、XRechnung）' },
});

const COLUMNS: Array<[keyof Line, Parameters<typeof s>[0]]> = [['name', 'item'], ['spec', 'spec'], ['quantity', 'qty'], ['unit', 'unit'], ['price', 'price'], ['amount', 'amount'], ['taxRate', 'rate'], ['tax', 'tax']];
const NUMERIC = new Set<keyof Line>(['quantity', 'price', 'amount', 'taxRate', 'tax']);

function partyBox(title: string, p: Party): HTMLElement {
  const row = (label: string, v?: string) => (v ? h('div', { class: 'inv-kv' }, h('span', {}, label), h('span', {}, v)) : null);
  return h('section', { class: 'inv-party' }, h('h3', {}, title), h('p', { class: 'inv-party-name' }, p.name ?? '—'), row(s('taxId'), p.taxId), row(s('address'), p.address), row(s('bank'), p.bank));
}

function render(inv: Invoice): HTMLElement {
  const cols = COLUMNS.filter(([k]) => inv.lines.some((l) => l[k]));
  const money = (v?: string) => (v && inv.currency ? `${v} ${inv.currency}` : v);
  const total = (label: string, v?: string, strong = false) => (v ? h('div', { class: `inv-total${strong ? ' strong' : ''}` }, h('span', {}, label), h('span', {}, money(v)!)) : null);
  return h(
    'article',
    { class: 'inv' },
    h(
      'header',
      { class: 'inv-head' },
      h('div', {}, h('p', { class: 'inv-kind' }, s(inv.standard)), h('h2', {}, inv.kind ?? s('invoice'))),
      h('div', { class: 'inv-meta' }, inv.number ? h('div', {}, `${s('number')} `, h('strong', {}, inv.number)) : null, inv.date ? h('div', {}, `${s('date')} ${inv.date}`) : null, inv.dueDate ? h('div', {}, `${s('due')} ${inv.dueDate}`) : null),
    ),
    h('div', { class: 'inv-parties' }, partyBox(s('seller'), inv.seller), partyBox(s('buyer'), inv.buyer)),
    inv.lines.length
      ? h(
          'div',
          { class: 'inv-lines-wrap' },
          h(
            'table',
            { class: 'inv-lines' },
            h('thead', {}, h('tr', {}, h('th', {}, '#'), ...cols.map(([, label]) => h('th', {}, s(label))))),
            h('tbody', {}, ...inv.lines.map((l, i) => h('tr', {}, h('td', { class: 'num' }, String(i + 1)), ...cols.map(([k]) => h('td', { class: NUMERIC.has(k) ? 'num' : undefined }, l[k] ?? ''))))),
          ),
        )
      : null,
    h('div', { class: 'inv-totals' }, total(s('net'), inv.net), total(s('taxTotal'), inv.tax), total(s('gross'), inv.gross, !inv.payable), total(s('payable'), inv.payable, true), inv.inWords ? h('div', { class: 'inv-total' }, h('span', {}, s('inWords')), h('span', {}, inv.inWords)) : null),
    inv.issuer || inv.note ? h('div', { class: 'inv-foot' }, inv.issuer ? h('p', {}, `${s('issuer')}: ${inv.issuer}`) : null, inv.note ? h('p', {}, `${s('note')}: ${inv.note}`) : null) : null,
    h(
      'details',
      { class: 'inv-all' },
      h('summary', {}, `${s('all')} (${inv.allFields.length})`),
      h('table', {}, h('tbody', {}, ...inv.allFields.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v))))),
    ),
  );
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const src = await readText(file, ctx.mount, undefined, ctx.progress);
  if (!isSource(src)) return src;
  const inv = parseInvoice(src.text);
  if (!inv) {
    // Not an invoice after all: show the XML.
    const code = await import('../code/view');
    return code.open(file, ctx);
  }
  ctx.mount.replaceChildren(h('div', { class: 'view view-invoice' }, render(inv)));
  const copyBtn = h('button', { type: 'button', class: 'btn', title: s('copyLinesTitle') }, s('copyLines')) as HTMLButtonElement;
  copyBtn.addEventListener('click', () => {
    const cols = COLUMNS.filter(([k]) => inv.lines.some((l) => l[k]));
    const rows = [cols.map(([, label]) => s(label)), ...inv.lines.map((l) => cols.map(([k]) => (l[k] ?? '').replace(/[\t\n]/g, ' ')))];
    navigator.clipboard?.writeText(rows.map((r) => r.join('\t')).join('\n')).then(() => {
      copyBtn.textContent = s('copied');
      setTimeout(() => (copyBtn.textContent = s('copyLines')), 1500);
    });
  });
  return {
    title: [inv.kind ?? s('invoice'), inv.number].filter(Boolean).join(' '),
    meta: () => [s(inv.standard), ...(inv.gross ?? inv.payable ? [`${inv.gross ?? inv.payable} ${inv.currency ?? ''}`.trim()] : []), file.name],
    tools: () => (inv.lines.length ? [copyBtn] : []),
    about: () => src.about(),
    onLangChange: () => ctx.mount.replaceChildren(h('div', { class: 'view view-invoice' }, render(inv))),
  };
}

