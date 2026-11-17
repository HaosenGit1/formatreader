/** Rich Text Format (.rtf) viewer: converted with our own parser, drawn as a page. */
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { renderPaper } from '../shared/paper';
import { bytesToRtfString, parseRtf } from './parse';

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const blocks = parseRtf(bytesToRtfString(new Uint8Array(await file.arrayBuffer())));
  const page = renderPaper(blocks);
  ctx.mount.replaceChildren(page.el);
  return { meta: () => ['Rich Text (RTF)'], onFontScale: () => {}, destroy: page.dispose };
}
