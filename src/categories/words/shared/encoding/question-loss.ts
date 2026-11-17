/**
 * Text whose characters were replaced by "?" when it was saved: e.g. Chinese
 * saved by Excel as "CSV (Comma delimited)" on a Western (Windows-1252)
 * system. The "?" are real bytes in the file, so nothing can bring the text
 * back; the reader should say so instead of leaving people guessing.
 *
 * Counts question marks that cannot be punctuation: runs of two or more, and
 * single ones followed directly by a letter or digit ("?6", "?OK").
 */
export function lostToQuestionMarks(text: string): number {
  let lost = 0;
  let letters = 0;
  const re = /\?+/g;
  for (const ch of text) if (/[\p{L}\p{N}]/u.test(ch)) letters++;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const next = text[m.index + m[0].length] ?? '';
    if (m[0].length >= 2 || /[\p{L}\p{N}]/u.test(next)) lost += m[0].length;
  }
  // Enough to be sure, and a real share of the text (code like "a ?? b" stays quiet).
  return lost >= 12 && lost >= 0.05 * (lost + letters) ? lost : 0;
}
