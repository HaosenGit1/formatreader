/** Is this text an HP-GL plot (and not, say, a gnuplot script also named .plt)? Kept tiny for the viewer list. */
export function looksHpgl(head: string): boolean {
  const t = head.replace(/\x1b%-12345X/g, '').replace(/@PJL[^\n]*\n/g, '').replace(/\x1b[%E][^A-Za-z]*[A-Za-z]?/g, '').trimStart();
  return /^(IN|DF|BP|PS|SP|PU|PA|PD|RO|IP|SC|PG)\s*[\d;,-]/i.test(t) || /^IN\s*;/i.test(t);
}
