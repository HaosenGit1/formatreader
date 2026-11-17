/**
 * PalmDoc (.pdb / .prc, "TEXtREAd") → the book's raw text bytes.
 * Record 0 holds the header; text records use PalmDoc LZ77 compression
 * (type 2) or none (type 1). The bytes then go through normal encoding
 * detection, so Chinese/Japanese PalmDoc books work too.
 */
export function palmDocText(bytes: Uint8Array): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(60, 68)) !== 'TEXtREAd') throw new Error('Not a PalmDoc file');
  const count = dv.getUint16(76);
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) offsets.push(dv.getUint32(78 + i * 8));
  offsets.push(bytes.length);
  const rec0 = offsets[0];
  const compression = dv.getUint16(rec0);
  const textLength = dv.getUint32(rec0 + 4);
  const recordCount = dv.getUint16(rec0 + 8);
  const out: number[] = [];
  for (let r = 1; r <= recordCount && r < count; r++) {
    const rec = bytes.subarray(offsets[r], offsets[r + 1]);
    if (compression === 1) for (const b of rec) out.push(b);
    else if (compression === 2) decompressInto(rec, out);
    else throw new Error('This PalmDoc uses an unsupported compression');
  }
  return new Uint8Array(out.slice(0, textLength || out.length));
}

/** PalmDoc LZ77 (as documented for Palm Reader / MobiPocket). */
export function decompressInto(src: Uint8Array, out: number[]) {
  let i = 0;
  while (i < src.length) {
    const c = src[i++];
    if (c === 0 || (c >= 0x09 && c <= 0x7f)) out.push(c);
    else if (c >= 0x01 && c <= 0x08) for (let k = 0; k < c && i < src.length; k++) out.push(src[i++]);
    else if (c >= 0xc0) out.push(0x20, c ^ 0x80);
    else {
      // 0x80–0xBF: back-reference (11-bit distance, 3-bit length + 3)
      const pair = (c << 8) | src[i++];
      const dist = (pair >> 3) & 0x7ff;
      const len = (pair & 7) + 3;
      for (let k = 0; k < len; k++) out.push(out[out.length - dist]);
    }
  }
}
