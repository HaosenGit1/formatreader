import { listZipEntries, type BlobLike } from './zip';

export type Category = 'words' | 'images' | 'drawings' | 'sounds' | 'videos' | 'archives' | 'other';

export interface FormatInfo {
  /** Stable id, e.g. 'pdf', 'docx', 'epub', 'png'. */
  id: string;
  /** Display name, e.g. 'PDF document'. */
  name: string;
  category: Category;
  /** True when the content is text and should go through the text pipeline. */
  text?: boolean;
}

const HEAD_BYTES = 4096;

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

const ascii = (b: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...b.subarray(start, Math.min(b.length, start + len)));

const extOf = (name: string) => {
  const m = /\.([a-z0-9_+-]{1,12})$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
};

const F = (id: string, name: string, category: Category, text = false): FormatInfo => ({ id, name, category, text });

/** Formats recognised purely by extension when the bytes don't say more. */
const BY_EXTENSION: Record<string, FormatInfo> = {
  doc: F('doc', 'Word 97–2003 document', 'words'),
  xls: F('xls', 'Excel 97–2003 workbook', 'words'),
  ppt: F('ppt', 'PowerPoint 97–2003 presentation', 'words'),
  msg: F('msg', 'Outlook message', 'words'),
  vsd: F('vsd', 'Visio 2003–2010 drawing', 'drawings'),
  wps: F('wps', 'WPS / Works document', 'words'),
  et: F('et', 'WPS spreadsheet', 'words'),
  dbf: F('dbf', 'dBASE table', 'words'),
  wk1: F('lotus', 'Lotus 1-2-3 spreadsheet', 'words'),
  wk3: F('lotus', 'Lotus 1-2-3 spreadsheet', 'words'),
  wk4: F('lotus', 'Lotus 1-2-3 spreadsheet', 'words'),
  wks: F('lotus', 'Lotus / Works spreadsheet', 'words'),
  qpw: F('qpw', 'Quattro Pro spreadsheet', 'words'),
  dps: F('dps', 'WPS presentation', 'words'),
  pub: F('pub', 'Publisher document', 'words'),
  mpp: F('mpp', 'Project file', 'words'),
  ofd: F('ofd', 'OFD document', 'words'),
  xps: F('xps', 'XPS document', 'words'),
  oxps: F('oxps', 'XPS document', 'words'),
  pages: F('pages', 'Apple Pages document', 'words'),
  numbers: F('numbers', 'Apple Numbers spreadsheet', 'words'),
  key: F('key', 'Apple Keynote presentation', 'words'),
  hwp: F('hwp', 'Hangul document (HWP, old binary)', 'words'),
  wpd: F('wpd', 'WordPerfect document', 'words'),
  dwg: F('dwg', 'AutoCAD drawing', 'drawings'),
  dxf: F('dxf', 'AutoCAD DXF drawing', 'drawings', true),
  step: F('step', 'STEP 3D model', 'drawings', true),
  stp: F('step', 'STEP 3D model', 'drawings', true),
  iges: F('iges', 'IGES 3D model', 'drawings', true),
  igs: F('iges', 'IGES 3D model', 'drawings', true),
  stl: F('stl', 'STL 3D model', 'drawings'),
  obj: F('obj', 'OBJ 3D model', 'drawings', true),
  ifc: F('ifc', 'IFC building model', 'drawings', true),
  svg: F('svg', 'SVG image', 'images', true),
  svgz: F('svgz', 'SVG image (compressed)', 'images'),
  azw: F('azw', 'Kindle book', 'words'),
  kfx: F('kfx', 'Kindle KFX book', 'words'),
  umd: F('umd', 'UMD ebook', 'words'),
  ttf: F('ttf', 'TrueType font', 'other'),
  otf: F('otf', 'OpenType font', 'other'),
  woff: F('woff', 'Web font', 'other'),
  woff2: F('woff2', 'Web font', 'other'),
};

/** ISO-BMFF (MP4 family) brand → format. */
function isoBrand(brand: string, ext: string): FormatInfo {
  const b = brand.trim().toLowerCase();
  if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'].includes(b)) return F('heic', 'HEIC image', 'images');
  if (b === 'avif' || b === 'avis') return F('avif', 'AVIF image', 'images');
  if (b === 'crx') return F('cr3', 'Canon RAW image', 'images');
  if (b === 'qt') return F('mov', 'QuickTime video', 'videos');
  if (b === 'm4a' || b === 'm4b' || b === 'm4p' || ext === 'm4a' || ext === 'm4b') return F('m4a', 'AAC audio', 'sounds');
  if (b.startsWith('3g')) return F('3gp', '3GP video', 'videos');
  return F('mp4', 'MP4 video', 'videos');
}

function fromMagic(h: Uint8Array, ext: string): FormatInfo | null {
  // Documents
  if (ascii(h, 0, 5) === '%PDF-') return F('pdf', 'PDF document', 'words');
  if (ascii(h, 0, 5) === '{\\rtf') return F('rtf', 'Rich Text document', 'words');
  if (ascii(h, 0, 4) === '%!PS') return F('ps', 'PostScript document', 'words');
  if (ascii(h, 0, 8) === 'AT&TFORM') return F('djvu', 'DjVu document', 'words');
  if (ascii(h, 0, 4) === 'ITSF') return F('chm', 'CHM help / ebook', 'words');
  if (ascii(h, 0, 8) === 'ITOLITLS') return F('lit', 'Microsoft Reader ebook', 'words');
  if (ascii(h, 60, 8) === 'BOOKMOBI') {
    return ext === 'azw3' || ext === 'azw'
      ? F('azw3', 'Kindle book (AZW3)', 'words')
      : F('mobi', 'MOBI ebook', 'words');
  }
  if (ascii(h, 60, 8) === 'TEXtREAd') return F('pdb', 'PalmDoc ebook', 'words');
  if (startsWith(h, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return BY_EXTENSION[ext] ?? F('ole', 'Office 97–2003 file', 'words');
  }

  // Archives (ZIP is handled separately)
  if (startsWith(h, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) {
    return ext === 'cbr' ? F('cbr', 'Comic book (CBR)', 'words') : F('rar', 'RAR archive', 'archives');
  }
  if (startsWith(h, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return ext === 'cb7' ? F('cb7', 'Comic book (CB7)', 'words') : F('7z', '7-Zip archive', 'archives');
  }
  if (startsWith(h, [0x1f, 0x8b])) return F('gz', 'GZIP archive', 'archives');
  if (ascii(h, 0, 3) === 'BZh') return F('bz2', 'BZIP2 archive', 'archives');
  if (startsWith(h, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return F('xz', 'XZ archive', 'archives');
  if (startsWith(h, [0x28, 0xb5, 0x2f, 0xfd])) return F('zst', 'Zstandard archive', 'archives');
  if (ascii(h, 257, 5) === 'ustar') return F('tar', 'TAR archive', 'archives');
  if (ascii(h, 0, 8) === 'MSCF\0\0\0\0') return F('cab', 'Cabinet archive', 'archives');

  // Images
  if (startsWith(h, [0xff, 0xd8, 0xff])) return F('jpg', 'JPEG image', 'images');
  if (startsWith(h, [0x89, 0x50, 0x4e, 0x47])) return F('png', 'PNG image', 'images');
  if (ascii(h, 0, 4) === 'GIF8') return F('gif', 'GIF image', 'images');
  if (ascii(h, 0, 4) === 'RIFF' && ascii(h, 8, 4) === 'WEBP') return F('webp', 'WebP image', 'images');
  if (ascii(h, 0, 4) === '8BPS') return F('psd', 'Photoshop document', 'images');
  if (startsWith(h, [0x49, 0x49, 0x2a, 0x00]) || startsWith(h, [0x4d, 0x4d, 0x00, 0x2a])) {
    const raw = ['cr2', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'orf', 'pef', 'rw2', '3fr', 'erf', 'raf'];
    return raw.includes(ext) ? F(ext, 'Camera RAW image', 'images') : F('tiff', 'TIFF image', 'images');
  }
  if (ascii(h, 0, 8) === 'FUJIFILM') return F('raf', 'Fujifilm RAW image', 'images');
  if (startsWith(h, [0xff, 0x0a]) || startsWith(h, [0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20])) return F('jxl', 'JPEG XL image', 'images');
  if (startsWith(h, [0, 0, 0, 0x0c, 0x6a, 0x50, 0x20, 0x20])) return F('jp2', 'JPEG 2000 image', 'images');
  if (ascii(h, 0, 2) === 'BM' && h.length > 14) return F('bmp', 'Bitmap image', 'images');
  if (startsWith(h, [0, 0, 1, 0]) && (ext === 'ico' || ext === '')) return F('ico', 'Icon', 'images');
  if (ascii(h, 128, 4) === 'DICM') return F('dcm', 'DICOM medical image', 'images');
  if (startsWith(h, [0x76, 0x2f, 0x31, 0x01])) return F('exr', 'OpenEXR image', 'images');

  // ISO-BMFF family (MP4, MOV, HEIC, AVIF, M4A, 3GP, CR3)
  if (ascii(h, 4, 4) === 'ftyp') return isoBrand(ascii(h, 8, 4), ext);
  if (['moov', 'mdat', 'wide', 'free'].includes(ascii(h, 4, 4)) && ext === 'mov') return F('mov', 'QuickTime video', 'videos');

  // Video / audio
  if (startsWith(h, [0x1a, 0x45, 0xdf, 0xa3])) {
    const head = ascii(h, 0, 64);
    if (head.includes('webm')) return F('webm', 'WebM video', 'videos');
    return ext === 'mka' ? F('mka', 'Matroska audio', 'sounds') : F('mkv', 'Matroska video (MKV)', 'videos');
  }
  if (ascii(h, 0, 4) === 'RIFF' && ascii(h, 8, 4) === 'AVI ') return F('avi', 'AVI video', 'videos');
  if (ascii(h, 0, 4) === 'RIFF' && ascii(h, 8, 4) === 'WAVE') return F('wav', 'WAV audio', 'sounds');
  if (ascii(h, 0, 4) === 'FORM' && ['AIFF', 'AIFC'].includes(ascii(h, 8, 4))) return F('aiff', 'AIFF audio', 'sounds');
  if (startsWith(h, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])) {
    return ext === 'wma' ? F('wma', 'Windows Media audio', 'sounds') : F('wmv', 'Windows Media video', 'videos');
  }
  if (ascii(h, 0, 3) === 'FLV') return F('flv', 'Flash video', 'videos');
  if (ascii(h, 0, 4) === '.RMF') return ext === 'ra' ? F('ra', 'RealAudio', 'sounds') : F('rmvb', 'RealMedia video', 'videos');
  if (startsWith(h, [0, 0, 1, 0xba]) || startsWith(h, [0, 0, 1, 0xb3])) return F('mpg', 'MPEG video', 'videos');
  if (h[0] === 0x47 && h.length > 188 && h[188] === 0x47) return F('ts', 'MPEG transport stream', 'videos');
  if (ascii(h, 0, 4) === 'OggS') {
    const head = ascii(h, 0, 64);
    if (head.includes('theora') || ext === 'ogv') return F('ogv', 'Ogg video', 'videos');
    return head.includes('OpusHead') ? F('opus', 'Opus audio', 'sounds') : F('ogg', 'Ogg audio', 'sounds');
  }
  if (ascii(h, 0, 4) === 'fLaC') return F('flac', 'FLAC audio', 'sounds');
  if (ascii(h, 0, 3) === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0 && ['mp3', 'mp2', ''].includes(ext))) {
    return F('mp3', 'MP3 audio', 'sounds');
  }
  if (h[0] === 0xff && (h[1] & 0xf6) === 0xf0) return F('aac', 'AAC audio', 'sounds');
  if (ascii(h, 0, 6) === '#!AMR') return F('amr', 'AMR audio', 'sounds');
  if (ascii(h, 0, 4) === 'MAC ') return F('ape', "Monkey's Audio", 'sounds');
  if (ascii(h, 0, 4) === 'MThd') return F('mid', 'MIDI music', 'sounds');

  // Drawings
  if (/^AC10[0-3]\d/.test(ascii(h, 0, 6))) return F('dwg', 'AutoCAD drawing', 'drawings');
  if (ascii(h, 0, 12) === 'ISO-10303-21') return F('step', 'STEP 3D model', 'drawings', true);
  if (ascii(h, 0, 4) === 'glTF') return F('glb', 'glTF 3D model', 'drawings');
  if (ascii(h, 0, 18) === 'Kaydara FBX Binary') return F('fbx', 'FBX 3D model', 'drawings');

  // Other
  if (ascii(h, 0, 16) === 'SQLite format 3\0') return F('sqlite', 'SQLite database', 'words');
  if (ascii(h, 4, 15) === 'Standard Jet DB') return F('mdb', 'Access database (MDB)', 'words');
  if (ascii(h, 4, 15) === 'Standard ACE DB') return F('accdb', 'Access database (ACCDB)', 'words');
  if (ascii(h, 0, 2) === 'MZ') return F('exe', 'Windows program', 'other');
  if (startsWith(h, [0x7f, 0x45, 0x4c, 0x46])) return F('elf', 'Linux program', 'other');
  if (startsWith(h, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(h, [0xca, 0xfe, 0xba, 0xbe])) {
    return ext === 'class' ? F('class', 'Java class file', 'other') : F('macho', 'macOS program', 'other');
  }
  if (startsWith(h, [0, 0x61, 0x73, 0x6d])) return F('wasm', 'WebAssembly module', 'other');
  if (ascii(h, 0, 4) === 'OTTO') return F('otf', 'OpenType font', 'other');
  if (startsWith(h, [0, 1, 0, 0, 0]) && ['ttf', 'ttc', ''].includes(ext)) return F('ttf', 'TrueType font', 'other');
  if (ascii(h, 0, 4) === 'wOFF' || ascii(h, 0, 4) === 'wOF2') return F('woff', 'Web font', 'other');
  if (ascii(h, 0, 4) === 'koly' || ext === 'dmg') return F('dmg', 'macOS disk image', 'archives');
  if (ascii(h, 0x8001, 5) === 'CD001') return F('iso', 'Disc image', 'archives');
  return null;
}

/** Decide what kind of ZIP-based file this is from its entry names and first bytes. */
function fromZip(names: string[], head: Uint8Array, ext: string): FormatInfo {
  const has = (n: string) => names.includes(n);
  const any = (re: RegExp) => names.some((n) => re.test(n));
  const mime = ascii(head, 30, 120); // ODF/EPUB store their mimetype uncompressed as the first entry

  if (mime.includes('application/epub+zip') || (has('META-INF/container.xml') && ext === 'epub')) {
    return F('epub', 'EPUB ebook', 'words');
  }
  if (mime.includes('opendocument.text')) return F('odt', 'OpenDocument text', 'words');
  if (mime.includes('opendocument.spreadsheet')) return F('ods', 'OpenDocument spreadsheet', 'words');
  if (mime.includes('opendocument.presentation')) return F('odp', 'OpenDocument presentation', 'words');
  if (mime.includes('opendocument.graphics')) return F('odg', 'OpenDocument drawing', 'drawings');
  // OpenDocument written by tools that compress the mimetype entry: recognise by structure.
  if (has('content.xml') && has('META-INF/manifest.xml')) {
    if (ext === 'ods' || ext === 'ots') return F('ods', 'OpenDocument spreadsheet', 'words');
    if (ext === 'odp' || ext === 'otp') return F('odp', 'OpenDocument presentation', 'words');
    if (ext === 'odg' || ext === 'otg') return F('odg', 'OpenDocument drawing', 'drawings');
    return F('odt', 'OpenDocument text', 'words');
  }
  if (has('word/document.xml')) return F('docx', 'Word document', 'words');
  if (has('xl/workbook.xml')) return F('xlsx', 'Excel workbook', 'words');
  if (has('xl/workbook.bin')) return F('xlsb', 'Excel binary workbook', 'words');
  if (has('ppt/presentation.xml')) return F('pptx', 'PowerPoint presentation', 'words');
  if (has('visio/document.xml')) return F('vsdx', 'Visio drawing', 'drawings');
  if (any(/\.fdseq$/i) || any(/\.fpage$/i)) return F(ext === 'oxps' ? 'oxps' : 'xps', ext === 'oxps' ? 'OpenXPS document' : 'XPS document', 'words');
  if (has('OFD.xml')) return F('ofd', 'OFD document', 'words');
  if (has('Index/Document.iwa') || any(/^Index\/.*\.iwa$/)) {
    return BY_EXTENSION[ext] ?? F('iwork', 'Apple iWork document', 'words');
  }
  if (mime.includes('application/hwp+zip') || has('Contents/section0.xml')) return F('hwpx', 'Hangul document (HWPX)', 'words');
  if (has('3D/3dmodel.model')) return F('3mf', '3MF 3D model', 'drawings');
  if (has('content.json') && ext === 'xmind') return F('xmind', 'XMind mind map', 'drawings');
  if (has('doc.kml')) return F('kmz', 'Google Earth KMZ', 'drawings');
  if (has('AndroidManifest.xml')) return F('apk', 'Android app', 'other');
  if (has('META-INF/MANIFEST.MF') && ext === 'jar') return F('jar', 'Java archive', 'other');
  if (has('mimetype') && any(/\.fb2$/i)) return F('fbz', 'FictionBook (zipped)', 'words');
  const files = names.filter((n) => !n.endsWith('/'));
  if (files.length > 0 && files.every((n) => /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(n) || /(^|\/)(\.|__MACOSX|thumbs\.db|comicinfo\.xml)/i.test(n))) {
    return F('cbz', 'Comic book (CBZ)', 'words');
  }
  if (ext === 'cbz') return F('cbz', 'Comic book (CBZ)', 'words');
  return F('zip', 'ZIP archive', 'archives');
}

/**
 * Identify a file from its bytes (and its name as a tie-breaker).
 * Returns null when nothing binary matched — the caller then treats the file
 * as text if the encoding detector agrees.
 */
export async function detectFormat(blob: BlobLike, fileName: string): Promise<FormatInfo | null> {
  const head = new Uint8Array(await blob.slice(0, Math.max(HEAD_BYTES, 0x8006)).arrayBuffer());
  const ext = extOf(fileName);

  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) {
    const names = await listZipEntries(blob);
    if (names) return fromZip(names, head, ext);
    return F('zip', 'ZIP archive', 'archives');
  }

  const magic = fromMagic(head, ext);
  if (magic) return magic;

  // Extension-only formats that are binary (DWG without magic, Kindle KFX, …).
  const byExt = BY_EXTENSION[ext];
  if (byExt && !byExt.text) return byExt;
  return null;
}

export { extOf };
