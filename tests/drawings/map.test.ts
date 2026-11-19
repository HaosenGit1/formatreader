// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseGeoJson, parseGpx, parseKml, parseKmz, parseShapefile, readDbf } from '../../src/categories/drawings/map/parse';
import { lineLength, ringArea } from '../../src/categories/drawings/map/view';
import { attachShapeParts, pickFromMany } from '../../src/core/companions';

const dir = 'samples/maps/';
const buf = (p: string) => {
  const b = readFileSync(dir + p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('maps', () => {
  test('KML: turbines, boundary and cable, with folders and attributes', () => {
    const m = parseKml(readFileSync(dir + 'wind-farm.kml', 'utf8'));
    expect(m.title).toBe('Prairie Wind 风电场 (sample)');
    expect(m.features.filter((f) => f.kind === 'point')).toHaveLength(13);
    const t1 = m.features.find((f) => f.name === '风机 T-01')!;
    expect(t1.group).toBe('Turbines 风机');
    expect(t1.props).toMatchObject({ ID: 'T-01', Model: 'GW 155-4.5', 'Hub height (m)': '100' });
    expect(m.features.find((f) => f.kind === 'area')?.props.description).toBe('Lease area\nFictional sample');
    expect(m.features.some((f) => f.kind === 'line')).toBe(true);
    expect(m.lonLat).toBe(true);
  });

  test('KMZ opens the KML inside', async () => {
    const m = await parseKmz(new Uint8Array(buf('wind-farm.kmz')));
    expect(m.features).toHaveLength(15);
  });

  test('GPX: waypoints and a timed track', () => {
    const m = parseGpx(readFileSync(dir + 'site-survey.gpx', 'utf8'));
    expect(m.title).toBe('Site survey 现场踏勘');
    expect(m.features.filter((f) => f.kind === 'point').map((f) => f.name)).toEqual(['Substation gate', 'Met mast 测风塔']);
    const trk = m.features.find((f) => f.kind === 'line')!;
    expect(trk.props).toMatchObject({ points: '12', start: '2026-10-02T09:00:00Z' });
  });

  test('GeoJSON', () => {
    const m = parseGeoJson(readFileSync(dir + 'turbines.geojson', 'utf8'));
    expect(m.features).toHaveLength(13);
    expect(m.features[0].props).toMatchObject({ id: 'T-01', hub_m: '100' });
  });

  test('Shapefile with its GBK .dbf, .prj and .cpg', () => {
    const m = parseShapefile({ shp: buf('shapefile/turbines.shp'), dbf: buf('shapefile/turbines.dbf'), prj: readFileSync(dir + 'shapefile/turbines.prj', 'utf8'), cpg: 'GBK' });
    expect(m.features).toHaveLength(12);
    expect(m.features[0].name).toBe('风机 T-01');
    expect(m.features[0].props).toMatchObject({ ID: 'T-01', MODEL: 'GW 155-4.5', HUB_M: '100' });
    expect(m.lonLat).toBe(true);
    expect(m.crs).toBe('GCS_WGS_1984');
  });

  test('.dbf without a .cpg: the language byte (GBK) decides', () => {
    expect(readDbf(buf('shapefile/turbines.dbf'))[0].NAME).toBe('风机 T-01');
  });

  test('a .shp opened with its partners (drop several files at once)', async () => {
    const f = (n: string) => new File([readFileSync(dir + 'shapefile/' + n)], n);
    const picked = await pickFromMany([f('turbines.dbf'), f('turbines.shp'), f('turbines.prj')]);
    expect(picked.name).toBe('turbines.shp');
    expect(Object.keys((picked as File & { shapeParts: object }).shapeParts).sort()).toEqual(['dbf', 'prj']);
    const lone = await attachShapeParts(f('turbines.shp'), 'turbines.shp', ['other.dbf'], async () => f('turbines.dbf'));
    expect((lone as File & { shapeParts?: object }).shapeParts).toBeUndefined();
  });

  test('distances and areas on the globe', () => {
    // 1° of latitude ≈ 111.2 km; a 0.01° square at the equator ≈ 1.24 km².
    expect(lineLength([0, 0, 0, 1]) / 1000).toBeCloseTo(111.2, 0);
    expect(ringArea([0, 0, 0.01, 0, 0.01, 0.01, 0, 0.01]) / 1e6).toBeCloseTo(1.236, 2);
  });
});
