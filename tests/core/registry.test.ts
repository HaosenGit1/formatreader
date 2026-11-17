import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { allViewers } from '../../src/categories';
import { detectFormat, extOf } from '../../src/core/detect-format';
import { infoEntry } from '../../src/core/info-entry';
import { assertUniqueIds, pickViewer, withTrials } from '../../src/core/registry';
import type { ViewerEntry } from '../../src/core/viewer';

const viewers = [...allViewers, infoEntry];

async function route(name: string, bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const blob = new Blob([new Uint8Array(data)]);
  const format = await detectFormat(blob, name);
  return pickViewer(viewers, { format, name, ext: extOf(name), head: data.subarray(0, 8192) })?.id ?? 'none';
}

describe('registry', () => {
  test('viewer ids are unique', () => {
    expect(() => assertUniqueIds(viewers)).not.toThrow();
  });

  test('higher priority wins, then list order', () => {
    const mk = (id: string, priority?: number): ViewerEntry => ({ id, category: 'other', priority, accepts: () => true, load: async () => ({ open: async () => ({}) }) });
    expect(pickViewer([mk('low', 1), mk('mid'), mk('high', 90)], { format: null, name: '', ext: '', head: new Uint8Array() })?.id).toBe('high');
    expect(pickViewer([mk('a'), mk('b')], { format: null, name: '', ext: '', head: new Uint8Array() })?.id).toBe('a');
  });

  test('a viewer whose accepts() throws is skipped', () => {
    const bad: ViewerEntry = { id: 'bad', category: 'other', priority: 99, accepts: () => { throw new Error('boom'); }, load: async () => ({ open: async () => ({}) }) };
    expect(pickViewer([bad, infoEntry], { format: null, name: '', ext: '', head: new Uint8Array() })?.id).toBe('core/info');
  });
});

describe('routing: each file goes to the right viewer', () => {
  test.each([
    ['novel.txt', '第一章', 'words/text'],
    ['notes.md', '# Title', 'words/text'],
    ['movie.srt', '1\n00:00:01,000 --> 00:00:02,000\nHi', 'words/text'],
    ['README', 'just words', 'words/text'],
    ['hello.py', 'print(1)', 'words/code'],
    ['config.json', '{"a":1}', 'words/code'],
    ['run', '#!/bin/sh\necho', 'words/code'],
    ['data.csv', 'a,b\n1,2', 'words/sheets'],
    ['data.tsv', 'a\tb', 'words/sheets'],
    ['export.xls', '<html><table><tr><td>1</td></tr></table></html>', 'words/sheets'],
    ['book.fb2', '<?xml version="1.0"?><FictionBook/>', 'words/books'],
  ])('%s → %s', async (name, content, id) => {
    expect(await route(name, content)).toBe(id);
  });

  test('binary formats', async () => {
    expect(await route('doc.pdf', '%PDF-1.7\n')).toBe('words/pdf');
    expect(await route('photo.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('core/info');
  });
});

describe('routing: every sample in samples/code opens in the Code viewer', () => {
  const dir = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'samples', 'code');
  for (const name of readdirSync(dir)) {
    test(name, async () => {
      expect(await route(name, new Uint8Array(readFileSync(join(dir, name))))).toBe('words/code');
    });
  }
});

describe('experimental viewers (?try=)', () => {
  const stable: ViewerEntry = { id: 'words/slides', category: 'words', accepts: () => true, load: async () => ({ open: async () => ({}) }) };
  const next: ViewerEntry = { id: 'words/slides-v2', category: 'words', experimental: true, accepts: () => true, load: async () => ({ open: async () => ({}) }) };
  const ctx = { format: null, name: 'a.pptx', ext: 'pptx', head: new Uint8Array() };

  test('visitors never get the experimental viewer', () => {
    expect(pickViewer(withTrials([stable, next], ''), ctx)?.id).toBe('words/slides');
    expect(pickViewer(withTrials([stable, next], '?try=something-else'), ctx)?.id).toBe('words/slides');
  });
  test('?try=<id> puts it ahead of the stable one', () => {
    expect(pickViewer(withTrials([stable, next], '?try=words/slides-v2'), ctx)?.id).toBe('words/slides-v2');
    expect(pickViewer(withTrials([stable, next], '?try=a,words/slides-v2'), ctx)?.id).toBe('words/slides-v2');
  });
});
