/** Binary property lists, shown as the XML plist text (read-only). */
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { codeView } from '../shared/code-block';
import { bplistToXml } from './bplist';

const s = strings({
  label: { en: 'Property list (binary)', zh: '属性列表（二进制）' },
  note: { en: 'Apple binary property list, shown as XML text.', zh: 'Apple 二进制属性列表，以 XML 文本显示。' },
});

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const xml = bplistToXml(new Uint8Array(await file.arrayBuffer()));
  ctx.mount.replaceChildren(await codeView(xml, 'xml'));
  return {
    meta: () => [s('label')],
    notices: () => [h('div', { class: 'notice subtle' }, s('note'))],
  };
}
