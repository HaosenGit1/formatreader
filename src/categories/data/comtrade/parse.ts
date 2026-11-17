/**
 * COMTRADE (IEEE C37.111 / IEC 60255-24) — 1991, 1999 and 2013 revisions.
 * .cfg describes the channels; .dat holds the samples (ASCII, BINARY,
 * BINARY32 or FLOAT32). 2013 also allows a single combined .cff file.
 */

export interface AnalogChannel {
  index: number;
  id: string;
  phase: string;
  circuit: string;
  unit: string;
  a: number;
  b: number;
  skew: number;
  primary: number;
  secondary: number;
  /** 'P' or 'S': which side the scaled values represent. */
  ps: string;
}
export interface DigitalChannel {
  index: number;
  id: string;
  phase: string;
  circuit: string;
  normal: number;
}
export interface ComtradeConfig {
  station: string;
  device: string;
  revision: string;
  analog: AnalogChannel[];
  digital: DigitalChannel[];
  lineFrequency: number;
  rates: Array<{ rate: number; endSample: number }>;
  start: string;
  trigger: string;
  fileType: 'ASCII' | 'BINARY' | 'BINARY32' | 'FLOAT32';
  timeMultiplier: number;
}
export interface ComtradeData {
  /** Time of each sample in seconds, relative to the first sample. */
  time: Float64Array;
  /** Scaled analog values per channel (NaN = missing). */
  analog: Float64Array[];
  /** Digital values per channel (0/1). */
  digital: Uint8Array[];
  /** Trigger time in seconds from the first sample (when known). */
  triggerAt: number | null;
}

const num = (v: string | undefined, fallback = 0) => {
  const n = parseFloat((v ?? '').trim());
  return isNaN(n) ? fallback : n;
};

export function parseCfg(text: string): ComtradeConfig {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim());
  let i = 0;
  const next = () => (lines[i++] ?? '').split(',').map((x) => x.trim());

  const [station = '', device = '', revision = '1991'] = next();
  const counts = next();
  const nA = parseInt(counts.find((c) => /A$/i.test(c)) ?? '0', 10);
  const nD = parseInt(counts.find((c) => /D$/i.test(c)) ?? '0', 10);

  const analog: AnalogChannel[] = [];
  for (let k = 0; k < nA; k++) {
    const f = next();
    analog.push({
      index: num(f[0], k + 1), id: f[1] ?? `A${k + 1}`, phase: f[2] ?? '', circuit: f[3] ?? '', unit: f[4] ?? '',
      a: num(f[5], 1), b: num(f[6], 0), skew: num(f[7], 0), primary: num(f[10], 1), secondary: num(f[11], 1), ps: (f[12] ?? 'P').toUpperCase(),
    });
  }
  const digital: DigitalChannel[] = [];
  for (let k = 0; k < nD; k++) {
    const f = next();
    // 1991: index,id,normal  — 1999+: index,id,phase,circuit,normal
    const old = f.length <= 3;
    digital.push({ index: num(f[0], k + 1), id: f[1] ?? `D${k + 1}`, phase: old ? '' : f[2] ?? '', circuit: old ? '' : f[3] ?? '', normal: num(old ? f[2] : f[4], 0) });
  }
  const lineFrequency = num(next()[0], 50);
  const nrates = parseInt(next()[0] ?? '0', 10) || 0;
  const rates: ComtradeConfig['rates'] = [];
  for (let k = 0; k < Math.max(nrates, 1); k++) {
    const f = next();
    rates.push({ rate: num(f[0], 0), endSample: num(f[1], 0) });
  }
  if (nrates === 0) rates.length = rates.length && rates[0].endSample ? 1 : 1;
  const start = next().join(',');
  const trigger = next().join(',');
  const ft = (next()[0] ?? 'ASCII').toUpperCase();
  const fileType = (['ASCII', 'BINARY', 'BINARY32', 'FLOAT32'].includes(ft) ? ft : 'ASCII') as ComtradeConfig['fileType'];
  const timeMultiplier = num(next()[0], 1) || 1;
  return { station, device, revision, analog, digital, lineFrequency, rates: nrates ? rates : [{ rate: 0, endSample: rates[0]?.endSample ?? 0 }], start, trigger, fileType, timeMultiplier };
}

/** "dd/mm/yyyy,hh:mm:ss.ssssss" → milliseconds since epoch (UTC-agnostic), or null. */
export function parseStamp(stamp: string): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(stamp.trim());
  if (!m) return null;
  let [, d, mo, y] = m;
  const yy = y.length === 2 ? 1900 + Number(y) + (Number(y) < 70 ? 100 : 0) : Number(y);
  const frac = m[7] ? Number(`0.${m[7]}`) : 0;
  return Date.UTC(yy, Number(mo) - 1, Number(d), Number(m[4]), Number(m[5]), Number(m[6])) + frac * 1000;
}

function sampleTimes(cfg: ComtradeConfig, n: number, stamps: Float64Array): Float64Array {
  const t = new Float64Array(n);
  const fixed = cfg.rates.some((r) => r.rate > 0);
  if (fixed) {
    let k = 0;
    let base = 0;
    let prevEnd = 0;
    for (const r of cfg.rates) {
      const end = Math.min(n, r.endSample || n);
      for (; k < end; k++) t[k] = base + (k - prevEnd) / r.rate;
      base = k > 0 ? t[k - 1] + 1 / r.rate : 0;
      prevEnd = k;
    }
    for (; k < n; k++) t[k] = t[k - 1] + (k > 1 ? t[k - 1] - t[k - 2] : 0);
  } else {
    // Timestamps are in microseconds × timemult.
    const t0 = stamps[0] ?? 0;
    for (let k = 0; k < n; k++) t[k] = ((stamps[k] - t0) * cfg.timeMultiplier) / 1e6;
  }
  return t;
}

function triggerOffset(cfg: ComtradeConfig): number | null {
  const s = parseStamp(cfg.start);
  const tr = parseStamp(cfg.trigger);
  return s !== null && tr !== null ? (tr - s) / 1000 : null;
}

export function parseDat(cfg: ComtradeConfig, data: Uint8Array): ComtradeData {
  const nA = cfg.analog.length;
  const nD = cfg.digital.length;
  const analogRaw: number[][] = Array.from({ length: nA }, () => []);
  const digitalRaw: number[][] = Array.from({ length: nD }, () => []);
  const stamps: number[] = [];

  if (cfg.fileType === 'ASCII') {
    const text = new TextDecoder('latin1').decode(data);
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const f = line.split(',');
      stamps.push(num(f[1], NaN));
      for (let c = 0; c < nA; c++) {
        const v = (f[2 + c] ?? '').trim();
        analogRaw[c].push(v === '' || v === '99999' ? NaN : Number(v));
      }
      for (let c = 0; c < nD; c++) digitalRaw[c].push(Number((f[2 + nA + c] ?? '0').trim()) ? 1 : 0);
    }
  } else {
    const aBytes = cfg.fileType === 'BINARY' ? 2 : 4;
    const words = Math.ceil(nD / 16);
    const rec = 8 + nA * aBytes + words * 2;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const count = Math.floor(data.length / rec);
    for (let k = 0; k < count; k++) {
      const o = k * rec;
      stamps.push(dv.getUint32(o + 4, true));
      for (let c = 0; c < nA; c++) {
        const p = o + 8 + c * aBytes;
        let v: number;
        if (cfg.fileType === 'BINARY') {
          const x = dv.getInt16(p, true);
          v = x === -32768 ? NaN : x;
        } else if (cfg.fileType === 'BINARY32') {
          const x = dv.getInt32(p, true);
          v = x === -2147483648 ? NaN : x;
        } else v = dv.getFloat32(p, true);
        analogRaw[c].push(v);
      }
      for (let c = 0; c < nD; c++) {
        const w = dv.getUint16(o + 8 + nA * aBytes + Math.floor(c / 16) * 2, true);
        digitalRaw[c].push((w >> c % 16) & 1);
      }
    }
  }

  const n = stamps.length;
  return {
    time: sampleTimes(cfg, n, Float64Array.from(stamps)),
    analog: cfg.analog.map((ch, c) => Float64Array.from(analogRaw[c], (x) => ch.a * x + ch.b)),
    digital: digitalRaw.map((d) => Uint8Array.from(d)),
    triggerAt: triggerOffset(cfg),
  };
}

/** COMTRADE 2013 combined file: "--- file type: CFG ---", "--- file type: DAT BINARY: 1234 ---" … */
export function parseCff(bytes: Uint8Array): { cfg: ComtradeConfig; dat: Uint8Array } {
  const latin = new TextDecoder('latin1').decode(bytes);
  const cfgM = /---\s*file type:\s*CFG\s*---\r?\n([\s\S]*?)(?=\r?\n---\s*file type:)/i.exec(latin);
  if (!cfgM) throw new Error('No configuration section in this .cff file');
  const cfg = parseCfg(cfgM[1]);
  const datM = /---\s*file type:\s*DAT\s+(ASCII|BINARY)(?::\s*(\d+))?\s*---\r?\n/i.exec(latin);
  if (!datM) throw new Error('No data section in this .cff file');
  const start = datM.index + datM[0].length;
  const len = datM[2] ? Number(datM[2]) : undefined;
  let end = len !== undefined ? start + len : latin.indexOf('\n--- file type:', start);
  if (end < 0) end = bytes.length;
  return { cfg, dat: bytes.subarray(start, end) };
}

export { looksLikeCfg } from './detect';
