/**
 * Turns an image file into something the page can show: an <img> for formats
 * browsers read themselves, or a <canvas> for ones decoded here (HEIC, TIFF,
 * PSD). Decoders download only when such a file is opened.
 */
import { findEmbeddedJpegs } from './raw';

export interface Picture {
  element: HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
}

export interface Decoded {
  /** Format name for the toolbar, e.g. "HEIC". */
  label: string;
  pages: number;
  page(index: number): Promise<Picture>;
  /** Shown under the toolbar, e.g. "Camera preview" for RAW files. */
  note?: 'rawPreview' | 'psdComposite' | 'heicDepth';
  /** Extra rows for the Details panel (e.g. a DICOM scan's modality and study). */
  details?: Array<[string, string]>;
  /** Quarter turns needed (camera RAW previews don't carry the photo's orientation). */
  turns?: number;
  release?(): void;
}

/** Formats every current browser shows directly in <img>. */
export const NATIVE = new Set(['jpg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'apng']);
/** Camera RAW formats (TIFF- or ISO-based) whose embedded JPEG preview is shown. */
export const RAW = new Set(['cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw', 'x3f', '3fr', 'iiq', 'erf', 'kdc', 'mrw', 'rwl']);

const LABELS: Record<string, string> = {
  jpg: 'JPEG', png: 'PNG', gif: 'GIF', webp: 'WebP', avif: 'AVIF', bmp: 'BMP', ico: 'Icon', svg: 'SVG', svgz: 'SVG',
  heic: 'HEIC', tiff: 'TIFF', psd: 'Photoshop', jxl: 'JPEG XL', jp2: 'JPEG 2000', exr: 'OpenEXR', hdr: 'Radiance HDR', tga: 'TGA', dcm: 'DICOM',
};

function loadImg(blob: Blob): Promise<Picture & { url: string }> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = 'async';
  img.draggable = false;
  img.alt = '';
  return new Promise((resolve, reject) => {
    img.onload = () => resolve({ element: img, width: img.naturalWidth || 300, height: img.naturalHeight || 150, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This browser cannot display this image.'));
    };
    img.src = url;
  });
}

function canvasFrom(data: ArrayLike<number> & { buffer?: ArrayBufferLike }, width: number, height: number): Picture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const n = width * height * 4;
  const pixels = new Uint8ClampedArray(n);
  if (data instanceof Float32Array) for (let i = 0; i < n; i++) pixels[i] = data[i] * 255; // 32-bit (0…1)
  else if (data instanceof Uint16Array) for (let i = 0; i < n; i++) pixels[i] = data[i] >> 8; // 16-bit
  else pixels.set(data as ArrayLike<number>);
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0);
  return { element: canvas, width, height };
}

/** A single picture that the browser decodes (also used to try HEIC/JXL/JP2 natively first). */
async function native(file: Blob, label: string): Promise<Decoded> {
  const pic = await loadImg(file);
  return { label, pages: 1, page: async () => pic, release: () => URL.revokeObjectURL(pic.url) };
}

async function svgz(file: File): Promise<Decoded> {
  const text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
  return native(new Blob([text], { type: 'image/svg+xml' }), 'SVG');
}

async function heic(file: File): Promise<Decoded> {
  // Safari reads HEIC itself; elsewhere libheif (WebAssembly) decodes it.
  try {
    return await native(file, 'HEIC');
  } catch {
    /* not supported natively */
  }
  const { default: factory } = await import('libheif-js/libheif-wasm/libheif-bundle.mjs');
  const libheif = factory() as { HeifDecoder: new () => { decode(b: Uint8Array): HeifImage[] }; ready?: Promise<unknown> };
  if (libheif.ready) await libheif.ready;
  const images = new libheif.HeifDecoder().decode(new Uint8Array(await file.arrayBuffer()));
  if (!images.length) throw new Error('No image found in this HEIC file.');
  // The primary image first (the photo itself), then any others (bursts, sequences).
  images.sort((a, b) => Number(b.is_primary()) - Number(a.is_primary()));
  return {
    label: 'HEIC',
    pages: images.length,
    async page(i) {
      const image = images[i];
      const width = image.get_width();
      const height = image.get_height();
      const out = await new Promise<{ data: Uint8ClampedArray }>((resolve, reject) =>
        image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (d) => (d ? resolve(d) : reject(new Error('This HEIC image could not be decoded.')))),
      );
      return canvasFrom(out.data, width, height);
    },
    release: () => images.forEach((im) => im.free?.()),
  };
}

interface HeifImage {
  get_width(): number;
  get_height(): number;
  is_primary(): boolean;
  display(target: { data: Uint8ClampedArray; width: number; height: number }, cb: (d: { data: Uint8ClampedArray } | null) => void): void;
  free?(): void;
}

async function tiff(file: File): Promise<Decoded> {
  const { default: UTIF } = await import('utif');
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf).filter((ifd: Record<string, unknown>) => ifd.t256 && ifd.t257);
  if (!ifds.length) throw new Error('No image found in this TIFF file.');
  return {
    label: 'TIFF',
    pages: ifds.length,
    async page(i) {
      const ifd = ifds[i];
      UTIF.decodeImage(buf, ifd);
      return canvasFrom(UTIF.toRGBA8(ifd), ifd.width, ifd.height);
    },
  };
}

async function psd(file: File): Promise<Decoded> {
  const { readPsd } = await import('ag-psd');
  const buf = await file.arrayBuffer();
  const doc = readPsd(buf, { skipLayerImageData: true, skipThumbnail: true, useImageData: true });
  const img = doc.imageData;
  if (!img) {
    // Saved without "Maximize compatibility": only the small thumbnail is available.
    const withThumb = readPsd(buf, { skipLayerImageData: true, skipCompositeImageData: true, useImageData: true });
    const thumb = withThumb.imageResources?.thumbnail as unknown as ImageData | undefined;
    if (!thumb) throw new Error('This Photoshop file has no flattened image to show.');
    return { label: 'Photoshop', pages: 1, note: 'psdComposite', page: async () => canvasFrom(thumb.data, thumb.width, thumb.height) };
  }
  return { label: 'Photoshop', pages: 1, page: async () => canvasFrom(img.data, img.width, img.height) };
}

/** EXIF orientation → quarter turns (mirrored variants are shown unmirrored). */
const TURNS: Record<number, number> = { 3: 2, 4: 2, 5: 1, 6: 1, 7: 3, 8: 3 };

async function raw(file: File, ext: string): Promise<Decoded> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  for (const { start, end } of findEmbeddedJpegs(bytes)) {
    try {
      const decoded = await native(new Blob([bytes.subarray(start, end)], { type: 'image/jpeg' }), `RAW (${ext.toUpperCase()})`);
      let turns = 0;
      try {
        const { default: exifr } = await import('exifr/dist/lite.esm.mjs');
        turns = TURNS[(await exifr.orientation(file)) ?? 1] ?? 0;
      } catch {
        /* no orientation: show as stored */
      }
      return { ...decoded, note: 'rawPreview', turns };
    } catch {
      /* e.g. lossless-JPEG sensor data: try the next one */
    }
  }
  throw new Error('No preview image was found in this RAW file.');
}

async function single(label: string, make: () => Promise<Picture>): Promise<Decoded> {
  const pic = await make();
  return { label, pages: 1, page: async () => pic };
}

async function tga(file: File): Promise<Decoded> {
  const { TGALoader } = await import('three/addons/loaders/TGALoader.js');
  const t = new TGALoader().parse(await file.arrayBuffer()) as unknown as { data: Uint8Array; width: number; height: number };
  return single('TGA', async () => canvasFrom(t.data, t.width, t.height));
}

async function dicom(file: File): Promise<Decoded> {
  const { decodeDicom } = await import('./dicom');
  const d = await decodeDicom(new Uint8Array(await file.arrayBuffer()));
  return { label: 'DICOM', pages: d.pages, page: d.page, details: d.details };
}

export async function decodeImage(file: File, formatId: string, ext: string): Promise<Decoded> {
  if (formatId === 'exr' || ext === 'exr') {
    const { decodeExr } = await import('./hdr');
    return single('OpenEXR', async () => decodeExr(await file.arrayBuffer()));
  }
  if (formatId === 'hdr') {
    const { decodeHdr } = await import('./hdr');
    return single('Radiance HDR', async () => decodeHdr(await file.arrayBuffer()));
  }
  if (formatId === 'tga' || ext === 'tga') return tga(file);
  if (formatId === 'dcm' || ext === 'dcm' || ext === 'dicom') return dicom(file);
  if (RAW.has(formatId) || (RAW.has(ext) && (formatId === 'tiff' || formatId === ext || !formatId))) return raw(file, RAW.has(ext) ? ext : formatId);
  if (formatId === 'heic') return heic(file);
  if (formatId === 'tiff') {
    // Safari shows TIFF natively; elsewhere decode it here.
    return tiff(file).catch(() => native(file, 'TIFF'));
  }
  if (formatId === 'psd') return psd(file);
  if (formatId === 'svgz' || ext === 'svgz') return svgz(file);
  if (formatId === 'jxl' || formatId === 'jp2') {
    return native(file, LABELS[formatId]).catch(() => {
      throw new Error(`${LABELS[formatId]} images can't be shown in this browser yet (Safari can show them).`);
    });
  }
  return native(file, LABELS[formatId] ?? formatId.toUpperCase());
}
