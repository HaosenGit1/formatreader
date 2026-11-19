/** Cheap content checks for circuit-board files (kept tiny for the viewer list). */
export function looksGerber(head: string): boolean {
  return /%FS[LT]?[AI]?X\d\dY\d\d\*%/.test(head) || (/\bG04\b/.test(head) && /\bD0?[123]\*/.test(head)) || /%MO(MM|IN)\*%/.test(head);
}
export function looksExcellon(head: string): boolean {
  return /^\s*M48\b/m.test(head) && /^T\d+/m.test(head);
}

