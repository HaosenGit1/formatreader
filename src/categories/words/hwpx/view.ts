/** HWPX (Hangul, Korea) documents as a page. Old binary .hwp is not supported. */
import { strFromU8 } from 'fflate';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { renderPaper } from '../shared/paper';
import { hwpxToBlocks } from './convert';

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const { unzipSync } = await import('fflate');
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => /^Contents\/(section\d+|header)\.xml$/i.test(f.name) });
  const sections = Object.keys(files)
    .filter((n) => /section\d+\.xml$/i.test(n))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]))
    .map((n) => strFromU8(files[n]));
  const header = Object.keys(files).find((n) => /header\.xml$/i.test(n));
  const page = renderPaper(hwpxToBlocks(sections, header ? strFromU8(files[header]) : undefined));
  ctx.mount.replaceChildren(page.el);
  return { meta: () => ['Hangul (HWPX)'], onFontScale: () => {}, destroy: page.dispose };
}
