/**
 * Videos: the browser plays them (MP4, WebM, MOV, MKV, OGV where the codecs are
 * supported); others show their details and a clear message.
 */
import type { ViewerEntry } from '../../core/viewer';

const IDS = new Set(['qsv', 'kux', 'qlv', 'xv', 'mp4', 'webm', 'mov', 'mkv', 'ogv', 'avi', 'wmv', 'flv', 'mpg', 'ts', '3gp', 'rmvb']);

export const videosViewers: ViewerEntry[] = [
  {
    id: 'videos/video',
    category: 'videos',
    layout: 'fill',
    prefetch: true,
    mimes: /^video\//,
    // (.mts is also a TypeScript module: camcorder .mts streams are recognised by content as 'ts'.)
    accepts: ({ format, ext }) => IDS.has(format?.id ?? '') || (!format && ext === 'm4v'),
    load: () => import('./video/view'),
  },
];
