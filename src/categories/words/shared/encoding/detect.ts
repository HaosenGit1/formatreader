import { plausibility } from '../../../../core/plausibility';
import { decode, isValidUtf8 } from './codec';
import { fastLegacy } from './fast';
import { toWhatwgLabel } from './names';

export type DetectReason =
  | 'bom'
  | 'ascii'
  | 'utf8'
  | 'utf16-pattern'
  | 'statistical'
  | 'fallback';

export interface EncodingResult {
  /** WHATWG label usable with TextDecoder. */
  encoding: string;
  /** 0..1 */
  confidence: number;
  reason: DetectReason;
  /** Byte length of a byte-order mark to skip (0 if none). */
  bomLength: number;
  /** Other plausible encodings, best first (for the UI dropdown). */
  alternatives: string[];
}

export interface BinaryResult {
  binary: true;
}

/** The statistical detector (language models, ~700 KB gz), loaded once on demand. */
let detectorPromise: Promise<typeof import('jschardet')> | null = null;
const loadDetector = () => (detectorPromise ??= import('jschardet'));

/**
 * Fetch the detector in the background for visitors who are likely to open
 * non-Unicode files (their browser language uses legacy encodings a lot), so
 * the first GBK / Shift_JIS / Cyrillic file opens without waiting.
 * Skipped when the browser asks to save data.
 */
export function warmDetector(): void {
  if (typeof navigator === 'undefined') return;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  if (langs.some((l) => /^(zh|ja|ko|ru|uk|be|bg|sr|mk|kk|ar|fa|he|el|th|tr|vi|pl|cs|sk|hu|ro|hr|sl|lt|lv|et)\b/i.test(l))) {
    void loadDetector().catch(() => {});
  }
}

/** How many bytes we look at to decide. Enough for any detector, fast on huge files. */
export const SAMPLE_BYTES = 256 * 1024;

const FALLBACK_CANDIDATES = ['gb18030', 'big5', 'shift_jis', 'euc-kr', 'windows-1251', 'windows-1252'];

function bom(bytes: Uint8Array): { label: string; length: number } | null {
  const [a, b, c, d] = bytes;
  if (a === 0xef && b === 0xbb && c === 0xbf) return { label: 'utf-8', length: 3 };
  // UTF-32 BOMs would also match UTF-16 LE; TextDecoder has no UTF-32, treat as binary-ish later.
  if (a === 0xff && b === 0xfe && !(c === 0 && d === 0)) return { label: 'utf-16le', length: 2 };
  if (a === 0xfe && b === 0xff) return { label: 'utf-16be', length: 2 };
  if (a === 0x84 && b === 0x31 && c === 0x95 && d === 0x33) return { label: 'gb18030', length: 4 };
  return null;
}

/** UTF-16 text without a BOM: mostly-ASCII text leaves zero bytes in every other slot. */
function utf16Pattern(bytes: Uint8Array): string | null {
  const n = Math.min(bytes.length, 4096) & ~1;
  if (n < 8) return null;
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < n; i += 2) {
    if (bytes[i] === 0) evenZero++;
    if (bytes[i + 1] === 0) oddZero++;
  }
  const pairs = n / 2;
  if (oddZero / pairs > 0.35 && evenZero / pairs < 0.05) return 'utf-16le';
  if (evenZero / pairs > 0.35 && oddZero / pairs < 0.05) return 'utf-16be';
  return utf16Cjk(bytes.subarray(0, n));
}

/**
 * UTF-16 Chinese / Japanese / Korean without a BOM has almost no zero bytes, so
 * the pattern above misses it (and it looks like binary data). Decode both ways
 * and accept one only if it reads clearly as real text.
 */
function highByteUniform(bytes: Uint8Array, offset: number): boolean {
  const counts = new Map<number, number>();
  let pairs = 0;
  for (let i = offset; i < bytes.length; i += 2, pairs++) counts.set(bytes[i], (counts.get(bytes[i]) ?? 0) + 1);
  const top = [...counts.values()].sort((a, b) => b - a);
  return (top[0] ?? 0) + (top[1] ?? 0) >= pairs * 0.9;
}

function utf16Cjk(bytes: Uint8Array): string | null {
  if (bytes.length < 16) return null;
  // Valid UTF-8 is UTF-8 — unless it is full of control bytes (Arabic/Hebrew/Cyrillic UTF-16 bytes are all below 0x80).
  let low = 0;
  for (const b of bytes) if (b < 0x09 || (b > 0x0d && b < 0x20)) low++;
  if (low < bytes.length * 0.1 && isValidUtf8(bytes, true)) return null;
  let best: { label: string; score: number } | null = null;
  for (const label of ['utf-16le', 'utf-16be']) {
    let text: string;
    try {
      text = new TextDecoder(label, { fatal: true }).decode(bytes);
    } catch {
      continue; // unpaired surrogates: not UTF-16 this way round
    }
    let nonAscii = 0;
    let control = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp >= 0x80) nonAscii++;
      else if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) control++;
    }
    if (nonAscii < 8 || control > text.length * 0.02) continue;
    const score = plausibility(text);
    // One alphabet (Arabic, Russian, Greek, Hindi…): nearly every high byte is the same one or two
    // values (0x06 for Arabic, 0x00 for spaces), which random binary never does.
    const need = highByteUniform(bytes, label === 'utf-16le' ? 1 : 0) ? 0.6 : 1.0;
    if (score >= need && (!best || score > best.score)) best = { label, score };
  }
  return best?.label ?? null;
}

/**
 * Binary check: real text almost never contains NUL bytes or many C0 control
 * characters. (UTF-16 is handled before this is called.)
 */
export function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 64 * 1024);
  if (n === 0) return false;
  let nul = 0;
  let ctrl = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) nul++;
    else if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c && b !== 0x1b) ctrl++;
  }
  if (nul > 0 && nul / n > 0.001) return true;
  if (nul > 2) return true;
  return ctrl / n > 0.05;
}

function isAscii(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) if (bytes[i] > 0x7f) return false;
  return true;
}

/** Share of characters that are decoding errors or stray control characters. */
export function badnessRatio(text: string): number {
  if (!text.length) return 0;
  let bad = 0;
  let total = 0;
  for (const ch of text) {
    total++;
    const cp = ch.codePointAt(0)!;
    if (cp === 0xfffd) bad += 1;
    else if (cp >= 0x80 && cp <= 0x9f) bad += 1; // C1 controls: classic sign of a wrong single-byte guess
    else if (cp >= 0xe000 && cp <= 0xf8ff) bad += 0.5; // private use area
  }
  return bad / total;
}

/**
 * Detect the text encoding of a file. The statistical detector (language
 * models, ~700 KB) is only loaded when a file is not Unicode.
 */
/**
 * Single-byte code pages (especially of one family) differ in only a few letters (Turkish ş ğ ı vs
 * Western; Czech ť š in ISO-8859-2 vs Windows-1250; Russian in KOI8 vs Windows-1251).
 * Statistical detectors often pick the wrong sibling, so compare the family members by
 * how much the decoded text reads like real writing.
 */
const SINGLE_BYTE = [
  'windows-1252', 'iso-8859-15', 'windows-1250', 'iso-8859-2', 'windows-1254', 'windows-1257', 'windows-1258', 'macintosh',
  'windows-1251', 'koi8-r', 'koi8-u', 'ibm866', 'iso-8859-5', 'x-mac-cyrillic',
  'windows-1253', 'iso-8859-7', 'windows-1255', 'iso-8859-8', 'windows-1256', 'iso-8859-6', 'windows-874',
];

function refineSingleByte(result: EncodingResult | BinaryResult, bytes: Uint8Array): EncodingResult | BinaryResult {
  if ('binary' in result || result.reason === 'bom' || result.reason === 'ascii' || result.reason === 'utf8') return result;
  if (!SINGLE_BYTE.includes(result.encoding)) return result;
  const family = SINGLE_BYTE;
  const sample = bytes.subarray(0, 64 * 1024);
  const scoreOf = (label: string) => {
    const text = decode(sample, label);
    return plausibility(text) - badnessRatio(text) * 10;
  };
  const current = scoreOf(result.encoding);
  let best = { label: result.encoding, score: current };
  for (const label of family) {
    if (label === result.encoding) continue;
    const score = scoreOf(label);
    if (score > best.score) best = { label, score };
  }
  if (best.label === result.encoding || best.score - current < 0.15) return result;
  return { ...result, encoding: best.label, alternatives: [result.encoding, ...result.alternatives.filter((a) => a !== best.label)] };
}

export async function detectEncoding(all: Uint8Array): Promise<EncodingResult | BinaryResult> {
  const bytes = all.length > SAMPLE_BYTES ? all.subarray(0, SAMPLE_BYTES) : all;
  return refineSingleByte(await detectEncodingRaw(all), bytes);
}

async function detectEncodingRaw(all: Uint8Array): Promise<EncodingResult | BinaryResult> {
  const bytes = all.length > SAMPLE_BYTES ? all.subarray(0, SAMPLE_BYTES) : all;
  const truncated = all.length > bytes.length;

  const b = bom(bytes);
  if (b) {
    return { encoding: b.label, confidence: 1, reason: 'bom', bomLength: b.length, alternatives: [] };
  }

  const u16 = utf16Pattern(bytes);
  if (u16) {
    return { encoding: u16, confidence: 0.9, reason: 'utf16-pattern', bomLength: 0, alternatives: [] };
  }

  if (looksBinary(bytes)) return { binary: true };

  if (isAscii(bytes)) {
    return { encoding: 'utf-8', confidence: 1, reason: 'ascii', bomLength: 0, alternatives: [] };
  }

  if (isValidUtf8(bytes, truncated)) {
    return {
      encoding: 'utf-8',
      confidence: 0.99,
      reason: 'utf8',
      bomLength: 0,
      alternatives: ['gb18030', 'big5', 'shift_jis', 'windows-1252'],
    };
  }

  // Clear-cut legacy cases (GBK, Big5, Japanese, Korean, Western European)
  // are decided here without downloading the statistical detector.
  const fast = fastLegacy(bytes);
  if (fast) {
    return { encoding: fast.encoding, confidence: 0.95, reason: 'statistical', bomLength: 0, alternatives: fast.alternatives };
  }

  // Legacy encoding: ask the statistical detector, then verify each guess by decoding.
  const guesses = new Map<string, number>();
  try {
    const { detectAll } = await loadDetector();
    for (const r of detectAll(bytes)) {
      const label = toWhatwgLabel(r.encoding);
      if (label && label !== 'utf-8' && !guesses.has(label)) guesses.set(label, r.confidence);
    }
  } catch {
    /* detector failure: fall through to fallbacks */
  }
  for (const label of FALLBACK_CANDIDATES) if (!guesses.has(label)) guesses.set(label, 0);

  const scored = [...guesses.entries()].map(([label, conf]) => {
    const bad = badnessRatio(decode(bytes, label));
    // Every decoding error is strong evidence against a candidate.
    return { label, conf, bad, score: conf - bad * 20 };
  });
  scored.sort((x, y) => y.score - x.score);

  const best = scored[0];
  const runnerUp = scored[1];
  const alternatives = scored.slice(1).map((s) => s.label);
  if (best.conf > 0) {
    // The detector's raw score is not a probability (short files score low even
    // when unambiguous). An error-free decode that rivals can't match is strong proof.
    let confidence = best.conf - best.bad * 5;
    if (best.bad === 0) confidence = runnerUp && runnerUp.bad > 0.002 ? Math.max(confidence, 0.95) : Math.max(confidence, 0.6);
    return {
      encoding: best.label,
      confidence: Math.max(0.05, Math.min(0.99, confidence)),
      reason: 'statistical',
      bomLength: 0,
      alternatives,
    };
  }
  return { encoding: best.label, confidence: 0.1, reason: 'fallback', bomLength: 0, alternatives };
}

export function isBinaryResult(r: EncodingResult | BinaryResult): r is BinaryResult {
  return 'binary' in r;
}
