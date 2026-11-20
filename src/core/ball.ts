/**
 * The crystal ball on the front page (website and portable file alike). It does not need the
 * sponsor video: over the video the glass is clear; on the plain page it is a deeper midnight glass.
 */
import { h } from './dom';

/**
 * The upload circle becomes a small ball that falls and bounces as if under gentle
 * gravity — slow arcs, each bounce a slightly different height — and rebounds off the
 * sides and top, squashing a little at each impact. It eases to a stop under
 * the pointer so it's easy to click; reduced-motion visitors get a still ball.
 */
export function crystalBall(landing: HTMLElement): void {
  const ball = landing.querySelector<HTMLElement>('.circle');
  if (!ball) return;
  landing.classList.add('promo-ball');
  // The crystal-ball look (the earlier midnight-blue ball stays available as ?ball=classic).
  let classic = false;
  try {
    classic = new URLSearchParams(location.search).get('ball') === 'classic';
  } catch {
    /* no address */
  }
  if (!classic) {
    landing.classList.add('promo-crystal');
    // Two pools of liquid light inside the glass (moved by CSS transforms only).
    ball.prepend(h('span', { class: 'crystal-flow', 'aria-hidden': 'true' }));
  }
  // A small caption under the slogan: on hover with a mouse, always on touchscreens.
  ball.append(h('span', { class: 'circle-hint hint-mouse', 'aria-hidden': 'true' }, 'Open a file'), h('span', { class: 'circle-hint hint-touch', 'aria-hidden': 'true' }, 'Tap to open'));
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const r0 = landing.getBoundingClientRect();
  const size0 = ball.offsetWidth;
  const G = 260; // px/s²: a slow, floaty fall
  const PACE = 0.6; // the whole motion at 60 % speed: same arcs, more graceful
  let x = (r0.width - size0) / 2;
  let y = 24; // starts near the top and drops in
  let vx = (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 40);
  let vy = 0;
  let squash = 0; // after a landing: > 0 flattened, < 0 stretched tall — wobbles like jelly, then settles
  let squashV = 0;
  let phase = Math.random() * 10; // gentle breathing while in flight
  let squashSide = 0; // 0…1 after a side bounce (narrows), decays
  let timeScale = still ? 0 : 1;
  let target = timeScale;
  let last = performance.now();
  ball.addEventListener('pointerenter', () => (target = 0));
  ball.addEventListener('pointerleave', () => (target = still ? 0 : 1));
  ball.addEventListener('focus', () => (target = 0));
  ball.addEventListener('blur', () => (target = still ? 0 : 1));
  // Sizes are measured when they change, not on every frame (no layout work while animating).
  let r = landing.getBoundingClientRect();
  let size = ball.offsetWidth;
  const measure = () => ((r = landing.getBoundingClientRect()), (size = ball.offsetWidth));
  const ro = new ResizeObserver(measure);
  ro.observe(landing);
  ro.observe(ball);
  const frame = (now: number) => {
    if (!ball.isConnected) return void ro.disconnect();
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    timeScale += (target - timeScale) * Math.min(1, real * 3);
    const dt = real * timeScale * PACE;
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
        squashV = 0;
        vy = -Math.sqrt(2 * G * height);
        vx += (Math.random() - 0.5) * 24; // a small change of drift with each bounce
        vx = Math.sign(vx || 1) * Math.min(130, Math.max(60, Math.abs(vx)));
      }
      // Top edge: bounce back down.
      if (y < pad) {
        y = pad;
        vy = Math.abs(vy) * 0.9;
        squash = 0.5;
        squashV = 0;
      }
      // Side edges: rebound like a real ball.
      if (x < pad || x > right) {
        x = x < pad ? pad : right;
        vx = -vx * 0.95;
        squashSide = Math.min(1, Math.abs(vx) / 110);
      }
      // A soft spring: flatten → a little taller → flatter … → round (about two wobbles).
      squashV += (-190 * squash - 6.5 * squashV) * dt;
      squash += squashV * dt;
      squashSide *= Math.pow(0.02, dt);
      phase += dt;
    }
    const breathe = still ? 0 : 0.012 * Math.sin(phase * 2.2) * timeScale;
    const sq = 0.12 * squash - 0.1 * squashSide + breathe; // > 0: flattened (floor), < 0: narrowed (wall)
    ball.style.transformOrigin = squashSide > Math.abs(squash) ? (vx > 0 ? '0% 50%' : '100% 50%') : '50% 100%';
    ball.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 + sq).toFixed(4)}, ${(1 - sq).toFixed(4)})`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
