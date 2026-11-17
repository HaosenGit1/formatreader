import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { looksLikeCfg } from '../../src/categories/data/comtrade/detect';
import { parseCff, parseCfg, parseDat, parseStamp } from '../../src/categories/data/comtrade/parse';
import { detectFormat } from '../../src/core/detect-format';

const dir = join(process.cwd(), 'samples', 'data');
const peak = (v: Float64Array, from: number, to: number) => Math.max(...Array.from(v.subarray(from, to), Math.abs));

describe('COMTRADE configuration', () => {
  const cfg = parseCfg(readFileSync(join(dir, 'fault-ascii.cfg'), 'utf8'));
  test('header, channels, rates, times', () => {
    expect(cfg.station).toBe('Wind Farm Substation');
    expect(cfg.revision).toBe('1999');
    expect(cfg.analog.map((c) => c.id)).toEqual(['VA', 'VB', 'VC', 'IA', 'IB', 'IC']);
    expect(cfg.digital.map((c) => c.id)).toEqual(['TRIP', 'CB OPEN']);
    expect(cfg.rates).toEqual([{ rate: 4000, endSample: 1200 }]);
    expect(cfg.fileType).toBe('ASCII');
    expect(cfg.analog[3]).toMatchObject({ unit: 'A', a: 0.25, b: 0 });
  });
  test('trigger time is 100 ms after start', () => {
    expect(parseStamp(cfg.trigger)! - parseStamp(cfg.start)!).toBeCloseTo(100, 6);
  });
  test('detection: a COMTRADE .cfg vs an ordinary config file', () => {
    expect(looksLikeCfg(readFileSync(join(dir, 'fault-ascii.cfg'), 'utf8'))).toBe(true);
    expect(looksLikeCfg('[server]\nport=8080\n')).toBe(false);
  });
});

describe('COMTRADE data', () => {
  test('ASCII .dat with scaling (1991 style, digital without phase)', () => {
    const cfg = parseCfg('Station,Dev,1991\r\n2,1A,1D\r\n1,IA,A,,A,0.5,1,0,-32767,32767\r\n1,TRIP,0\r\n50\r\n1\r\n1000,3\r\n01/01/2026,00:00:00.000\r\n01/01/2026,00:00:00.001\r\nASCII\r\n');
    const d = parseDat(cfg, new TextEncoder().encode('1,0,10,0\r\n2,1000,20,1\r\n3,2000,,1\r\n'));
    expect(Array.from(d.analog[0])).toEqual([6, 11, NaN]); // 0.5·x + 1, missing → NaN
    expect(Array.from(d.digital[0])).toEqual([0, 1, 1]);
    expect(Array.from(d.time)).toEqual([0, 0.001, 0.002]);
    expect(d.triggerAt).toBeCloseTo(0.001, 9);
  });

  test('.zip with the .cfg/.dat pair (BINARY): the fault shows in phase A only', () => {
    const files = unzipSync(new Uint8Array(readFileSync(join(dir, 'fault-record.zip'))));
    const cfg = parseCfg(new TextDecoder().decode(files['REL670_F3_20261117_021015.cfg']));
    const d = parseDat(cfg, files['REL670_F3_20261117_021015.dat']);
    expect(cfg.fileType).toBe('BINARY');
    expect(d.time.length).toBe(1200);
    const ia = d.analog[3];
    // before the fault ≈ 420 A peak, during the fault ≈ 8× that
    expect(peak(ia, 0, 400)).toBeGreaterThan(400);
    expect(peak(ia, 0, 400)).toBeLessThan(440);
    expect(peak(ia, 420, 620)).toBeGreaterThan(3000);
    expect(peak(d.analog[4], 420, 620)).toBeLessThan(440); // phase B unaffected
    // trip from 120 ms, breaker open from 160 ms
    expect(d.digital[0][470]).toBe(0);
    expect(d.digital[0][490]).toBe(1);
    expect(d.digital[1][650]).toBe(1);
  });

  test('2013 single-file .cff (BINARY32)', () => {
    const { cfg, dat } = parseCff(new Uint8Array(readFileSync(join(dir, 'fault-2013.cff'))));
    expect(cfg.revision).toBe('2013');
    expect(cfg.fileType).toBe('BINARY32');
    const d = parseDat(cfg, dat);
    expect(d.time.length).toBe(1200);
    // 8.165 kV peak, stored in steps of a = 0.5 kV
    expect(Math.abs(peak(d.analog[0], 0, 400) - 8.165)).toBeLessThanOrEqual(0.25);
  });

  test('recognised from bytes / ZIP contents', async () => {
    const blob = (n: string) => new Blob([new Uint8Array(readFileSync(join(dir, n)))]);
    expect((await detectFormat(blob('fault-record.zip'), 'fault-record.zip'))?.id).toBe('comtrade');
    expect((await detectFormat(blob('fault-2013.cff'), 'fault-2013.cff'))?.id).toBe('comtrade');
  });
});
