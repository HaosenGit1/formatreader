/**
 * Point clouds: XYZ / PTS text ("x y z [r g b]" per line) and LAS laser scans (drones,
 * survey, lidar). Very large clouds are thinned evenly to keep the browser fluid.
 * Coordinates are moved near the origin (scans often sit at map coordinates in the
 * millions, beyond what 32-bit graphics can place precisely).
 */
export interface Cloud {
  positions: Float32Array;
  colors?: Float32Array;
  note?: string;
}

const MAX = 3_000_000;

export function readXyz(text: string): Cloud {
  const lines = text.split(/\r?\n/);
  const xyz: number[] = [];
  const rgb: number[] = [];
  let colored = true;
  for (const line of lines) {
    const v = line.trim().split(/[\s,;]+/).map(Number);
    if (v.length < 3 || v.slice(0, 3).some((n) => !Number.isFinite(n))) continue; // header / count lines
    xyz.push(v[0], v[1], v[2]);
    if (v.length >= 6 && v.slice(3, 6).every(Number.isFinite)) {
      const scale = Math.max(v[3], v[4], v[5]) > 1 ? 1 / 255 : 1;
      rgb.push(v[3] * scale, v[4] * scale, v[5] * scale);
    } else colored = false;
  }
  if (!xyz.length) throw new Error('No points found (expected lines of "x y z").');
  return finish(xyz, colored && rgb.length === xyz.length ? rgb : undefined);
}

export function readLas(buf: ArrayBuffer): Cloud {
  const v = new DataView(buf);
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'LASF') throw new Error('This is not a LAS point cloud.');
  const fmtByte = v.getUint8(104);
  if (fmtByte & 0x80) throw new Error('This is a compressed LAZ point cloud, which can’t be read here yet. Open it in CloudCompare (free), or convert it to LAS with LAStools / PDAL.');
  const format = fmtByte & 0x3f;
  const minor = v.getUint8(25);
  const offset = v.getUint32(96, true);
  const recLen = v.getUint16(105, true);
  let count = v.getUint32(107, true);
  if (!count && minor >= 4) count = Number(v.getBigUint64(247, true));
  const [sx, sy, sz] = [v.getFloat64(131, true), v.getFloat64(139, true), v.getFloat64(147, true)];
  const [ox, oy, oz] = [v.getFloat64(155, true), v.getFloat64(163, true), v.getFloat64(171, true)];
  const RGB_AT: Record<number, number> = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 };
  const rgbAt = RGB_AT[format];
  const avail = Math.min(count, Math.floor((buf.byteLength - offset) / recLen));
  const step = Math.max(1, Math.ceil(avail / MAX));
  const xyz: number[] = [];
  const rgb: number[] = [];
  for (let i = 0; i < avail; i += step) {
    const at = offset + i * recLen;
    xyz.push(v.getInt32(at, true) * sx + ox, v.getInt32(at + 4, true) * sy + oy, v.getInt32(at + 8, true) * sz + oz);
    if (rgbAt !== undefined) {
      const r = v.getUint16(at + rgbAt, true);
      const g = v.getUint16(at + rgbAt + 2, true);
      const b = v.getUint16(at + rgbAt + 4, true);
      const k = Math.max(r, g, b) > 255 ? 65535 : 255; // some writers store 8-bit values
      rgb.push(r / k, g / k, b / k);
    }
  }
  const cloud = finish(xyz, rgb.length ? rgb : undefined, true);
  if (step > 1) cloud.note = `Showing every ${step}th point (${Math.ceil(avail / step).toLocaleString()} of ${avail.toLocaleString()}) so the browser stays fluid.`;
  return cloud;
}

/** Moves the cloud near the origin; without colours, tints it by height. */
function finish(xyz: number[], rgb?: number[], heightTint = false): Cloud {
  const n = xyz.length / 3;
  let mx = Infinity, my = Infinity, mz = Infinity, Mz = -Infinity; // prettier-ignore
  for (let i = 0; i < n; i++) {
    mx = Math.min(mx, xyz[i * 3]);
    my = Math.min(my, xyz[i * 3 + 1]);
    mz = Math.min(mz, xyz[i * 3 + 2]);
    Mz = Math.max(Mz, xyz[i * 3 + 2]);
  }
  const positions = new Float32Array(xyz.length);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = xyz[i * 3] - mx;
    positions[i * 3 + 1] = xyz[i * 3 + 1] - my;
    positions[i * 3 + 2] = xyz[i * 3 + 2] - mz;
  }
  let colors = rgb ? new Float32Array(rgb) : undefined;
  if (!colors && heightTint && Mz > mz) {
    // Low blue → green → high warm, like a terrain map.
    colors = new Float32Array(xyz.length);
    for (let i = 0; i < n; i++) {
      const t = (xyz[i * 3 + 2] - mz) / (Mz - mz);
      colors[i * 3] = Math.min(1, Math.max(0, 1.6 * t - 0.3));
      colors[i * 3 + 1] = Math.min(1, 0.35 + 0.9 * Math.sin(Math.PI * t) * 0.7);
      colors[i * 3 + 2] = Math.min(1, Math.max(0, 1 - 1.4 * t));
    }
  }
  return { positions, colors };
}
