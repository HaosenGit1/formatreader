import { describe, expect, test } from 'vitest';
import { detectFormat } from '../../src/core/detect-format';

const blob = (bytes: number[] | Uint8Array) => new Blob([new Uint8Array(bytes)]);
const str = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Build a tiny stored (uncompressed) ZIP with the given entries. */
function makeZip(entries: Array<[string, string]>): Uint8Array {
  const enc = new TextEncoder();
  const parts: number[] = [];
  const central: number[] = [];
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  for (const [name, content] of entries) {
    const nb = [...enc.encode(name)];
    const cb = [...enc.encode(content)];
    const offset = parts.length;
    parts.push(...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(cb.length), ...u32(cb.length), ...u16(nb.length), ...u16(0), ...nb, ...cb);
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(cb.length), ...u32(cb.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nb);
  }
  const cdOffset = parts.length;
  const eocd = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(central.length), ...u32(cdOffset), ...u16(0)];
  return new Uint8Array([...parts, ...central, ...eocd]);
}

describe('magic bytes', () => {
  test.each([
    [str('%PDF-1.7\n'), 'x.bin', 'pdf'],
    [[0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'photo', 'jpg'],
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'a', 'png'],
    [[0, 0, 0, 0x18, ...str('ftypheic'), 0, 0, 0, 0], 'IMG_0001.HEIC', 'heic'],
    [[0, 0, 0, 0x18, ...str('ftypisom'), 0, 0, 0, 0], 'v', 'mp4'],
    [[0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x88, ...str('matroska')], 'movie', 'mkv'],
    [str('Rar!\x1a\x07\x01\x00'), 'a.rar', 'rar'],
    [str('AC1032'), 'plan.dwg', 'dwg'],
    [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 'old.doc', 'doc'],
    [str('{\\rtf1\\ansi'), 'letter', 'rtf'],
  ])('%#: %s → %s', async (bytes, name, id) => {
    expect((await detectFormat(blob(bytes as number[]), name as string))?.id).toBe(id);
  });

  test('MOBI marker at offset 60', async () => {
    const b = new Uint8Array(100);
    b.set(str('BOOKMOBI'), 60);
    expect((await detectFormat(blob(b), 'book.mobi'))?.id).toBe('mobi');
  });

  test('plain text is not claimed by any binary format', async () => {
    expect(await detectFormat(blob(str('hello world')), 'a.txt')).toBeNull();
  });
});

describe('zip containers', () => {
  test.each([
    [[['[Content_Types].xml', '<x/>'], ['word/document.xml', '<w/>']], 'docx'],
    [[['[Content_Types].xml', '<x/>'], ['xl/workbook.xml', '<w/>']], 'xlsx'],
    [[['[Content_Types].xml', '<x/>'], ['ppt/presentation.xml', '<p/>']], 'pptx'],
    [[['mimetype', 'application/epub+zip'], ['META-INF/container.xml', '<c/>']], 'epub'],
    [[['mimetype', 'application/vnd.oasis.opendocument.text'], ['content.xml', '<c/>']], 'odt'],
    [[['001.jpg', 'x'], ['002.jpg', 'y']], 'cbz'],
    [[['readme.txt', 'hi'], ['src/a.js', 'x']], 'zip'],
  ])('%#: → %s', async (entries, id) => {
    const zip = makeZip(entries as Array<[string, string]>);
    expect((await detectFormat(blob(zip), 'file'))?.id).toBe(id);
  });
});
