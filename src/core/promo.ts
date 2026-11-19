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

/** Smooth 1-D gradient noise (−1…1): gentle, never-repeating variation over time. */
function noise1(seed: number) {
  const grad = new Map<number, number>();
  const g = (i: number) => {
    let v = grad.get(i);
    if (v === undefined) {
      const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
      grad.set(i, (v = (x - Math.floor(x)) * 2 - 1));
      if (grad.size > 512) grad.delete(grad.keys().next().value!);
    }
    return v;
  };
  return (t: number) => {
    const i = Math.floor(t);
    const f = t - i;
    const u = f * f * f * (f * (f * 6 - 15) + 10); // smootherstep
    // Blend the two neighbouring gradients (Perlin-style), scaled to about −1…1.
    return ((1 - u) * g(i) * f + u * g(i + 1) * (f - 1)) * 2;
  };
}

/**
 * The upload circle becomes a small ball gliding slowly over the video, like a bubble on
 * a breeze: its heading turns in smooth curves (layered noise), its speed rises and falls,
 * it eases away from the edges instead of bouncing, and it breathes softly. It glides to a
 * stop under the pointer so it's easy to click; reduced-motion visitors get a still ball.
 */
function wander(landing: HTMLElement): void {
  const ball = landing.querySelector<HTMLElement>('.circle');
  if (!ball) return;
  landing.classList.add('promo-ball');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seed = Math.random() * 1000;
  const turnA = noise1(seed);
  const turnB = noise1(seed + 17);
  const pace = noise1(seed + 41);
  const r0 = landing.getBoundingClientRect();
  const size0 = ball.offsetWidth;
  let x = (r0.width - size0) / 2;
  let y = (r0.height - size0) / 2 - 20;
  let heading = Math.random() * Math.PI * 2;
  let speedScale = still ? 0 : 1;
  let target = speedScale;
  let t = 0;
  let last = performance.now();
  ball.addEventListener('pointerenter', () => (target = 0));
  ball.addEventListener('pointerleave', () => (target = still ? 0 : 1));
  ball.addEventListener('focus', () => (target = 0));
  ball.addEventListener('blur', () => (target = still ? 0 : 1));
  const frame = (now: number) => {
    if (!ball.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    speedScale += (target - speedScale) * Math.min(1, dt * 2.2); // glide to a stop / back
    const r = landing.getBoundingClientRect();
    const size = ball.offsetWidth;
    const pad = 20;
    const maxX = Math.max(pad, r.width - size - pad);
    const maxY = Math.max(pad, r.height - size - pad - 44); // clear of the footer link
    // Wander: the heading drifts by layered slow noise (big lazy curves + small sways).
    heading += (turnA(t * 0.09) * 0.55 + turnB(t * 0.31) * 0.18) * dt;
    // Near an edge, turn gently back toward the middle (stronger the closer it gets).
    const cx = (maxX + pad) / 2;
    const cy = (maxY + pad) / 2;
    const edge = Math.max(0, 1 - Math.min(x - pad, maxX - x, y - pad, maxY - y) / Math.max(60, size * 0.9));
    if (edge > 0) {
      const toCentre = Math.atan2(cy - y, cx - x);
      let d = toCentre - heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      heading += d * Math.min(1, edge * edge * dt * 2.5);
    }
    const speed = (24 + 10 * pace(t * 0.12)) * speedScale; // px per second, breathing pace
    x = Math.min(maxX, Math.max(pad, x + Math.cos(heading) * speed * dt));
    y = Math.min(maxY, Math.max(pad, y + Math.sin(heading) * speed * dt));
    const breathe = 1 + 0.022 * Math.sin(t * 0.9) * (still ? 0 : 1);
    ball.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${breathe.toFixed(4)})`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
