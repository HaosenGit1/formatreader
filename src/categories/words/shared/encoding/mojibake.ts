import { decode, decodeStrict, encode } from './codec';

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

/** Returns the repaired text, or null if the text does not look double-encoded. */
export function repairMojibake(text: string, maxLayers = 3): RepairResult | null {
  if (!hasNonAscii(text)) return null;
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
