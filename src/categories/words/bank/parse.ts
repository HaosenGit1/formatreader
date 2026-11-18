/**
 * Bank statements → one common shape: SWIFT MT940, ISO 20022 camt.052/053/054 (XML),
 * OFX/QFX/QBO (SGML or XML) and BAI2. A file may hold several statements (accounts or days).
 */

export interface Entry {
  date: string;
  valueDate?: string;
  /** Signed: money in is positive, money out negative. */
  amount: number;
  description: string;
  counterparty?: string;
  counterAccount?: string;
  reference?: string;
  type?: string;
}

export interface Statement {
  account?: string;
  accountName?: string;
  bank?: string;
  currency?: string;
  id?: string;
  from?: string;
  to?: string;
  opening?: { amount: number; date?: string };
  closing?: { amount: number; date?: string };
  entries: Entry[];
}

export type BankFormat = 'mt940' | 'camt' | 'ofx' | 'bai2';

export interface BankFile {
  format: BankFormat;
  statements: Statement[];
}

/** Which bank statement format, from the start of the file (or null). */
export function bankKind(head: string): BankFormat | null {
  if (/urn:iso:std:iso:20022:tech:xsd:camt\.05[234]/.test(head)) return 'camt';
  if (/OFXHEADER\s*:|<OFX>/i.test(head)) return 'ofx';
  if (/(^|\n)\s*:20:/.test(head) && /(^|\n)\s*:25:/.test(head) && /(^|\n)\s*:6[02][FM]:/.test(head)) return 'mt940';
  if (/^\s*01,/.test(head) && /\n\s*0[23],/.test(head)) return 'bai2';
  return null;
}

/** "231231" or "20231231…" → "2023-12-31". */
function ymd(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (/^\d{8}/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  if (/^\d{6}$/.test(t)) {
    const yy = Number(t.slice(0, 2));
    return `${yy < 80 ? 2000 + yy : 1900 + yy}-${t.slice(2, 4)}-${t.slice(4, 6)}`;
  }
  if (/^\d{4}-\d\d-\d\d/.test(t)) return t.slice(0, 10);
  return t;
}
const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

// ------------------------------------------------------------------ MT940

/** Text of :86: — German-style ?20…?29 subfields, or SWIFT /NAME/ codes, or plain. */
function mt86(info: string): Pick<Entry, 'description' | 'counterparty' | 'counterAccount' | 'type'> {
  const flat = info.replace(/\r?\n/g, '');
  if (/\?\d\d/.test(flat)) {
    const sub = new Map<string, string>();
    for (const m of flat.matchAll(/\?(\d\d)([^?]*)/g)) sub.set(m[1], (sub.get(m[1]) ?? '') + m[2]);
    const purpose = [...sub].filter(([k]) => /^(2\d|6[0-3])$/.test(k)).map(([, v]) => v).join(' ');
    return {
      type: sub.get('00'),
      description: purpose.trim() || flat,
      counterparty: [sub.get('32'), sub.get('33')].filter(Boolean).join(' ') || undefined,
      counterAccount: sub.get('31'),
    };
  }
  const name = /\/NAME\/([^/]+)/.exec(flat)?.[1];
  const remi = /\/REMI\/(?:USTD\/\/)?([^/]+)/.exec(flat)?.[1];
  const iban = /\/IBAN\/([^/]+)/.exec(flat)?.[1];
  return { description: (remi ?? info.replace(/\r?\n/g, ' ')).trim(), counterparty: name?.trim(), counterAccount: iban?.trim() };
}

function parseMt940(text: string): Statement[] {
  const statements: Statement[] = [];
  let st: Statement | null = null;
  let last: Entry | null = null;
  // Fields start with ":tag:" at the start of a line; following lines continue the field.
  const fields: Array<[string, string]> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\{[^}]*\}|^-\}$|^\}$/g, '');
    const m = /^:(\d\d[A-Z]?):(.*)$/.exec(line);
    if (m) fields.push([m[1], m[2]]);
    else if (fields.length && line.trim() && !/^-$/.test(line.trim())) fields[fields.length - 1][1] += `\n${line}`;
  }
  const balance = (v: string) => {
    const b = /^([CD])(\d{6})([A-Z]{3})([\d,]+)/.exec(v.trim());
    return b ? { amount: (b[1] === 'D' ? -1 : 1) * num(b[4]), date: ymd(b[2]), currency: b[3] } : null;
  };
  for (const [tag, value] of fields) {
    if (tag === '20') {
      st = { id: value.trim(), entries: [] };
      statements.push(st);
      last = null;
    }
    if (!st) {
      st = { entries: [] };
      statements.push(st);
    }
    if (tag === '25') st.account = value.trim();
    else if (tag === '28C' || tag === '28') st.id = st.id ? `${st.id} / ${value.trim()}` : value.trim();
    else if (tag === '60F' || tag === '60M') {
      const b = balance(value);
      if (b) (st.opening = { amount: b.amount, date: b.date }), (st.currency ??= b.currency), (st.from ??= b.date);
    } else if (tag === '62F' || tag === '62M') {
      const b = balance(value);
      if (b) (st.closing = { amount: b.amount, date: b.date }), (st.to = b.date);
    } else if (tag === '61') {
      const [first, ...rest] = value.split('\n');
      const l = /^(\d{6})(\d{4})?(R?[CD])([A-Z])?([\d,]+)([NFS][A-Z0-9]{3})?([^/]*)(?:\/\/(.*))?$/.exec(first.trim());
      if (!l) continue;
      const sign = l[3] === 'D' || l[3] === 'RC' ? -1 : 1;
      const valueDate = ymd(l[1]);
      let date = valueDate!;
      if (l[2]) date = `${valueDate!.slice(0, 4)}-${l[2].slice(0, 2)}-${l[2].slice(2, 4)}`;
      last = { date, valueDate, amount: sign * num(l[5]), description: rest.join(' ').trim(), reference: (l[7] || '').trim() || l[8]?.trim(), type: l[6] };
      st.entries.push(last);
    } else if (tag === '86' && last) {
      const info = mt86(value);
      last.description = [info.description, last.description].filter(Boolean).join(' · ');
      last.counterparty ??= info.counterparty;
      last.counterAccount ??= info.counterAccount;
      if (info.type) last.type = info.type;
    }
  }
  return statements.filter((s) => s.entries.length || s.opening || s.closing);
}

// ------------------------------------------------------------------ camt.052 / 053 / 054

const kids = (el: Element | null | undefined, name: string) => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
const kid = (el: Element | null | undefined, ...path: string[]): Element | null => {
  let cur: Element | null | undefined = el;
  for (const p of path) cur = kids(cur, p)[0];
  return cur ?? null;
};
const val = (el: Element | null | undefined, ...path: string[]) => kid(el, ...path)?.textContent?.trim() || undefined;
const deep = (el: Element | null | undefined, name: string) => (el ? (Array.from(el.getElementsByTagName('*')).find((e) => e.localName === name) ?? null) : null);

function camtAmount(el: Element): number {
  const amt = num(val(el, 'Amt') ?? '0');
  return val(el, 'CdtDbtInd') === 'DBIT' ? -amt : amt;
}

function parseCamt(text: string): Statement[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const root = doc.documentElement;
  const groups = Array.from(root.getElementsByTagName('*')).filter((e) => ['Stmt', 'Rpt', 'Ntfctn'].includes(e.localName));
  return groups.map((g) => {
    const acct = kid(g, 'Acct');
    const st: Statement = {
      id: val(g, 'Id'),
      account: val(acct, 'Id', 'IBAN') ?? val(acct, 'Id', 'Othr', 'Id'),
      accountName: val(acct, 'Nm') ?? val(acct, 'Ownr', 'Nm'),
      bank: val(acct, 'Svcr', 'FinInstnId', 'Nm') ?? val(acct, 'Svcr', 'FinInstnId', 'BICFI') ?? val(acct, 'Svcr', 'FinInstnId', 'BIC'),
      currency: val(acct, 'Ccy'),
      from: ymd(val(g, 'FrToDt', 'FrDtTm')),
      to: ymd(val(g, 'FrToDt', 'ToDtTm')),
      entries: [],
    };
    for (const b of kids(g, 'Bal')) {
      const code = val(b, 'Tp', 'CdOrPrtry', 'Cd') ?? val(b, 'Tp', 'CdOrPrtry', 'Prtry');
      const entry = { amount: camtAmount(b), date: ymd(val(b, 'Dt', 'Dt') ?? val(b, 'Dt', 'DtTm')) };
      if ((code === 'OPBD' || code === 'PRCD') && !st.opening) st.opening = entry;
      if (code === 'CLBD') st.closing = entry;
      st.currency ??= kid(b, 'Amt')?.getAttribute('Ccy') ?? undefined;
    }
    for (const n of kids(g, 'Ntry')) {
      const amount = camtAmount(n);
      const tx = deep(n, 'TxDtls');
      const parties = kid(tx, 'RltdPties');
      // Money in: the payer is the other party; money out: the payee.
      const other = amount >= 0 ? 'Dbtr' : 'Cdtr';
      const party = kid(parties, other);
      const name = val(party, 'Nm') ?? val(party, 'Pty', 'Nm');
      const otherAcct = kid(parties, `${other}Acct`);
      const remit = tx ? Array.from(tx.getElementsByTagName('*')).filter((e) => e.localName === 'Ustrd').map((e) => e.textContent?.trim()).filter(Boolean).join(' ') : '';
      st.entries.push({
        date: ymd(val(n, 'BookgDt', 'Dt') ?? val(n, 'BookgDt', 'DtTm')) ?? '',
        valueDate: ymd(val(n, 'ValDt', 'Dt') ?? val(n, 'ValDt', 'DtTm')),
        amount,
        description: remit || val(n, 'AddtlNtryInf') || val(tx, 'AddtlTxInf') || '',
        counterparty: name,
        counterAccount: val(otherAcct, 'Id', 'IBAN') ?? val(otherAcct, 'Id', 'Othr', 'Id'),
        reference: val(kid(tx, 'Refs'), 'EndToEndId') ?? val(n, 'AcctSvcrRef') ?? val(n, 'NtryRef'),
        type: val(n, 'BkTxCd', 'Domn', 'Fmly', 'SubFmlyCd') ?? val(n, 'BkTxCd', 'Prtry', 'Cd'),
      });
    }
    return st;
  });
}

// ------------------------------------------------------------------ OFX / QFX / QBO

function parseOfx(text: string): Statement[] {
  // OFX 1.x is SGML (leaf tags are not closed): read "<TAG>value" pairs inside each block.
  const field = (block: string, tag: string) => new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block)?.[1]?.trim() || undefined;
  const blocks = (src: string, tag: string) => {
    const out: string[] = [];
    const re = new RegExp(`<${tag}>([\\s\\S]*?)(?:</${tag}>|(?=<${tag}>)|$)`, 'gi');
    for (const m of src.matchAll(re)) out.push(m[1]);
    return out;
  };
  const statements: Statement[] = [];
  for (const rs of [...blocks(text, 'STMTRS'), ...blocks(text, 'CCSTMTRS')]) {
    const list = blocks(rs, 'BANKTRANLIST')[0] ?? rs;
    const entries: Entry[] = blocks(list, 'STMTTRN').map((t) => ({
      date: ymd(field(t, 'DTPOSTED')) ?? '',
      valueDate: ymd(field(t, 'DTAVAIL') ?? field(t, 'DTUSER')),
      amount: num(field(t, 'TRNAMT') ?? '0'),
      description: [field(t, 'MEMO'), field(t, 'CHECKNUM') ? `Check ${field(t, 'CHECKNUM')}` : ''].filter(Boolean).join(' · '),
      counterparty: field(t, 'NAME') ?? field(t, 'PAYEE'),
      reference: field(t, 'FITID') ?? field(t, 'REFNUM'),
      type: field(t, 'TRNTYPE'),
    }));
    const ledger = blocks(rs, 'LEDGERBAL')[0];
    const closing = ledger ? { amount: num(field(ledger, 'BALAMT') ?? '0'), date: ymd(field(ledger, 'DTASOF')) } : undefined;
    const sum = entries.reduce((a, e) => a + e.amount, 0);
    statements.push({
      account: field(rs, 'ACCTID'),
      bank: field(rs, 'BANKID'),
      accountName: field(rs, 'ACCTTYPE'),
      currency: field(rs, 'CURDEF'),
      from: ymd(field(list, 'DTSTART')),
      to: ymd(field(list, 'DTEND')),
      // OFX gives only the closing balance: the opening one follows from it.
      opening: closing ? { amount: Math.round((closing.amount - sum) * 100) / 100 } : undefined,
      closing,
      entries,
    });
  }
  return statements;
}

// ------------------------------------------------------------------ BAI2

function parseBai2(text: string): Statement[] {
  // Records end with "/"; 88 records continue the previous one.
  const records: string[][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/\/$/, '');
    if (!line) continue;
    const parts = line.split(',');
    if (parts[0] === '88' && records.length) records[records.length - 1].push(...parts.slice(1));
    else records.push(parts);
  }
  const statements: Statement[] = [];
  let st: Statement | null = null;
  let groupDate: string | undefined;
  let groupCcy: string | undefined;
  const cents = (s: string | undefined) => (s && s.trim() ? Number(s) / 100 : NaN);
  for (const r of records) {
    if (r[0] === '02') {
      groupDate = ymd(r[4]);
      groupCcy = r[6] || undefined;
    } else if (r[0] === '03') {
      st = { account: r[1], currency: r[2] || groupCcy, from: groupDate, to: groupDate, entries: [] };
      statements.push(st);
      // Summary triples: type code, amount, item count, funds type (+ its extra fields).
      let i = 3;
      while (i + 1 < r.length) {
        const code = r[i];
        const amount = cents(r[i + 1]);
        if (code === '010' && Number.isFinite(amount)) st.opening = { amount, date: groupDate };
        if (code === '015' && Number.isFinite(amount)) st.closing = { amount, date: groupDate };
        const funds = r[i + 3];
        i += 4 + (funds === 'V' ? 2 : funds === 'S' ? 3 : funds === 'D' ? 1 + 2 * Number(r[i + 4] || 0) : 0);
      }
    } else if (r[0] === '16' && st) {
      const code = Number(r[1]);
      const funds = r[3];
      let i = 4 + (funds === 'V' ? 2 : funds === 'S' ? 3 : funds === 'D' ? 1 + 2 * Number(r[4] || 0) : 0);
      const bankRef = r[i++];
      const custRef = r[i++];
      const textPart = r.slice(i).join(',').trim();
      const amount = cents(r[2]) * (code >= 400 && code < 700 ? -1 : 1);
      st.entries.push({ date: groupDate ?? '', amount: Number.isFinite(amount) ? amount : 0, description: textPart, reference: [custRef, bankRef].filter((x) => x && x.trim()).join(' / ') || undefined, type: r[1] });
    }
  }
  return statements;
}

export function parseBank(text: string): BankFile | null {
  const kind = bankKind(text.slice(0, 20000));
  if (!kind) return null;
  const statements = kind === 'mt940' ? parseMt940(text) : kind === 'camt' ? parseCamt(text) : kind === 'ofx' ? parseOfx(text) : parseBai2(text);
  return statements.length ? { format: kind, statements } : null;
}

/** Totals and the balance check: opening + money in − money out = closing? */
export function summarise(st: Statement) {
  let moneyIn = 0;
  let moneyOut = 0;
  for (const e of st.entries) e.amount >= 0 ? (moneyIn += e.amount) : (moneyOut -= e.amount);
  const round = (v: number) => Math.round(v * 100) / 100;
  const expected = st.opening ? round(st.opening.amount + moneyIn - moneyOut) : undefined;
  const difference = expected !== undefined && st.closing ? round(st.closing.amount - expected) : undefined;
  return { moneyIn: round(moneyIn), moneyOut: round(moneyOut), count: st.entries.length, expected, difference };
}
