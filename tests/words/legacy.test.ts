import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { describe, expect, test } from 'vitest';
import { docBlocks, docText, pptSlides } from '../../src/categories/words/legacy/extract';

const dir = join(process.cwd(), 'samples', 'legacy');
const cfb = (name: string) => XLSX.CFB.read(readFileSync(join(dir, name)), { type: 'buffer' });
const stream = (c: ReturnType<typeof cfb>, name: string) => {
  const e = XLSX.CFB.find(c, name);
  return e ? new Uint8Array(e.content as ArrayLike<number> as Uint8Array) : undefined;
};
const word = (name: string) => {
  const c = cfb(name);
  return docText(stream(c, 'WordDocument')!, { '0Table': stream(c, '0Table'), '1Table': stream(c, '1Table') });
};

describe('old Word (.doc)', () => {
  test('macOS-written Chinese document', () => {
    const t = word('wind-report.doc');
    expect(t).toContain('风场月度运行报告');
    expect(t).toContain('十月份风场总发电量为 800.8 MWh');
  });
  test('Apache POI sample with a table', () => {
    const blocks = docBlocks(word('simple-table.doc'));
    expect(blocks.some((b) => b.type === 'table')).toBe(true);
  });
  test('Apache POI SampleDoc has readable paragraphs', () => {
    const paras = docBlocks(word('SampleDoc.doc')).filter((b) => b.type === 'para' && b.runs.length);
    expect(paras.length).toBeGreaterThan(3);
  });
  test('Word 6/95 document (Apache POI Word6.doc)', () => {
    expect(word('Word6.doc').trim()).toBe('The quick brown fox jumps over the lazy dog');
  });
  test('field codes are removed, results kept', () => {
    const blocks = docBlocks('See \u0013 HYPERLINK "https://x" \u0014the site\u0015 now\r');
    expect(blocks[0].type === 'para' && blocks[0].runs[0].text).toBe('See the site now');
  });
  test('cells and rows', () => {
    const blocks = docBlocks('Intro\rA\u0007B\u0007\u0007C\u0007D\u0007\u0007After\r');
    const table = blocks.find((b) => b.type === 'table');
    expect(table?.type === 'table' && table.rows.map((r) => r.map((c) => c.map((p) => p.runs.map((x) => x.text).join('')).join('')))).toEqual([['A', 'B'], ['C', 'D']]);
  });
});

describe('old PowerPoint (.ppt)', () => {
  test('fast-saved file: only the current slides (POI basic test file has 2)', () => {
    const slides = pptSlides(stream(cfb('basic_test_ppt_file.ppt'), 'PowerPoint Document')!);
    expect(slides.map((s) => s.title[0])).toEqual(['This is a test title', 'This is the title on page 2']);
  });
  for (const name of ['basic_test_ppt_file.ppt', 'with_textbox.ppt']) {
    test(name, () => {
      const slides = pptSlides(stream(cfb(name), 'PowerPoint Document')!);
      expect(slides.length).toBeGreaterThan(0);
      expect(slides.some((s) => s.title.length || s.body.length)).toBe(true);
    });
  }
});
