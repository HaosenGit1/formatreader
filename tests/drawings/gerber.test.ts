import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { buildGerber, looksExcellon, looksGerber } from '../../src/categories/drawings/dxf/gerber';

test('Gerber X2 copper: pads, traces, arc, pour with a clear cut-out, in mm', () => {
  const b = buildGerber(new Uint8Array(readFileSync('samples/drawings/sensor-board.gtl')), 'sensor-board.gtl');
  const polys = b.prims.filter((p) => p.kind === 'poly');
  expect(polys.filter((p) => p.fill === 3)).toHaveLength(1); // the cut-out (clear polarity)
  expect(polys.length).toBeGreaterThan(20);
  expect(b.units).toBe(4);
  expect(b.bounds!.minX).toBeCloseTo(2, 1);
  expect(b.bounds!.maxX).toBeCloseTo(48, 1);
});

test('Excellon drill: holes with their tool diameters', () => {
  const b = buildGerber(new Uint8Array(readFileSync('samples/drawings/sensor-board.drl')), 'sensor-board.drl');
  expect(b.prims).toHaveLength(10);
  const first = b.prims[0] as { pts: number[] };
  const xs = first.pts.filter((_, i) => i % 2 === 0);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.8, 1); // T1 = 0.8 mm
});

test('sniffing', () => {
  expect(looksGerber('%FSLAX46Y46*%\n%MOMM*%')).toBe(true);
  expect(looksExcellon('M48\nMETRIC\nT1C0.8\n%')).toBe(true);
  expect(looksGerber('just some notes.txt')).toBe(false);
});
