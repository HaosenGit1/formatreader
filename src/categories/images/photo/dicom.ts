/**
 * DICOM (medical images: CT, MR, X-ray, ultrasound…). Pixel data is shown with
 * the scan's own brightness/contrast window (or one computed from the pixels),
 * frames as pages. Uncompressed, RLE and JPEG-baseline scans decode here;
 * other compressions (JPEG 2000, JPEG-LS, lossless JPEG) are named, not shown.
 * Patient name and ID are deliberately not displayed.
 */
import type { Picture } from './decode';

type DataSet = {
  string(tag: string): string | undefined;
  uint16(tag: string): number | undefined;
  intString(tag: string): number | undefined;
  floatString(tag: string, i?: number): number | undefined;
  elements: Record<string, { dataOffset: number; length: number; fragments?: Array<{ offset: number; position: number; length: number }>; basicOffsetTable?: number[]; encapsulatedPixelData?: boolean }>;
  byteArray: Uint8Array;
};

const SYNTAX: Record<string, string> = {
  '1.2.840.10008.1.2': 'uncompressed', '1.2.840.10008.1.2.1': 'uncompressed', '1.2.840.10008.1.2.2': 'uncompressed-be', '1.2.840.10008.1.2.1.99': 'deflate',
  '1.2.840.10008.1.2.5': 'rle', '1.2.840.10008.1.2.4.50': 'jpeg', '1.2.840.10008.1.2.4.51': 'jpeg-ext',
  '1.2.840.10008.1.2.4.57': 'JPEG lossless', '1.2.840.10008.1.2.4.70': 'JPEG lossless', '1.2.840.10008.1.2.4.80': 'JPEG-LS', '1.2.840.10008.1.2.4.81': 'JPEG-LS',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000', '1.2.840.10008.1.2.4.91': 'JPEG 2000', '1.2.840.10008.1.2.4.201': 'HTJ2K', '1.2.840.10008.1.2.4.202': 'HTJ2K', '1.2.840.10008.1.2.4.203': 'HTJ2K',
};

const MODALITY: Record<string, string> = { CT: 'CT', MR: 'MRI', CR: 'X-ray', DX: 'X-ray', MG: 'Mammography', US: 'Ultrasound', NM: 'Nuclear medicine', PT: 'PET', XA: 'Angiography', OT: 'Other', SC: 'Secondary capture' };

export interface DicomImage {
  pages: number;
  page(i: number): Promise<Picture>;
  details: Array<[string, string]>;
}

export async function decodeDicom(bytes: Uint8Array): Promise<DicomImage> {
  const dicomParser = (await import('dicom-parser')).default as unknown as { parseDicom(b: Uint8Array): DataSet };
  const ds = dicomParser.parseDicom(bytes);
  const rows = ds.uint16('x00280010') ?? 0;
  const cols = ds.uint16('x00280011') ?? 0;
  const bits = ds.uint16('x00280100') ?? 16;
  const signed = ds.uint16('x00280103') === 1;
  const spp = ds.uint16('x00280002') ?? 1;
  // RLE output below is always interleaved, whatever the file's planar flag says.
  const planarFlag = ds.uint16('x00280006') === 1;
  const photometric = (ds.string('x00280004') ?? 'MONOCHROME2').trim();
  const frames = Math.max(1, ds.intString('x00280008') ?? 1);
  const slope = ds.floatString('x00281053') ?? 1;
  const intercept = ds.floatString('x00281052') ?? 0;
  const syntax = SYNTAX[(ds.string('x00020010') ?? '1.2.840.10008.1.2').trim()] ?? 'unknown';
  const planar = planarFlag && syntax !== 'rle';
  const pixel = ds.elements['x7fe00010'];
  if (!rows || !cols || !pixel) throw new Error('This DICOM file has no image (it may be a report or structured data).');
  if (!['uncompressed', 'uncompressed-be', 'rle', 'jpeg', 'jpeg-ext'].includes(syntax)) {
    throw new Error(`This DICOM image is compressed with ${syntax === 'unknown' ? 'a method' : syntax} that can't be shown here yet.`);
  }

  const modality = (ds.string('x00080060') ?? '').trim();
  const details: Array<[string, string]> = [];
  const add = (label: string, v?: string) => v?.trim() && details.push([label, v.trim()]);
  add('Modality', MODALITY[modality] && MODALITY[modality] !== modality ? `${MODALITY[modality]} (${modality})` : modality);
  add('Body part', ds.string('x00180015'));
  add('Study', ds.string('x00081030'));
  const date = ds.string('x00080020')?.trim();
  if (date && /^\d{8}$/.test(date)) add('Study date', `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`);
  add('Equipment', [ds.string('x00080070'), ds.string('x00081090')].filter(Boolean).join(' '));
  if (frames > 1) add('Frames', String(frames));

  const frameBytes = rows * cols * spp * (bits / 8);
  const frameData = (i: number): Uint8Array => {
    if (!pixel.encapsulatedPixelData) return ds.byteArray.subarray(pixel.dataOffset + i * frameBytes, pixel.dataOffset + (i + 1) * frameBytes);
    // Encapsulated: fragment positions are absolute in the file. Frames are found from the
    // basic offset table when present, else one fragment per frame (or all for a single frame).
    const frags = pixel.fragments ?? [];
    const bot = pixel.basicOffsetTable ?? [];
    let pick = frags;
    if (frames > 1 && bot.length === frames) pick = frags.filter((f) => f.offset >= bot[i] && (i + 1 >= frames || f.offset < bot[i + 1]));
    else if (frames > 1 && frags.length === frames) pick = frags.slice(i, i + 1);
    const total = pick.reduce((n, f) => n + f.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const f of pick) {
      out.set(ds.byteArray.subarray(f.position, f.position + f.length), o);
      o += f.length;
    }
    return out;
  };

  const windowCenter = ds.floatString('x00281050');
  const windowWidth = ds.floatString('x00281051');

  return {
    pages: frames,
    details,
    async page(i) {
      let raw = frameData(i);
      if (syntax === 'jpeg' || syntax === 'jpeg-ext') {
        // 8-bit JPEG: the browser decodes it.
        const bmp = await createImageBitmap(new Blob([raw as BlobPart], { type: 'image/jpeg' }));
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const g = canvas.getContext('2d')!;
        g.drawImage(bmp, 0, 0);
        // DICOM says the JPEG holds plain RGB, but nothing in the JPEG says so: the browser
        // converted it as if it were YCbCr. Undo that conversion to get the stored colours back.
        if (spp === 3 && photometric === 'RGB' && browserAssumesYcc(raw)) {
          const img = g.getImageData(0, 0, bmp.width, bmp.height);
          const d = img.data;
          for (let k = 0; k < d.length; k += 4) {
            const [r, gg, b] = [d[k], d[k + 1], d[k + 2]];
            d[k] = 0.299 * r + 0.587 * gg + 0.114 * b;
            d[k + 1] = -0.168736 * r - 0.331264 * gg + 0.5 * b + 128;
            d[k + 2] = 0.5 * r - 0.418688 * gg - 0.081312 * b + 128;
          }
          g.putImageData(img, 0, 0);
        }
        return { element: canvas, width: bmp.width, height: bmp.height };
      }
      if (syntax === 'rle') raw = decodeRle(raw, rows * cols, spp, bits / 8);
      const n = rows * cols;
      const out = new Uint8ClampedArray(n * 4);
      if (spp === 3) {
        // Colour (RGB / YBR_FULL), interleaved or planar.
        for (let p = 0; p < n; p++) {
          let r = planar ? raw[p] : raw[p * 3];
          let g = planar ? raw[n + p] : raw[p * 3 + 1];
          let b = planar ? raw[2 * n + p] : raw[p * 3 + 2];
          if (photometric.startsWith('YBR')) [r, g, b] = [r + 1.402 * (b - 128), r - 0.344136 * (g - 128) - 0.714136 * (b - 128), r + 1.772 * (g - 128)];
          out.set([r, g, b, 255], p * 4);
        }
      } else {
        const values = new Float32Array(n);
        const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        const le = syntax !== 'uncompressed-be';
        for (let p = 0; p < n; p++) {
          let v: number;
          if (bits === 8) v = signed ? (raw[p] << 24) >> 24 : raw[p];
          else if (bits === 16) v = signed ? dv.getInt16(p * 2, le) : dv.getUint16(p * 2, le);
          else v = signed ? dv.getInt32(p * 4, le) : dv.getUint32(p * 4, le);
          values[p] = v * slope + intercept;
        }
        // Window: from the file, or the 1st–99th percentile of the pixels.
        let lo: number;
        let hi: number;
        if (windowCenter !== undefined && windowWidth) {
          lo = windowCenter - windowWidth / 2;
          hi = windowCenter + windowWidth / 2;
        } else {
          const sample = Array.from(values.filter((_, k) => k % Math.max(1, Math.floor(n / 50_000)) === 0)).sort((a, b) => a - b);
          lo = sample[Math.floor(sample.length * 0.01)] ?? 0;
          hi = sample[Math.floor(sample.length * 0.99)] ?? 1;
        }
        const span = Math.max(hi - lo, 1e-6);
        const invert = photometric === 'MONOCHROME1';
        for (let p = 0; p < n; p++) {
          let g = ((values[p] - lo) / span) * 255;
          if (invert) g = 255 - g;
          out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = g;
          out[p * 4 + 3] = 255;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = cols;
      canvas.height = rows;
      canvas.getContext('2d')!.putImageData(new ImageData(out, cols, rows), 0, 0);
      return { element: canvas, width: cols, height: rows };
    },
  };
}

/** Will a browser treat this 3-component JPEG as YCbCr? (Yes, unless an Adobe marker says RGB or components are named R, G, B.) */
function browserAssumesYcc(j: Uint8Array): boolean {
  let i = 2;
  let adobeRgb = false;
  while (i + 4 < j.length && j[i] === 0xff) {
    const m = j[i + 1];
    const len = (j[i + 2] << 8) | j[i + 3];
    if (m === 0xee && String.fromCharCode(...j.subarray(i + 4, i + 9)) === 'Adobe') adobeRgb = j[i + 4 + 11] === 0;
    if (m >= 0xc0 && m <= 0xc3) {
      const ids = String.fromCharCode(j[i + 10], j[i + 13], j[i + 16]);
      return !adobeRgb && ids !== 'RGB';
    }
    if (m === 0xda) break;
    i += 2 + len;
  }
  return !adobeRgb;
}

/** DICOM RLE (PackBits per byte plane, most significant plane first). */
function decodeRle(src: Uint8Array, pixels: number, spp: number, bytesPerSample: number): Uint8Array {
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const segments = dv.getUint32(0, true);
  const out = new Uint8Array(pixels * spp * bytesPerSample);
  for (let s = 0; s < segments; s++) {
    const start = dv.getUint32(4 + s * 4, true);
    const end = s + 1 < segments ? dv.getUint32(8 + s * 4, true) : src.length;
    const sample = Math.floor(s / bytesPerSample);
    const byteInSample = bytesPerSample - 1 - (s % bytesPerSample); // segment 0 = high byte; output little-endian
    let o = 0;
    for (let i = start; i < end && o < pixels; ) {
      const n = (src[i++] << 24) >> 24;
      if (n >= 0) {
        for (let k = 0; k <= n && o < pixels; k++) out[(o++ * spp + sample) * bytesPerSample + byteInSample] = src[i++];
      } else if (n !== -128) {
        const v = src[i++];
        for (let k = 0; k < 1 - n && o < pixels; k++) out[(o++ * spp + sample) * bytesPerSample + byteInSample] = v;
      }
    }
  }
  return out;
}
