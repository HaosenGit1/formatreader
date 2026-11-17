/**
 * Fast, tiny encoding detection for the most common legacy cases, so the big
 * statistical detector (~700 KB) only downloads for genuinely unclear files.
 *
 * Every rule here only fires when the evidence is overwhelming; otherwise it
 * returns null and the caller falls back to the full detector.
 *
 *  - GBK (Simplified Chinese): the 3,755 most common hanzi are exactly the
 *    byte pairs B0–D7 × A1–FE, punctuation is A1–A9 × A1–FE. Real GBK text
 *    is almost entirely in those ranges, and its second bytes are never < 0x7F.
 *  - Big5 (Traditional Chinese): common characters have first bytes A4–C6,
 *    and roughly 40% of second bytes are 0x40–0x7E — impossible in GB2312.
 *  - Shift_JIS / EUC-JP: Japanese prose is full of kana (ぁ–ヶ).
 *  - EUC-KR: Korean text is mostly Hangul syllables.
 *  - Windows-1252: Western European text is mostly ASCII with a few accented
 *    letters; anything denser or with odd symbols is left to the detector.
 */
import { decodeStrict } from './codec';

export interface FastResult {
  encoding: string;
  alternatives: string[];
}

/** Minimum evidence before any rule may decide. */
const MIN_PAIRS = 12;

/**
 * Strict decode that tolerates one incomplete character at the very end
 * (we look at a prefix of the file, which may cut a character in half).
 */
function strictPrefix(bytes: Uint8Array, label: string): string | null {
  if (label === 'windows-1252') return decodeStrict(bytes, label);
  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes, { stream: true });
  } catch {
    return null;
  }
}

interface PairStats {
  pairs: number;
  /** Second byte below 0x7F (allowed in GBK extension and Big5, never in GB2312). */
  lowTrail: number;
  gbCommon: number;
  big5Common: number;
  /** Full-width CJK punctuation (，。、：；！？「」 etc. live in A1–A3 × A1–FE). */
  cjkPunct: number;
  /** Lead bytes C9–D7: common hanzi in GBK, almost never used by Korean Hangul. */
  upperLead: number;
}

/** Walk the bytes as a generic double-byte encoding (lead 0x81–0xFE). */
function pairStats(b: Uint8Array): PairStats {
  const st: PairStats = { pairs: 0, lowTrail: 0, gbCommon: 0, big5Common: 0, cjkPunct: 0, upperLead: 0 };
  for (let i = 0; i < b.length; i++) {
    const lead = b[i];
    if (lead < 0x81 || lead === 0xff) continue;
    const trail = b[i + 1];
    if (trail === undefined) break;
    i++;
    st.pairs++;
    if (trail < 0x7f) st.lowTrail++;
    if (lead >= 0xa1 && lead <= 0xa3 && trail >= 0xa1) st.cjkPunct++;
    if (lead >= 0xc9 && lead <= 0xd7) st.upperLead++;
    if (trail >= 0xa1 && trail <= 0xfe && ((lead >= 0xb0 && lead <= 0xd7) || (lead >= 0xa1 && lead <= 0xa9))) st.gbCommon++;
    if ((lead >= 0xa4 && lead <= 0xc6) || (lead >= 0xa1 && lead <= 0xa3)) {
      if ((trail >= 0x40 && trail <= 0x7e) || (trail >= 0xa1 && trail <= 0xfe)) st.big5Common++;
    }
  }
  return st;
}

function countRanges(text: string) {
  let nonAscii = 0;
  let kana = 0;
  let halfKana = 0;
  let hangul = 0;
  let han = 0;
  let spaces = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x20) spaces++;
    if (cp < 0x80) continue;
    nonAscii++;
    if (cp >= 0x3041 && cp <= 0x30f6) kana++;
    else if (cp >= 0xff61 && cp <= 0xff9f) halfKana++;
    else if (cp >= 0xac00 && cp <= 0xd7a3) hangul++;
    else if (cp >= 0x4e00 && cp <= 0x9fff) han++;
  }
  return { nonAscii, kana, halfKana, hangul, han, spaces };
}

/** Accented letters and typographic marks used by Western European languages in Windows-1252. */
const WESTERN = /^[À-ÖØ-Ýß-öø-ýÿŒœŠšŽžŸ‘’“”„–—…€«»°·×÷ªº¿¡]$/u;

function looksWestern(bytes: Uint8Array): boolean {
  let letters = 0;
  let high = 0;
  // Windows-1252 is a single-byte encoding: decode byte by byte.
  const text = strictPrefix(bytes, 'windows-1252');
  if (text === null) return false;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) letters++;
    else if (cp >= 0x80) {
      if (!WESTERN.test(ch)) return false;
      high++;
      letters++;
    }
  }
  // Western prose: a handful of accents among mostly plain letters. Cyrillic,
  // Greek etc. read as 1252 look like walls of accented letters instead.
  return high >= 1 && letters >= 20 && high / letters < 0.25;
}

/**
 * Cyrillic: the same Russian text in Windows-1251, KOI8-R or CP866 decodes to
 * Cyrillic letters in every case, but only the right one gives mostly
 * lower-case letters dominated by о, е, а, и, н, т, с (the most common letters
 * of Russian, Ukrainian, Bulgarian…). Greek or Arabic bytes read as Cyrillic
 * fail the letter-frequency test.
 */
const CYR_COMMON = new Set([...'оеаинтсрвлі']);

function cyrillicScore(text: string): number {
  let nonAscii = 0;
  let cyr = 0;
  let lower = 0;
  let common = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) continue;
    nonAscii++;
    if (cp >= 0x0400 && cp <= 0x04ff) {
      cyr++;
      const isLower = (cp >= 0x0430 && cp <= 0x045f);
      if (isLower) lower++;
      if (CYR_COMMON.has(ch)) common++;
    }
  }
  if (nonAscii < 20 || cyr / nonAscii < 0.9 || lower === 0) return 0;
  const lowerShare = lower / cyr;
  const commonShare = common / lower;
  return lowerShare >= 0.7 && commonShare >= 0.4 ? lowerShare * commonShare : 0;
}

function looksCyrillic(bytes: Uint8Array): string | null {
  const scores = ['windows-1251', 'koi8-r', 'ibm866'].map((label) => {
    const text = strictPrefix(bytes, label);
    return { label, score: text ? cyrillicScore(text) : 0 };
  });
  scores.sort((a, b) => b.score - a.score);
  // A clear winner only: the right encoding scores high, wrong ones near zero.
  if (scores[0].score > 0.3 && scores[1].score < scores[0].score * 0.5) return scores[0].label;
  return null;
}

/**
 * Returns the encoding when the bytes leave no real doubt, otherwise null.
 * Call only for bytes that are not valid UTF-8 and have no BOM.
 */
export function fastLegacy(sample: Uint8Array): FastResult | null {
  const bytes = sample;
  const st = pairStats(bytes);

  if (st.pairs >= MIN_PAIRS) {
    // Japanese and Korean first: their tell-tale scripts never appear in Chinese.
    for (const label of ['shift_jis', 'euc-jp'] as const) {
      const text = strictPrefix(bytes, label);
      if (!text) continue;
      const c = countRanges(text);
      if (c.nonAscii >= MIN_PAIRS && c.kana / c.nonAscii >= 0.15 && c.halfKana / c.nonAscii < 0.05) {
        return { encoding: label, alternatives: ['shift_jis', 'euc-jp', 'gb18030', 'big5'].filter((l) => l !== label) };
      }
    }
    // Korean and Chinese share byte ranges (Chinese bytes read as Korean give
    // valid-looking Hangul). Real Korean separates words with spaces and uses
    // ASCII punctuation; Chinese has no spaces and uses full-width punctuation.
    const kr = strictPrefix(bytes, 'euc-kr');
    if (kr && st.cjkPunct / st.pairs < 0.02) {
      const c = countRanges(kr);
      if (c.nonAscii >= MIN_PAIRS && c.hangul / c.nonAscii >= 0.6 && c.spaces / c.hangul >= 0.12) {
        return { encoding: 'euc-kr', alternatives: ['gb18030', 'big5', 'shift_jis'] };
      }
    }

    const lowShare = st.lowTrail / st.pairs;
    const chineseShape = st.cjkPunct > 0 || st.upperLead / st.pairs >= 0.05;
    if (lowShare < 0.02 && st.gbCommon / st.pairs >= 0.85 && chineseShape && strictPrefix(bytes, 'gb18030') !== null) {
      return { encoding: 'gb18030', alternatives: ['big5', 'shift_jis', 'euc-kr'] };
    }
    if (lowShare >= 0.1 && st.big5Common / st.pairs >= 0.85 && strictPrefix(bytes, 'big5') !== null) {
      return { encoding: 'big5', alternatives: ['gb18030', 'shift_jis', 'euc-kr'] };
    }
    // Not clearly CJK: single-byte texts (Cyrillic, accented Latin) also have
    // many high bytes, so keep checking below.
  }

  if (looksWestern(bytes)) return { encoding: 'windows-1252', alternatives: ['windows-1250', 'iso-8859-15', 'gb18030'] };
  const cyr = looksCyrillic(bytes);
  if (cyr) return { encoding: cyr, alternatives: ['windows-1251', 'koi8-r', 'ibm866', 'x-mac-cyrillic'].filter((l) => l !== cyr) };
  return null;
}
