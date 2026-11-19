/**
 * Images: photos and pictures. Formats browsers show natively, plus HEIC
 * (iPhone), TIFF, Photoshop and camera RAW through decoders loaded on demand.
 */
import type { ViewerEntry } from '../../core/viewer';

/** Kept in sync with photo/decode.ts (RAW, NATIVE) — duplicated here so the list costs nothing to load. */
const RAW = new Set(['cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'arq', 'srf', 'sr2', 'dng', 'gpr', 'raf', 'orf', 'ori', 'rw2', 'raw', 'rwl', 'pef', 'srw', 'x3f', '3fr', 'fff', 'iiq', 'cap', 'eip', 'erf', 'kdc', 'dcr', 'dcs', 'mos', 'mef', 'mrw']);
const IDS = new Set(['jpg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'heic', 'tiff', 'psd', 'svgz', 'jxl', 'jp2', 'exr', 'hdr', 'dcm', ...RAW]);

/** Lottie JSON (After Effects animations exported with Bodymovin): version, frame rate, layers. */
const looksLikeLottie = (head: Uint8Array) => {
  const t = new TextDecoder().decode(head.subarray(0, 8192));
  return /^\s*\{/.test(t) && /"v"\s*:\s*"\d/.test(t) && /"fr"\s*:/.test(t) && /"(layers|assets)"\s*:/.test(t);
};

const looksLikeSvg = (head: Uint8Array) => /<svg[\s>]/i.test(new TextDecoder().decode(head.subarray(0, 4096)));

export const imagesViewers: ViewerEntry[] = [
  {
    // Windows metafiles (EMF, WMF): vector pictures from Office and engineering software.
    id: 'images/metafile',
    category: 'images',
    layout: 'fill',
    mimes: /x-emf|x-wmf|image\/(emf|wmf)/,
    accepts: ({ format }) => format?.id === 'emf' || format?.id === 'wmf',
    load: () => import('./metafile/view'),
  },
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
  {
    // Animations: Lottie (.json/.lottie, Telegram .tgs after unzipping) and Flash (.swf).
    id: 'images/anim',
    category: 'images',
    layout: 'fill',
    prefetch: false,
    accepts: ({ format, head }) => format?.id === 'swf' || format?.id === 'lottie' || ((!format || !!format.text) && looksLikeLottie(head)),
    load: () => import('./anim/view'),
  },
];
