/** Text viewer: plain text (novels, logs, notes), Markdown, HTML and subtitles. */
import './text.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { codeView } from '../shared/code-block';
import { isSource, readText } from '../shared/read';
import { TextSource } from '../shared/text-source';
import { markdownView, htmlView, plainView, subtitleView } from './render';
import { classifyText, type TextKind } from './text-kind';

const s = strings({
  rendered: { en: 'Rendered', zh: '预览' },
  source: { en: 'Source', zh: '源码' },
  text: { en: 'Text', zh: '文本' },
});

function kindLabel(k: TextKind): string {
  switch (k.kind) {
    case 'subtitle': return k.format.toUpperCase();
    case 'markdown': return 'Markdown';
    case 'html': return 'HTML';
    default: return s('text');
  }
}

async function makeView(src: TextSource, name: string, ctx: OpenContext): Promise<OpenedView> {
  // Plain reading text: show \\u…, %…, &#…; and Base64 decoded when the whole text is encoded.
  if (classifyText(name, src.text).kind === 'plain') src.enableDecoding();
  let showSource = false;
  let kind = classifyText(name, src.text);

  const draw = async () => {
    kind = classifyText(name, src.text);
    const text = src.text;
    let body: HTMLElement;
    if (kind.kind === 'markdown') body = showSource ? await codeView(text, 'markdown') : await markdownView(text);
    else if (kind.kind === 'html') body = showSource ? await codeView(text, 'xml') : await htmlView(text);
    else if (kind.kind === 'subtitle') body = subtitleView(text, kind.format);
    else body = plainView(text);
    ctx.mount.replaceChildren(body);
  };
  const changed = async () => {
    await draw();
    ctx.refreshChrome();
  };
  await draw();

  return {
    meta: () => [kindLabel(kind)],
    tools: () => {
      const out: HTMLElement[] = [];
      const enc = src.tool(changed);
      if (enc) out.push(enc);
      if (kind.kind === 'markdown' || kind.kind === 'html') {
        const btn = (value: boolean, label: string) =>
          h('button', { type: 'button', class: showSource === value ? 'active' : '', 'aria-pressed': String(showSource === value), onclick: () => { showSource = value; changed(); } }, label);
        out.push(h('div', { class: 'seg', role: 'group' }, btn(false, s('rendered')), btn(true, s('source'))));
      }
      return out;
    },
    about: () => src.about(),
    notices: () => src.notices(changed),
    onFontScale: () => { /* sizes follow the --reader-scale CSS variable */ },
    onLangChange: () => void draw(),
  };
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const src = await readText(file, ctx.mount);
  return isSource(src) ? makeView(src, file.name, ctx) : src;
}

export async function openText(text: string, ctx: OpenContext): Promise<OpenedView> {
  return makeView(TextSource.fromPasted(text), '', ctx);
}
