/**
 * Accounting data files for audits: SAF-T (OECD Standard Audit File for Tax — Portugal,
 * Poland, Norway, Lithuania, Romania, Austria, Luxembourg…) and China's GB/T 24589
 * (会计核算软件数据接口) and similar accounting XML exports.
 *
 * Two layers:
 *  - tables(): every repeating record in the file as a table (works for any data XML);
 *    a record nested in another (an entry line in a voucher) carries its parent's key fields.
 *  - summary(): header, accounts with opening/closing balances, and the debit = credit check,
 *    from known element names in English, Chinese and pinyin abbreviations.
 */

export interface Table {
  path: string;
  columns: string[];
  rows: string[][];
}

export interface Account {
  id: string;
  name: string;
  opening: number;
  closing: number;
}

export interface Ledger {
  kind: 'saft' | 'gbt' | 'xml';
  company?: string;
  taxId?: string;
  period?: string;
  currency?: string;
  software?: string;
  accounts: Account[];
  entries: number;
  debit: number;
  credit: number;
  /** Totals stated in the file's header, when present. */
  statedDebit?: number;
  statedCredit?: number;
  tables: Table[];
}

export function ledgerKind(head: string): Ledger['kind'] | null {
  if (/StandardAuditFile|<(\w+:)?AuditFile[\s>]|urn:OECD:StandardAuditFile/i.test(head)) return 'saft';
  if (/GB\/T\s*24589|<(\w+:)?(电子账簿|记账凭证|会计科目|凭证|科目余额|会计凭证)[\s>]/.test(head)) return 'gbt';
  return null;
}

const leaf = (e: Element) => e.children.length === 0;
const text = (e: Element) => (e.textContent ?? '').trim();
const num = (s: string | undefined) => {
  const v = Number((s ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(v) ? v : 0;
};

/** Every group of 2+ sibling elements with the same name that hold fields: a table. */
export function tables(doc: Document, limitRows = 20000): Table[] {
  const groups = new Map<string, { columns: Set<string>; rows: Array<Map<string, string>> }>();
  const walk = (el: Element, path: string, inherited: Array<[string, string]>) => {
    const byName = new Map<string, Element[]>();
    for (const c of Array.from(el.children)) byName.set(c.localName, [...(byName.get(c.localName) ?? []), c]);
    for (const [name, list] of byName) {
      const p = path ? `${path} › ${name}` : name;
      const isRecord = list.length >= 2 || (list[0].children.length > 0 && Array.from(list[0].children).some(leaf) && byName.size === 1 && !!path);
      for (const rec of list) {
        const fields: Array<[string, string]> = [];
        for (const a of Array.from(rec.attributes)) if (!a.name.startsWith('xmlns')) fields.push([`@${a.localName}`, a.value]);
        for (const c of Array.from(rec.children)) if (leaf(c)) fields.push([c.localName, text(c)]);
        if (isRecord && fields.length) {
          let g = groups.get(p);
          if (!g) groups.set(p, (g = { columns: new Set(), rows: [] }));
          if (g.rows.length < limitRows) {
            const row = new Map<string, string>(inherited);
            for (const [k, v] of fields) row.set(k, v);
            for (const k of row.keys()) g.columns.add(k);
            g.rows.push(row);
          }
        }
        // Children of this record inherit its first identifying fields (e.g. voucher no. and date).
        const keys = isRecord ? fields.filter(([k]) => /id|no|number|date|code|编号|号|日期|代码/i.test(k)).slice(0, 3) : [];
        walk(rec, p, [...inherited, ...keys.map(([k, v]) => [`${name}.${k}`, v] as [string, string])]);
      }
    }
  };
  walk(doc.documentElement, '', []);
  return [...groups.entries()]
    .map(([path, g]) => {
      const columns = [...g.columns];
      return { path, columns, rows: g.rows.map((r) => columns.map((c) => r.get(c) ?? '')) };
    })
    .filter((t) => t.rows.length >= 1 && t.columns.length >= 2);
}

const pick = (el: Element | Document | null | undefined, ...names: string[]): string | undefined => {
  if (!el) return undefined;
  const set = new Set(names.map((n) => n.toLowerCase()));
  for (const e of Array.from(el.getElementsByTagName('*'))) if (set.has(e.localName.toLowerCase()) && leaf(e) && text(e)) return text(e);
  return undefined;
};
const find = (el: Element | Document, ...names: string[]) => {
  const set = new Set(names.map((n) => n.toLowerCase()));
  return Array.from(el.getElementsByTagName('*')).filter((e) => set.has(e.localName.toLowerCase()));
};

const N = {
  accountId: ['AccountID', 'AccountCode', '科目编号', '会计科目编号', '科目代码', 'KMBH', 'KMDM'],
  accountName: ['AccountDescription', 'AccountName', '科目名称', '会计科目名称', 'KMMC'],
  openDebit: ['OpeningDebitBalance', '期初借方余额', 'QCJFYE'],
  openCredit: ['OpeningCreditBalance', '期初贷方余额', 'QCDFYE'],
  closeDebit: ['ClosingDebitBalance', '期末借方余额', 'QMJFYE'],
  closeCredit: ['ClosingCreditBalance', '期末贷方余额', 'QMDFYE'],
  opening: ['OpeningBalance', '期初余额', 'QCYE'],
  closing: ['ClosingBalance', '期末余额', 'QMYE'],
  debit: ['DebitAmount', '借方金额', '借方发生额', 'JFJE', 'JFFSE'],
  credit: ['CreditAmount', '贷方金额', '贷方发生额', 'DFJE', 'DFFSE'],
};

export function parseLedger(xmlText: string): Ledger | null {
  const kind = ledgerKind(xmlText.slice(0, 20000));
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  const header = find(doc, 'Header', '文件头', '账簿信息', '电子账簿')[0] ?? doc.documentElement;

  // Accounts: records holding an account id and a name.
  const accounts: Account[] = [];
  for (const a of find(doc, 'Account', 'GeneralLedger', '会计科目', '科目', '科目余额')) {
    const id = pick(a, ...N.accountId);
    if (!id || !a.children.length) continue;
    const opening = pick(a, ...N.opening) !== undefined ? num(pick(a, ...N.opening)) : num(pick(a, ...N.openDebit)) - num(pick(a, ...N.openCredit));
    const closing = pick(a, ...N.closing) !== undefined ? num(pick(a, ...N.closing)) : num(pick(a, ...N.closeDebit)) - num(pick(a, ...N.closeCredit));
    accounts.push({ id, name: pick(a, ...N.accountName) ?? '', opening, closing });
  }

  // Entry lines: elements with a debit or credit amount (SAF-T DebitLine/CreditLine/Line, 凭证分录…).
  let debit = 0;
  let credit = 0;
  const debitNames = new Set(N.debit.map((n) => n.toLowerCase()));
  const creditNames = new Set(N.credit.map((n) => n.toLowerCase()));
  // Only the journal counts (SAF-T PT also lists invoice lines with debit/credit amounts).
  const gle: Element | undefined = find(doc, 'GeneralLedgerEntries', '记账凭证汇总')[0];
  const journal: Element | Document = gle ?? doc;
  for (const e of Array.from(journal.getElementsByTagName('*'))) {
    const n = e.localName.toLowerCase();
    // SAF-T NO/LT wrap the value: <DebitAmount><Amount>12.00</Amount></DebitAmount>.
    const v = leaf(e) ? text(e) : Array.from(e.children).find((c) => c.localName === 'Amount')?.textContent ?? '';
    if (debitNames.has(n)) debit += num(v);
    else if (creditNames.has(n)) credit += num(v);
  }
  const entries = find(doc, 'Transaction', '记账凭证', '凭证').length;
  if (!kind && !accounts.length && !entries) return null;
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    kind: kind ?? 'xml',
    company: pick(header, 'CompanyName', 'Name', '单位名称', '企业名称', '核算单位名称', 'DWMC'),
    taxId: pick(header, 'TaxRegistrationNumber', 'RegistrationNumber', 'CompanyID', '纳税人识别号', '统一社会信用代码'),
    period: [pick(header, 'StartDate', 'SelectionStartDate', '开始日期', '会计期间起'), pick(header, 'EndDate', 'SelectionEndDate', '结束日期', '会计期间止')].filter(Boolean).join(' – ') || pick(header, 'FiscalYear', '会计年度'),
    currency: pick(header, 'CurrencyCode', 'DefaultCurrencyCode', '本位币', '记账本位币'),
    software: [pick(header, 'SoftwareCompanyName', 'SoftwareCompanyNIF', '软件开发商'), pick(header, 'ProductID', 'SoftwareID', '软件名称'), pick(header, 'ProductVersion', 'SoftwareVersion', '软件版本')].filter(Boolean).join(' ') || undefined,
    accounts,
    entries,
    debit: round(debit),
    credit: round(credit),
    statedDebit: gle ? num(Array.from(gle.children).find((c) => c.localName === 'TotalDebit')?.textContent ?? '') || undefined : undefined,
    statedCredit: gle ? num(Array.from(gle.children).find((c) => c.localName === 'TotalCredit')?.textContent ?? '') || undefined : undefined,
    tables: tables(doc),
  };
}
