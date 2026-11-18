/**
 * CSV / TSV records with their exact original text, so a saved copy writes untouched rows
 * back byte for byte (same quoting, same spacing) and only re-writes the rows you changed.
 */

export interface Record {
  /** The record's text exactly as in the file (without its line break). Null for a new row. */
  raw: string | null;
  cells: string[];
}

/** Splits text into records (quoted fields may contain line breaks and delimiters). */
export function records(text: string, delim: string): { list: Record[]; trailingBreak: boolean } {
  const list: Record[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const start = i;
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    let atFieldStart = true;
    for (; i < n; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') (cell += '"'), i++;
          else quoted = false;
        } else cell += ch;
        continue;
      }
      if (ch === '"' && atFieldStart) {
        quoted = true;
        atFieldStart = false;
        continue;
      }
      if (ch === delim) {
        cells.push(cell);
        cell = '';
        atFieldStart = true;
        continue;
      }
      if (ch === '\r' || ch === '\n') break;
      cell += ch;
      atFieldStart = false;
    }
    cells.push(cell);
    list.push({ raw: text.slice(start, i), cells });
    // One line break (\r\n, \n or \r) ends the record.
    if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
    else if (i < n) i++;
  }
  const trailingBreak = /[\r\n]$/.test(text);
  return { list, trailingBreak };
}

/** A changed row: quote only the fields that need it. */
export function serialize(cells: string[], delim: string): string {
  return cells.map((c) => (c.includes(delim) || c.includes('"') || /[\r\n]/.test(c) || /^\s|\s$/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(delim);
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The edited table as text: untouched rows exactly as they were, changed and new rows re-written. */
export function rebuild(original: Record[], edited: Array<{ origin: number | null; cells: string[] }>, delim: string, trailingBreak: boolean): string {
  const lines = edited.map((row) => {
    const o = row.origin === null ? null : original[row.origin];
    return o && o.raw !== null && same(o.cells, row.cells) ? o.raw : serialize(row.cells, delim);
  });
  return lines.join('\n') + (trailingBreak ? '\n' : '');
}
