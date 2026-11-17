import { describe, expect, test } from 'vitest';
import { parseRtf, type Para } from '../../src/categories/words/rtf/parse';

const text = (blocks: ReturnType<typeof parseRtf>) =>
  blocks.map((b) => (b.type === 'para' ? b.runs.map((r) => r.text).join('') : `[${b.type}]`)).join('\n');

describe('RTF parser', () => {
  test('paragraphs and formatting', () => {
    const doc = parseRtf('{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Hello {\\b bold} and {\\i italic}.\\par Second\\par}');
    expect(text(doc)).toBe('Hello bold and italic.\nSecond');
    const runs = (doc[0] as Para).runs;
    expect(runs.find((r) => r.text === 'bold')?.b).toBe(true);
    expect(runs.find((r) => r.text === 'italic')?.i).toBe(true);
  });

  test('Chinese via font charset (GBK bytes)', () => {
    // 你好 in GBK = C4 E3 BA C3
    const doc = parseRtf("{\\rtf1\\ansi\\ansicpg1252{\\fonttbl{\\f0\\fnil\\fcharset134 SimSun;}}\\f0 \\'c4\\'e3\\'ba\\'c3\\par}");
    expect(text(doc)).toBe('你好');
  });

  test('Unicode with \\uc fallback characters skipped', () => {
    const doc = parseRtf('{\\rtf1\\ansi\\uc1 \\u20320?\\u22909?\\u-24?\\par}');
    // -24 + 65536 = 65512 (U+FFE8)
    expect(text(doc)).toBe('你好￨');
  });

  test('Russian via \\ansicpg1251', () => {
    // Привет in Windows-1251 = CF F0 E8 E2 E5 F2
    const doc = parseRtf("{\\rtf1\\ansi\\ansicpg1251 \\'cf\\'f0\\'e8\\'e2\\'e5\\'f2\\par}");
    expect(text(doc)).toBe('Привет');
  });

  test('alignment, escapes, special characters', () => {
    const doc = parseRtf('{\\rtf1 \\qc Centered \\{x\\}\\par \\pard \\ldblquote q\\rdblquote \\emdash ok\\par}');
    expect((doc[0] as Para).align).toBe('center');
    // The space after a control word is a delimiter, not text (RTF rule).
    expect(text(doc)).toBe('Centered {x}\n“q”—ok');
  });

  test('font and colour tables, header and info are not shown as text', () => {
    const doc = parseRtf('{\\rtf1{\\fonttbl{\\f0 Times;}}{\\colortbl;\\red255\\green0\\blue0;}{\\info{\\title Secret}}{\\header Page header}\\cf1 Red\\par}');
    expect(text(doc)).toBe('Red');
    expect((doc[0] as Para).runs[0].color).toBe('rgb(255,0,0)');
  });

  test('tables', () => {
    const doc = parseRtf('{\\rtf1 \\trowd\\cellx1000\\cellx2000 A\\cell B\\cell\\row \\trowd\\cellx1000\\cellx2000 1\\cell 2\\cell\\row \\pard After\\par}');
    const table = doc.find((b) => b.type === 'table');
    expect(table?.type === 'table' && table.rows.map((r) => r.map((c) => c.map((p) => p.runs.map((x) => x.text).join('')).join('')))).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ]);
    expect(text(doc)).toContain('After');
  });

  test('PNG picture', () => {
    const doc = parseRtf('{\\rtf1 {\\pict\\pngblip\\picwgoal1440 89504e470d0a1a0a0000000d49484452}\\par}');
    const pic = doc.find((b) => b.type === 'picture');
    expect(pic?.type === 'picture' && pic.mime).toBe('image/png');
    expect(pic?.type === 'picture' && pic.data[1]).toBe(0x50);
  });
});

describe('RTF tables written with \\pard in every cell (macOS, Word)', () => {
  test('stay one table', () => {
    const rtf = '{\\rtf1 Before\\par \\itap1\\trowd\\cellx1000\\cellx2000\\pard\\intbl A\\cell \\pard\\intbl B\\cell \\row \\itap1\\trowd\\cellx1000\\cellx2000\\pard\\intbl 1\\cell \\pard\\intbl 2\\cell \\row \\pard After\\par}';
    const tables = parseRtf(rtf).filter((b) => b.type === 'table');
    expect(tables.length).toBe(1);
    expect(tables[0].type === 'table' && tables[0].rows.length).toBe(2);
  });
});
