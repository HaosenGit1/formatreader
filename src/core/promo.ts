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
    video.addEventListener('playing', () => landing.classList.add('promo-on'), { once: true });
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
