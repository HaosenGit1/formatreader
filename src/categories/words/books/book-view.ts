/**
 * Ebook reader for EPUB, MOBI, AZW3/KF8, FB2/FBZ and CBZ, built on foliate-js.
 * Book content renders in frames; the page's Content-Security-Policy stops any
 * script inside a book from running.
 */
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import { buildPrintHtml, printHtml, type PrintableBook, type PrintSection } from './book-print';

const t = strings({
  contents: { en: 'Contents', zh: '目录' },
  noContents: { en: 'This book has no table of contents.', zh: '这本书没有目录。' },
  progress: { en: 'Reading progress', zh: '阅读进度' },
  prevPage: { en: 'Previous page', zh: '上一页' },
  nextPage: { en: 'Next page', zh: '下一页' },
  pages: { en: 'Pages', zh: '翻页' },
  scroll: { en: 'Scroll', zh: '滚动' },
  printHead: { en: 'Print or save as PDF', zh: '打印或另存为 PDF' },
  whole: { en: 'Whole book', zh: '整本书' },
  part: { en: 'This part', zh: '这一部分' },
  chapterOnly: { en: 'This chapter', zh: '这一章' },
  pageOnly: { en: 'This page', zh: '这一页' },
  nChapters: { en: '{n} chapters', zh: '{n} 章' },
  nPages: { en: '{n} pages', zh: '{n} 页' },
  big: { en: 'A big book: the print window may take several minutes to open. One part is much quicker.', zh: '这本书很大，整本打印时打印窗口可能要几分钟才会打开。只打印一部分会快很多。' },
  go: { en: 'Continue', zh: '继续' },
  cancel: { en: 'Cancel', zh: '取消' },
  preparing: { en: 'Getting it ready to print…', zh: '正在准备打印……' },
  previewNote: { en: 'Opening the print window. A big book takes a while to show.', zh: '正在打开打印窗口，大书需要等一会儿才显示。' },
  printFailed: { en: 'This book could not be prepared for printing.', zh: '这本书无法准备打印。' },
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
  /** The whole book to the print window (and "Save as PDF"). */
  print(): Promise<void>;
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
  let here: RelocateDetail = {};
  view.addEventListener('relocate', ((e: CustomEvent<RelocateDetail>) => {
    const d = e.detail;
    here = d;
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

  // ---- printing: the whole book, a part (one book of a collection), or the chapter on screen
  type Choice = { key: 'whole' | 'part' | 'chapter'; label: string; detail: string; from: number; to: number };
  const pb = book as unknown as PrintableBook & { resolveHref?: (href: string) => { index?: number } | Promise<{ index?: number }> };
  const fixed = view.isFixedLayout || book.rendition?.layout === 'pre-paginated';
  const count = (n: number) => t(fixed ? 'nPages' : 'nChapters').replace('{n}', n.toLocaleString());

  /** The section on screen. */
  const currentIndex = (): number | null => {
    const c = (view.renderer as unknown as { getContents?: () => Array<{ index?: number }> }).getContents?.()[0]?.index;
    if (typeof c === 'number') return c;
    if (typeof here.fraction === 'number') {
      const r = (view as unknown as { resolveNavigation(t: unknown): { index?: number } | undefined }).resolveNavigation({ fraction: here.fraction });
      if (typeof r?.index === 'number') return r.index;
    }
    return null;
  };
  /** Where each top-level contents entry starts, in book order. */
  const partStarts = async (): Promise<Array<{ label: string; index: number }>> => {
    const out: Array<{ label: string; index: number }> = [];
    for (const item of book.toc ?? []) {
      try {
        const r = await pb.resolveHref?.(item.href);
        if (typeof r?.index === 'number') out.push({ label: item.label?.trim() || '—', index: r.index });
      } catch {
        /* entry that points nowhere */
      }
    }
    return out.sort((a, b) => a.index - b.index);
  };

  const choices = async (): Promise<Choice[]> => {
    const total = pb.sections?.length ?? 0;
    const linear = (from: number, to: number) => (pb.sections ?? []).slice(from, to).filter((x) => x.linear !== 'no').length;
    const list: Choice[] = [{ key: 'whole', label: t('whole'), detail: count(linear(0, total)), from: 0, to: total }];
    const i = currentIndex();
    if (i === null || total < 2) return list;
    if (!fixed) {
      const starts = await partStarts();
      let k = -1;
      starts.forEach((p, j) => { if (p.index <= i) k = j; });
      if (k >= 0 && starts.length > 1) {
        const from = starts[k].index;
        const to = starts.slice(k + 1).find((p) => p.index > from)?.index ?? total;
        if (to - from > 1 && to - from < total) list.push({ key: 'part', label: t('part'), detail: `${starts[k].label} · ${count(linear(from, to))}`, from, to });
      }
    }
    list.push({ key: 'chapter', label: t(fixed ? 'pageOnly' : 'chapterOnly'), detail: fixed ? `${i + 1} / ${total}` : here.tocItem?.label?.trim() || `${i + 1} / ${total}`, from: i, to: i + 1 });
    return list;
  };

  let panel: HTMLElement | null = null;
  const close = () => {
    panel?.remove();
    panel = null;
  };

  const run = async (c: Choice) => {
    const ctrl = new AbortController();
    const bar = h('div', { class: 'book-print-bar' }, h('div', { class: 'book-print-fill' }));
    const fill = bar.firstElementChild as HTMLElement;
    const counter = h('span', { class: 'book-print-count' });
    const status = h('p', { class: 'book-print-status', role: 'status' }, t('preparing'), ' ', counter);
    panel!.replaceChildren(
      h('strong', { class: 'book-print-title' }, t('printHead')),
      h('p', { class: 'book-print-what' }, c.label, c.key === 'whole' ? '' : ` · ${c.detail}`),
      status,
      bar,
      h('div', { class: 'book-print-buttons' }, h('button', { type: 'button', class: 'btn', onclick: () => { ctrl.abort(); close(); } }, t('cancel'))),
    );
    const loaded: PrintSection[] = [];
    const release = () => loaded.forEach((x) => { try { x.unload?.(); } catch { /* already gone */ } });
    try {
      const built = await buildPrintHtml(pb, c.key === 'whole' ? title : `${title} – ${c.detail.split(' · ')[0]}`, fixed, (done, total) => {
        fill.style.width = `${total ? (done / total) * 100 : 0}%`;
        counter.textContent = `${done.toLocaleString()} / ${total.toLocaleString()}`;
      }, { from: c.from, to: c.to, signal: ctrl.signal, loaded });
      if (ctrl.signal.aborted) return release();
      if (!built.pages) throw new Error('no pages');
      status.replaceChildren(t('previewNote'));
      fill.style.width = '100%';
      // Release the extra copies of the chapters once the print window has closed.
      await printHtml(built.html, release);
      close();
    } catch (err) {
      release();
      if ((err as DOMException)?.name === 'AbortError') return;
      console.error('Book print failed', err);
      status.replaceChildren(t('printFailed'));
      setTimeout(close, 4000);
    }
  };

  const print = async () => {
    if (panel) return;
    panel = h('div', { class: 'book-print', role: 'dialog', 'aria-label': t('printHead') });
    root.append(panel);
    const list = await choices();
    if (!panel) return;
    const big = file.size > 80 * 1024 * 1024 || (pb.sections?.length ?? 0) > 400;
    // A big book starts on the part (or chapter) on screen; others on the whole book.
    let picked = big ? list.find((c) => c.key === 'part') ?? list.find((c) => c.key === 'chapter') ?? list[0] : list[0];
    if (list.length === 1 && !big) return run(list[0]);
    const name = `fr-print-${Math.random().toString(36).slice(2)}`;
    const warn = h('p', { class: 'book-print-warn', hidden: !(big && picked.key === 'whole') }, '⚠︎ ', t('big'));
    panel.replaceChildren(
      h('strong', { class: 'book-print-title' }, t('printHead')),
      h(
        'div',
        { class: 'book-print-choices', role: 'radiogroup' },
        ...list.map((c) =>
          h(
            'label',
            { class: 'book-print-choice' },
            h('input', { type: 'radio', name, checked: c === picked, onchange: () => { picked = c; warn.hidden = !(big && c.key === 'whole'); } }),
            h('span', { class: 'book-print-label' }, c.label),
            h('span', { class: 'book-print-detail' }, c.detail),
          ),
        ),
      ),
      warn,
      h(
        'div',
        { class: 'book-print-buttons' },
        h('button', { type: 'button', class: 'btn', onclick: close }, t('cancel')),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => void run(picked) }, t('go')),
      ),
    );
    (panel.querySelector('input:checked') as HTMLInputElement | null)?.focus();
  };

  return {
    el,
    tools,
    title,
    author,
    print,
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
