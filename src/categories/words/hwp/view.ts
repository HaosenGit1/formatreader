/** Old binary Hangul documents (.hwp 5.x, Korea) rendered with hwp.js. */
import './hwp.css';
import { h } from '../../../core/dom';
import type { OpenContext, OpenedView } from '../../../core/viewer';

export const preload = () => import('hwp.js');

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const [{ Viewer }, data] = await Promise.all([import('hwp.js'), file.arrayBuffer()]);
  const container = h('div', { class: 'hwp-pages' });
  ctx.mount.replaceChildren(h('div', { class: 'view view-hwp' }, container));
  const viewer = new Viewer(container, new Uint8Array(data), { type: 'array' });
  const pages = container.querySelectorAll('.hwp-page').length;
  return {
    meta: () => ['Hangul (HWP)', ...(pages ? [`${pages} ${pages === 1 ? 'page' : 'pages'}`] : [])],
    destroy: () => {
      try {
        viewer.distory();
      } catch {
        /* already gone */
      }
    },
  };
}
