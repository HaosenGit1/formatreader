/**
 * Archives. Multi-file archives (ZIP, RAR, 7Z, TAR…) list their files; any
 * file opens in FormatReader. A single .gz file opens its content directly.
 */
import type { ViewerEntry } from '../../core/viewer';

/** Formats libarchive can list (single-stream .gz goes to the gzip viewer). */
const ARCHIVE_IDS = new Set(['zip', 'rar', '7z', 'tar', 'xz', 'bz2', 'zst', 'cab', 'iso', 'cbr', 'cb7', 'cbt']);

export const archivesViewers: ViewerEntry[] = [
  {
    id: 'archives/archive',
    category: 'archives',
    mimes: /zip|x-rar|vnd\.rar|x-7z|x-tar|x-xz|x-bzip2|zstd|vnd\.ms-cab|x-iso9660|x-cbr|x-cb7/,
    accepts: ({ format, ext }) => ARCHIVE_IDS.has(format?.id ?? '') || (format?.id === 'gz' && ['tgz'].includes(ext)) || (format?.id === 'tar'),
    load: () => import('./archive/view'),
  },
  {
    id: 'archives/gzip',
    category: 'archives',
    mimes: /gzip/,
    accepts: ({ format }) => format?.id === 'gz' && typeof DecompressionStream !== 'undefined',
    load: () => import('./gzip/view'),
  },
];
