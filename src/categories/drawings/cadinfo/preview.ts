/**
 * Finds the preview pictures CAD programs save inside their files: PNG or JPEG images
 * anywhere in the bytes (also inside OLE compound files, e.g. Revit "RevitPreview4.0",
 * Inventor and SolidWorks thumbnails) and raw Windows bitmaps (DIB, used by Rhino and
 * OLE clipboard thumbnails). Returns the largest one.
 */
export interface Found {
  blob: Blob;
  width: number;
  height: number;
}

const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);

function pngAt(b: Uint8Array, i: number): Found | null {
  if (b[i + 1] !== 0x50 || b[i + 2] !== 0x4e || b[i + 3] !== 0x47 || b[i + 4] !== 0x0d || b[i + 5] !== 0x0a) return null;
  const width = be32(b, i + 16);
  const height = be32(b, i + 20);
  if (!width || !height || width > 20000 || height > 20000) return null;
  let p = i + 8;
  while (p + 12 <= b.length) {
    const len = be32(b, p);
    const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    p += 12 + len;
    if (type === 'IEND') return { blob: new Blob([b.slice(i, p)], { type: 'image/png' }), width, height };
    if (len > b.length) return null;
  }
  return null;
}

function jpegAt(b: Uint8Array, i: number): Found | null {
  if (b[i + 1] !== 0xd8 || b[i + 2] !== 0xff) return null;
  let p = i + 2;
  let width = 0;
  let height = 0;
  while (p + 4 < b.length && b[p] === 0xff) {
    const marker = b[p + 1];
    const len = (b[p + 2] << 8) | b[p + 3];
    if (marker >= 0xc0 && marker <= 0xc3) (height = (b[p + 5] << 8) | b[p + 6]), (width = (b[p + 7] << 8) | b[p + 8]);
    if (marker === 0xda) {
      // Entropy-coded data: the image ends at the next FF D9.
      for (let q = p + 2 + len; q + 1 < b.length; q++) if (b[q] === 0xff && b[q + 1] === 0xd9) return width && height ? { blob: new Blob([b.slice(i, q + 2)], { type: 'image/jpeg' }), width, height } : null;
      return null;
    }
    p += 2 + len;
  }
  return null;
}

/** A BITMAPINFOHEADER that looks real, drawn into a PNG. */
async function dibAt(b: Uint8Array, i: number): Promise<Found | null> {
  const w = le32(b, i + 4) | 0;
  const hRaw = le32(b, i + 8) | 0;
  const planes = le16(b, i + 12);
  const bpp = le16(b, i + 14);
  const comp = le32(b, i + 16);
  const h = Math.abs(hRaw);
  if (planes !== 1 || ![8, 24, 32].includes(bpp) || (comp !== 0 && comp !== 3) || w < 16 || w > 4096 || h < 16 || h > 4096) return null;
  const colors = bpp === 8 ? le32(b, i + 32) || 256 : 0;
  const stride = Math.ceil((w * bpp) / 32) * 4;
  const pix = i + 40 + colors * 4 + (comp === 3 ? 12 : 0);
  if (pix + stride * h > b.length) return null;
  if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') return null;
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    const row = pix + (hRaw > 0 ? h - 1 - y : y) * stride;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (bpp === 8) {
        const c = i + 40 + b[row + x] * 4;
        img.data[o] = b[c + 2];
        img.data[o + 1] = b[c + 1];
        img.data[o + 2] = b[c];
      } else {
        const s = row + x * (bpp / 8);
        img.data[o] = b[s + 2];
        img.data[o + 1] = b[s + 1];
        img.data[o + 2] = b[s];
      }
      img.data[o + 3] = 255;
    }
  }
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  (canvas.getContext('2d') as CanvasRenderingContext2D).putImageData(img, 0, 0);
  const blob = canvas instanceof OffscreenCanvas ? await canvas.convertToBlob({ type: 'image/png' }) : await new Promise<Blob>((r) => (canvas as HTMLCanvasElement).toBlob((x) => r(x!), 'image/png'));
  return { blob, width: w, height: h };
}

/** All embedded pictures in a byte range (PNG and JPEG anywhere; DIB as a fallback). */
export async function findPreviews(b: Uint8Array): Promise<Found[]> {
  const out: Found[] = [];
  for (let i = 0; i + 8 < b.length && out.length < 40; i++) {
    const c = b[i];
    if (c === 0x89) {
      const f = pngAt(b, i);
      if (f) out.push(f);
    } else if (c === 0xff && b[i + 1] === 0xd8) {
      const f = jpegAt(b, i);
      if (f) out.push(f);
    }
  }
  if (!out.length) {
    for (let i = 0; i + 40 < b.length; i++) {
      if (b[i] !== 0x28 || b[i + 1] || b[i + 2] || b[i + 3]) continue;
      const f = await dibAt(b, i);
      if (f) {
        out.push(f);
        break;
      }
    }
  }
  return out;
}

/** The largest picture: in an OLE compound file, every stream is searched (streams aren't contiguous). */
export async function bestPreview(bytes: Uint8Array): Promise<Found | null> {
  let found: Found[] = [];
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (isOle) {
    try {
      const CFB = await import('cfb');
      const doc = CFB.read(bytes, { type: 'array' });
      for (const entry of doc.FileIndex) if (entry.type === 2 && entry.content?.length) found.push(...(await findPreviews(Uint8Array.from(entry.content as ArrayLike<number>))));
    } catch {
      /* fall back to a raw scan */
    }
  }
  if (!found.length) found = await findPreviews(bytes);
  return found.sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
}
