import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { readLas, readXyz } from '../../src/categories/drawings/model/points';

const buf = (p: string) => {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

test('LAS 1.2 with RGB: every point, moved near the origin, coloured', () => {
  const c = readLas(buf('samples/drawings/turbine-scan.las'));
  expect(c.positions.length / 3).toBe(9000);
  expect(Math.min(...Array.from(c.positions))).toBeGreaterThanOrEqual(0);
  expect(Math.max(...Array.from(c.positions))).toBeLessThan(200); // not 4 million (map coordinates)
  expect(c.colors?.length).toBe(c.positions.length);
});

test('XYZ text with colours', () => {
  const c = readXyz(readFileSync('samples/drawings/turbine-scan.xyz', 'utf8'));
  expect(c.positions.length / 3).toBe(9000);
  expect(c.colors![0]).toBeCloseTo(90 / 255);
});

test('LAZ (compressed) is explained, not misread', () => {
  const b = new Uint8Array(buf('samples/drawings/turbine-scan.las'));
  b[104] |= 0x80;
  expect(() => readLas(b.buffer)).toThrow(/LAZ/);
});
