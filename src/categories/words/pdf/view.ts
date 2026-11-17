/** PDF viewer: the browser's built-in PDF viewer, fed from a local object URL. */
import './pdf.css';
import { h } from '../../../core/dom';
import type { OpenContext, OpenedView } from '../../../core/viewer';

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const url = URL.createObjectURL(file);
  ctx.mount.replaceChildren(h('div', { class: 'view view-pdf' }, h('iframe', { class: 'pdf-frame', src: url, title: file.name })));
  return {
    meta: () => ['PDF'],
    destroy: () => URL.revokeObjectURL(url),
  };
}
