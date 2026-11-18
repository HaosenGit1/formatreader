/**
 * SAF-T audit files and GB/T 24589 accounting data (and other accounting XML exports):
 * an overview, the debit = credit check, the trial balance (opening and closing balance per
 * account) and every record of the file as a table — searchable, copyable to Excel.
 */
import './ledger.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { isSource, readText } from '../shared/read';
import { parseLedger, type Ledger, type Table } from './parse';

const s = strings({
  saft: { en: 'SAF-T audit file', zh: 'SAF-T 审计文件' },
  gbt: { en: 'Accounting data (GB/T 24589)', zh: '会计核算数据（GB/T 24589）' },
  xml: { en: 'Accounting data (XML)', zh: '会计数据（XML）' },
  company: { en: 'Company', zh: '单位' },
  taxId: { en: 'Tax ID', zh: '税号' },
  period: { en: 'Period', zh: '期间' },
  currency: { en: 'Currency', zh: '币种' },
  software: { en: 'Software', zh: '软件' },
  entries: { en: 'Entries', zh: '凭证数' },
  debit: { en: 'Total debit', zh: '借方合计' },
  credit: { en: 'Total credit', zh: '贷方合计' },
  ok: { en: '✓ Debit equals credit', zh: '✓ 借贷平衡' },
  bad: { en: '⚠ Debit and credit differ by {d}', zh: '⚠ 借贷不平衡，差额 {d}' },
  stated: { en: 'Totals stated in the file: debit {d}, credit {c} — {m}', zh: '文件中声明的合计：借方 {d}，贷方 {c} — {m}' },
  match: { en: 'match the entries', zh: '与分录一致' },
  differ: { en: 'differ from the entries', zh: '与分录不一致' },
  trial: { en: 'Trial balance', zh: '科目余额表' },
  account: { en: 'Account', zh: '科目编号' },
  name: { en: 'Name', zh: '科目名称' },
  opening: { en: 'Opening', zh: '期初余额' },
  closing: { en: 'Closing', zh: '期末余额' },
  records: { en: 'Records in the file', zh: '文件中的全部记录' },
  rows: { en: 'rows', zh: '行' },
  search: { en: 'Search records', zh: '搜索记录' },
  copy: { en: 'Copy', zh: '复制' },
  copied: { en: 'Copied', zh: '已复制' },
  signNote: { en: 'Balances: debit positive, credit negative.', zh: '余额：借方为正，贷方为负。' },
});

const money = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function tableView(t: Table, q: string): HTMLElement | null {
  const rows = q ? t.rows.filter((r) => r.some((c) => c.toLowerCase().includes(q))) : t.rows;
  if (q && !rows.length) return null;
  const copyBtn = h('button', { type: 'button', class: 'btn' }, s('copy')) as HTMLButtonElement;
  copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const text = [t.columns, ...rows].map((r) => r.map((c) => c.replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      copyBtn.textContent = s('copied');
      setTimeout(() => (copyBtn.textContent = s('copy')), 1500);
    });
  });
  const numeric = t.columns.map((_, i) => rows.slice(0, 50).every((r) => !r[i] || /^-?[\d,.]+$/.test(r[i])));
  return h(
    'details',
    { class: 'lg-table', open: !!q || t.rows.length <= 200 },
    h('summary', {}, h('span', {}, t.path), h('span', { class: 'lg-count' }, `${rows.length} ${s('rows')}`), copyBtn),
    h(
      'div',
      { class: 'lg-wrap' },
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, ...t.columns.map((c) => h('th', {}, c)))),
        h('tbody', {}, ...rows.slice(0, 3000).map((r) => h('tr', {}, ...r.map((c, i) => h('td', { class: numeric[i] ? 'num' : undefined }, c))))),
      ),
    ),
  );
}

function render(l: Ledger, query: string): HTMLElement {
  const q = query.toLowerCase();
  const card = (label: string, value?: string) => (value ? h('div', { class: 'lg-card' }, h('span', {}, label), h('strong', {}, value)) : null);
  const diff = Math.round((l.debit - l.credit) * 100) / 100;
  const hasAmounts = l.debit !== 0 || l.credit !== 0;
  const statedMatch = l.statedDebit !== undefined && Math.abs(l.statedDebit - l.debit) < 0.005 && Math.abs((l.statedCredit ?? 0) - l.credit) < 0.005;
  return h(
    'div',
    { class: 'lg' },
    h('header', {}, h('p', { class: 'lg-kind' }, s(l.kind)), h('h2', {}, l.company ?? '—')),
    h('div', { class: 'lg-cards' }, card(s('taxId'), l.taxId), card(s('period'), l.period), card(s('currency'), l.currency), card(s('software'), l.software), card(s('entries'), l.entries ? String(l.entries) : undefined), hasAmounts ? card(s('debit'), money(l.debit)) : null, hasAmounts ? card(s('credit'), money(l.credit)) : null),
    hasAmounts ? h('p', { class: `lg-check ${Math.abs(diff) < 0.005 ? 'ok' : 'bad'}` }, Math.abs(diff) < 0.005 ? s('ok') : s('bad').replace('{d}', money(diff))) : null,
    l.statedDebit !== undefined ? h('p', { class: `lg-check ${statedMatch ? 'ok' : 'bad'}` }, s('stated').replace('{d}', money(l.statedDebit)).replace('{c}', money(l.statedCredit ?? 0)).replace('{m}', s(statedMatch ? 'match' : 'differ'))) : null,
    l.accounts.length && !q
      ? h(
          'details',
          { class: 'lg-table', open: true },
          h('summary', {}, h('span', {}, s('trial')), h('span', { class: 'lg-count' }, `${l.accounts.length} ${s('rows')} · ${s('signNote')}`)),
          h('div', { class: 'lg-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...['account', 'name', 'opening', 'closing'].map((k, i) => h('th', { class: i > 1 ? 'num' : undefined }, s(k as 'account'))))), h('tbody', {}, ...l.accounts.map((a) => h('tr', {}, h('td', {}, a.id), h('td', {}, a.name), h('td', { class: 'num' }, money(a.opening)), h('td', { class: 'num' }, money(a.closing))))))),
        )
      : null,
    h('h3', { class: 'lg-h' }, s('records')),
    ...(l.tables.map((t) => tableView(t, q)).filter(Boolean) as HTMLElement[]),
  );
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const src = await readText(file, ctx.mount, undefined, ctx.progress);
  if (!isSource(src)) return src;
  const ledger = parseLedger(src.text);
  if (!ledger) return (await import('../code/view')).open(file, ctx);
  const search = h('input', { type: 'search', class: 'lg-search', placeholder: s('search'), 'aria-label': s('search') }) as HTMLInputElement;
  const body = h('div', { class: 'view view-ledger' });
  const draw = () => body.replaceChildren(render(ledger, search.value));
  search.addEventListener('input', draw);
  ctx.mount.replaceChildren(body);
  draw();
  return {
    title: ledger.company,
    meta: () => [s(ledger.kind), ...(ledger.entries ? [`${ledger.entries} ${s('entries')}`] : []), file.name],
    tools: () => [search],
    about: () => src.about(),
    onLangChange: draw,
  };
}
