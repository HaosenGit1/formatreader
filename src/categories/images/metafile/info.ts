/** EMF / WMF headers: kind, logical extent and size in pixels (96 dpi). */
export interface MetafileInfo {
  kind: 'emf' | 'wmf';
  extX: number;
  extY: number;
  width: number;
  height: number;
}

export function metafileInfo(b: Uint8Array): MetafileInfo | null {
  if (b.length < 44) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // EMF: record type 1 (EMR_HEADER), " EMF" signature at offset 40.
  if (v.getUint32(0, true) === 1 && v.getUint32(40, true) === 0x464d4520) {
    const [l, t, r, bo] = [v.getInt32(8, true), v.getInt32(12, true), v.getInt32(16, true), v.getInt32(20, true)]; // bounds, device pixels
    const [fl, ft, fr, fb] = [v.getInt32(24, true), v.getInt32(28, true), v.getInt32(32, true), v.getInt32(36, true)]; // frame, 0.01 mm
    const extX = Math.max(1, r - l);
    const extY = Math.max(1, bo - t);
    const mmW = (fr - fl) / 100;
    const mmH = (fb - ft) / 100;
    const width = mmW > 0 ? (mmW / 25.4) * 96 : extX;
    const height = mmH > 0 ? (mmH / 25.4) * 96 : extY;
    return { kind: 'emf', extX, extY, width, height };
  }
  // Placeable WMF: 0x9AC6CDD7, bounding box and units per inch.
  if (v.getUint32(0, true) === 0x9ac6cdd7) {
    const [l, t, r, bo] = [v.getInt16(6, true), v.getInt16(8, true), v.getInt16(10, true), v.getInt16(12, true)];
    const inch = v.getUint16(14, true) || 1440;
    const extX = Math.max(1, Math.abs(r - l));
    const extY = Math.max(1, Math.abs(bo - t));
    return { kind: 'wmf', extX, extY, width: (extX / inch) * 96, height: (extY / inch) * 96 };
  }
  // Plain WMF (no placeable header): type 1/2, header size 9 words. Size unknown: assume 1000 units.
  if ((v.getUint16(0, true) === 1 || v.getUint16(0, true) === 2) && v.getUint16(2, true) === 9) return { kind: 'wmf', extX: 1000, extY: 1000, width: 600, height: 600 };
  return null;
}
