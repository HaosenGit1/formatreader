/**
 * The preview picture AutoCAD saves inside DWG files (R13 and later): the
 * address at byte 0x0D points to a sentinel, then a small table of entries
 * (2 = BMP without file header, 3 = WMF, 6 = PNG).
 */
const SENTINEL = [0x1f, 0x25, 0x6d, 0x07, 0xd4, 0x36, 0x28, 0x28, 0x9d, 0x57, 0xca, 0x3f, 0x9d, 0x44, 0x10, 0x2b];

const at = (b: Uint8Array, i: number) => SENTINEL.every((v, k) => b[i + k] === v);

export interface DwgPreview {
  blob: Blob;
  kind: 'png' | 'bmp';
}

export function dwgPreview(b: Uint8Array): DwgPreview | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = b.length > 0x11 ? dv.getUint32(0x0d, true) : 0;
  if (!(p > 0 && p + 16 < b.length && at(b, p))) {
    // Some writers put it elsewhere: look for the sentinel in the first megabytes.
    p = -1;
    for (let i = 0; i < Math.min(b.length - 16, 8 << 20); i++) if (b[i] === 0x1f && at(b, i)) { p = i; break; }
    if (p < 0) return null;
  }
  let q = p + 16 + 4; // sentinel, overall size
  const count = b[q++];
  let best: DwgPreview | null = null;
  for (let k = 0; k < count && q + 9 <= b.length; k++, q += 9) {
    const code = b[q];
    const start = dv.getUint32(q + 1, true);
    const size = dv.getUint32(q + 5, true);
    if (!size || start + size > b.length) continue;
    const data = b.subarray(start, start + size);
    if (code === 6) return { blob: new Blob([data as BlobPart], { type: 'image/png' }), kind: 'png' };
    if (code === 2 && size > 40) best = { blob: bmpFile(data), kind: 'bmp' };
  }
  return best;
}

/** A DIB (BITMAPINFOHEADER + palette + pixels) with a BMP file header in front. */
function bmpFile(dib: Uint8Array): Blob {
  const dv = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
  const headerSize = dv.getUint32(0, true);
  const bits = dv.getUint16(14, true);
  const used = dv.getUint32(32, true);
  const palette = bits <= 8 ? (used || 1 << bits) * 4 : 0;
  const head = new Uint8Array(14);
  const hv = new DataView(head.buffer);
  head[0] = 0x42;
  head[1] = 0x4d;
  hv.setUint32(2, 14 + dib.length, true);
  hv.setUint32(10, 14 + headerSize + palette, true);
  return new Blob([head, dib as BlobPart], { type: 'image/bmp' });
}
