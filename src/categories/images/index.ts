/**
 * Images: photos and pictures. Formats browsers show natively, plus HEIC
 * (iPhone), TIFF, Photoshop and camera RAW through decoders loaded on demand.
 */
import type { ViewerEntry } from '../../core/viewer';

/** Kept in sync with photo/decode.ts (RAW, NATIVE) — duplicated here so the list costs nothing to load. */
const RAW = new Set(['cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw', 'x3f', '3fr', 'iiq', 'erf', 'kdc', 'mrw', 'rwl']);
const IDS = new Set(['jpg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'heic', 'tiff', 'psd', 'svgz', 'jxl', 'jp2', 'exr', 'hdr', 'dcm', ...RAW]);

const looksLikeSvg = (head: Uint8Array) => /<svg[\s>]/i.test(new TextDecoder().decode(head.subarray(0, 4096)));

export const imagesViewers: ViewerEntry[] = [
  {
    id: 'images/photo',
    category: 'images',
    layout: 'fill',
    prefetch: true,
    mimes: /^image\//,
    accepts: ({ format, ext, head }) =>
      IDS.has(format?.id ?? '') ||
      (RAW.has(ext) && (!format || format.id === 'tiff')) ||
      (ext === 'svg' && looksLikeSvg(head)) ||
      (ext === 'svgz' && format?.id === 'gz') ||
      // No signature: TGA by name; DICOM files saved without their 128-byte preamble.
      (!format && (ext === 'tga' || ext === 'dcm')),
    load: () => import('./photo/view'),
  },
];
