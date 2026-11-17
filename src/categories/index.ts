/** Every viewer in the app, from all categories. The shell sorts them by priority. */
import type { ViewerEntry } from '../core/viewer';
import { archivesViewers } from './archives';
import { dataViewers } from './data';
import { drawingsViewers } from './drawings';
import { imagesViewers } from './images';
import { soundsViewers } from './sounds';
import { videosViewers } from './videos';
import { wordsViewers } from './words';

export const allViewers: ViewerEntry[] = [
  ...wordsViewers,
  ...dataViewers,
  ...imagesViewers,
  ...drawingsViewers,
  ...soundsViewers,
  ...videosViewers,
  ...archivesViewers,
];
