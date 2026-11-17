/** OpenDocument viewer: text (ODT/OTT) as a page, presentations (ODP/OTP) as slides. */
import './odf.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';
import type { Block } from '../shared/doc-model';
import { renderPaper } from '../shared/paper';
import { odpToSlides, odtToBlocks, type OdfInput } from './convert';

const s = strings({ slides: { en: 'slides', zh: '页幻灯片' } });

export const preload = () => import('fflate');

async function readZip(file: File): Promise<OdfInput> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (f) => f.name === 'content.xml' || f.name === 'styles.xml' || /^(Pictures|media)\//.test(f.name),
  });
  if (!files['content.xml']) throw new Error('content.xml is missing');
  const pictures = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(files)) if (!name.endsWith('.xml')) pictures.set(name, data);
  return { content: strFromU8(files['content.xml']), styles: files['styles.xml'] ? strFromU8(files['styles.xml']) : undefined, pictures };
}

/** Default slide text size (Impress/PowerPoint body text). */
const SLIDE_BASE_PT = 18;

/** A slide: frames positioned in % of the slide, text scaled with the slide width. */
function slideEl(frames: ReturnType<typeof odpToSlides>['slides'][number]['frames'], aspect: number, disposers: Array<() => void>): HTMLElement {
  const slide = h('div', { class: 'odp-slide', style: `aspect-ratio:${aspect}` });
  for (const f of frames) {
    const page = renderPaper(f.blocks as Block[], SLIDE_BASE_PT);
    disposers.push(page.dispose);
    const article = page.el.querySelector('article')!;
    article.className = 'odp-frame-content';
    slide.append(h('div', { class: 'odp-frame', style: `left:${f.x}%;top:${f.y}%;width:${f.w}%;min-height:${f.h}%` }, article));
  }
  return slide;
}

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const input = await readZip(file);
  const isPresentation = ctx.format?.id === 'odp' || /\.(odp|otp)$/i.test(file.name);

  if (!isPresentation) {
    const page = renderPaper(odtToBlocks(input));
    ctx.mount.replaceChildren(page.el);
    return { meta: () => ['OpenDocument Text'], onFontScale: () => {}, destroy: page.dispose };
  }

  const { slides, aspect, widthPt } = odpToSlides(input);
  const disposers: Array<() => void> = [];
  const list = h('div', { class: 'odp-slides' }, ...slides.map((sl) => slideEl(sl.frames, aspect, disposers)));
  ctx.mount.replaceChildren(h('div', { class: 'view view-odp' }, list));
  // Text inside slides scales with the slide's width.
  const ro = new ResizeObserver(() => {
    // 1em = 18 pt at the slide's real size, scaled to its width on screen.
    for (const el of list.querySelectorAll<HTMLElement>('.odp-slide')) el.style.fontSize = `${(el.clientWidth * SLIDE_BASE_PT) / widthPt}px`;
  });
  for (const el of list.querySelectorAll<HTMLElement>('.odp-slide')) ro.observe(el);
  return {
    meta: () => ['OpenDocument Presentation', `${slides.length} ${s('slides')}`],
    destroy: () => {
      ro.disconnect();
      disposers.forEach((d) => d());
    },
  };
}
