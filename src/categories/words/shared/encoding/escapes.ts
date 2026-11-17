/**
 * Text that is *encoded* rather than mis-decoded: Unicode escapes (你),
 * URL encoding (%E4%BD%A0), HTML entities (&#20320;) and Base64 (5L2g5aW9).
 * Decoded only when the encoding clearly dominates the text, so normal text
 * that merely contains an escape or two is never changed.
 */

export type EscapeKind = 'unicode' | 'url' | 'html' | 'base64';

export interface DecodedText {
  text: string;
  kinds: EscapeKind[];
}

/** Share of the non-whitespace characters covered by matches of `re`. */
function coverage(text: string, re: RegExp): { count: number; share: number } {
  const compact = text.replace(/\s+/g, '');
  if (!compact.length) return { count: 0, share: 0 };
  let covered = 0;
  let count = 0;
  for (const m of text.matchAll(re)) {
    covered += m[0].length;
    count++;
  }
  return { count, share: covered / compact.length };
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

function bytesToText(bytes: number[]): string {
  try {
    return utf8.decode(new Uint8Array(bytes));
  } catch {
    return String.fromCharCode(...bytes); // Latin-1 fallback
  }
}

// ---------------------------------------------------------------- unicode

const UNICODE_RE = /\\u\{[0-9a-fA-F]{1,6}\}|\\u[0-9a-fA-F]{4}|\\U[0-9a-fA-F]{8}|\\x[0-9a-fA-F]{2}/g;

function decodeUnicode(text: string): string {
  // Runs of \xNN are usually UTF-8 bytes (e.g. Python bytes reprs).
  let out = text.replace(/(?:\\x[0-9a-fA-F]{2})+/g, (run) => bytesToText(run.match(/[0-9a-fA-F]{2}/g)!.map((h) => parseInt(h, 16))));
  out = out
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\U([0-9a-fA-F]{8})/g, (_m, a, b) => String.fromCodePoint(parseInt(a ?? b, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))); // surrogate pairs combine naturally
  return out.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

// -------------------------------------------------------------------- url

const URL_RE = /%[0-9A-Fa-f]{2}/g;

function decodeUrl(text: string): string {
  // Decode runs of %XX as UTF-8 bytes; leave everything else untouched.
  const formLike = /[=&]/.test(text) && !/\s/.test(text.trim());
  const t = formLike ? text.replace(/\+/g, ' ') : text;
  return t.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => bytesToText(run.match(/[0-9A-Fa-f]{2}/g)!.map((h) => parseInt(h, 16))));
}

// ------------------------------------------------------------------- html

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', middot: '·' };
const HTML_RE = /&#\d{1,7};|&#x[0-9a-fA-F]{1,6};|&(?:amp|lt|gt|quot|apos|nbsp|copy|reg|hellip|mdash|ndash|laquo|raquo|middot);/g;

function decodeHtml(text: string): string {
  return text.replace(HTML_RE, (m) => {
    if (m.startsWith('&#x')) return String.fromCodePoint(parseInt(m.slice(3, -1), 16));
    if (m.startsWith('&#')) return String.fromCodePoint(parseInt(m.slice(2, -1), 10));
    return NAMED[m.slice(1, -1)] ?? m;
  });
}

// ----------------------------------------------------------------- base64

function decodeBase64(text: string): string | null {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 12) return null;
  const standard = /^[A-Za-z0-9+/]+={0,2}$/.test(compact) && compact.length % 4 === 0;
  const urlSafe = /^[A-Za-z0-9_-]+={0,2}$/.test(compact) && /[_-]/.test(compact);
  if (!standard && !urlSafe) return null;
  // Plain words and numbers also match the alphabet; real Base64 mixes cases and digits.
  if (!/[a-z]/.test(compact) || !/[A-Z]/.test(compact) || !/\d|[+/_-]/.test(compact)) return null;
  let bin: string;
  try {
    const norm = compact.replace(/-/g, '+').replace(/_/g, '/');
    bin = atob(norm + '='.repeat((4 - (norm.length % 4)) % 4));
  } catch {
    return null;
  }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  let decoded: string;
  try {
    decoded = utf8.decode(bytes);
  } catch {
    return null; // binary data, not text
  }
  // Must read as text: almost no control characters.
  let printable = 0;
  for (const ch of decoded) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x20 || cp === 0x0a || cp === 0x0d || cp === 0x09) printable++;
  }
  return printable / [...decoded].length >= 0.97 ? decoded : null;
}

// ------------------------------------------------------------------ entry

const DOMINANT = 0.3;
const MIN_COUNT = 3;

function decodeOnce(text: string): { text: string; kind: EscapeKind } | null {
  const b64 = decodeBase64(text);
  if (b64 !== null && b64 !== text) return { text: b64, kind: 'base64' };
  const u = coverage(text, UNICODE_RE);
  if (u.count >= MIN_COUNT && u.share >= DOMINANT) return { text: decodeUnicode(text), kind: 'unicode' };
  const p = coverage(text, URL_RE);
  if (p.count >= MIN_COUNT && p.share >= DOMINANT) return { text: decodeUrl(text), kind: 'url' };
  const e = coverage(text, HTML_RE);
  if (e.count >= MIN_COUNT && e.share >= DOMINANT) return { text: decodeHtml(text), kind: 'html' };
  return null;
}

/** Returns the decoded text when the input is clearly encoded; null otherwise. Handles up to 3 layers. */
export function decodeEscapes(input: string): DecodedText | null {
  if (input.length > 2_000_000) return null;
  let text = input;
  const kinds: EscapeKind[] = [];
  for (let i = 0; i < 3; i++) {
    const r = decodeOnce(text);
    if (!r || r.text === text) break;
    text = r.text;
    kinds.push(r.kind);
  }
  return kinds.length ? { text, kinds } : null;
}
