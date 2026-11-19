import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildDwgBytes, buildDxfBytes, pack, unpack } from '../../src/categories/drawings/dxf/drawing-job';
import { edgeLoop, imageBoundary, patternPieces } from '../../src/categories/drawings/dxf/shapes';
import type { Poly } from '../../src/categories/drawings/dxf/build';

const sample = (n: string) => new Uint8Array(readFileSync(`samples/drawings/${n}`));
const polys = (prims: unknown[]) => prims.filter((p): p is Poly => (p as Poly).kind === 'poly');

describe('DXF/DWG: hatches, leaders, wipeouts, layouts', () => {
  test('every new object in the feature sample is drawn', async () => {
    const b = await buildDxfBytes(sample('turbine-pad-features.dxf'), () => {});
    const p = polys(b.prims);
    expect(p.filter((x) => x.fill === 1 && x.layer === 'HATCH')).toHaveLength(1); // solid hatch
    expect(p.filter((x) => x.layer === 'HATCH' && !x.fill).length).toBeGreaterThan(5); // ANSI31 lines
    expect(p.filter((x) => x.fill === 3)).toHaveLength(1); // wipeout
    expect(p.filter((x) => x.fill === 1 && x.layer === 'NOTES')).toHaveLength(2); // two arrowheads
    const texts = b.prims.filter((x) => x.kind === 'text').map((x) => (x as { text: string }).text);
    expect(texts).toEqual(expect.arrayContaining(['TOWER FLANGE', 'GROUT PAD', 'T-07']));
    expect(p.some((x) => x.layer === 'CONSTRUCTION')).toBe(true);
    expect([...b.skipped]).toEqual([]);
    expect(b.units).toBe(6);
    // Paper space is its own layout, named from the LAYOUT object, with one viewport.
    expect(b.layouts.map((l) => l.name)).toEqual(['Sheet A1']);
    expect(b.layouts[0].viewports).toEqual([{ cx: 200, cy: 160, w: 300, h: 200, vx: 15, vy: 9, vh: 40, twist: 0 }]);
    expect(b.prims.some((x) => x.kind === 'text' && x.text.startsWith('TURBINE PAD'))).toBe(false); // not mixed into the model
  });

  test('pattern lines stay inside the boundary', async () => {
    const b = await buildDxfBytes(sample('turbine-pad-features.dxf'), () => {});
    for (const x of polys(b.prims).filter((q) => q.layer === 'HATCH' && !q.fill))
      for (let i = 0; i < x.pts.length; i += 2) expect(Math.hypot(x.pts[i] - 10, x.pts[i + 1] - 10)).toBeLessThanOrEqual(4.01);
  });

  test('fills and layouts survive the hand-over from the worker', async () => {
    const b = await buildDxfBytes(sample('turbine-pad-features.dxf'), () => {});
    const u = unpack(pack(b).packed);
    expect(polys(u.prims).map((x) => x.fill ?? 0)).toEqual(polys(b.prims).map((x) => x.fill ?? 0));
    expect(u.layouts[0].name).toBe('Sheet A1');
  });

  test('DWG: hatches filled, layout found, units read', async () => {
    const b = await buildDwgBytes(sample('libredwg-example-2018.dwg'), () => {});
    expect(polys(b.prims).some((x) => x.fill)).toBe(true);
    expect(b.layouts.length).toBeGreaterThan(0);
    expect(b.units).toBe(4);
  }, 60000);
});

describe('hatch geometry', () => {
  test('a clockwise arc edge runs from its start to its end', () => {
    const pts = edgeLoop([{ type: 2, center: { x: 0, y: 0 }, radius: 1, startAngle: 0, endAngle: Math.PI / 2, ccw: false }]);
    expect(pts[0]).toBeCloseTo(1);
    expect(pts[1]).toBeCloseTo(0);
    // Clockwise edges store mirrored angles: 0 → 90° means walking from (1, 0) down to (0, −1).
    expect(pts.at(-2)).toBeCloseTo(0);
    expect(pts.at(-1)).toBeCloseTo(-1);
  });

  test('too dense a pattern falls back to a tint (null)', () => {
    const square = [[0, 0, 1000, 0, 1000, 1000, 0, 1000]];
    expect(patternPieces(square, [{ angle: 0, base: { x: 0, y: 0 }, offset: { x: 0, y: 0.01 }, dashes: [] }])).toBeNull();
    expect(patternPieces(square, [{ angle: 0, base: { x: 0, y: 0 }, offset: { x: 0, y: 100 }, dashes: [] }])!.length).toBeGreaterThanOrEqual(9); // lines on the edge itself may count either way
  });

  test('a wipeout rectangle maps to drawing coordinates', () => {
    const b = imageBoundary({ x: 24, y: 12 }, { x: 8, y: 0 }, { x: 0, y: 4 }, { x: 1, y: 1 }, [{ x: -0.5, y: -0.5 }, { x: 0.5, y: 0.5 }]);
    expect(b.map((p) => [p.x, p.y])).toEqual([[24, 16], [32, 16], [32, 12], [24, 12]]);
  });
});
