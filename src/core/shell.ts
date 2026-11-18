/**
 * The app shell: front page, loading screen, header, toolbar, full screen,
 * drag & drop / file picker / paste, and error isolation.
 *
 * It knows nothing about any file format. It identifies the file, asks the
 * registry for a viewer, gives that viewer an element to draw into, and shows
 * whatever toolbar controls the viewer offers. If a viewer fails, only that
 * file shows an error card; the shell and all other viewers keep working.
 */
import { withDetectedType } from './mime';
import { FolderSource } from './folder-source';
import { offlineLine } from '../offline/panel';
import { detectFormat, extOf } from './detect-format';
import { formatBytes, h } from './dom';
import { lang, onLangChange, setLang, strings } from './i18n';
import { infoEntry } from './info-entry';
import { messageView } from './info-view';
import { assertUniqueIds, pickViewer, withTrials } from './registry';
import type { OpenContext, OpenedView, ViewerEntry, ViewerModule } from './viewer';

const s = strings({
  // Brand slogan: the same words for every visitor.
  readAny: { en: 'Any Format.\nOne Bridge.', zh: 'Any Format.\nOne Bridge.' },
  openAnother: { en: 'Open another', zh: '换个文件' },
  about: { en: 'About this file: format, where it comes from, how to open it elsewhere', zh: '关于此文件：格式、来源、在其他软件中怎么打开' },
  aboutShort: { en: 'About', zh: '文件说明' },
  fullscreen: { en: 'Full screen', zh: '全屏' },
  exitFullscreen: { en: 'Exit full screen', zh: '退出全屏' },
  smaller: { en: 'Smaller text', zh: '缩小文字' },
  larger: { en: 'Larger text', zh: '放大文字' },
  pasted: { en: 'Pasted text', zh: '粘贴的文字' },
  failed: { en: 'This file could not be opened', zh: '无法打开这个文件' },
  trail: { en: 'Opened from', zh: '打开自' },
  offlineTitle: { en: 'Needs the internet', zh: '需要联网' },
  offlineText: {
    en: 'The reader for this kind of file could not be downloaded. Connect to the internet and open the file again: once downloaded, it also works offline.',
    zh: '无法下载这类文件的阅读器。请联网后再打开一次：下载过一次之后，离线也能使用。',
  },
  back: { en: 'Back', zh: '返回' },
  formats: { en: 'Formats', zh: '支持的格式' },
  portable: { en: 'Portable · works without internet', zh: '便携版 · 无需联网' },
  portableLicence: {
    en: 'Free software under GPL-3.0 or later, with no warranty. Source and licence: ',
    zh: '依据 GPL-3.0 或更新版本发布的自由软件，不提供任何担保。源代码和许可证：',
  },
  portableNote: {
    en: 'This single file is the whole app. Copy it anywhere and open it in a browser. Free software (GPL-3.0); source: github.com/HaosenGit1/formatreader',
    zh: '这一个文件就是完整的应用。复制到任何地方，用浏览器打开即可。自由软件（GPL-3.0），源代码：github.com/HaosenGit1/formatreader',
  },
});

interface Current {
  name: string;
  size: number;
  /** The file or folder being shown (kept so it can be reopened from the trail). */
  file?: File | FolderSource;
  entry: ViewerEntry;
  view: OpenedView;
  format: OpenContext['format'];
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
  /**
   * Files we came through to reach the current one, outermost first: e.g.
   * [project.zip, inner.7z] while showing report.docx from inside inner.7z.
   * Opening a file from inside another (archive, email attachment, .gz) adds
   * to it; dropping or choosing a file starts afresh.
   */
  let trail: Array<File | FolderSource> = [];

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
      h('button', { type: 'button', class: 'circle', onclick: () => fileInput.click() }, h('span', { class: 'circle-text' }, s('readAny'))),
      import.meta.env.MODE === 'portable'
        ? h(
            'footer',
            { class: 'landing-foot landing-foot-portable' },
            h('span', { class: 'foot-link', title: s('portableNote') }, s('portable')),
            h('span', { class: 'foot-legal' }, s('portableLicence'), h('a', { href: 'https://github.com/HaosenGit1/formatreader' }, 'github.com/HaosenGit1/formatreader')),
          )
        : h('footer', { class: 'landing-foot' }, h('a', { class: 'foot-link', href: 'formats.html' }, s('formats')), offlineLine()),
    );

  /** The only loading state: the name fills with colour like a progress bar. */
  const loadingView = () => h('div', { class: 'loading', role: 'status', 'aria-label': 'Loading' }, h('div', { class: 'loading-name' }, 'FormatReader'));

  // ------------------------------------------------------------- toolbar

  function fullscreenButton(view: OpenedView): HTMLElement | null {
    if (view.fullscreen) {
      return h('button', { type: 'button', class: 'btn fs-btn', onclick: () => view.fullscreen!() }, expandIcon(), view.fullscreenLabel?.() ?? s('fullscreen'));
    }
    const on = isFull();
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
    if (c.size >= 0) tools.push(h('button', { type: 'button', class: 'btn about-btn', title: s('about'), onclick: () => toggleAbout(c) }, 'ⓘ ', s('aboutShort')));
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
      // One step back up the trail (same as the browser's Back button).
      trail.length ? h('button', { type: 'button', class: 'btn back-btn', title: s('back'), 'aria-label': s('back'), onclick: () => goBack() }, '←') : null,
      h(
        'div',
        { class: 'file' },
        // The way back when this file was opened from inside another one.
        trail.length
          ? h(
              'nav',
              { class: 'trail', 'aria-label': s('trail') },
              ...trail.flatMap((f, i) => [h('button', { type: 'button', class: 'trail-link', title: f.name, onclick: () => goBackTo(i) }, f.name), h('span', { class: 'trail-sep', 'aria-hidden': 'true' }, '›')]),
            )
          : null,
        h('div', { class: 'file-name', title }, title),
        h('div', { class: 'file-meta' }, [...meta, ...(c.size >= 0 ? [formatBytes(c.size)] : [])].join(' · ')),
      ),
      h('div', { class: 'tools' }, ...tools),
    );
  }

  /** "About this file": what it is, where it comes from, how to open it elsewhere (loaded on demand). */
  async function toggleAbout(c: Current) {
    const slot = app.querySelector('.about-slot');
    if (!slot) return;
    if (slot.firstChild) {
      slot.replaceChildren();
      return;
    }
    const { aboutPanel } = await import('./about/panel');
    if (current !== c) return;
    let facts = {};
    try {
      facts = c.view.about?.() ?? {};
    } catch (err) {
      console.error(`Viewer ${c.entry.id} failed to describe the file`, err);
    }
    const dot = c.name.lastIndexOf('.');
    const ext = dot > 0 ? c.name.slice(dot + 1).toLowerCase() : '';
    slot.replaceChildren(aboutPanel({ name: c.name, ext, size: c.size, format: c.format, viewerId: c.entry.id, facts }, () => slot.replaceChildren()));
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
    if (immersive) setImmersive(false);
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
    const page = h('main', { class: `doc${entry.layout === 'fill' ? ' doc-fill' : ''}` }, h('div', { class: 'toolbar' }), h('div', { class: 'about-slot' }), h('div', { class: 'notices', hidden: true }), mount);
    const cover = h('div', { class: 'loading-cover' }, loadingView());
    app.replaceChildren(header(), page, cover);

    const ctx: OpenContext = { mount, format, fontScale: () => fontScale, refreshChrome, openFile: (f, o) => openInside(f, o?.replace) };
    let view: OpenedView;
    try {
      const mod = await entry.load();
      view = await run(mod, ctx);
    } catch (err) {
      console.error(`Viewer ${entry.id} failed`, err);
      view = {};
      // Offline and this viewer's code was never stored: say what to do, not a raw network error.
      const missingCode = /dynamically imported module|Unable to preload CSS|Failed to fetch|Importing a module script failed|NetworkError|Load failed/i.test(String((err as Error)?.message));
      mount.replaceChildren(missingCode ? messageView(s('offlineTitle'), s('offlineText')) : messageView(s('failed'), String((err as Error)?.message ?? err)));
    }
    if (my !== token) {
      view.destroy?.();
      return;
    }
    current = { name, size, entry, view, format, file: shownFile ?? undefined };
    shownFile = null;
    refreshChrome();
    cover.remove();
    window.scrollTo(0, 0);
  }

  /** The file or folder `show()` is about to display (set by openFile / openFolder). */
  let shownFile: File | FolderSource | null = null;

  /** Open a file found inside the current one, remembering the way back. */
  function openInside(file: File, replace = false) {
    // A viewer may hand over while it is still opening (current not set yet).
    const from = current?.file ?? shownFile;
    if (from && !replace) {
      trail.push(from);
      // Let the browser's Back button (and mouse/swipe back) step out again.
      history.pushState({ formatreaderDepth: trail.length }, '');
    }
    void openFile(file, true);
  }

  /** One step back: through history when we added the entry, otherwise directly. */
  function goBack() {
    if (trail.length) goBackTo(trail.length - 1);
  }

  /**
   * Back to trail item `index`, through the browser history when our entries are on top
   * (so the browser's Back button stays in step), otherwise directly.
   */
  function goBackTo(index: number) {
    const steps = trail.length - index;
    if (steps > 0 && history.state?.formatreaderDepth === trail.length) history.go(-steps);
    else backTo(index);
  }

  window.addEventListener('popstate', () => {
    const depth = Number(history.state?.formatreaderDepth ?? 0);
    if (trail.length > depth) backTo(depth);
  });

  /** Go back up the trail to the file at `index`. */
  function backTo(index: number) {
    const target = trail[index];
    trail = trail.slice(0, index);
    if (target instanceof FolderSource) void openFolder(target, true);
    else void openFile(target, true);
  }

  /** A dropped folder: shown as a tree like an archive; its files open with the folder on the trail. */
  const folderEntry: ViewerEntry = { id: 'core/folder', category: 'other', accepts: () => false, load: () => import('./folder-view') };
  async function openFolder(folder: FolderSource, keepTrail = false) {
    if (!keepTrail) trail = [];
    closeCurrent();
    const my = ++token;
    app.replaceChildren(loadingView());
    shownFile = folder;
    await show(folderEntry, folder.name, -1, null, async (_mod, ctx) => (await import('./folder-view')).openFolder(folder, ctx), my);
  }

  async function openFile(file: File, keepTrail = false) {
    if (!keepTrail) trail = [];
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
    // Label the file with what its bytes say it is: archives give no type, renames give a wrong one.
    file = withDetectedType(file, format);
    const entry = pickViewer(viewers, { format, name: file.name, ext: extOf(file.name), head }) ?? infoEntry;
    shownFile = file;
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

  // Real full screen where the browser allows it. iPhone browsers allow it only for videos,
  // so there (and anywhere it fails) the page fills the screen itself: "immersive" mode.
  type FsDoc = Document & { webkitFullscreenElement?: Element; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
  type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
  const fsDoc = document as FsDoc;
  const nativeFull = () => !!(document.fullscreenElement ?? fsDoc.webkitFullscreenElement);
  const canNative = () => !!(document.fullscreenEnabled || fsDoc.webkitFullscreenEnabled);
  let immersive = false;
  const isFull = () => nativeFull() || immersive;

  function setImmersive(on: boolean) {
    if (immersive === on) return;
    immersive = on;
    document.documentElement.classList.toggle('fr-immersive', on);
    const main = app.querySelector<HTMLElement>('main.doc');
    main?.classList.toggle('doc-immersive', on);
    main?.querySelector('.immersive-exit')?.remove();
    if (on) {
      main?.append(h('button', { type: 'button', class: 'immersive-exit', 'aria-label': s('exitFullscreen'), title: s('exitFullscreen'), onclick: () => history.state?.formatreaderImmersive ? history.back() : setImmersive(false) }, '✕'));
      // The phone's Back gesture leaves immersive mode instead of the page.
      history.pushState({ ...(history.state ?? {}), formatreaderImmersive: true }, '');
    }
    app.querySelector('.fs-btn')?.replaceWith(current ? (fullscreenButton(current.view) ?? '') : '');
    dispatchEvent(new Event('resize')); // viewers that measure themselves (books, drawings) re-layout
  }

  function toggleFullscreen() {
    if (current?.view.fullscreen) return current.view.fullscreen();
    if (immersive) {
      if (history.state?.formatreaderImmersive) history.back();
      else setImmersive(false);
      return;
    }
    if (nativeFull()) {
      (document.exitFullscreen?.() ?? Promise.resolve(fsDoc.webkitExitFullscreen?.())).catch(() => {});
      return;
    }
    const main = app.querySelector<FsEl>('main.doc');
    if (!main) return;
    if (canNative() && main.requestFullscreen) main.requestFullscreen().catch(() => setImmersive(true));
    else if (canNative() && main.webkitRequestFullscreen) main.webkitRequestFullscreen();
    else return setImmersive(true);
    // Some browsers refuse without saying so: if nothing happened, fill the screen ourselves.
    setTimeout(() => {
      if (!nativeFull() && !immersive) setImmersive(true);
    }, 400);
  }

  window.addEventListener('popstate', () => {
    if (immersive && !history.state?.formatreaderImmersive) setImmersive(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && immersive) toggleFullscreen();
  });

  // Update only the button: re-rendering would move the page out of full screen.
  const onFsChange = () => {
    if (!current || current.view.fullscreen) return;
    app.querySelector('.fs-btn')?.replaceWith(fullscreenButton(current.view) ?? '');
  };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

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
    // A folder dropped (perhaps by accident): browse it like an archive.
    const entry = e.dataTransfer?.items?.[0]?.webkitGetAsEntry?.();
    if (entry?.isDirectory) return void openFolder(new FolderSource(entry as FileSystemDirectoryEntry));
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
