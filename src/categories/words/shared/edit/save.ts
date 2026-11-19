/**
 * "Save a copy" for edited text: writes a NEW file (a download named "… (edited).ext"),
 * never the original. The copy keeps the original's encoding, byte-order mark and line
 * endings, so other programs open it exactly as before.
 */
import { encode } from '../encoding/codec';

export interface TextFormat {
  encoding: string;
  bom: boolean;
  /** Line break to write ('\r\n', '\n' or '\r'). */
  eol: string;
}

/** The line break most used in the original text (mixed files keep the majority). */
export function eolOf(raw: string): string {
  const sample = raw.slice(0, 2_000_000);
  const crlf = (sample.match(/\r\n/g) ?? []).length;
  const lf = (sample.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (sample.match(/\r(?!\n)/g) ?? []).length;
  if (crlf >= lf && crlf >= cr && crlf > 0) return '\r\n';
  if (cr > lf) return '\r';
  return '\n';
}

const BOMS: Record<string, number[]> = { 'utf-8': [0xef, 0xbb, 0xbf], 'utf-16le': [0xff, 0xfe], 'utf-16be': [0xfe, 0xff] };

function utf16(text: string, littleEndian: boolean): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  const v = new DataView(out.buffer);
  for (let i = 0; i < text.length; i++) v.setUint16(i * 2, text.charCodeAt(i), littleEndian);
  return out;
}

/** Characters of the text that this encoding cannot store (for the warning). */
export function unencodable(text: string, encoding: string): string[] {
  const norm = encoding.toLowerCase();
  if (norm.startsWith('utf')) return [];
  const bad = new Set<string>();
  for (const ch of new Set(text)) if (!encode(ch, norm)) bad.add(ch);
  return [...bad];
}

/** Text (with "\n" line breaks, as edited) → bytes in the original's format. Null if a character can't be stored. */
export function encodeLike(text: string, f: TextFormat): Uint8Array | null {
  const body = f.eol === '\n' ? text : text.replace(/\r\n|\r|\n/g, f.eol);
  const norm = f.encoding.toLowerCase();
  const bytes = norm === 'utf-16le' ? utf16(body, true) : norm === 'utf-16be' ? utf16(body, false) : encode(body, norm);
  if (!bytes) return null;
  const bom = f.bom ? (BOMS[norm] ?? []) : [];
  if (!bom.length) return bytes;
  const out = new Uint8Array(bom.length + bytes.length);
  out.set(bom);
  out.set(bytes, bom.length);
  return out;
}

/** "report.csv" → "report (edited).csv". */
/** Formats whose real files are not plain text: a copy typed into an empty one is saved as .txt / .csv. */
const RICH_EXT = /\.(docx?|docm|dotx?|odt|rtf|wps|pages|xlsx?|xlsm|xlsb|xltx|ods|et|numbers|pptx?|odp|key|pdf|epub)$/i;

export function copyName(name: string, empty = false, table = false): string {
  if (empty && RICH_EXT.test(name)) return `${name.replace(RICH_EXT, '')} (edited).${table ? 'csv' : 'txt'}`;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} (edited)${name.slice(dot)}` : `${name || 'text'} (edited).txt`;
}

/** Offers the copy as a download; the browser adds (1), (2)… if that name exists. */
export function downloadCopy(bytes: Uint8Array, name: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
