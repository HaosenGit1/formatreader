/** PDF viewer: the browser's built-in PDF viewer, fed from a local object URL. */
import './pdf.css';
import { h } from '../../../core/dom';
import type { OpenContext, OpenedView } from '../../../core/viewer';

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  // A PDF taken out of an archive (or dropped with no MIME type) has an empty
  // type, and the browser will not show an untyped blob as a PDF: label it.
  const blob = file.type === 'application/pdf' ? file : new Blob([file], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const frame = h('iframe', { class: 'pdf-frame', src: url, title: file.name }) as HTMLIFrameElement;
  ctx.mount.replaceChildren(h('div', { class: 'view view-pdf' }, frame));
  return {
    meta: () => ['PDF'],
    // The PDF itself, every page as it is (not the page around it).
    print: () => {
      try {
        frame.contentWindow!.focus();
        frame.contentWindow!.print();
      } catch {
        window.print();
      }
    },
    destroy: () => URL.revokeObjectURL(url),
  };
}
