/**
 * Text that is *encoded* rather than mis-decoded: Unicode escapes (\u4f60, \xe4),
 * URL encoding (%E4%BD%A0), HTML entities (&#20320;), Base64 (5L2g5aW9),
 * octal byte escapes (\344\275\240, how git shows Chinese file names),
 * quoted-printable (=E4=BD=A0, email bodies) and MIME encoded words
 * (=?GB2312?B?xOO6ww==?=, email subjects).
 * Decoded only when the encoding clearly dominates the text, so normal text
 * that merely contains an escape or two is never changed.
 */

import { plausibility } from '../../../../core/plausibility';

export type EscapeKind = 'unicode' | 'url' | 'html' | 'base64' | 'octal' | 'qp' | 'mime';

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

/** Escaped bytes are usually UTF-8, but old systems escaped GBK, Big5, Shift-JIS… bytes too. */
const LEGACY = ['gb18030', 'big5', 'shift_jis', 'euc-kr'];

function bytesToText(bytes: number[]): string {
  const b = new Uint8Array(bytes);
  try {
    return utf8.decode(b);
  } catch {
    let best: { text: string; score: number } | null = null;
    for (const label of LEGACY) {
      try {
        const text = new TextDecoder(label, { fatal: true }).decode(b);
        const score = plausibility(text);
        if (!best || score > best.score) best = { text, score };
      } catch {
        /* not this one */
      }
    }
    return best && best.score > 0.5 ? best.text : String.fromCharCode(...bytes); // Latin-1 fallback
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

// ------------------------------------------------------------------ octal

const OCTAL_RE = /\\[0-3][0-7]{2}/g;

function decodeOctal(text: string): string {
  return text.replace(/(?:\\[0-3][0-7]{2})+/g, (run) => bytesToText(run.match(/[0-7]{3}/g)!.map((o) => parseInt(o, 8))));
}

// ------------------------------------------------------- quoted-printable

const QP_RE = /=[0-9A-F]{2}/g;

function decodeQp(text: string): string {
  const joined = text.replace(/=\r?\n/g, ''); // soft line breaks
  return joined.replace(/(?:=[0-9A-F]{2})+/g, (run) => bytesToText(run.match(/[0-9A-F]{2}/g)!.map((h) => parseInt(h, 16))));
}

// --------------------------------------------------------- MIME words

const MIME_RE = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;

function decodeMime(text: string): string {
  // Adjacent encoded words are joined without the space between them (RFC 2047).
  return text.replace(/\?=\s+=\?/g, '?==?').replace(MIME_RE, (m, charset: string, kind: string, data: string) => {
    let bytes: Uint8Array;
    try {
      if (kind.toUpperCase() === 'B') bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      else bytes = Uint8Array.from(data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16))), (c) => c.charCodeAt(0));
      const label = /^gb2312$|^gbk$/i.test(charset) ? 'gb18030' : charset;
      return new TextDecoder(label).decode(bytes);
    } catch {
      return m;
    }
  });
}

// ------------------------------------------------------------------ entry

const DOMINANT = 0.3;
const MIN_COUNT = 3;

function decodeOnce(text: string): { text: string; kind: EscapeKind } | null {
  const mime = coverage(text, MIME_RE);
  if (mime.count >= 1 && mime.share >= DOMINANT) return { text: decodeMime(text), kind: 'mime' };
  const b64 = decodeBase64(text);
  if (b64 !== null && b64 !== text) return { text: b64, kind: 'base64' };
  const u = coverage(text, UNICODE_RE);
  if (u.count >= MIN_COUNT && u.share >= DOMINANT) return { text: decodeUnicode(text), kind: 'unicode' };
  const p = coverage(text, URL_RE);
  if (p.count >= MIN_COUNT && p.share >= DOMINANT) return { text: decodeUrl(text), kind: 'url' };
  const e = coverage(text, HTML_RE);
  if (e.count >= MIN_COUNT && e.share >= DOMINANT) return { text: decodeHtml(text), kind: 'html' };
  const o = coverage(text, OCTAL_RE);
  if (o.count >= MIN_COUNT && o.share >= DOMINANT) return { text: decodeOctal(text), kind: 'octal' };
  const q = coverage(text, QP_RE);
  if (q.count >= MIN_COUNT && q.share >= DOMINANT) return { text: decodeQp(text), kind: 'qp' };
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
