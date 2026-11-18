/**
 * formats.html must never claim a format that doesn't open: every extension
 * listed as supported is routed, by the real detector and router, to the
 * viewer it is listed under. Real sample bytes are used where the format is
 * recognised by content.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
// @ts-expect-error plain JS module shared with the build
import { formatsCatalog } from '../../scripts/formats-catalog.mjs';
import { allViewers } from '../../src/categories';
import { detectFormat, extOf } from '../../src/core/detect-format';
import { pickViewer } from '../../src/core/registry';

const root = process.cwd();
const samples = new Map<string, string>();
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (!samples.has(extOf(f)) && !f.startsWith('locked-')) samples.set(extOf(f), p); // locked files open the unlock screen
  }
};
walk(join(root, 'samples'));

/** Only recognised by content no sample here has (e.g. a .dat needs its .cfg; .cfg must look like COMTRADE). */
const CONTENT_ONLY = new Set(['cfg', 'dat', 'db', 'sqlite3', 'tab', 'prn', 'wk1', 'qpw', 'fods', 'dotm', 'dotx', 'ppsx', 'potx', 'xltx', 'xlsm', 'docm', 'pptm', 'oxps', 'azw3', 'fbz', 'cbr', 'mobi', 'pdb', 'mht', 'iso', 'cab', 'zst', 'bz2', 'xz', 'tgz', 'numbers', 'et', 'dps', 'wps', 'dot', 'pps', 'pot', 'xlsb', 'dif', 'slk', 'dbf', 'mbox', 'mdx', 'xhtml', 'jpeg', 'avif', 'heif', 'tif', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2', 'pef', 'srw', 'gltf', 'fbx', 'dxf', 'obj', 'ply', 'stp', 'iges', 'igs', 'brep', 'mp3', 'aac', 'ogg', 'opus', 'm4v', 'mov', 'mkv', 'ogv', 'ts', 'm2ts']);

type Group = { name: { en: string }; viewer?: string | string[]; ext: string[] };
type Cat = { id: string; coming?: boolean; groups: Group[] };

describe('formats.html lists only what opens', () => {
  for (const cat of formatsCatalog(root) as Cat[]) {
    if (cat.coming) continue;
    for (const g of cat.groups) {
      const allowed = ([] as string[]).concat(g.viewer ?? []);
      test(`${cat.id} / ${g.name.en}`, async () => {
        for (const ext of g.ext) {
          const sample = samples.get(ext);
          if (!sample && CONTENT_ONLY.has(ext)) continue;
          const name = `example.${ext}`;
          const bytes = sample ? new Uint8Array(readFileSync(sample)) : new TextEncoder().encode('hello = 1\nworld = 2\n');
          const format = await detectFormat(new Blob([bytes]), name);
          const viewer = pickViewer(allViewers, { format, name, ext, head: bytes.subarray(0, 8192) });
          expect(allowed, `.${ext} opened in ${viewer?.id}`).toContain(viewer?.id);
        }
      });
    }
  }
  test('every listed viewer exists', () => {
    const ids = new Set(allViewers.map((v) => v.id));
    for (const cat of formatsCatalog(root) as Cat[]) for (const g of cat.groups) for (const v of ([] as string[]).concat(g.viewer ?? [])) expect(ids).toContain(v);
  });
});
