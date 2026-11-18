import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { findEmbeddedJpegs } from '../../src/categories/images/photo/raw';

const bytes = (f: string) => new Uint8Array(readFileSync(`samples/images/${f}`));

describe('camera RAW preview', () => {
  test('finds the full-size JPEG preview inside a RAW file (even at the very end)', () => {
    const raw = bytes('camera-preview.dng');
    const jpg = bytes('wind-farm.jpg');
    const [first] = findEmbeddedJpegs(raw);
    expect(first.end - first.start).toBe(jpg.length);
    expect(raw.subarray(first.start, first.end)).toEqual(jpg);
  });
  test('a JPEG on its own is found whole', () => {
    const jpg = bytes('wind-farm.jpg');
    expect(findEmbeddedJpegs(jpg)).toEqual([{ start: 0, end: jpg.length }]);
  });
  test('random bytes give nothing', () => {
    const junk = new Uint8Array(100_000).map((_, i) => (i * 7919) % 251);
    junk.set([0xff, 0xd8, 0xff, 0xe0, 0, 2], 500);
    expect(findEmbeddedJpegs(junk)).toEqual([]);
  });
});
