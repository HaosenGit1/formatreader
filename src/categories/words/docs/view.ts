/**
 * Word viewer (.docx, .docm, .dotx): pages drawn with docx-preview, scaled
 * to fit the window; A− / A+ zoom. Old binary .doc files are not supported yet.
 */
import './docs.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';

const s = strings({
  pages: { en: 'pages', zh: '页' },
  page: { en: 'page', zh: '页' },
});

/**
 * Word stores bullets as private-use characters of the old Symbol / Wingdings
 * fonts (e.g. U+F0B7), which browsers don't have: they show as empty boxes.
 * Map them to ordinary Unicode bullets and drop the missing font.
 */
const SYMBOL_BULLETS: Record<string, string> = {
  f0b7: '•', f0a7: '▪', f0a8: '□', f0d8: '➢', f0fc: '✓', f076: '❖', f06c: '●', f06e: '■', f0e0: '➔', f0a4: '◆',
};

function fixSymbolBullets(styles: HTMLElement) {
  for (const style of styles.querySelectorAll('style')) {
    const css = style.textContent ?? '';
    const fixed = css
      // escaped form: content: "\f0b7"
      .replace(/\\(f0[0-9a-f]{2})\s?/gi, (m, code: string) => SYMBOL_BULLETS[code.toLowerCase()] ?? m)
      // literal private-use characters
      .replace(/[\uF000-\uF0FF]/g, (ch) => SYMBOL_BULLETS[ch.charCodeAt(0).toString(16)] ?? '•')
      .replace(/font-family:\s*(Symbol|Wingdings[^;]*);/gi, 'font-family: inherit;');
    if (fixed !== css) style.textContent = fixed;
  }
}

/** Start downloading the Word engine early (e.g. while a file is dragged). */
export const preload = () => import('docx-preview');

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const [{ renderAsync }, data] = await Promise.all([import('docx-preview'), file.arrayBuffer()]);

  const pagesEl = h('div', { class: 'docx-pages' });
  const styles = h('div', { class: 'docx-styles', hidden: true });
  const stage = h('div', { class: 'docx-stage' }, pagesEl);
  ctx.mount.replaceChildren(h('div', { class: 'view view-docx' }, styles, stage));

  await renderAsync(data, pagesEl, styles, {
    className: 'docx',
    inWrapper: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    renderComments: false,
    renderChanges: false,
    // Embedded HTML fragments (altChunk) are skipped for safety.
    renderAltChunks: false,
    useBase64URL: false,
    experimental: true,
  });

  fixSymbolBullets(styles);
  const pages = pagesEl.querySelectorAll('section.docx');

  // Pages have a fixed paper width: fit them to the window, then apply A− / A+.
  const fit = () => {
    const first = pages[0] as HTMLElement | undefined;
    const pageWidth = first?.offsetWidth ?? 800;
    const available = Math.max(200, stage.clientWidth - 32);
    const zoom = Math.min(1, available / pageWidth) * ctx.fontScale();
    pagesEl.style.setProperty('zoom', String(zoom));
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();

  return {
    meta: () => ['Word', `${pages.length} ${pages.length === 1 ? s('page') : s('pages')}`],
    onFontScale: () => fit(),
    destroy: () => ro.disconnect(),
  };
}
