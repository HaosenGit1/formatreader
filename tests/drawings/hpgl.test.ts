import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { buildHpgl, looksHpgl } from '../../src/categories/drawings/dxf/hpgl';

test('HP-GL/2 plot: pens as layers, mm units, labels, circle, fills, PE polyline', () => {
  const b = buildHpgl(new Uint8Array(readFileSync('samples/drawings/turbine-elevation.plt')));
  expect([...b.layers.keys()].sort()).toEqual(['Pen 1', 'Pen 2', 'Pen 3']);
  expect(b.units).toBe(4);
  expect(b.bounds).toMatchObject({ minX: 0, minY: 0, maxX: 420, maxY: 297 }); // A3 sheet in mm
  const texts = b.prims.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text);
  expect(texts).toEqual(['TURBINE ELEVATION  1:500', 'PLOT T-07']);
  expect(b.prims.filter((p) => p.kind === 'poly' && p.fill === 1)).toHaveLength(1);
  // The PE ground line: 6 points from (20, 40) mm, ending 300 mm further right.
  const ground = b.prims.find((p) => p.kind === 'poly' && p.layer === 'Pen 1' && p.pts.length === 12) as { pts: number[] };
  expect(ground.pts.slice(0, 2)).toEqual([20, 40]);
  expect(ground.pts[10]).toBeCloseTo(320);
});

test('a gnuplot script named .plt is not taken for a plot', () => {
  expect(looksHpgl('set terminal png\nplot sin(x)\n')).toBe(false);
  expect(looksHpgl('IN;SP1;PU0,0;')).toBe(true);
  expect(looksHpgl('\x1b%-12345X@PJL ENTER LANGUAGE=HPGL2\r\n\x1bE\x1b%0BIN;')).toBe(true);
});
