/**
 * The browser's own readers (PDF viewer, <img>, <audio>, <video>) trust a
 * file's MIME label, not its bytes. Files taken out of archives have no label
 * and renamed files have a wrong one, so after content detection the shell
 * stamps the detected type on the file before any viewer sees it.
 */
import type { FormatInfo } from './detect-format';

const MIME: Record<string, string> = {
  // documents
  pdf: 'application/pdf', epub: 'application/epub+zip', rtf: 'application/rtf', ps: 'application/postscript',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation',
  // images
  png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
  svg: 'image/svg+xml', tiff: 'image/tiff', heic: 'image/heic', jxl: 'image/jxl', jp2: 'image/jp2', psd: 'image/vnd.adobe.photoshop',
  // sound
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac',
  aiff: 'audio/aiff', mid: 'audio/midi', wma: 'audio/x-ms-wma', amr: 'audio/amr', mka: 'audio/x-matroska',
  // video
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', ogv: 'video/ogg', avi: 'video/x-msvideo',
  mpg: 'video/mpeg', ts: 'video/mp2t', '3gp': 'video/3gpp', flv: 'video/x-flv', wmv: 'video/x-ms-wmv',
  // archives
  zip: 'application/zip', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar', tar: 'application/x-tar', gz: 'application/gzip',
  bz2: 'application/x-bzip2', xz: 'application/x-xz', zst: 'application/zstd',
};

export const mimeFor = (format: FormatInfo | null): string | undefined => (format ? MIME[format.id] : undefined);

/** The same file, labelled with the type its content was detected as (no copy is made). */
export function withDetectedType(file: File, format: FormatInfo | null): File {
  const mime = mimeFor(format);
  if (!mime || file.type === mime) return file;
  return new File([file], file.name, { type: mime, lastModified: file.lastModified });
}
