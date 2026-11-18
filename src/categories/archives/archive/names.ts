/**
 * File names in zips made on Chinese, Japanese or Korean Windows are stored in
 * GBK / Big5 / Shift-JIS / EUC-KR without the "UTF-8" flag, so they come out as
 * DOS code page 437 garbage: "▒¿╕µ/╖τ╡τ│í╘┬▒¿.txt" instead of "报告/风电场月报.txt".
 * Turn the names back into their bytes and pick the encoding under which all the
 * names together read most like real text.
 */
import { plausibility } from '../../../core/plausibility';

const CP437_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const TO_BYTE = new Map([...CP437_HIGH].map((c, i) => [c, 0x80 + i]));

function cp437Bytes(name: string): Uint8Array | null {
  const out: number[] = [];
  for (const ch of name) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else {
      const b = TO_BYTE.get(ch);
      if (b === undefined) return null; // not CP437 garbage
      out.push(b);
    }
  }
  return Uint8Array.from(out);
}

const CANDIDATES = ['utf-8', 'gb18030', 'big5', 'shift_jis', 'euc-kr'];

/** A function that fixes names, or null when the names are fine as they are. */
export function nameRepair(names: string[]): ((name: string) => string) | null {
  const odd = names.filter((n) => /[^\x00-\x7f]/.test(n));
  if (!odd.length) return null;
  const bytes = odd.map(cp437Bytes);
  if (bytes.some((b) => !b)) return null;
  const base = plausibility(odd.join(' '));
  let best: { label: string; score: number } | null = null;
  for (const label of CANDIDATES) {
    const dec = new TextDecoder(label, { fatal: true });
    try {
      const fixed = bytes.map((b) => dec.decode(b!)).join(' ');
      const score = plausibility(fixed);
      if (score - base >= 0.8 && score > 0.5 && (!best || score > best.score)) best = { label, score };
    } catch {
      /* some name isn't valid in this encoding */
    }
  }
  if (!best) return null;
  const dec = new TextDecoder(best.label);
  return (name) => {
    const b = cp437Bytes(name);
    return b && /[^\x00-\x7f]/.test(name) ? dec.decode(b) : name;
  };
}
