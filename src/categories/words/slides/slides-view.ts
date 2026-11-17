/**
 * PowerPoint (.pptx) viewer built on pptx-preview: all slides in a scrolling
 * list, plus a full-screen slideshow (one slide at a time, arrow keys / click).
 */
import { formatCount, h } from '../../../core/dom';
import { strings } from '../../../core/i18n';

const t = strings({
  slides: { en: 'slides', zh: '页幻灯片' },
  showHint: { en: '← → or click to move · Esc to exit', zh: '← → 或点击翻页 · Esc 退出' },
});

export interface SlidesController {
  el: HTMLElement;
  count: number;
  /** Start the slideshow at the slide nearest the top of the view. */
  present(): void;
  destroy(): void;
}

export async function openSlides(file: File, mount: HTMLElement): Promise<SlidesController> {
  const { init } = await import('pptx-preview');
  const stage = h('div', { class: 'slides-stage' });
  const meta = h('div', { class: 'meta' });
  const root = h('div', { class: 'view view-slides' }, meta, stage);
  mount.replaceChildren(root);

  const buffer = await file.arrayBuffer();
  // Render at a fixed reference width; CSS scales slides to fit the screen.
  const width = 960;
  const previewer = init(stage, { width, height: Math.round((width * 9) / 16), mode: 'list' });
  await previewer.preview(buffer);

  // Charts are drawn a moment after the slides; then give colourless series Office's default colours.
  setTimeout(() => fixChartColors(stage), 50);
  setTimeout(() => fixChartColors(stage), 600);

  const slides = [...stage.querySelectorAll<HTMLElement>('.pptx-preview-slide-wrapper')];
  const count = slides.length || previewer.slideCount || 0;
  meta.textContent = `${formatCount(count)} ${t('slides')}`;

  // The renderer draws slides at fixed pixel sizes; scale each one to the
  // available width. Holders reserve the scaled size in the layout.
  const holders = slides.map((s) => {
    const holder = h('div', { class: 'slide-fit' });
    s.replaceWith(holder);
    holder.append(s);
    return holder;
  });
  stage.querySelector('.pptx-preview-wrapper')?.replaceWith(...holders);
  const fit = () => {
    const avail = Math.max(200, stage.clientWidth - 32);
    slides.forEach((s, i) => {
      const w = s.offsetWidth || width;
      const scale = Math.min(1.5, avail / w);
      s.style.setProperty('--slide-scale', String(scale));
      holders[i].style.width = `${w * scale}px`;
      holders[i].style.height = `${s.offsetHeight * scale}px`;
    });
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();

  return {
    el: root,
    count,
    present: () => presentSlides(slides),
    destroy() {
      ro.disconnect();
      try {
        previewer.destroy();
      } catch {
        /* already gone */
      }
    },
  };
}

/** Office's default chart palette (accent 1–6), used when a chart relies on theme colours. */
const OFFICE_COLORS = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];

const isRealColor = (c: unknown) => typeof c === 'string' ? c !== '' && c !== 'none' && c !== 'transparent' && !c.includes('undefined') : !!c;

async function fixChartColors(root: HTMLElement) {
  const nodes = root.querySelectorAll<HTMLElement>('[_echarts_instance_]');
  if (!nodes.length) return;
  const echarts = await import('echarts');
  nodes.forEach((node) => {
    const chart = echarts.getInstanceByDom(node);
    if (!chart) return;
    const option = chart.getOption() as { series?: Array<{ type?: string; itemStyle?: { color?: unknown }; lineStyle?: { color?: unknown }; data?: unknown[] }> };
    let changed = false;
    const series = (option.series ?? []).map((s, i) => {
      const color = OFFICE_COLORS[i % OFFICE_COLORS.length];
      if (s.type === 'pie') {
        // Pie slices: colour each slice that has none.
        const data = (s.data ?? []).map((d, j) => {
          const item: { value?: unknown; itemStyle?: { color?: unknown } } = typeof d === 'object' && d ? (d as { itemStyle?: { color?: unknown } }) : { value: d };
          if (isRealColor(item.itemStyle?.color)) return item;
          changed = true;
          return { ...item, itemStyle: { ...item.itemStyle, color: OFFICE_COLORS[j % OFFICE_COLORS.length] } };
        });
        return { data };
      }
      if (isRealColor(s.itemStyle?.color)) return {};
      changed = true;
      return { itemStyle: { color }, lineStyle: isRealColor(s.lineStyle?.color) ? {} : { color } };
    });
    // The renderer invents a "图表标题" (chart title) placeholder that overlaps the legend.
    const titles = (chart.getOption() as { title?: Array<{ text?: string }> }).title ?? [];
    const hideTitle = titles.some((tt) => tt.text === '图表标题');
    if (changed || hideTitle) chart.setOption({ series, ...(hideTitle ? { title: { show: false } } : {}) });
  });
}

/** Full-screen slideshow: one slide at a time, scaled to fill the screen. */
function presentSlides(slides: HTMLElement[]) {
  if (!slides.length) return;
  // Start from the slide currently in view.
  let index = Math.max(0, slides.findIndex((s) => s.getBoundingClientRect().bottom > 120));

  const frame = h('div', { class: 'show-frame' });
  const counter = h('div', { class: 'show-counter' });
  const hint = h('div', { class: 'show-hint' }, t('showHint'));
  const show = h('div', { class: 'slideshow', tabindex: -1 }, frame, counter, hint);
  document.body.append(show);

  // Slides are moved (not copied) into the show so charts drawn on canvases
  // keep their pixels; each goes back to its place when the show moves on.
  let shown: { slide: HTMLElement; home: HTMLElement } | null = null;
  const putBack = () => {
    if (!shown) return;
    shown.slide.style.removeProperty('transform');
    shown.home.append(shown.slide);
    shown = null;
  };
  const render = () => {
    putBack();
    const slide = slides[index];
    const home = slide.parentElement!;
    const sw = slide.offsetWidth;
    const sh = slide.offsetHeight;
    shown = { slide, home };
    frame.replaceChildren(slide);
    const scale = Math.min(window.innerWidth / sw, window.innerHeight / sh);
    frame.style.width = `${sw * scale}px`;
    frame.style.height = `${sh * scale}px`;
    slide.style.transform = `scale(${scale})`;
    counter.textContent = `${index + 1} / ${slides.length}`;
  };
  const go = (d: number) => {
    const next = Math.min(slides.length - 1, Math.max(0, index + d));
    if (next !== index) {
      index = next;
      render();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(e.key)) go(1);
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(e.key)) go(-1);
    else if (e.key === 'Home') { index = 0; render(); }
    else if (e.key === 'End') { index = slides.length - 1; render(); }
    else if (e.key === 'Escape') close();
    else return;
    e.preventDefault();
  };
  const onClick = (e: MouseEvent) => go(e.clientX < window.innerWidth / 3 ? -1 : 1);
  const onFsChange = () => {
    if (!document.fullscreenElement) close();
    else render();
  };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('fullscreenchange', onFsChange);
    window.removeEventListener('resize', render);
    putBack();
    show.remove();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', render);
  show.addEventListener('click', onClick);
  render();
  show.focus();
  show
    .requestFullscreen?.()
    .then(() => document.addEventListener('fullscreenchange', onFsChange))
    .catch(() => {
      /* Full screen refused (e.g. iPhone): the overlay still fills the window. */
    });
  setTimeout(() => hint.classList.add('fade'), 2500);
}
