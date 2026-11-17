/** Code viewer: every programming language, JSON, XML, YAML and config files. */
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import { codeView } from '../shared/code-block';
import { isSource, readText } from '../shared/read';
import { codeKind, languageName } from './languages';

const s = strings({
  invalidJson: { en: 'This JSON has an error, shown as-is:', zh: 'JSON 有错误，按原样显示：' },
});

/** Pretty-print JSON documents below this size (bigger ones are shown as they are). */
const PRETTY_LIMIT = 30 * 1024 * 1024;

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const src = await readText(file, ctx.mount);
  if (!isSource(src)) return src;

  let jsonError: string | null = null;
  let kind = codeKind(file.name, src.text.slice(0, 4000)) ?? { language: 'plaintext' };

  const draw = async () => {
    kind = codeKind(file.name, src.text.slice(0, 4000)) ?? { language: 'plaintext' };
    let text = src.text;
    jsonError = null;
    if (kind.json === 'document' && text.length < PRETTY_LIMIT) {
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch (e) {
        jsonError = (e as Error).message;
      }
    }
    ctx.mount.replaceChildren(await codeView(text, kind.language));
  };
  const changed = async () => {
    await draw();
    ctx.refreshChrome();
  };
  await draw();

  return {
    meta: () => {
      if (kind.json === 'lines') return ['JSON Lines'];
      // Languages without a highlighter yet: name them by extension (SOL, TF…) rather than "Text".
      const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1];
      return [kind.language === 'plaintext' && ext ? ext.toUpperCase() : languageName(kind.language)];
    },
    tools: () => {
      const enc = src.tool(changed);
      return enc ? [enc] : [];
    },
    notices: () => [...src.notices(changed), ...(jsonError ? [h('div', { class: 'notice' }, `${s('invalidJson')} ${jsonError}`)] : [])],
    onFontScale: () => {},
    onLangChange: () => void draw(),
  };
}
