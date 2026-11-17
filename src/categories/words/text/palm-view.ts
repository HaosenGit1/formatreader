/** PalmDoc ebooks: decompressed, then shown like any text (with encoding detection). */
import './text.css';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { TextSource } from '../shared/text-source';
import { palmDocText } from './palmdoc';
import { plainView } from './render';

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const src = await TextSource.fromBytes(palmDocText(new Uint8Array(await file.arrayBuffer())));
  if (!src) throw new Error('This PalmDoc contains no readable text');
  const draw = () => ctx.mount.replaceChildren(plainView(src.text));
  const changed = () => {
    draw();
    ctx.refreshChrome();
  };
  draw();
  return {
    meta: () => ['PalmDoc'],
    tools: () => {
      const enc = src.tool(changed);
      return enc ? [enc] : [];
    },
    notices: () => src.notices(changed),
    onFontScale: () => {},
  };
}
