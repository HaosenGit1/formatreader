/** PowerPoint viewer (.pptx) with a full-screen slideshow. */
import './slides.css';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { openSlides } from './slides-view';

const s = strings({
  present: { en: 'Present', zh: '放映' },
  slides: { en: 'slides', zh: '页幻灯片' },
});

/** Start downloading the slide renderer early. */
export const preload = () => import('pptx-preview');

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const slides = await openSlides(file, ctx.mount);
  return {
    meta: () => ['PowerPoint', `${slides.count} ${s('slides')}`],
    fullscreen: () => slides.present(),
    fullscreenLabel: () => s('present'),
    destroy: () => slides.destroy(),
  };
}
