/** Delimited text (CSV/TSV/…) parsing — no DOM, unit-tested. */

/** RFC 4180 CSV parser: quotes, escaped quotes, newlines inside quotes. */
export function parseDelimited(text: string, delimiter: string, maxRows = Infinity): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i++;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (rows.length >= maxRows) return rows;
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Choose the CSV delimiter that splits the first lines most consistently. */
export function sniffDelimiter(sample: string): string {
  const lines = sample.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ',';
  let bestScore = 0;
  for (const d of [',', '\t', ';', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1);
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.filter((c) => c === counts[0]).length / counts.length;
    const score = counts[0] * consistent;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}
