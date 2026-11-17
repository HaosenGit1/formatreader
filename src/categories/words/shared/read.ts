import { infoView, messageView } from '../../../core/info-view';
import { strings } from '../../../core/i18n';
import type { OpenedView } from '../../../core/viewer';
import { TextSource } from './text-source';

const s = strings({ empty: { en: 'This file is empty.', zh: '这个文件是空的。' } });

/**
 * Reads a file as text. When it is empty or turns out to be binary, returns
 * a ready view explaining that instead (so every text viewer behaves alike).
 */
export async function readText(file: File, mount: HTMLElement): Promise<TextSource | OpenedView> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) {
    mount.replaceChildren(messageView(file.name, s('empty')));
    return {};
  }
  const src = await TextSource.fromBytes(bytes);
  if (!src) {
    mount.replaceChildren(infoView(file.size, bytes.subarray(0, 64 * 1024), null));
    return {};
  }
  return src;
}

export const isSource = (x: TextSource | OpenedView): x is TextSource => x instanceof TextSource;
