/**
 * The app shell: front page, loading screen, header, toolbar, full screen,
 * drag & drop / file picker / paste, and error isolation.
 *
 * It knows nothing about any file format. It identifies the file, asks the
 * registry for a viewer, gives that viewer an element to draw into, and shows
 * whatever toolbar controls the viewer offers. If a viewer fails, only that
 * file shows an error card; the shell and all other viewers keep working.
 */
import { detectFormat, extOf } from './detect-format';
import { formatBytes, h } from './dom';
import { lang, onLangChange, setLang, strings } from './i18n';
import { infoEntry } from './info-entry';
import { messageView } from './info-view';
import { assertUniqueIds, pickViewer, withTrials } from './registry';
import type { OpenContext, OpenedView, ViewerEntry, ViewerModule } from './viewer';

const s = strings({
  readAny: { en: 'Read any format', zh: '读任何格式' },
  point1: { en: 'Detects the format and fixes garbled text', zh: '自动识别格式，乱码也能读' },
  point2: { en: 'No apps to install', zh: '无需安装任何软件' },
  point3: { en: 'Nothing leaves your device', zh: '文件不会离开你的设备' },
  openAnother: { en: 'Open another', zh: '换个文件' },
  fullscreen: { en: 'Full screen', zh: '全屏' },
  exitFullscreen: { en: 'Exit full screen', zh: '退出全屏' },
  smaller: { en: 'Smaller text', zh: '缩小文字' },
  larger: { en: 'Larger text', zh: '放大文字' },
  pasted: { en: 'Pasted text', zh: '粘贴的文字' },
  failed: { en: 'This file could not be opened', zh: '无法打开这个文件' },
});

interface Current {
  name: string;
  size: number;
  entry: ViewerEntry;
  view: OpenedView;
}

export function startApp(categoryViewers: ViewerEntry[]): void {
  assertUniqueIds([...categoryViewers, infoEntry]);
  // Experimental viewers run only for whoever opens the page with ?try=<id>.
  const viewers = withTrials([...categoryViewers, infoEntry], location.search);

  const app = document.getElementById('app')!;
  const fileInput = h('input', { type: 'file', hidden: true }) as HTMLInputElement;
  document.body.append(fileInput);

  let current: Current | null = null;
  let token = 0;

  // ---- reading size (A− / A+), remembered per browser
  let fontScale = 1;
  try {
    fontScale = Number(localStorage.getItem('fr.fontScale')) || 1;
  } catch {
    /* storage unavailable */
  }
  const applyFontScale = () => document.documentElement.style.setProperty('--reader-scale', String(fontScale));
  applyFontScale();

  // -------------------------------------------------------------- pieces

  const icon = (path: string, size = 16): SVGSVGElement => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) el.setAttribute(k, String(v));
    el.innerHTML = path;
    return el;
  };
  const expandIcon = () => icon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>');
  const shrinkIcon = () => icon('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>');

  const header = () =>
    h(
      'header',
      { class: 'site-header' },
      h('button', { class: 'brand', type: 'button', onclick: goHome }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'F'), h('span', { class: 'brand-name' }, 'FormatReader')),
    );

  const landing = () =>
    h(
      'main',
      { class: 'landing' },
      h('button', { type: 'button', class: 'circle', onclick: () => fileInput.click() }, h('span', { class: 'circle-text' }, s('readAny')),
        h('span', { class: 'circle-points' }, h('span', {}, s('point1')), h('span', {}, s('point2')), h('span', {}, s('point3'))),
      ),
    );

  /** The only loading state: the name fills with colour like a progress bar. */
  const loadingView = () => h('div', { class: 'loading', role: 'status', 'aria-label': 'Loading' }, h('div', { class: 'loading-name' }, 'FormatReader'));

  // ------------------------------------------------------------- toolbar

  function fullscreenButton(view: OpenedView): HTMLElement | null {
    if (view.fullscreen) {
      return h('button', { type: 'button', class: 'btn fs-btn', onclick: () => view.fullscreen!() }, expandIcon(), view.fullscreenLabel?.() ?? s('fullscreen'));
    }
    if (!document.fullscreenEnabled) return null; // e.g. iPhone Safari
    const on = !!document.fullscreenElement;
    const label = on ? s('exitFullscreen') : s('fullscreen');
    return h('button', { type: 'button', class: 'btn fs-btn', title: `${label} (F)`, onclick: toggleFullscreen }, on ? shrinkIcon() : expandIcon(), label);
  }

  function toolbar(c: Current): HTMLElement {
    const tools: Array<HTMLElement | null> = [];
    try {
      tools.push(...(c.view.tools?.() ?? []));
    } catch (err) {
      console.error(`Viewer ${c.entry.id} failed to build its tools`, err);
    }
    if (c.view.onFontScale) {
      tools.push(
        h(
          'div',
          { class: 'seg', role: 'group' },
          h('button', { type: 'button', title: s('smaller'), 'aria-label': s('smaller'), onclick: () => setFont(-0.1) }, 'A−'),
          h('button', { type: 'button', title: s('larger'), 'aria-label': s('larger'), onclick: () => setFont(0.1) }, 'A+'),
        ),
      );
    }
    tools.push(fullscreenButton(c.view));
    tools.push(h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, s('openAnother')));

    let meta: string[] = [];
    try {
      meta = c.view.meta?.() ?? [];
    } catch {
      /* keep the size at least */
    }
    if (c.entry.experimental) meta.unshift(`🧪 ${c.entry.id}`);
    const title = c.view.title ?? c.name;
    return h(
      'div',
      { class: 'toolbar' },
      h('div', { class: 'file' }, h('div', { class: 'file-name', title }, title), h('div', { class: 'file-meta' }, [...meta, formatBytes(c.size)].join(' · '))),
      h('div', { class: 'tools' }, ...tools),
    );
  }

  function notices(c: Current): HTMLElement {
    let items: HTMLElement[] = [];
    try {
      items = c.view.notices?.() ?? [];
    } catch (err) {
      console.error(`Viewer ${c.entry.id} failed to build its notices`, err);
    }
    return h('div', { class: 'notices', hidden: items.length === 0 }, ...items);
  }

  /** Redraw everything around the viewer, never the viewer itself (that would reload documents). */
  function refreshChrome() {
    if (!current) return;
    app.querySelector('.site-header')?.replaceWith(header());
    app.querySelector('.toolbar')?.replaceWith(toolbar(current));
    app.querySelector('.notices')?.replaceWith(notices(current));
    document.title = `${current.view.title ?? current.name} — FormatReader`;
  }

  // ------------------------------------------------------- opening files

  function closeCurrent() {
    const c = current;
    current = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    try {
      c?.view.destroy?.();
    } catch (err) {
      console.error('Viewer failed to clean up', err);
    }
  }

  function goHome() {
    closeCurrent();
    ++token;
    app.replaceChildren(header(), landing());
    document.title = 'FormatReader';
    prefetchCommonViewers();
  }

  async function show(entry: ViewerEntry, name: string, size: number, format: OpenContext['format'], run: (mod: ViewerModule, ctx: OpenContext) => Promise<OpenedView>, my: number) {
    // Lay out the page first; the viewer draws into `mount` under the loading cover.
    const mount = h('div', { class: 'viewer-mount' });
    const page = h('main', { class: `doc${entry.layout === 'fill' ? ' doc-fill' : ''}` }, h('div', { class: 'toolbar' }), h('div', { class: 'notices', hidden: true }), mount);
    const cover = h('div', { class: 'loading-cover' }, loadingView());
    app.replaceChildren(header(), page, cover);

    const ctx: OpenContext = { mount, format, fontScale: () => fontScale, refreshChrome };
    let view: OpenedView;
    try {
      const mod = await entry.load();
      view = await run(mod, ctx);
    } catch (err) {
      console.error(`Viewer ${entry.id} failed`, err);
      view = {};
      mount.replaceChildren(messageView(s('failed'), String((err as Error)?.message ?? err)));
    }
    if (my !== token) {
      view.destroy?.();
      return;
    }
    current = { name, size, entry, view };
    refreshChrome();
    cover.remove();
    window.scrollTo(0, 0);
  }

  async function openFile(file: File) {
    closeCurrent();
    const my = ++token;
    app.replaceChildren(loadingView());
    warmForMime(file.type);
    const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
    let format: OpenContext['format'] = null;
    try {
      format = await detectFormat(file, file.name);
    } catch (err) {
      console.error('Format detection failed', err);
    }
    if (my !== token) return;
    const entry = pickViewer(viewers, { format, name: file.name, ext: extOf(file.name), head }) ?? infoEntry;
    warm(entry); // its libraries download while the page is being laid out and the file read
    await show(entry, file.name, file.size, format, (mod, ctx) => mod.open(file, ctx), my);
  }

  async function openPasted(text: string) {
    closeCurrent();
    const my = ++token;
    const head = new TextEncoder().encode(text.slice(0, 4000));
    // The first viewer that accepts plain text and supports pasting.
    const candidates = viewers.filter((v) => {
      try {
        return v.accepts({ format: null, name: '', ext: '', head });
      } catch {
        return false;
      }
    });
    const sorted = candidates.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));
    for (const entry of sorted.reverse()) {
      // Lowest priority first: the general Text viewer is the one meant for pasting.
      const mod = await entry.load().catch(() => null);
      if (mod?.openText) {
        const size = new TextEncoder().encode(text).length;
        await show(entry, s('pasted'), size, null, (m, ctx) => m.openText!(text, ctx), my);
        return;
      }
    }
  }

  // ---------------------------------------------------------- full screen

  function toggleFullscreen() {
    if (current?.view.fullscreen) return current.view.fullscreen();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    app.querySelector<HTMLElement>('main.doc')?.requestFullscreen?.().catch(() => {});
  }

  // Update only the button: re-rendering would move the page out of full screen.
  document.addEventListener('fullscreenchange', () => {
    if (!current || current.view.fullscreen) return;
    app.querySelector('.fs-btn')?.replaceWith(fullscreenButton(current.view) ?? '');
  });

  // --------------------------------------------------------- reading size

  function setFont(delta: number) {
    fontScale = Math.min(2, Math.max(0.7, Math.round((fontScale + delta) * 10) / 10));
    applyFontScale();
    try {
      current?.view.onFontScale?.(fontScale);
    } catch (err) {
      console.error('Viewer failed to resize text', err);
    }
    try {
      localStorage.setItem('fr.fontScale', String(fontScale));
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------- prefetch

  /** While the front page sits idle, fetch the most common viewers so they open instantly. */
  let prefetched = false;
  function prefetchCommonViewers() {
    if (prefetched) return;
    prefetched = true;
    const run = () => viewers.filter((v) => v.prefetch).forEach((v) => v.load().catch(() => {}));
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (idle) idle(run, { timeout: 3000 });
    else setTimeout(run, 1500);
  }

  /** Load a viewer and let it start fetching its heavy libraries. Safe to call repeatedly. */
  const warmed = new Set<string>();
  function warm(entry: ViewerEntry) {
    if (warmed.has(entry.id)) return;
    warmed.add(entry.id);
    entry
      .load()
      .then((m) => m.preload?.())
      .catch(() => warmed.delete(entry.id));
  }

  /** Warm the viewers that match a MIME type (all the browser reveals during a drag). */
  function warmForMime(mime: string) {
    if (!mime) return;
    for (const v of viewers) if (v.mimes?.test(mime)) warm(v);
  }

  // ------------------------------------------------------ input: drop/pick/paste

  // While dragging, the page shows only the circle.
  const overlayText = h('span', { class: 'circle-text' }, s('readAny'));
  const overlay = h('div', { class: 'drop-overlay', 'aria-hidden': 'true' }, h('div', { class: 'circle circle-active' }, overlayText));
  document.body.append(overlay);
  let dragDepth = 0;
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    overlay.classList.add('show');
    // Start loading the right viewer while the user is still dragging.
    if (dragDepth === 1) for (const item of e.dataTransfer?.items ?? []) if (item.kind === 'file') warmForMime(item.type);
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlay.classList.remove('show');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    overlay.classList.remove('show');
    const file = e.dataTransfer?.files?.[0];
    if (file) void openFile(file);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void openFile(file);
    fileInput.value = '';
  });

  document.addEventListener('paste', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName))) return;
    const file = e.clipboardData?.files?.[0];
    if (file) {
      e.preventDefault();
      void openFile(file);
      return;
    }
    const text = e.clipboardData?.getData('text/plain');
    if (text) {
      e.preventDefault();
      void openPasted(text);
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'f' && e.key !== 'F') || e.metaKey || e.ctrlKey || e.altKey || !current) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    e.preventDefault();
    toggleFullscreen();
  });

  onLangChange(() => {
    overlayText.textContent = s('readAny');
    if (!current) {
      if (app.querySelector('.landing')) app.replaceChildren(header(), landing());
      return;
    }
    try {
      current.view.onLangChange?.();
    } catch (err) {
      console.error('Viewer failed to switch language', err);
    }
    refreshChrome();
  });

  setLang(lang());
  goHome();
}
