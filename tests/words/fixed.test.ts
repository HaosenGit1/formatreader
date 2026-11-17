// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { parseOfd } from '../../src/categories/words/fixed/ofd';
import { parseXps } from '../../src/categories/words/fixed/xps';

const dir = join(process.cwd(), 'samples', 'docs');
const zip = (n: string) => unzipSync(new Uint8Array(readFileSync(join(dir, n))));
const texts = (items: Array<{ kind: string; text?: string }>) => items.filter((i) => i.kind === 'text').map((i) => i.text);

describe('XPS', () => {
  const doc = parseXps(zip('wind-report.xps'));
  test('pages and size (1/96 inch units)', () => {
    expect(doc.pages.length).toBe(2);
    expect([doc.pages[0].width, doc.pages[0].height]).toEqual([816, 1056]);
  });
  test('text, vector paths and the image brush', () => {
    const p = doc.pages[0];
    expect(texts(p.items)).toContain('WTG-03: gearbox fault 齿轮箱故障');
    expect(p.items.some((i) => i.kind === 'path')).toBe(true);
    const img = p.items.find((i) => i.kind === 'image');
    expect(img?.kind === 'image' && img.href.startsWith('data:image/png;base64,')).toBe(true);
    expect(img?.transform).toBe('matrix(1 0 0 1 96 420)');
  });
});

describe('OFD', () => {
  const doc = parseOfd(zip('wind-report.ofd'));
  test('title, page size in mm', () => {
    expect(doc.title).toBe('风场月报（OFD 示例）');
    expect([doc.pages[0].width, doc.pages[0].height]).toEqual([210, 297]);
  });
  test('text at its position, line, image', () => {
    const items = doc.pages[0].items;
    expect(texts(items)).toEqual(['风场月度运行报告', '十月份风场总发电量为 800.8 MWh，平均可利用率 68.5%。', 'WTG-03 因齿轮箱故障停机，建议在冬季前更换。']);
    const title = items.find((i) => i.kind === 'text');
    expect(title?.kind === 'text' && [title.x, title.y]).toEqual([20, 27]);
    expect(items.find((i) => i.kind === 'path')?.kind === 'path').toBe(true);
    expect(items.some((i) => i.kind === 'image')).toBe(true);
  });
});
