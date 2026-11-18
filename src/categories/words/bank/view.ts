/**
 * Bank statements (MT940, camt.05x, OFX/QFX/QBO, BAI2): detected by content, then shown as
 * a statement per account — opening and closing balance, money in and out, the balance
 * check (opening + in − out = closing), and every transaction in a sortable, searchable
 * table with a running balance. "Copy table" pastes into Excel.
 */
import './bank.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { isSource, readText } from '../shared/read';
import { parseBank, summarise, type BankFile, type Entry, type Statement } from './parse';

const s = strings({
  mt940: { en: 'SWIFT MT940 statement', zh: 'SWIFT MT940 银行流水' },
  camt: { en: 'ISO 20022 camt statement', zh: 'ISO 20022 camt 银行流水' },
  ofx: { en: 'OFX statement (QFX / QBO)', zh: 'OFX 银行流水（QFX / QBO）' },
  bai2: { en: 'BAI2 statement', zh: 'BAI2 银行流水' },
  account: { en: 'Account', zh: '账户' },
  period: { en: 'Period', zh: '期间' },
  opening: { en: 'Opening balance', zh: '期初余额' },
  closing: { en: 'Closing balance', zh: '期末余额' },
  in: { en: 'Money in', zh: '收入' },
  out: { en: 'Money out', zh: '支出' },
  count: { en: 'Transactions', zh: '笔数' },
  ok: { en: '✓ Balances agree: opening + in − out = closing', zh: '✓ 余额核对一致：期初 + 收入 − 支出 = 期末' },
  diff: { en: '⚠ Balances do not agree: difference {d} (opening + in − out = {e}, closing = {c})', zh: '⚠ 余额核对不一致：差额 {d}（期初 + 收入 − 支出 = {e}，期末 = {c}）' },
  noCheck: { en: 'No opening or closing balance in the file: balances cannot be checked.', zh: '文件中没有期初或期末余额，无法核对余额。' },
  date: { en: 'Date', zh: '日期' },
  valueDate: { en: 'Value date', zh: '起息日' },
  description: { en: 'Description', zh: '摘要' },
  counterparty: { en: 'Counterparty', zh: '对方' },
  counterAccount: { en: 'Counter account', zh: '对方账号' },
  reference: { en: 'Reference', zh: '参考号' },
  type: { en: 'Type', zh: '类型' },
  amountIn: { en: 'In', zh: '收入' },
  amountOut: { en: 'Out', zh: '支出' },
  balance: { en: 'Balance', zh: '余额' },
  search: { en: 'Search transactions', zh: '搜索交易' },
  copy: { en: 'Copy table', zh: '复制表格' },
  copyTitle: { en: 'Copy all transactions as a table, to paste into Excel', zh: '把全部交易复制为表格，可直接粘贴到 Excel' },
  copied: { en: 'Copied', zh: '已复制' },
  statements: { en: 'statements', zh: '份流水' },
  shown: { en: '{n} of {t} shown', zh: '显示 {n} / {t} 笔' },
});

const money = (v: number | undefined, ccy?: string) => (v === undefined || !Number.isFinite(v) ? '' : `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${ccy ? ` ${ccy}` : ''}`);

type Col = { key: string; label: string; get: (e: Entry, bal?: number) => string | number | undefined; num?: boolean };

function columns(st: Statement): Col[] {
  const has = (k: keyof Entry) => st.entries.some((e) => e[k]);
  const cols: Col[] = [{ key: 'date', label: s('date'), get: (e) => e.date }];
  if (st.entries.some((e) => e.valueDate && e.valueDate !== e.date)) cols.push({ key: 'valueDate', label: s('valueDate'), get: (e) => e.valueDate });
  cols.push({ key: 'description', label: s('description'), get: (e) => e.description });
  if (has('counterparty')) cols.push({ key: 'counterparty', label: s('counterparty'), get: (e) => e.counterparty });
  if (has('counterAccount')) cols.push({ key: 'counterAccount', label: s('counterAccount'), get: (e) => e.counterAccount });
  if (has('reference')) cols.push({ key: 'reference', label: s('reference'), get: (e) => e.reference });
  if (has('type')) cols.push({ key: 'type', label: s('type'), get: (e) => e.type });
  cols.push({ key: 'in', label: s('amountIn'), get: (e) => (e.amount >= 0 ? e.amount : undefined), num: true });
  cols.push({ key: 'out', label: s('amountOut'), get: (e) => (e.amount < 0 ? -e.amount : undefined), num: true });
  if (st.opening) cols.push({ key: 'balance', label: s('balance'), get: (_e, bal) => bal, num: true });
  return cols;
}

function statementView(st: Statement, file: BankFile, query: () => string): { el: HTMLElement; rows: () => string[][]; filter: () => void } {
  const sum = summarise(st);
  const cols = columns(st);
  // Running balance in file order (the order the bank booked them).
  const balances: number[] = [];
  let bal = st.opening?.amount ?? 0;
  for (const e of st.entries) balances.push((bal = Math.round((bal + e.amount) * 100) / 100));
  let order = st.entries.map((_, i) => i);
  let sortKey = '';
  let sortDir = 1;

  const check = sum.difference === undefined
    ? h('p', { class: 'bank-check muted' }, s('noCheck'))
    : Math.abs(sum.difference) < 0.005
      ? h('p', { class: 'bank-check ok' }, s('ok'))
      : h('p', { class: 'bank-check bad' }, s('diff').replace('{d}', money(sum.difference, st.currency)).replace('{e}', money(sum.expected, st.currency)).replace('{c}', money(st.closing?.amount, st.currency)));

  const card = (label: string, value: string) => h('div', { class: 'bank-card' }, h('span', {}, label), h('strong', {}, value || '—'));
  const tbody = h('tbody');
  const shown = h('p', { class: 'bank-shown' });
  const draw = () => {
    const q = query().toLowerCase();
    const visible = order.filter((i) => !q || cols.some((c) => String(c.get(st.entries[i], balances[i]) ?? '').toLowerCase().includes(q)));
    const frag = document.createDocumentFragment();
    for (const i of visible.slice(0, 20000)) {
      const e = st.entries[i];
      frag.append(h('tr', {}, ...cols.map((c) => {
        const v = c.get(e, balances[i]);
        return h('td', { class: c.num ? `num${c.key === 'out' ? ' out' : ''}` : undefined }, typeof v === 'number' ? money(v) : (v ?? ''));
      })));
    }
    tbody.replaceChildren(frag);
    shown.textContent = visible.length === st.entries.length ? '' : s('shown').replace('{n}', String(visible.length)).replace('{t}', String(st.entries.length));
  };
  const head = h('tr', {}, ...cols.map((c) =>
    h('th', {
      class: c.num ? 'num' : undefined,
      onclick: () => {
        sortDir = sortKey === c.key ? -sortDir : 1;
        sortKey = c.key;
        const val = (i: number) => c.get(st.entries[i], balances[i]);
        order = st.entries.map((_, i) => i).sort((a, b) => {
          const x = val(a);
          const y = val(b);
          if (x === undefined) return 1;
          if (y === undefined) return -1;
          return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sortDir;
        });
        draw();
      },
    }, c.label),
  ));
  draw();
  const el = h(
    'section',
    { class: 'bank-statement' },
    h('header', { class: 'bank-head' },
      h('div', {}, h('p', { class: 'bank-kind' }, s(file.format)), h('h2', {}, [st.accountName, st.account].filter(Boolean).join(' · ') || s('account')), st.bank ? h('p', { class: 'bank-sub' }, st.bank) : null),
      st.from || st.to ? h('div', { class: 'bank-period' }, `${s('period')}: ${[st.from, st.to].filter(Boolean).join(' – ')}`) : null,
    ),
    h('div', { class: 'bank-cards' },
      card(s('opening'), money(st.opening?.amount, st.currency)),
      card(s('in'), money(sum.moneyIn, st.currency)),
      card(s('out'), money(sum.moneyOut, st.currency)),
      card(s('closing'), money(st.closing?.amount, st.currency)),
      card(s('count'), String(sum.count)),
    ),
    check,
    h('div', { class: 'bank-table-wrap' }, h('table', { class: 'bank-table' }, h('thead', {}, head), tbody)),
    shown,
  );
  const rows = () => [cols.map((c) => c.label), ...order.map((i) => cols.map((c) => { const v = c.get(st.entries[i], balances[i]); return typeof v === 'number' ? v.toFixed(2) : String(v ?? '').replace(/[\t\n]/g, ' '); }))];
  return { el, rows, filter: draw };
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const src = await readText(file, ctx.mount, undefined, ctx.progress);
  if (!isSource(src)) return src;
  const bank = parseBank(src.text);
  if (!bank) {
    // Not a statement after all: show it as text.
    return (await import('../text/view')).open(file, ctx);
  }
  const search = h('input', { type: 'search', class: 'bank-search', placeholder: s('search'), 'aria-label': s('search') }) as HTMLInputElement;
  const views = bank.statements.map((st) => statementView(st, bank, () => search.value));
  search.addEventListener('input', () => views.forEach((v) => v.filter()));
  ctx.mount.replaceChildren(h('div', { class: 'view view-bank' }, ...views.map((v) => v.el)));
  const copyBtn = h('button', { type: 'button', class: 'btn', title: s('copyTitle') }, s('copy')) as HTMLButtonElement;
  copyBtn.addEventListener('click', () => {
    const text = views.map((v, i) => [...(views.length > 1 ? [[bank.statements[i].account ?? `#${i + 1}`]] : []), ...v.rows()].map((r) => r.join('\t')).join('\n')).join('\n\n');
    navigator.clipboard?.writeText(text).then(() => {
      copyBtn.textContent = s('copied');
      setTimeout(() => (copyBtn.textContent = s('copy')), 1500);
    });
  });
  const total = bank.statements.reduce((n, st) => n + st.entries.length, 0);
  return {
    meta: () => [s(bank.format), ...(bank.statements.length > 1 ? [`${bank.statements.length} ${s('statements')}`] : []), `${total} ${s('count')}`],
    tools: () => [search, copyBtn],
    about: () => src.about(),
  };
}
