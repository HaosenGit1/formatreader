import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { detectFormat } from '../src/core/detect-format';
import { decode } from '../src/words/encoding/codec';
import { detectEncoding, isBinaryResult } from '../src/words/encoding/detect';
import { repairMojibake } from '../src/words/encoding/mojibake';
import { classifyText } from '../src/words/text-kind';

const dir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'samples');
const files = readdirSync(dir).filter((f) => !f.startsWith('.'));

/** Expected decoded snippet per sample: proves the right encoding was chosen. */
const EXPECT: Record<string, string> = {
  'novel-gbk.txt': '山村少年',
  'novel-big5.txt': '遠處的山巒',
  'japanese-shiftjis.txt': '吾輩は猫である',
  'korean-euckr.txt': '대한민국은 민주공화국이다',
  'russian-1251.txt': 'Все счастливые семьи',
  'french-1252.txt': 'Le cœur a ses raisons',
  'arabic-1256.txt': 'في البدء كان الكلمة',
  'sales-gbk.csv': '风机叶片',
  'report-utf8-bom.csv': 'Pitch fault',
  'european-semicolon.csv': 'Müller;Köln',
  'movie-gbk.srt': '欢迎来到这里',
  'notepad-utf16.txt': 'Windows 记事本',
  'double-encoded.txt': '这是一段被错误编码后又保存了的中文',
};

const BOOKS: Record<string, string> = { 'sample-book.epub': 'epub', 'sample-comic.cbz': 'cbz' };

describe('book samples are recognised as books', () => {
  for (const [name, id] of Object.entries(BOOKS)) {
    test(name, async () => {
      const bytes = new Uint8Array(readFileSync(join(dir, name)));
      expect((await detectFormat(new Blob([bytes]), name))?.id).toBe(id);
    });
  }
});

describe('every sample opens as readable text', () => {
  for (const name of files.filter((f) => !BOOKS[f])) {
    test(name, async () => {
      const bytes = new Uint8Array(readFileSync(join(dir, name)));
      expect(await detectFormat(new Blob([bytes]), name)).toBeNull();
      const enc = await detectEncoding(bytes);
      expect(isBinaryResult(enc)).toBe(false);
      if (isBinaryResult(enc)) return;
      let text = decode(bytes.subarray(enc.bomLength), enc.encoding);
      const repair = enc.encoding === 'utf-8' ? repairMojibake(text) : null;
      if (repair) text = repair.text;
      // A repaired file may have characters that were destroyed before we saw it; they are counted, not hidden.
      expect(text.split('�').length - 1).toBe(repair?.lost ?? 0);
      if (name !== 'double-encoded.txt') expect(repair).toBeNull();
      if (EXPECT[name]) expect(text).toContain(EXPECT[name]);
      expect(classifyText(name, text).kind).toBeTruthy();
    });
  }
});
