/**
 * Archives. gzip: the file inside opens in its own viewer. ZIP/RAR/7Z: next.
 */
import type { ViewerEntry } from '../../core/viewer';

export const archivesViewers: ViewerEntry[] = [
  {
    id: 'archives/gzip',
    category: 'archives',
    mimes: /gzip/,
    accepts: ({ format }) => format?.id === 'gz' && typeof DecompressionStream !== 'undefined',
    load: () => import('./gzip/view'),
  },
];
