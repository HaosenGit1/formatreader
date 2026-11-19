/**
 * "Tip a coffee": a small cup in the footer and a panel with a fixed $5 payment link.
 * The site itself stays free; the link goes to a Stripe Payment Link (set COFFEE_URL).
 * While COFFEE_URL is empty the cup is hidden (preview it with ?coffee in the address).
 */
import { h } from './dom';
import { strings } from './i18n';

/** Stripe Payment Link for a fixed $5 (e.g. https://buy.stripe.com/…). Empty = not live. */
export const COFFEE_URL = '';

const s = strings({
  link: { en: 'Tip a coffee', zh: '打赏一杯咖啡' },
  kicker: { en: 'Always free', zh: '永久免费' },
  title: { en: 'A cup of coffee', zh: '一杯咖啡' },
  text: {
    en: 'FormatReader will always be free for everyone. If it helped you, tip a cup of coffee — $5, no more.',
    zh: 'FormatReader 会一直对所有人免费。如果它帮到了你，打赏一杯咖啡就好——5 美元，仅此而已。',
  },
  buy: { en: 'Tip a coffee · $5', zh: '打赏一杯咖啡 · 5 美元' },
  notYet: { en: 'Coming soon — thank you for the thought!', zh: '即将开放——谢谢你的心意！' },
  later: { en: 'Maybe later', zh: '下次吧' },
  close: { en: 'Close', zh: '关闭' },
});

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = (markup: string, cls: string, size: number): SVGSVGElement => {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', '0 0 120 120');
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = markup;
  return el;
};

/** A cream porcelain cup with a gold rim, latte-art heart and rising steam. */
const CUP = `
  <g class="cf-steam" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
    <path d="M46 40c-6-7 6-11 0-19"/><path d="M60 38c-6-8 6-12 0-21"/><path d="M74 40c-6-7 6-11 0-19"/>
  </g>
  <ellipse cx="60" cy="100" rx="44" ry="9" fill="#efe4d0" stroke="#c9a96e" stroke-width="2"/>
  <ellipse cx="60" cy="98" rx="28" ry="4" fill="#d9c9ab"/>
  <path d="M86 60h4a12 12 0 0 1 0 24h-6" fill="none" stroke="#c9a96e" stroke-width="5"/>
  <path d="M28 52h64v14c0 18-14 31-32 31S28 84 28 66z" fill="#fbf6ec" stroke="#c9a96e" stroke-width="2"/>
  <ellipse cx="60" cy="52" rx="32" ry="7" fill="#f3e7cf" stroke="#c9a96e" stroke-width="2"/>
  <ellipse cx="60" cy="53" rx="27" ry="5" fill="#7a4a2c"/>
  <path d="M60 57c-6-3-8-6-5-8 2-1 4 0 5 2 1-2 3-3 5-2 3 2 1 5-5 8z" fill="#ead6b4"/>
  <path d="M34 66c2 10 8 18 16 22" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;

export function coffeeLink(): HTMLElement | null {
  let preview = false;
  try {
    preview = new URLSearchParams(location.search).has('coffee');
  } catch {
    /* no address */
  }
  if (!COFFEE_URL && !preview) return null;
  return h('button', { type: 'button', class: 'foot-link foot-button coffee-link', onclick: openCoffee }, svg(CUP, 'coffee-mini', 18), s('link'));
}

function openCoffee(): void {
  document.querySelector('.ad-panel')?.remove();
  const close = () => {
    panel.remove();
    removeEventListener('keydown', esc);
  };
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
  const panel: HTMLElement = h(
    'div',
    { class: 'ad-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': s('title'), onclick: (e: Event) => e.target === panel && close() },
    h('div', { class: 'ad-card coffee-card' },
      h('button', { type: 'button', class: 'ad-x', 'aria-label': s('close'), onclick: close }, '×'),
      svg(CUP, 'coffee-cup', 120),
      h('p', { class: 'ad-kicker' }, s('kicker')),
      h('h2', {}, s('title')),
      h('p', { class: 'ad-text' }, s('text')),
      h('div', { class: 'ad-actions' },
        COFFEE_URL
          ? h('a', { class: 'ad-btn ad-primary', href: COFFEE_URL, target: '_blank', rel: 'noopener' }, s('buy'))
          : h('span', { class: 'ad-btn ad-primary coffee-soon' }, s('notYet')),
        h('button', { type: 'button', class: 'ad-btn', onclick: close }, s('later')),
      ),
    ), // prettier-ignore
  );
  addEventListener('keydown', esc);
  document.body.append(panel);
}
