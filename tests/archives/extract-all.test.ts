import { describe, expect, test } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { extractToFolder, extractToZip, safeParts, type DirHandle } from '../../src/categories/archives/archive/extract-all';

/** An in-memory folder that records every write. */
class FakeDir implements DirHandle {
  dirs = new Map<string, FakeDir>();
  files = new Map<string, string>();
  constructor(readonly name: string, readonly writes: string[] = [], readonly path = name) {}
  async getDirectoryHandle(name: string, o?: { create?: boolean }) {
    let d = this.dirs.get(name);
    if (!d) {
      if (!o?.create) throw new Error('NotFound');
      this.dirs.set(name, (d = new FakeDir(name, this.writes, `${this.path}/${name}`)));
    }
    return d;
  }
  async getFileHandle(name: string, o?: { create?: boolean }) {
    if (!this.files.has(name) && !o?.create) throw new Error('NotFound');
    return {
      createWritable: async () => ({
        write: async (b: Blob) => {
          this.files.set(name, await b.text());
          this.writes.push(`${this.path}/${name}`);
        },
        close: async () => {},
      }),
    };
  }
}

const entry = (path: string, text: string) => ({ path, size: text.length, extract: async () => new File([text], path.split('/').pop()!) });

describe('Extract all', () => {
  test('paths cannot escape the folder (zip-slip) and are valid on Windows', () => {
    expect(safeParts('../../etc/passwd')).toEqual(['etc', 'passwd']);
    expect(safeParts('/abs\\win\\..\\x.txt')).toEqual(['abs', 'win', 'x.txt']);
    expect(safeParts('a:b?.txt')).toEqual(['a_b_.txt']);
    expect(safeParts('CON.txt')).toEqual(['_CON.txt']);
    expect(safeParts('name. ')).toEqual(['name']);
  });

  test('writes only inside a NEW folder; an existing one is left alone', async () => {
    const picked = new FakeDir('Desktop');
    // A folder with the archive's name already exists and holds a file.
    const old = await picked.getDirectoryHandle('报告', { create: true });
    old.files.set('keep.txt', 'mine');
    const writesBefore = picked.writes.length;
    const r = await extractToFolder(picked, '报告', [entry('报告/风机/a.txt', 'A'), entry('../evil.txt', 'E'), entry('b.txt', 'B')], () => {});
    expect(r.where).toBe('报告 (2)');
    expect(r.written).toBe(3);
    expect(old.files.get('keep.txt')).toBe('mine');
    const newWrites = picked.writes.slice(writesBefore);
    expect(newWrites.every((w) => w.startsWith('Desktop/报告 (2)/'))).toBe(true);
    expect(newWrites).toContain('Desktop/报告 (2)/报告/风机/a.txt');
    expect(newWrites).toContain('Desktop/报告 (2)/evil.txt');
  });

  test('a file that fails is reported, the rest still extract', async () => {
    const picked = new FakeDir('D');
    const bad = { path: 'locked.bin', size: 1, extract: async () => { throw new Error('encrypted'); } };
    const r = await extractToFolder(picked, 'x', [entry('a.txt', 'A'), bad], () => {});
    expect(r.written).toBe(1);
    expect(r.failed).toEqual(['locked.bin']);
  });

  test('ZIP fallback keeps folders and Chinese names (UTF-8 flag)', async () => {
    const { result, blob } = await extractToZip('报告.rar', [entry('维护/清单.csv', 'x,y'), entry('a.txt', 'A'), entry('A.TXT', 'B')], () => {});
    expect(result.where).toBe('报告.rar.zip');
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['A (2).TXT', 'a.txt', '维护/清单.csv']);
    expect(strFromU8(files['维护/清单.csv'])).toBe('x,y');
    // General-purpose flag bit 11 = names are UTF-8 (so Windows/Mac show them correctly).
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect((bytes[6] | (bytes[7] << 8)) & 0x800).toBe(0x800);
  });
});
