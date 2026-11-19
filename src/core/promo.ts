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
 * The upload circle becomes a small ball that falls and bounces as if under gentle
 * gravity — slow arcs, each bounce a slightly different height — and rebounds off the
 * sides and top, squashing a little at each impact. It eases to a stop under
 * the pointer so it's easy to click; reduced-motion visitors get a still ball.
 */
function wander(landing: HTMLElement): void {
  const ball = landing.querySelector<HTMLElement>('.circle');
  if (!ball) return;
  landing.classList.add('promo-ball');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const r0 = landing.getBoundingClientRect();
  const size0 = ball.offsetWidth;
  const G = 260; // px/s²: a slow, floaty fall
  let x = (r0.width - size0) / 2;
  let y = 24; // starts near the top and drops in
  let vx = (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 40);
  let vy = 0;
  let squash = 0; // 0…1 after a landing (flattens), decays
  let squashSide = 0; // 0…1 after a side bounce (narrows), decays
  let timeScale = still ? 0 : 1;
  let target = timeScale;
  let last = performance.now();
  ball.addEventListener('pointerenter', () => (target = 0));
  ball.addEventListener('pointerleave', () => (target = still ? 0 : 1));
  ball.addEventListener('focus', () => (target = 0));
  ball.addEventListener('blur', () => (target = still ? 0 : 1));
  const frame = (now: number) => {
    if (!ball.isConnected) return;
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    timeScale += (target - timeScale) * Math.min(1, real * 3);
    const dt = real * timeScale;
    const r = landing.getBoundingClientRect();
    const size = ball.offsetWidth;
    const pad = 16;
    const floor = Math.max(pad, r.height - size - 48); // just above the footer links
    const right = Math.max(pad, r.width - size - pad);
    if (still) {
      x = (r.width - size) / 2;
      y = floor * 0.45;
    } else {
      vy += G * dt;
      x += vx * dt;
      y += vy * dt;
      if (y >= floor) {
        // Bounce to a fresh height (50–85 % of the room), so the rhythm never repeats.
        y = floor;
        const height = (floor - pad) * (0.5 + Math.random() * 0.35);
        squash = Math.min(1, Math.abs(vy) / 260);
        vy = -Math.sqrt(2 * G * height);
        vx += (Math.random() - 0.5) * 24; // a small change of drift with each bounce
        vx = Math.sign(vx || 1) * Math.min(130, Math.max(60, Math.abs(vx)));
      }
      // Top edge: bounce back down.
      if (y < pad) {
        y = pad;
        vy = Math.abs(vy) * 0.9;
        squash = 0.5;
      }
      // Side edges: rebound like a real ball.
      if (x < pad || x > right) {
        x = x < pad ? pad : right;
        vx = -vx * 0.95;
        squashSide = Math.min(1, Math.abs(vx) / 110);
      }
      squash *= Math.pow(0.02, dt); // springs back round within ~half a second
      squashSide *= Math.pow(0.02, dt);
    }
    const sq = 0.12 * squash - 0.1 * squashSide; // > 0: flattened (floor), < 0: narrowed (wall)
    ball.style.transformOrigin = squashSide > squash ? (vx > 0 ? '0% 50%' : '100% 50%') : '50% 100%';
    ball.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 + sq).toFixed(4)}, ${(1 - sq).toFixed(4)})`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
