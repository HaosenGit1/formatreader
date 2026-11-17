// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { hwpxToBlocks } from '../../src/categories/words/hwpx/convert';
import { palmDocText } from '../../src/categories/words/text/palmdoc';

const root = join(process.cwd(), 'samples');

describe('PalmDoc', () => {
  test('compressed records decompress to the original text', () => {
    const text = new TextDecoder('windows-1252').decode(palmDocText(new Uint8Array(readFileSync(join(root, 'books', 'lighthouse.pdb')))));
    expect(text.startsWith('Chapter 1. The Lighthouse Keeper\n\nThe wind came off the sea')).toBe(true);
    expect(text).toContain('Chapter 2. Morning');
    expect(text.split('The wind came off the sea').length - 1).toBe(3);
  });
});

describe('HWPX', () => {
  test('Korean paragraphs, bold heading and table', () => {
    const files = unzipSync(new Uint8Array(readFileSync(join(root, 'docs', 'wind-report.hwpx'))));
    const blocks = hwpxToBlocks([strFromU8(files['Contents/section0.xml'])], strFromU8(files['Contents/header.xml']));
    const first = blocks[0];
    expect(first.type === 'para' && first.runs[0].text).toBe('풍력발전단지 월간 보고서');
    expect(first.type === 'para' && first.runs[0].b).toBe(true);
    const table = blocks.find((b) => b.type === 'table');
    expect(table?.type === 'table' && table.rows.length).toBe(3);
    expect(blocks.some((b) => b.type === 'para' && b.runs.some((r) => r.text.includes('겨울 전에 교체')))).toBe(true);
  });
});
