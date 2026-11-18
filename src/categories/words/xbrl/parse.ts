/**
 * XBRL financial reports: plain XBRL instances (.xbrl/.xml) and Inline XBRL (iXBRL, an HTML
 * report with tagged figures — SEC, ESMA/EU, UK Companies House). Reads every fact with its
 * period, unit and dimensions. Without the taxonomy's label files (separate downloads),
 * labels are made from the concept names ("CashAndCashEquivalents" → "Cash and cash equivalents").
 */

export interface Period {
  instant?: string;
  start?: string;
  end?: string;
}

export interface Fact {
  concept: string; // prefix:LocalName
  local: string;
  value: string;
  num?: number;
  unit?: string;
  decimals?: string;
  period: Period;
  dims: Array<[string, string]>;
  entity?: string;
}

export interface Report {
  inline: boolean;
  facts: Fact[];
  /** Report title fields from the dei / ifrs / esef cover page facts. */
  entity?: string;
  documentType?: string;
  periodEnd?: string;
  html?: string;
}

const XBRLI = 'http://www.xbrl.org/2003/instance';

export function xbrlKind(head: string): 'xbrl' | 'ixbrl' | null {
  if (/http:\/\/www\.xbrl\.org\/2013\/inlineXBRL/.test(head) || /<ix:(header|nonFraction|nonNumeric)/.test(head)) return 'ixbrl';
  if (/http:\/\/www\.xbrl\.org\/2003\/instance/.test(head) && /<(\w+:)?xbrl[\s>]/.test(head)) return 'xbrl';
  return null;
}

const all = (root: Element | Document, local: string) => Array.from(root.getElementsByTagName('*')).filter((e) => e.localName === local);
const child = (el: Element | null | undefined, local: string) => (el ? Array.from(el.children).find((c) => c.localName === local) ?? null : null);

function readContexts(root: Element | Document) {
  const contexts = new Map<string, { period: Period; dims: Array<[string, string]>; entity?: string }>();
  for (const c of all(root, 'context')) {
    const period = child(c, 'period');
    const p: Period = {
      instant: child(period, 'instant')?.textContent?.trim(),
      start: child(period, 'startDate')?.textContent?.trim(),
      end: child(period, 'endDate')?.textContent?.trim(),
    };
    const dims: Array<[string, string]> = [];
    for (const m of [...all(c, 'explicitMember'), ...all(c, 'typedMember')]) dims.push([m.getAttribute('dimension') ?? '', (m.textContent ?? '').trim()]);
    contexts.set(c.getAttribute('id') ?? '', { period: p, dims, entity: all(c, 'identifier')[0]?.textContent?.trim() });
  }
  return contexts;
}

function readUnits(root: Element | Document) {
  const units = new Map<string, string>();
  for (const u of all(root, 'unit')) {
    const measures = all(u, 'measure').map((m) => (m.textContent ?? '').trim().replace(/^iso4217:/, '').replace(/^xbrli:/, ''));
    const divide = all(u, 'divide').length > 0;
    units.set(u.getAttribute('id') ?? '', divide && measures.length === 2 ? `${measures[0]}/${measures[1]}` : measures.join('·'));
  }
  return units;
}

/** Inline XBRL number formats (ixt:num-dot-decimal, num-comma-decimal, zero-dash…). */
function ixNumber(text: string, format: string | null, scale: string | null, sign: string | null): number {
  let t = text.trim();
  if (/zero|fixed-zero/i.test(format ?? '') || /^[-–—]$/.test(t)) return 0;
  const comma = /comma-?decimal|numcommadecimal|num-comma-decimal/i.test(format ?? '');
  t = comma ? t.replace(/[^\d,]/g, '').replace(',', '.') : t.replace(/[^\d.]/g, '');
  let v = Number(t);
  if (scale) v *= 10 ** Number(scale);
  if (sign === '-') v = -v;
  return v;
}

export function parseReport(text: string): Report | null {
  const kind = xbrlKind(text.slice(0, 50000));
  if (!kind) return null;
  const inline = kind === 'ixbrl';
  const doc = new DOMParser().parseFromString(text, inline ? 'application/xhtml+xml' : 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  const contexts = readContexts(doc);
  const units = readUnits(doc);
  const facts: Fact[] = [];
  const add = (concept: string, value: string, ctxRef: string | null, unitRef: string | null, decimals: string | null, num?: number) => {
    const c = contexts.get(ctxRef ?? '');
    if (!c) return;
    const local = concept.split(':').pop()!;
    facts.push({ concept, local, value, num, unit: unitRef ? units.get(unitRef) ?? unitRef : undefined, decimals: decimals ?? undefined, period: c.period, dims: c.dims, entity: c.entity });
  };
  if (inline) {
    for (const e of all(doc, 'nonFraction')) {
      const nil = e.getAttribute('xsi:nil') === 'true';
      const v = nil ? NaN : ixNumber(e.textContent ?? '', e.getAttribute('format'), e.getAttribute('scale'), e.getAttribute('sign'));
      add(e.getAttribute('name') ?? '', nil ? '' : String(v), e.getAttribute('contextRef'), e.getAttribute('unitRef'), e.getAttribute('decimals'), Number.isFinite(v) ? v : undefined);
    }
    for (const e of all(doc, 'nonNumeric')) add(e.getAttribute('name') ?? '', (e.textContent ?? '').replace(/\s+/g, ' ').trim(), e.getAttribute('contextRef'), null, null);
  } else {
    for (const e of Array.from(doc.documentElement.children)) {
      if (e.namespaceURI === XBRLI || /linkbase|schemaRef|roleRef|arcroleRef|footnoteLink/.test(e.localName) || !e.getAttribute('contextRef')) continue;
      const value = (e.textContent ?? '').trim();
      const unitRef = e.getAttribute('unitRef');
      const n = unitRef && value !== '' ? Number(value) : NaN;
      add(e.prefix ? `${e.prefix}:${e.localName}` : e.localName, value, e.getAttribute('contextRef'), unitRef, e.getAttribute('decimals'), Number.isFinite(n) ? n : undefined);
    }
  }
  const pick = (...names: string[]) => names.map((n) => facts.find((f) => f.local === n && !f.dims.length)?.value).find(Boolean);
  return {
    inline,
    facts,
    entity: pick('EntityRegistrantName', 'NameOfReportingEntityOrOtherMeansOfIdentification', 'EntityCurrentLegalOrRegisteredName', 'NameOfReportingEntity') ?? facts[0]?.entity,
    documentType: pick('DocumentType', 'AmendmentDescription'),
    periodEnd: pick('DocumentPeriodEndDate', 'DateOfEndOfReportingPeriod2013', 'DateOfEndOfReportingPeriod'),
    html: inline ? text : undefined,
  };
}

/** "CashAndCashEquivalentsAtCarryingValue" → "Cash and cash equivalents at carrying value". */
export function label(local: string): string {
  const words = local.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(' ');
  return words.map((w, i) => (i === 0 ? w : /^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ');
}

export const periodKey = (p: Period) => p.instant ?? `${p.start}…${p.end}`;
export const periodLabel = (p: Period) => p.instant ?? `${p.start} – ${p.end}`;

/** Headline figures, matched across US GAAP and IFRS names. */
export const KEY_FIGURES: Array<[string, string, string[]]> = [
  ['Revenue', '营业收入', ['Revenues', 'Revenue', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractsWithCustomers']],
  ['Net profit', '净利润', ['NetIncomeLoss', 'ProfitLoss', 'ProfitLossAttributableToOwnersOfParent']],
  ['Total assets', '资产总计', ['Assets']],
  ['Total liabilities', '负债合计', ['Liabilities']],
  ['Equity', '所有者权益', ['StockholdersEquity', 'Equity', 'EquityAttributableToOwnersOfParent']],
  ['Cash', '现金及现金等价物', ['CashAndCashEquivalentsAtCarryingValue', 'CashAndCashEquivalents', 'Cash']],
  ['Operating cash flow', '经营活动现金流量', ['NetCashProvidedByUsedInOperatingActivities', 'CashFlowsFromUsedInOperatingActivities']],
  ['EPS (basic)', '基本每股收益', ['EarningsPerShareBasic', 'BasicEarningsLossPerShare']],
];
