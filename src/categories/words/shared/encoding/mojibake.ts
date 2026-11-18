import { decode, decodeStrict, encode } from './codec';
import { plausibility } from '../../../../core/plausibility';

/**
 * Repairs text that was decoded with the wrong encoding and then *saved*
 * (so the garbage is now real characters in the file), e.g.
 *   "浣犲ソ"   ← UTF-8 bytes of "你好" read as GBK
 *   "cafÃ©"   ← UTF-8 bytes of "café" read as Windows-1252
 *
 * Idea: re-encode the garbage with the wrong encoding to recover the original
 * bytes, then decode those bytes as UTF-8. Genuine text almost never survives
 * this round-trip as valid UTF-8, so a clean result is strong evidence.
 */

export interface RepairResult {
  text: string;
  /** Encodings that were undone, outermost first, e.g. ['gb18030']. */
  layers: string[];
  /** Characters that could not be recovered (their bytes were lost when the file was first mis-saved). */
  lost: number;
}

const WRONG_ENCODINGS = ['windows-1252', 'gb18030', 'big5', 'shift_jis', 'euc-kr', 'windows-1251'];

/** Quick filter so we only try repairs on text that could plausibly be mojibake. */
function hasNonAscii(text: string): boolean {
  return /[^\x00-\x7f]/.test(text);
}

function countNonAscii(text: string): number {
  let n = 0;
  for (const ch of text) if (ch.codePointAt(0)! > 0x7f) n++;
  return n;
}

function repairOnce(input: string): { text: string; layer: string } | null {
  // A wrong decoder turns bytes it can't use into U+FFFD; that byte is gone,
  // so drop the marker and let the lossy path below judge the result.
  const text = input.replace(/�/g, '');
  const hadLoss = text.length !== input.length;
  for (const wrong of WRONG_ENCODINGS) {
    const bytes = encode(text, wrong);
    if (!bytes) continue; // text contains characters the wrong encoding can't produce
    // Must actually contain multi-byte UTF-8 sequences, not just ASCII.
    let high = 0;
    for (const b of bytes) if (b >= 0x80) high++;
    if (high < 2) continue;

    const strict = decodeStrict(bytes, 'utf-8');
    if (strict !== null) {
      if (strict !== input && countNonAscii(strict) > 0) return { text: strict, layer: wrong };
      continue;
    }
    // Lossy repair: the wrong decoder may have swallowed a byte here and there
    // (common with GBK). Genuine text re-encoded this way is almost all errors,
    // so a low error rate is still strong evidence.
    const lossy = decode(bytes, 'utf-8');
    let errors = 0;
    for (const ch of lossy) if (ch === '�') errors++;
    const nonAscii = countNonAscii(lossy);
    const limit = hadLoss ? 0.1 : 0.05;
    if (nonAscii >= 4 && errors / nonAscii <= limit) return { text: lossy, layer: wrong };
  }
  return null;
}

// ---------------------------------------------------------------- general repair
//
// The cases above all assume the true text was UTF-8. Real 乱码 is often the
// other way round, or between two legacy encodings:
//   "ÄãºÃ"        ← GBK bytes of 你好 shown as Windows-1252 (old web pages, MP3 tags, emails)
//   "Ïðèâåò"      ← Windows-1251 Russian shown as Windows-1252
//   "‚±‚ñ‚É‚¿‚Í" ← Shift-JIS shown as Windows-1252
//   "偙傫偵偪偼"   ← Shift-JIS shown as GBK
//   "斕疑ㄛ岍賜"   ← GBK shown as Big5, and the reverse
//   "縺薙ｓ縺ｫ縺｡縺ｯ" ← UTF-8 shown as Shift-JIS
// Every pair "re-encode with the wrong encoding → decode with another" is tried,
// and a candidate is kept only if it reads far more like real text than the
// input (see plausibility.ts). Genuine text never gains from this.

// Encodings a text may wrongly have been read with, and encodings it may really be in —
// East Asian, Western and Central European, Cyrillic (Windows, KOI8, DOS), Greek,
// Turkish, Hebrew, Arabic, Baltic, Vietnamese, Thai and old Mac.
const SINGLE = ['windows-1250', 'windows-1251', 'windows-1253', 'windows-1254', 'windows-1255', 'windows-1256', 'windows-1257', 'windows-1258', 'windows-874', 'koi8-r', 'ibm866', 'macintosh'];
const WRONG = ['windows-1252', 'gb18030', 'big5', 'shift_jis', 'euc-kr', ...SINGLE];
const RIGHT = ['utf-8', 'gb18030', 'big5', 'shift_jis', 'euc-kr', 'windows-1252', ...SINGLE, 'koi8-u'];
const GAIN = 0.8;

function generalOnce(text: string): { text: string; layer: string; score: number } | null {
  const base = plausibility(text);
  let best: { text: string; layer: string; score: number } | null = null;
  const clean = text.replace(/�/g, '');
  for (const wrong of WRONG) {
    const bytes = encode(clean, wrong);
    if (!bytes) continue;
    let high = 0;
    for (const b of bytes) if (b >= 0x80) high++;
    if (high < 4) continue;
    for (const right of RIGHT) {
      if (right === wrong) continue;
      let out = decodeStrict(bytes, right);
      if (out === null) {
        // A few lost bytes are normal (the wrong decoder swallowed them); many means a wrong guess.
        const lossy = decode(bytes, right);
        let bad = 0;
        for (const ch of lossy) if (ch === '�') bad++;
        // Up to ~20% lost (or just one or two characters) is still worth showing, marked;
        // the plausibility gain below decides whether it is really the right pair.
        if (bad > 2 && bad / Math.max(1, countNonAscii(lossy)) > 0.2) continue;
        out = lossy;
      }
      const score = plausibility(out);
      if (score - base >= GAIN && score > 0.5 && (!best || score > best.score)) best = { text: out, layer: `${wrong}→${right}`, score };
    }
  }
  return best;
}

/** Repairs mojibake between any two common encodings (up to 3 layers deep). */
function repairGeneral(text: string, maxLayers = 3): RepairResult | null {
  if (!hasNonAscii(text)) return null;
  const probe = text.length > 6000 ? text.slice(0, 6000) : text;
  if (!generalOnce(probe)) return null;
  let current = text;
  const layers: string[] = [];
  for (let i = 0; i < maxLayers; i++) {
    const r = generalOnce(current.length > 200000 ? current.slice(0, 200000) : current);
    if (!r) break;
    // Apply the same conversion to the whole text (the probe only chose it).
    const [wrong, right] = r.layer.split('→');
    const bytes = encode(current.replace(/�/g, ''), wrong, true);
    if (!bytes) break;
    current = decode(bytes, right);
    layers.push(r.layer);
  }
  if (!layers.length) return null;
  let lost = 0;
  for (const ch of current) if (ch === '�') lost++;
  return { text: current, layers, lost };
}

/** Returns the repaired text, or null if the text does not look double-encoded. */
export function repairMojibake(text: string, maxLayers = 3): RepairResult | null {
  if (!hasNonAscii(text)) return null;
  // Text whose characters were destroyed when saved (锟斤拷, 嚙踝蕭, 烫烫烫…) can't be repaired.
  if (destroyedKind(text)) return null;
  return repairUtf8(text, maxLayers) ?? repairGeneral(text, maxLayers);
}

/**
 * Patterns that mean the original characters are gone for good:
 * 锟斤拷 / 嚙踝蕭 are the "lost character" mark (U+FFFD) saved through GBK / Big5;
 * 烫烫烫 / 屯屯屯 are a program's uninitialised memory, never text.
 */
export function destroyedKind(text: string): 'lost' | 'memory' | null {
  const sample = text.length > 100000 ? text.slice(0, 100000) : text;
  const count = (re: RegExp) => (sample.match(re) ?? []).length;
  if (count(/锟斤拷|嚙踝蕭|ï¿½/g) >= 2) return 'lost';
  if (count(/(烫){4,}|(屯){4,}|(葺){4,}/g) >= 1) return 'memory';
  return null;
}

/** UTF-8 text decoded with a wrong encoding and saved (the most common case; tuned for lossy GBK). */
function repairUtf8(text: string, maxLayers = 3): RepairResult | null {
  // Large inputs: decide on a prefix first so we don't re-encode megabytes needlessly.
  const probe = text.length > 20000 ? text.slice(0, 20000) : text;
  if (!repairOnce(probe)) return null;

  let current = text;
  const layers: string[] = [];
  for (let i = 0; i < maxLayers; i++) {
    const r = repairOnce(current);
    if (!r) break;
    current = r.text;
    layers.push(r.layer);
  }
  if (!layers.length) return null;
  let lost = 0;
  for (const ch of current) if (ch === '�') lost++;
  return { text: current, layers, lost };
}
