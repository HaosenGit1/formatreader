/** PDF viewer: the browser's built-in PDF viewer, fed from a local object URL. */
import './pdf.css';
import { h } from '../../../core/dom';
import type { OpenContext, OpenedView } from '../../../core/viewer';

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  // A PDF taken out of an archive (or dropped with no MIME type) has an empty
  // type, and the browser will not show an untyped blob as a PDF: label it.
  const blob = file.type === 'application/pdf' ? file : new Blob([file], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  ctx.mount.replaceChildren(h('div', { class: 'view view-pdf' }, h('iframe', { class: 'pdf-frame', src: url, title: file.name })));
  return {
    meta: () => ['PDF'],
    destroy: () => URL.revokeObjectURL(url),
  };
}
