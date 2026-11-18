import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { headerSize } from '../../src/categories/images/photo/decode';

test('picture size from the header (to explain why a huge picture fails)', () => {
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(png.buffer).setUint32(16, 24000);
  new DataView(png.buffer).setUint32(20, 18000);
  expect(headerSize(png)).toEqual({ w: 24000, h: 18000 });
  const dir = join(__dirname, '../../samples/images');
  const jpg = readdirSync(dir).find((f) => /\.jpe?g$/i.test(f));
  if (jpg) {
    const size = headerSize(new Uint8Array(readFileSync(join(dir, jpg))));
    expect(size!.w).toBeGreaterThan(0);
    expect(size!.h).toBeGreaterThan(0);
  }
});
