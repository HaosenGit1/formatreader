/**
 * Which files the Sheets viewer opens. Kept separate from the viewer so the
 * shell can decide quickly without loading the spreadsheet engine.
 */

/** Plain-text tables, parsed by our own CSV parser with encoding detection. */
export const DELIMITED_EXT = new Set(['csv', 'tsv', 'tab', 'psv']);

/** Detected format ids (from the file's bytes) that are spreadsheets. */
export const SHEET_FORMAT_IDS = new Set(['xlsx', 'xlsb', 'xls', 'et', 'ods', 'numbers', 'dbf', 'lotus', 'qpw']);

/** Extensions SheetJS reads even when the bytes say "text" (SYLK, DIF, PRN, flat ODS, HTML/XML "xls"). */
export const SHEET_TEXT_EXT = new Set(['xls', 'xlt', 'slk', 'sylk', 'dif', 'prn', 'fods', 'xlsx', 'xlsm', 'ods', 'dbf']);

/** Excel 2003 "XML Spreadsheet" saved with a .xml extension. */
export function isSpreadsheetXml(head: Uint8Array): boolean {
  const text = new TextDecoder('utf-8').decode(head.subarray(0, 2048));
  return text.includes('urn:schemas-microsoft-com:office:spreadsheet') || text.includes('<?mso-application progid="Excel.Sheet"?>');
}
