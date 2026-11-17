/**
 * .gz files (e.g. server.log.gz): decompressed in the browser, then the file
 * inside opens in its own viewer, as if it had been dropped directly.
 */
import type { OpenContext, OpenedView } from '../../../core/viewer';

/** The original name stored in the gzip header (FNAME), if any. */
function storedName(head: Uint8Array): string | null {
  if (head[0] !== 0x1f || head[1] !== 0x8b || !(head[3] & 0x08)) return null;
  let i = 10;
  if (head[3] & 0x04) i += 2 + (head[10] | (head[11] << 8)); // FEXTRA
  let name = '';
  for (; i < head.length && head[i] !== 0; i++) name += String.fromCharCode(head[i]);
  return name || null;
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
  const data = await new Response(stream).blob();
  const fallback = file.name.replace(/\.t?gz$/i, (m) => (m.toLowerCase() === '.tgz' ? '.tar' : '')) || 'file';
  const name = storedName(head) ?? fallback;
  ctx.openFile(new File([data], name), { replace: true });
  return {};
}
