// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { odpToSlides, odtToBlocks, type OdfInput } from '../../src/categories/words/odf/convert';
import type { Block } from '../../src/categories/words/shared/doc-model';

// happy-dom changes import.meta.url's scheme, so resolve from the project root.
const dir = join(process.cwd(), 'samples', 'docs');
function load(name: string): OdfInput {
  const files = unzipSync(new Uint8Array(readFileSync(join(dir, name))));
  const pictures = new Map(Object.entries(files).filter(([n]) => !n.endsWith('.xml') && n !== 'mimetype'));
  return { content: strFromU8(files['content.xml']), styles: files['styles.xml'] ? strFromU8(files['styles.xml']) : undefined, pictures };
}
const text = (blocks: Block[]) => blocks.map((b) => (b.type === 'para' ? b.runs.map((r) => r.text).join('') : `[${b.type}]`)).join('\n');

describe('OpenDocument text (ODT)', () => {
  const blocks = odtToBlocks(load('wind-report.odt'));
  test('headings, paragraphs and Chinese text', () => {
    const t = text(blocks);
    expect(t).toContain('风场月度运行报告 Wind Farm Monthly Report');
    expect(t).toContain('十月份风场总发电量为 800.8 MWh');
    expect(t).toContain('建议在冬季前更换 WTG-03 齿轮箱');
  });
  test('the table is kept as a table', () => {
    const table = blocks.find((b) => b.type === 'table');
    expect(table?.type === 'table' && table.rows.length).toBe(4);
  });
  test('bold text keeps its formatting', () => {
    const runs = blocks.flatMap((b) => (b.type === 'para' ? b.runs : []));
    expect(runs.find((r) => r.text.includes('bold'))?.b).toBe(true);
  });
});

describe('OpenDocument presentation (ODP)', () => {
  const { slides, aspect } = odpToSlides(load('wind-report.odp'));
  test('slides, frames, text', () => {
    expect(slides.length).toBe(2);
    expect(aspect).toBeCloseTo(28 / 15.75, 2);
    expect(text(slides[0].frames[0].blocks)).toBe('风场月报 Wind Farm Report');
    expect(text(slides[1].frames[1].blocks)).toContain('WTG-03: gearbox fault 齿轮箱故障');
  });
  test('frame positions are percentages of the slide', () => {
    const f = slides[0].frames[0];
    expect(f.x).toBeCloseTo((2 / 28) * 100, 1);
    expect(f.w).toBeCloseTo((24 / 28) * 100, 1);
  });
});
