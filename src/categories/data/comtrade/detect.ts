/**
 * Tiny check, part of the first page load (the parser itself loads only
 * when a COMTRADE file is opened): a .cfg's second line is "TT,##A,##D".
 */
export function looksLikeCfg(text: string): boolean {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/, 3);
  return lines.length >= 2 && /^\s*\d+\s*,\s*\d+A\s*,\s*\d+D\s*$/i.test(lines[1]);
}
