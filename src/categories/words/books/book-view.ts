/**
 * Ebook reader for EPUB, MOBI, AZW3/KF8, FB2/FBZ and CBZ, built on foliate-js.
 * Book content renders in frames; the page's Content-Security-Policy stops any
 * script inside a book from running.
 */
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';

const t = strings({
  contents: { en: 'Contents', zh: '目录' },
  noContents: { en: 'This book has no table of contents.', zh: '这本书没有目录。' },
  progress: { en: 'Reading progress', zh: '阅读进度' },
  prevPage: { en: 'Previous page', zh: '上一页' },
  nextPage: { en: 'Next page', zh: '下一页' },
  pages: { en: 'Pages', zh: '翻页' },
  scroll: { en: 'Scroll', zh: '滚动' },
});

interface TocItem {
  label: string;
  href: string;
  subitems?: TocItem[];
}

interface FoliateBook {
  metadata?: { title?: unknown; author?: unknown; language?: unknown };
  toc?: TocItem[];
  dir?: string;
  rendition?: { layout?: string };
}

interface RelocateDetail {
  fraction?: number;
  cfi?: string;
  tocItem?: { label?: string; href?: string };
  location?: { current: number; total: number };
}

interface FoliateView extends HTMLElement {
  book: FoliateBook;
  isFixedLayout: boolean;
  renderer: HTMLElement & { setStyles?: (css: string) => void; next: () => Promise<void> };
  open(file: File): Promise<void>;
  init(opts: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
  goTo(href: string): Promise<void>;
  goToFraction(f: number): Promise<void>;
  goLeft(): Promise<void>;
  goRight(): Promise<void>;
  getSectionFractions(): number[];
  close(): void;
}

export interface BookController {
  el: HTMLElement;
  tools: () => HTMLElement[];
  title: string;
  author: string;
  destroy(): void;
}

/** Book formats this reader opens, by detected format id. */
export const BOOK_FORMATS = new Set(['epub', 'mobi', 'azw3', 'fb2', 'fbz', 'cbz']);

const text = (v: unknown): string => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('name' in o) return text(o.name);
    const first = Object.values(o)[0];
    return text(first);
  }
  return String(v);
};

const storageKey = (file: File) => `fr.book.${file.name}.${file.size}`;
const load = (k: string) => {
  try {
    return localStorage.getItem(k) ?? undefined;
  } catch {
    return undefined;
  }
};
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: position just isn't remembered */
  }
};

function bookCss(scale: number, dark: boolean): string {
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html { color-scheme: ${dark ? 'dark' : 'light'}; font-size: ${Math.round(scale * 100)}%; }
    ${dark ? 'html, body { color: #e4e4ea !important; background: transparent !important; } a:link { color: #8fb4ff; }' : ''}
    p, li, blockquote, dd { line-height: 1.7; text-align: start; hanging-punctuation: allow-end last; widows: 2; }
    [align="left"] { text-align: left; } [align="right"] { text-align: right; }
    [align="center"] { text-align: center; } [align="justify"] { text-align: justify; }
    pre { white-space: pre-wrap !important; }
    aside[epub|type~="endnote"], aside[epub|type~="footnote"], aside[epub|type~="note"], aside[epub|type~="rearnote"] { display: none; }
  `;
}

const prefersDark = () => {
  const forced = document.documentElement.dataset.theme;
  if (forced) return forced === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

/**
 * Opens the book inside `mount`, which must already be in the page. The reader
 * must never be moved afterwards: moving an iframe reloads it and loses the book.
 */
export async function openBook(file: File, mount: HTMLElement, fontScale: () => number): Promise<BookController> {
  await import('foliate-js/view.js');
  const view = document.createElement('foliate-view') as FoliateView;
  const stage = h('div', { class: 'book-stage' }, view);
  const shell = h('div', { class: 'book-main' }, stage);
  const root = h('div', { class: 'view view-book' }, shell);
  mount.replaceChildren(root);
  await view.open(file);

  const book = view.book;
  const title = text(book.metadata?.title) || file.name;
  const author = text(book.metadata?.author);
  const key = storageKey(file);

  // ---- layout: table of contents + reader + progress bar
  const tocList = h('nav', { class: 'toc', 'aria-label': t('contents') });
  const tocPanel = h('aside', { class: 'toc-panel', hidden: true }, h('div', { class: 'toc-head' }, h('strong', {}, title), author ? h('div', { class: 'muted' }, author) : null), tocList);
  const chapter = h('div', { class: 'book-chapter' });
  const percent = h('div', { class: 'book-percent' });
  const slider = h('input', { type: 'range', min: 0, max: 1, step: 'any', value: 0, class: 'book-slider', 'aria-label': t('progress') }) as HTMLInputElement;
  const prev = h('button', { type: 'button', class: 'page-btn', 'aria-label': t('prevPage'), onclick: () => view.goLeft() }, '‹');
  const next = h('button', { type: 'button', class: 'page-btn', 'aria-label': t('nextPage'), onclick: () => view.goRight() }, '›');
  const bar = h('div', { class: 'book-bar' }, prev, h('div', { class: 'book-progress' }, h('div', { class: 'book-loc' }, chapter, percent), slider), next);
  shell.append(bar);
  root.prepend(tocPanel);
  const el = root;

  // ---- table of contents
  const tocLinks = new Map<string, HTMLAnchorElement>();
  const buildToc = (items: TocItem[], depth: number): HTMLElement =>
    h(
      'ol',
      { class: depth ? 'toc-sub' : 'toc-root' },
      ...items.map((item) => {
        const a = h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); view.goTo(item.href).catch(() => {}); if (window.innerWidth < 900) tocPanel.hidden = true; } }, item.label?.trim() || '—') as HTMLAnchorElement;
        tocLinks.set(item.href, a);
        return h('li', {}, a, item.subitems?.length ? buildToc(item.subitems, depth + 1) : null);
      }),
    );
  if (book.toc?.length) tocList.append(buildToc(book.toc, 0));
  else tocList.append(h('p', { class: 'muted' }, t('noContents')));

  // ---- progress
  view.addEventListener('relocate', ((e: CustomEvent<RelocateDetail>) => {
    const d = e.detail;
    if (typeof d.fraction === 'number') {
      slider.value = String(d.fraction);
      percent.textContent = `${Math.round(d.fraction * 100)}%`;
    }
    chapter.textContent = d.tocItem?.label?.trim() ?? '';
    tocLinks.forEach((a) => a.classList.remove('current'));
    if (d.tocItem?.href) tocLinks.get(d.tocItem.href)?.classList.add('current');
    if (d.cfi) save(key, d.cfi);
  }) as EventListener);
  slider.addEventListener('input', () => view.goToFraction(parseFloat(slider.value)));
  slider.dir = book.dir ?? 'ltr';

  // ---- keyboard: arrows / page keys / space, also while focus is inside the book
  const onKey = (e: KeyboardEvent) => {
    if (!view.isConnected) return; // this file's tab is in the background
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') view.goLeft();
    else if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) view.goRight();
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  view.addEventListener('load', ((e: CustomEvent<{ doc: Document }>) => e.detail.doc.addEventListener('keydown', onKey)) as EventListener);

  // ---- styles (font size, dark mode) and layout
  const applyStyles = () => {
    if (!view.isFixedLayout) view.renderer.setStyles?.(bookCss(fontScale(), prefersDark()));
  };
  applyStyles();
  view.renderer.setAttribute('max-inline-size', '720px');
  view.renderer.setAttribute('max-column-count', '2');
  view.renderer.setAttribute('gap', '6%');
  let flow = load('fr.book.flow') === 'scrolled' ? 'scrolled' : 'paginated';
  view.renderer.setAttribute('flow', flow);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', applyStyles);

  await view.init({ lastLocation: load(key), showTextStart: true });

  // ---- toolbar tools (rebuilt on each call so they follow the current language)
  const tools = () => {
    const tocBtn = h('button', { type: 'button', class: 'btn', onclick: () => { tocPanel.hidden = !tocPanel.hidden; } }, t('contents'));
    if (view.isFixedLayout) return [tocBtn];
    const flowSeg = h('div', { class: 'seg', role: 'group' });
    const renderFlow = () => {
      flowSeg.replaceChildren(
        ...(['paginated', 'scrolled'] as const).map((f) =>
          h('button', { type: 'button', class: flow === f ? 'active' : '', 'aria-pressed': String(flow === f), onclick: () => { flow = f; view.renderer.setAttribute('flow', f); save('fr.book.flow', f); renderFlow(); } }, f === 'paginated' ? t('pages') : t('scroll')),
        ),
      );
    };
    renderFlow();
    return [tocBtn, flowSeg];
  };

  return {
    el,
    tools,
    title,
    author,
    destroy() {
      document.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', applyStyles);
      try {
        view.close();
      } catch {
        /* already closed */
      }
    },
    // exposed for font-size buttons
    ...{ restyle: applyStyles },
  } as BookController & { restyle: () => void };
}
