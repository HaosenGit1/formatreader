/**
 * Front-page sponsor: Goldwind Americas ("Driving a renewable future"), approved by Goldwind.
 * A silent looping video behind the circle; clicking it (outside the circle) opens their site. The video is this site's
 * own file (no third-party requests); it loads after the page is shown, and is skipped for
 * visitors who ask for less motion or less data. Clicking the circle still opens files.
 */
import { h } from './dom';
import { strings } from './i18n';

/** One address for everything: advertising, suggestions, problems (the subject tells them apart). */
export const CONTACT_EMAIL = 'info@formatreader.com';

export const PROMO = {
  link: 'https://www.goldwindamericas.com/',
  video: '/promo/goldwind-americas-v2.mp4',
  poster: '/promo/goldwind-americas-v2.jpg',
};

const s = strings({
  name: { en: 'Goldwind Americas', zh: '金风科技美洲' },
  tagline: { en: 'Driving a renewable future', zh: '驱动可再生未来' },
  more: { en: 'Learn more', zh: '了解更多' },
  label: { en: 'Goldwind Americas website (opens in a new tab)', zh: '金风科技美洲官网（在新标签页打开）' },
  tag: { en: 'Ad space available', zh: 'Ad space available' }, // 广告招租 — English for everyone, like the slogan
  adTitle: { en: 'Advertise on FormatReader', zh: '在 FormatReader 投放广告' },
  adText: { en: 'Your brand behind the page every visitor sees first. Tell us about your company and what you’d like to show — we’ll get back to you.', zh: '您的品牌将出现在每位访客打开的第一个页面。告诉我们您的公司和想展示的内容，我们会尽快回复。' },
  adEmail: { en: 'Email us', zh: '发邮件联系' },
  adCopy: { en: 'Copy address', zh: '复制邮箱' },
  adCopied: { en: 'Copied', zh: '已复制' },
  adClose: { en: 'Close', zh: '关闭' },
  adSubject: { en: 'Advertising on FormatReader', zh: '在 FormatReader 投放广告' },
  fbKicker: { en: 'Feedback', zh: 'Feedback' },
  fbTitle: { en: 'Tell us what you think', zh: '告诉我们您的想法' },
  fbText: { en: 'A suggestion, a file that didn’t open right, a format you need — we read every message. Please describe the file rather than attaching anything private.', zh: '建议、没能正确打开的文件、需要支持的格式——每条消息我们都会认真阅读。请描述文件情况，不要附上隐私文件。' },
  fbSubject: { en: 'FormatReader feedback', zh: 'FormatReader 反馈' },
  fbBody: { en: 'Your suggestion or what happened:\n\nFile type (e.g. .dwg, .xlsx):\nBrowser and device:\n', zh: '您的建议或遇到的问题：\n\n文件类型（如 .dwg、.xlsx）：\n浏览器和设备：\n' },
  feedback: { en: 'Feedback', zh: '反馈' },
  adBody: { en: 'Company:\nWebsite:\nWhat you would like to show:\nTiming / budget:\n', zh: '公司：\n网站：\n想展示的内容：\n时间 / 预算：\n' },
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
    landing.prepend(bg, h('button', { type: 'button', class: 'promo-tag', onclick: () => openContactPanel('ads') }, s('tag')));
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
    const dt = real * timeScale * PACE;
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

/** The footer "Feedback" link (same panel as advertising, worded for suggestions). */
export function feedbackLink(): HTMLElement {
  return h('button', { type: 'button', class: 'foot-link foot-button', onclick: () => void import('./feedback').then((m) => m.openFeedback()) }, s('feedback'));
}

/**
 * A small panel to email info@formatreader.com — for advertisers ("Ad space available") or
 * feedback (footer). No form: the visitor's own email app sends it; the site sends nothing.
 */
function openContactPanel(kind: 'ads' | 'feedback'): void {
  document.querySelector('.ad-panel')?.remove();
  const ads = kind === 'ads';
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(s(ads ? 'adSubject' : 'fbSubject'))}&body=${encodeURIComponent(s(ads ? 'adBody' : 'fbBody'))}`;
  const copy = h('button', { type: 'button', class: 'ad-btn' }, s('adCopy')) as HTMLButtonElement;
  copy.addEventListener('click', () => void navigator.clipboard?.writeText(CONTACT_EMAIL).then(() => ((copy.textContent = s('adCopied')), setTimeout(() => (copy.textContent = s('adCopy')), 1500))));
  const close = () => {
    panel.remove();
    removeEventListener('keydown', esc);
  };
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
  const panel: HTMLElement = h(
    'div',
    { class: 'ad-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': s(ads ? 'adTitle' : 'fbTitle'), onclick: (e: Event) => e.target === panel && close() },
    h('div', { class: 'ad-card' },
      h('button', { type: 'button', class: 'ad-x', 'aria-label': s('adClose'), onclick: close }, '×'),
      h('p', { class: 'ad-kicker' }, s(ads ? 'tag' : 'fbKicker')),
      h('h2', {}, s(ads ? 'adTitle' : 'fbTitle')),
      h('p', { class: 'ad-text' }, s(ads ? 'adText' : 'fbText')),
      h('p', { class: 'ad-address' }, CONTACT_EMAIL),
      h('div', { class: 'ad-actions' }, h('a', { class: 'ad-btn ad-primary', href: mailto }, s('adEmail')), copy),
    ), // prettier-ignore
  );
  document.body.append(panel);
  addEventListener('keydown', esc);
  (panel.querySelector('.ad-primary') as HTMLElement).focus();
}
