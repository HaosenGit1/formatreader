/** HWPX (Hangul Word Processor, OWPML XML) → shared document model. */
import type { Block, Para, Run } from '../shared/doc-model';

const local = (e: Element) => e.localName;

function para(p: Element, bold: Set<string>): Para {
  const runs: Run[] = [];
  for (const run of Array.from(p.children).filter((e) => local(e) === 'run')) {
    const isBold = bold.has(run.getAttribute('charPrIDRef') ?? '');
    for (const part of Array.from(run.children)) {
      if (local(part) === 't') runs.push({ text: part.textContent ?? '', b: isBold || undefined });
      else if (local(part) === 'tab') runs.push({ text: '\t' });
      else if (local(part) === 'lineBreak') runs.push({ text: '\n' });
    }
  }
  return { type: 'para', runs: runs.filter((r) => r.text) };
}

function blocks(container: Element, bold: Set<string>): Block[] {
  const out: Block[] = [];
  for (const p of Array.from(container.children).filter((e) => local(e) === 'p')) {
    // Tables live inside runs of a paragraph; keep only the outermost ones
    // (nested tables are reached through their cells).
    const isOuter = (t: Element) => {
      for (let a = t.parentElement; a && a !== p; a = a.parentElement) if (local(a) === 'tbl') return false;
      return true;
    };
    const tables = Array.from(p.querySelectorAll('*')).filter((e) => local(e) === 'tbl' && isOuter(e));
    const own = para(p, bold);
    if (own.runs.length || !tables.length) out.push(own);
    for (const tbl of tables) {
      const rows = Array.from(tbl.children)
        .filter((e) => local(e) === 'tr')
        .map((tr) =>
          Array.from(tr.children)
            .filter((e) => local(e) === 'tc')
            .map((tc) => {
              const sub = Array.from(tc.children).find((e) => local(e) === 'subList') ?? tc;
              return blocks(sub, bold).filter((b): b is Para => b.type === 'para');
            }),
        );
      out.push({ type: 'table', rows });
    }
  }
  return out;
}

/** `sections`: XML of Contents/section0.xml, section1.xml…; `header`: Contents/header.xml. */
export function hwpxToBlocks(sections: string[], header?: string): Block[] {
  const parser = new DOMParser();
  const bold = new Set<string>();
  if (header) {
    const hd = parser.parseFromString(header, 'application/xml');
    for (const cp of Array.from(hd.querySelectorAll('*')).filter((e) => local(e) === 'charPr')) {
      if (Array.from(cp.children).some((c) => local(c) === 'bold')) bold.add(cp.getAttribute('id') ?? '');
    }
  }
  const out: Block[] = [];
  for (const xml of sections) {
    const doc = parser.parseFromString(xml, 'application/xml');
    out.push(...blocks(doc.documentElement, bold));
  }
  return out;
}
