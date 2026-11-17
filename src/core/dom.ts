type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;
type Child = Node | string | null | undefined | false;

/** Tiny element builder: h('div', { class: 'x', onclick: fn }, 'text', child). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

/**
 * Append items to `container` in batches as the user scrolls, so huge files
 * render instantly and never freeze the page.
 */
export function renderProgressively<T>(
  container: HTMLElement,
  items: T[],
  render: (item: T, index: number) => Node,
  batch = 200,
): void {
  let i = 0;
  const sentinel = h('div', { class: 'sentinel', 'aria-hidden': 'true' });
  const step = () => {
    const frag = document.createDocumentFragment();
    const end = Math.min(items.length, i + batch);
    for (; i < end; i++) frag.append(render(items[i], i));
    container.append(frag);
    if (i < items.length) container.append(sentinel);
    else sentinel.remove();
  };
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        sentinel.remove();
        step();
        if (i >= items.length) io.disconnect();
      }
    },
    { rootMargin: '1500px' },
  );
  step();
  if (i < items.length) io.observe(sentinel);
}
