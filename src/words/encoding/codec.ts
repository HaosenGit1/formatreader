/**
 * Small codec helpers built on the platform TextDecoder.
 *
 * Browsers can decode legacy encodings (GBK, Big5, Shift_JIS, …) but cannot
 * encode them. We build reverse maps lazily by decoding every 1- and 2-byte
 * sequence once; that is enough to re-encode text, which we need to repair
 * double-encoded text (浣犲ソ → 你好) and to generate test data.
 */

const encoderCache = new Map<string, Map<string, number[]>>();

/**
 * Windows-1252 bytes 0x80–0x9F per the WHATWG Encoding Standard. Some runtimes
 * (notably Node) decode these as C1 controls, so we decode 1252 ourselves to
 * get identical results everywhere.
 */
const CP1252_HIGH =
  '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F' +
  '\u0090‘’“”•–—˜™š›œ\u009DžŸ';
const CP1252_LABELS = new Set(['windows-1252', 'cp1252', 'latin1', 'iso-8859-1', 'ascii', 'us-ascii', 'x-cp1252']);

function decodeCp1252(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part: string[] = [];
    const end = Math.min(bytes.length, i + CHUNK);
    for (let j = i; j < end; j++) {
      const b = bytes[j];
      part.push(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b));
    }
    out += part.join('');
  }
  return out;
}

/** Decode bytes with a WHATWG label. Never throws; invalid bytes become U+FFFD. */
export function decode(bytes: Uint8Array, label: string): string {
  if (CP1252_LABELS.has(label.toLowerCase())) return decodeCp1252(bytes);
  return new TextDecoder(label).decode(bytes);
}

/** Decode, returning null if any byte sequence is invalid. */
export function decodeStrict(bytes: Uint8Array, label: string): string | null {
  if (CP1252_LABELS.has(label.toLowerCase())) return decodeCp1252(bytes);
  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Returns true if `bytes` is valid UTF-8. A multi-byte sequence cut off at the
 * very end is tolerated when `truncated` is true (we often look at a prefix).
 */
export function isValidUtf8(bytes: Uint8Array, truncated = false): boolean {
  try {
    const d = new TextDecoder('utf-8', { fatal: true });
    d.decode(bytes, { stream: truncated });
    return true;
  } catch {
    return false;
  }
}

function buildEncoder(label: string): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (let b = 0; b < 0x80; b++) map.set(String.fromCharCode(b), [b]);

  // Single high bytes, separated by '\n' so one bad byte cannot shift the rest.
  const singles: number[] = [];
  for (let b = 0x80; b <= 0xff; b++) singles.push(b, 0x0a);
  const singleOut = decode(new Uint8Array(singles), label).split('\n');
  const singleValid = new Set<number>();
  for (let i = 0; i < 128; i++) {
    const ch = singleOut[i];
    if (ch && ch.length === 1 && ch !== '�') {
      singleValid.add(0x80 + i);
      if (!map.has(ch)) map.set(ch, [0x80 + i]);
    }
  }

  // Double-byte sequences (GBK, Big5, Shift_JIS, EUC-KR, EUC-JP two-byte set).
  const pairs: number[] = [];
  const index: Array<[number, number]> = [];
  for (let lead = 0x81; lead <= 0xfe; lead++) {
    if (singleValid.has(lead)) continue;
    for (let trail = 0x40; trail <= 0xfe; trail++) {
      if (trail === 0x7f) continue;
      pairs.push(lead, trail, 0x0a);
      index.push([lead, trail]);
    }
  }
  if (pairs.length) {
    const out = decode(new Uint8Array(pairs), label).split('\n');
    for (let i = 0; i < index.length; i++) {
      const ch = out[i];
      // A single code point (may be a surrogate pair) that is not an error.
      if (!ch || ch.includes('�') || [...ch].length !== 1) continue;
      if (!map.has(ch)) map.set(ch, index[i]);
    }
  }
  return map;
}

function encoderFor(label: string): Map<string, number[]> {
  let enc = encoderCache.get(label);
  if (!enc) {
    enc = buildEncoder(label);
    encoderCache.set(label, enc);
  }
  return enc;
}

/**
 * Encode text into a legacy encoding. Returns null when a character cannot be
 * represented (unless `lossy`, which substitutes '?').
 */
export function encode(text: string, label: string, lossy = false): Uint8Array | null {
  const norm = label.toLowerCase();
  if (norm === 'utf-8' || norm === 'utf8') return new TextEncoder().encode(text);
  const enc = encoderFor(norm === 'gb18030' ? 'gbk' : norm);
  const out: number[] = [];
  for (const ch of text) {
    const bytes = enc.get(ch);
    if (bytes) {
      for (const b of bytes) out.push(b);
    } else if (lossy) {
      out.push(0x3f);
    } else {
      return null;
    }
  }
  return new Uint8Array(out);
}
