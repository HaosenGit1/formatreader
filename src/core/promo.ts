/**
 * Front-page sponsor: Goldwind Americas ("Driving a renewable future"), approved by Goldwind.
 * A silent looping video behind the circle; clicking it (outside the circle) opens their site. The video is this site's
 * own file (no third-party requests); it loads after the page is shown, and is skipped for
 * visitors who ask for less motion or less data. Clicking the circle still opens files.
 */
import { h } from './dom';
import { strings } from './i18n';

export const PROMO = {
  link: 'https://www.goldwindamericas.com/',
  video: '/promo/goldwind-americas.mp4',
  poster: '/promo/goldwind-americas.jpg',
};

const s = strings({
  name: { en: 'Goldwind Americas', zh: '金风科技美洲' },
  tagline: { en: 'Driving a renewable future', zh: '驱动可再生未来' },
  more: { en: 'Learn more', zh: '了解更多' },
  label: { en: 'Goldwind Americas website (opens in a new tab)', zh: '金风科技美洲官网（在新标签页打开）' },
});

/** No visible button: a link only screen readers see (the video itself is the visible link). */
export function promoBar(): HTMLElement {
  return h('a', { class: 'promo-sr', href: PROMO.link, target: '_blank', rel: 'noopener' }, s('label'));
}

/** Starts the background video behind `landing` once the page is idle (if the file exists). */
export function startPromoVideo(landing: HTMLElement): void {
  const less = matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (less) return;
  const go = () => {
    if (!landing.isConnected) return;
    const video = h('video', { class: 'promo-video', muted: true, autoplay: true, loop: true, playsinline: true, preload: 'auto', 'aria-hidden': 'true', tabindex: '-1' }) as HTMLVideoElement;
    video.muted = true; // required for autoplay
    const bg = h('div', { class: 'promo-bg', 'aria-hidden': 'true' }, video);
    video.addEventListener('playing', () => landing.classList.add('promo-on'), { once: true });
    // Clicking the video (anywhere but the circle and the links) opens Goldwind Americas.
    landing.addEventListener('click', (e) => {
      if (landing.classList.contains('promo-on') && e.target === landing) window.open(PROMO.link, '_blank', 'noopener');
    });
    // No video on the server yet (or it can't play here): quietly keep the plain page.
    video.addEventListener('error', () => bg.remove(), { once: true });
    video.poster = PROMO.poster;
    video.src = PROMO.video;
    landing.prepend(bg);
    void video.play().catch(() => {});
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(go, { timeout: 2000 });
  else setTimeout(go, 800);
}
