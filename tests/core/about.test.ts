// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { aboutSections } from '../../src/core/about/panel';
import { ENCODING_CHOICES } from '../../src/categories/words/shared/encoding/names';
import { ENCODING_GUIDES, FORMAT_GUIDES } from '../../src/core/about/guide';
import { encode } from '../../src/categories/words/shared/encoding/codec';
import { execFileSync } from 'node:child_process';

const all = (secs: ReturnType<typeof aboutSections>) => secs.map((s) => `${s.heading}\n${s.plain.join('\n')}`).join('\n\n');

describe('About this file', () => {
  test('GBK CSV: names the encoding and how to choose it in Excel, Notepad++, VS Code', () => {
    const text = all(aboutSections({ name: '维护清单.csv', ext: 'csv', size: 10, format: null, viewerId: 'words/sheets', facts: { encoding: 'gb18030', lineEnding: 'CRLF' } }));
    expect(text).toContain('936 : Chinese Simplified (GB2312)');
    expect(text).toContain('Simplified Chinese (GBK)');
    expect(text).toContain('iconv -f GB18030 -t UTF-8 "维护清单.csv" > "维护清单-utf8.csv"');
    expect(text).toContain('CSV UTF-8');
    expect(text).toContain('Windows (CRLF)');
  });

  test('mojibake saved in the file: the repair command really repairs it', () => {
    const secs = aboutSections({ name: 'a.txt', ext: 'txt', size: 1, format: null, viewerId: 'words/text', facts: { encoding: 'utf-8', repaired: ['gb18030'] } });
    const text = all(secs);
    expect(text).toContain('UTF-8 read as GBK');
    const cmd = text.match(/cat "a.txt" \| (.*) > "a-fixed.txt"/)![1];
    // Run the generated pipe on real 乱码: UTF-8 bytes of 你好世界 read as GBK.
    const garbled = new TextDecoder('gbk').decode(new TextEncoder().encode('你好世界'));
    const out = execFileSync('sh', ['-c', cmd], { input: garbled }).toString();
    expect(out).toBe('你好世界');
  });

  test('two-step general repair command', () => {
    const text = all(aboutSections({ name: 'r.txt', ext: 'txt', size: 1, format: null, viewerId: 'words/text', facts: { encoding: 'utf-8', repaired: ['windows-1252→windows-1251'] } }));
    const cmd = text.match(/cat "r.txt" \| (.*) > "r-fixed.txt"/)![1];
    const garbled = new TextDecoder('windows-1252').decode(encode('Привет', 'windows-1251')!);
    expect(execFileSync('sh', ['-c', cmd], { input: garbled }).toString()).toBe('Привет');
  });

  test('wrong extension is pointed out', () => {
    const text = all(aboutSections({ name: 'report.xls', ext: 'xls', size: 1, format: { id: 'xlsx', name: 'Excel workbook', category: 'words' }, viewerId: 'words/sheets', facts: {} }));
    expect(text).toContain('.xlsx');
  });

  test('every encoding the reader offers has a guide; every guide has its two languages', () => {
    for (const c of ENCODING_CHOICES) expect(ENCODING_GUIDES[c.label], c.label).toBeTruthy();
    for (const [id, g] of Object.entries(FORMAT_GUIDES)) {
      expect(g.from[0] && g.from[1], id).toBeTruthy();
      expect(g.open.length, id).toBeGreaterThan(0);
    }
  });
});
