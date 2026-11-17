/**
 * The last-resort viewer: a card naming the format (or "unknown file") when
 * no category has a viewer for it yet. Lives in core so it is always present.
 */
import { infoView } from './info-view';
import type { ViewerEntry } from './viewer';

export const infoEntry: ViewerEntry = {
  id: 'core/info',
  category: 'other',
  priority: 0,
  accepts: () => true,
  load: async () => ({
    async open(file, ctx) {
      const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
      ctx.mount.replaceChildren(infoView(file.size, head, ctx.format));
      return { meta: () => (ctx.format ? [ctx.format.name] : []) };
    },
  }),
};
