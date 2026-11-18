/**
 * E-invoice XML → one common shape: China's 数电票/全电发票 (EInvoice), UBL 2.1 (Peppol,
 * XRechnung UBL, many national systems) and UN/CEFACT CII (ZUGFeRD, Factur-X, XRechnung CII).
 * Field names differ between versions and vendors, so each value is looked up from a short
 * list of known names; every field of the file is also kept (allFields) so nothing is lost.
 */

export interface Party {
  name?: string;
  taxId?: string;
  address?: string;
  bank?: string;
}

export interface Line {
  name?: string;
  spec?: string;
  unit?: string;
  quantity?: string;
  price?: string;
  amount?: string;
  taxRate?: string;
  tax?: string;
}

export interface Invoice {
  standard: 'cn' | 'ubl' | 'cii';
  kind?: string;
  number?: string;
  date?: string;
  dueDate?: string;
  currency?: string;
  seller: Party;
  buyer: Party;
  lines: Line[];
  net?: string;
  tax?: string;
  gross?: string;
  payable?: string;
  inWords?: string;
  issuer?: string;
  note?: string;
  allFields: Array<[string, string]>;
}

/** Which invoice standard, from the start of the file (or null). */
export function invoiceKind(head: string): Invoice['standard'] | null {
  if (/<(\w+:)?EInvoice[\s>]/.test(head) || /<(\w+:)?(FPXX|Fpxx|InvoiceData)[\s>]/.test(head) && /发票|SellerName|XSFMC/.test(head)) return 'cn';
  if (/urn:oasis:names:specification:ubl:schema:xsd:(Invoice|CreditNote)-2/.test(head)) return 'ubl';
  if (/CrossIndustryInvoice/.test(head)) return 'cii';
  return null;
}

const leafText = (e: Element) => (e.children.length ? '' : (e.textContent ?? '').trim());
const elements = (root: Element | Document) => Array.from(root.getElementsByTagName('*'));
/** First non-empty value of any of these element names (local name, case-insensitive). */
function pick(root: Element | Document | null | undefined, ...names: string[]): string | undefined {
  if (!root) return undefined;
  const wanted = names.map((n) => n.toLowerCase());
  for (const name of wanted) {
    for (const e of elements(root)) if (e.localName.toLowerCase() === name && leafText(e)) return leafText(e);
  }
  return undefined;
}
const find = (root: Element | Document | null | undefined, ...names: string[]): Element | null => {
  if (!root) return null;
  const wanted = names.map((n) => n.toLowerCase());
  return elements(root).find((e) => wanted.includes(e.localName.toLowerCase())) ?? null;
};
const findAll = (root: Element | Document | null | undefined, ...names: string[]) => {
  if (!root) return [];
  const wanted = names.map((n) => n.toLowerCase());
  return elements(root).filter((e) => wanted.includes(e.localName.toLowerCase()));
};

function allFields(doc: Document): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (e: Element, path: string) => {
    const p = path ? `${path} › ${e.localName}` : e.localName;
    for (const a of Array.from(e.attributes)) if (!a.name.startsWith('xmlns')) out.push([`${p} @${a.localName}`, a.value]);
    if (!e.children.length) {
      const t = (e.textContent ?? '').trim();
      if (t) out.push([p, t]);
    }
    for (const c of Array.from(e.children)) walk(c, p);
  };
  walk(doc.documentElement, '');
  return out.slice(0, 5000);
}

function chinese(doc: Document): Invoice {
  const seller = find(doc, 'SellerInformation', 'Seller', 'XSFXX');
  const buyer = find(doc, 'BuyerInformation', 'Buyer', 'GMFXX');
  const items = findAll(doc, 'IssuItemInformation', 'IssuItemInfo', 'InvoiceItem', 'FPMX', 'Fpmx', 'ItemInformation');
  return {
    standard: 'cn',
    kind: pick(find(doc, 'EInvoiceType'), 'LabelName') ?? pick(doc, 'InvoiceTypeName', 'FPZLMC', 'InvoiceType'),
    number: pick(doc, 'InvoiceNumber', 'InvoiceNo', 'FPHM', 'Fphm', 'EIid'),
    date: pick(doc, 'IssueTime', 'IssueDate', 'KPRQ', 'Kprq', 'RequestTime'),
    currency: 'CNY',
    seller: { name: pick(seller ?? doc, 'SellerName', 'XSFMC', 'Xsfmc'), taxId: pick(seller ?? doc, 'SellerIdNum', 'SellerTaxID', 'SellerTaxNo', 'XSFNSRSBH'), address: pick(seller, 'SellerAddr', 'SellerAddress', 'XSFDZ'), bank: pick(seller, 'SellerBankName', 'XSFKHH') },
    buyer: { name: pick(buyer ?? doc, 'BuyerName', 'GMFMC', 'Gmfmc'), taxId: pick(buyer ?? doc, 'BuyerIdNum', 'BuyerTaxID', 'BuyerTaxNo', 'GMFNSRSBH'), address: pick(buyer, 'BuyerAddr', 'BuyerAddress', 'GMFDZ'), bank: pick(buyer, 'BuyerBankName', 'GMFKHH') },
    lines: items.map((it) => ({
      name: pick(it, 'ItemName', 'XMMC', 'Xmmc', 'GoodsName'),
      spec: pick(it, 'SpecMod', 'GGXH', 'Specification'),
      unit: pick(it, 'MeaUnits', 'DW', 'Unit'),
      quantity: pick(it, 'Quantity', 'SPSL', 'XMSL'),
      price: pick(it, 'UnPrice', 'DJ', 'XMDJ', 'UnitPrice'),
      amount: pick(it, 'Amount', 'JE', 'XMJE'),
      taxRate: pick(it, 'TaxRate', 'SL', 'SLV'),
      tax: pick(it, 'ComTaxAm', 'SE', 'TaxAmount'),
    })),
    net: pick(doc, 'TotalAmWithoutTax', 'HJJE', 'TotalAmount'),
    tax: pick(doc, 'TotalTaxAm', 'HJSE', 'TotalTax'),
    gross: pick(doc, 'TotalTax-includedAmount', 'JSHJ', 'TotalAmountWithTax'),
    inWords: pick(doc, 'TotalTax-includedAmountInChinese', 'JSHJDX'),
    issuer: pick(doc, 'Drawer', 'KPR', 'Issuer'),
    note: pick(doc, 'Remark', 'BZ', 'Note'),
    allFields: allFields(doc),
  };
}

function ubl(doc: Document): Invoice {
  const party = (role: string): Party => {
    const p = find(doc, role);
    return {
      name: pick(p, 'RegistrationName', 'Name'),
      taxId: pick(find(p, 'PartyTaxScheme'), 'CompanyID') ?? pick(p, 'CompanyID', 'EndpointID'),
      address: [pick(p, 'StreetName'), pick(p, 'PostalZone'), pick(p, 'CityName'), pick(p, 'IdentificationCode')].filter(Boolean).join(', ') || undefined,
    };
  };
  const totals = find(doc, 'LegalMonetaryTotal');
  const root = doc.documentElement;
  const top = (name: string) => Array.from(root.children).find((c) => c.localName === name)?.textContent?.trim();
  return {
    standard: 'ubl',
    kind: root.localName === 'CreditNote' ? 'Credit note' : 'Invoice',
    number: top('ID'),
    date: top('IssueDate'),
    dueDate: top('DueDate') ?? pick(find(doc, 'PaymentMeans'), 'PaymentDueDate'),
    currency: top('DocumentCurrencyCode'),
    seller: party('AccountingSupplierParty'),
    buyer: party('AccountingCustomerParty'),
    lines: findAll(doc, 'InvoiceLine', 'CreditNoteLine').map((l) => ({
      name: pick(find(l, 'Item'), 'Name') ?? pick(l, 'Description'),
      quantity: pick(l, 'InvoicedQuantity', 'CreditedQuantity'),
      unit: find(l, 'InvoicedQuantity', 'CreditedQuantity')?.getAttribute('unitCode') ?? undefined,
      price: pick(find(l, 'Price'), 'PriceAmount'),
      amount: Array.from(l.children).find((c) => c.localName === 'LineExtensionAmount')?.textContent?.trim(),
      taxRate: pick(find(l, 'ClassifiedTaxCategory'), 'Percent'),
    })),
    net: pick(totals, 'TaxExclusiveAmount', 'LineExtensionAmount'),
    tax: Array.from(root.children).find((c) => c.localName === 'TaxTotal') ? pick(Array.from(root.children).find((c) => c.localName === 'TaxTotal'), 'TaxAmount') : undefined,
    gross: pick(totals, 'TaxInclusiveAmount'),
    payable: pick(totals, 'PayableAmount'),
    note: top('Note'),
    allFields: allFields(doc),
  };
}

function cii(doc: Document): Invoice {
  const party = (role: string): Party => {
    const p = find(doc, role);
    return {
      name: Array.from(p?.children ?? []).find((c) => c.localName === 'Name')?.textContent?.trim(),
      taxId: pick(find(p, 'SpecifiedTaxRegistration'), 'ID'),
      address: [pick(p, 'LineOne'), pick(p, 'PostcodeCode'), pick(p, 'CityName'), pick(p, 'CountryID')].filter(Boolean).join(', ') || undefined,
    };
  };
  const doc0 = find(doc, 'ExchangedDocument');
  const sum = find(doc, 'SpecifiedTradeSettlementHeaderMonetarySummation');
  return {
    standard: 'cii',
    kind: 'Invoice',
    number: Array.from(doc0?.children ?? []).find((c) => c.localName === 'ID')?.textContent?.trim(),
    date: pick(find(doc0, 'IssueDateTime'), 'DateTimeString'),
    dueDate: pick(find(doc, 'SpecifiedTradePaymentTerms'), 'DateTimeString'),
    currency: pick(doc, 'InvoiceCurrencyCode'),
    seller: party('SellerTradeParty'),
    buyer: party('BuyerTradeParty'),
    lines: findAll(doc, 'IncludedSupplyChainTradeLineItem').map((l) => ({
      name: pick(find(l, 'SpecifiedTradeProduct'), 'Name'),
      quantity: pick(l, 'BilledQuantity'),
      unit: find(l, 'BilledQuantity')?.getAttribute('unitCode') ?? undefined,
      price: pick(find(l, 'NetPriceProductTradePrice'), 'ChargeAmount'),
      amount: pick(find(l, 'SpecifiedTradeSettlementLineMonetarySummation'), 'LineTotalAmount'),
      taxRate: pick(find(l, 'ApplicableTradeTax'), 'RateApplicablePercent'),
    })),
    net: pick(sum, 'TaxBasisTotalAmount', 'LineTotalAmount'),
    tax: pick(sum, 'TaxTotalAmount'),
    gross: pick(sum, 'GrandTotalAmount'),
    payable: pick(sum, 'DuePayableAmount'),
    note: pick(find(doc0, 'IncludedNote'), 'Content'),
    allFields: allFields(doc),
  };
}

export function parseInvoice(xml: string): Invoice | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  const kind = invoiceKind(xml.slice(0, 20000));
  if (kind === 'cn') return chinese(doc);
  if (kind === 'ubl') return ubl(doc);
  if (kind === 'cii') return cii(doc);
  return null;
}
