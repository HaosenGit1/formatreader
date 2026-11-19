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
    video.addEventListener('playing', () => (landing.classList.add('promo-on'), wander(landing)), { once: true });
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

/**
 * The upload circle becomes a small ball drifting slowly and irregularly over the video
 * (two slow waves per axis with unrelated periods, so the path never repeats visibly).
 * It pauses under the pointer so it's easy to click; still for reduced-motion visitors.
 */
function wander(landing: HTMLElement): void {
  const ball = landing.querySelector<HTMLElement>('.circle');
  if (!ball) return;
  landing.classList.add('promo-ball');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seed = Math.random() * 100;
  let t = seed;
  let speed = 1;
  let target = 1;
  let last = performance.now();
  ball.addEventListener('pointerenter', () => (target = 0));
  ball.addEventListener('pointerleave', () => (target = 1));
  ball.addEventListener('focus', () => (target = 0));
  ball.addEventListener('blur', () => (target = 1));
  const frame = (now: number) => {
    if (!ball.isConnected) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    speed += (target - speed) * Math.min(1, dt * 3); // ease to a stop / back into motion
    t += dt * speed;
    const r = landing.getBoundingClientRect();
    const size = ball.offsetWidth;
    const pad = 16;
    const w = Math.max(0, r.width - size - pad * 2);
    const h = Math.max(0, r.height - size - pad * 2 - 40); // keep clear of the footer links
    const u = still ? 0.5 : 0.5 + 0.32 * Math.sin(t * 0.053 + 1.3) + 0.18 * Math.sin(t * 0.131 + seed);
    const v = still ? 0.45 : 0.5 + 0.3 * Math.sin(t * 0.041 + seed * 0.7) + 0.2 * Math.sin(t * 0.097 + 2.1);
    ball.style.transform = `translate(${pad + u * w}px, ${pad + v * h}px)`;
    if (!still) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
