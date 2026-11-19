/**
 * The feedback form (footer "Feedback"): a message, an optional email for a reply and an
 * optional file (≤ 4 MB). It is the ONE place the site sends anything, only when the visitor
 * presses Send, and says so on the form. It posts to formatreader.com/api/feedback (same
 * site; CloudFront passes it to a small function that emails it to the owner).
 */
import { h } from './dom';
import { lang, strings } from './i18n';

const s = strings({
  kicker: { en: 'Feedback', zh: 'Feedback' },
  title: { en: 'Tell us what you think', zh: '告诉我们您的想法' },
  message: { en: 'Your message', zh: '您的留言' },
  messageHint: { en: 'A suggestion, a file that didn’t open right, a format you need…', zh: '建议、没能正确打开的文件、需要支持的格式……' },
  email: { en: 'Your email (optional — only if you’d like a reply)', zh: '您的邮箱（选填——需要回复时填写）' },
  file: { en: 'Attach a file (optional, up to 4 MB)', zh: '附加文件（选填，最大 4 MB）' },
  remove: { en: 'Remove', zh: '移除' },
  privacy: { en: 'Pressing Send sends this message (and the file, if attached) to FormatReader. Nothing else ever leaves your computer.', zh: '点击“发送”会把这条留言（以及附加的文件）发送给 FormatReader。除此之外，任何内容都不会离开您的电脑。' },
  send: { en: 'Send', zh: '发送' },
  sending: { en: 'Sending…', zh: '正在发送…' },
  thanks: { en: 'Thank you — we got your message.', zh: '谢谢！我们已收到您的留言。' },
  tooBig: { en: 'The file is larger than 4 MB. Please attach a smaller one (or a part of it).', zh: '文件超过 4 MB，请附加较小的文件（或其中一部分）。' },
  empty: { en: 'Please write a message first.', zh: '请先填写留言。' },
  failed: { en: 'It couldn’t be sent (no internet?). Please try again, or write to info@formatreader.com.', zh: '发送失败（没有网络？）。请重试，或发邮件到 info@formatreader.com。' },
  close: { en: 'Close', zh: '关闭' },
});

const MAX = 4 * 1024 * 1024;

const toBase64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const sha256 = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function openFeedback(): void {
  document.querySelector('.ad-panel')?.remove();
  const opened = performance.now();
  const message = h('textarea', { class: 'fb-input fb-message', rows: 5, maxlength: 8000, placeholder: s('messageHint'), 'aria-label': s('message') }) as HTMLTextAreaElement;
  const email = h('input', { class: 'fb-input', type: 'email', autocomplete: 'email', placeholder: s('email'), 'aria-label': s('email') }) as HTMLInputElement;
  const trap = h('input', { class: 'fb-trap', type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }) as HTMLInputElement;
  const fileInput = h('input', { type: 'file', class: 'fb-file-input' }) as HTMLInputElement;
  const fileName = h('span', { class: 'fb-file-name' });
  const removeBtn = h('button', { type: 'button', class: 'fb-remove', hidden: true }, s('remove')) as HTMLButtonElement;
  const status = h('p', { class: 'fb-status', role: 'status' });
  const send = h('button', { type: 'submit', class: 'ad-btn ad-primary' }, s('send')) as HTMLButtonElement;
  let file: File | null = null;
  const showFile = () => {
    fileName.textContent = file ? file.name : '';
    removeBtn.hidden = !file;
  };
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0] ?? null;
    fileInput.value = '';
    if (f && f.size > MAX) {
      status.textContent = s('tooBig');
      return;
    }
    file = f;
    status.textContent = '';
    showFile();
  });
  removeBtn.addEventListener('click', () => ((file = null), showFile()));

  const close = () => {
    panel.remove();
    removeEventListener('keydown', esc);
  };
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
  const form = h(
    'form',
    { class: 'ad-card fb-card', novalidate: true },
    h('button', { type: 'button', class: 'ad-x', 'aria-label': s('close'), onclick: close }, '×'),
    h('p', { class: 'ad-kicker' }, s('kicker')),
    h('h2', {}, s('title')),
    message,
    email,
    trap,
    h('div', { class: 'fb-file' }, h('label', { class: 'ad-btn fb-attach' }, s('file'), fileInput), fileName, removeBtn),
    h('p', { class: 'fb-privacy' }, s('privacy')),
    status,
    h('div', { class: 'ad-actions' }, send),
  ) as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (message.value.trim().length < 2) {
      status.textContent = s('empty');
      message.focus();
      return;
    }
    send.disabled = true;
    status.textContent = s('sending');
    try {
      const body = JSON.stringify({
        message: message.value,
        email: email.value.trim(),
        website: trap.value,
        elapsed: Math.round(performance.now() - opened),
        lang: lang(),
        page: location.pathname,
        file: file ? { name: file.name, type: file.type, data: await toBase64(file) } : undefined,
      });
      const res = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json', 'x-amz-content-sha256': await sha256(body) }, body });
      if (!res.ok) throw new Error(String(res.status));
      form.replaceChildren(h('p', { class: 'ad-kicker' }, s('kicker')), h('h2', {}, s('thanks')), h('div', { class: 'ad-actions' }, h('button', { type: 'button', class: 'ad-btn', onclick: close }, s('close'))));
    } catch {
      status.textContent = s('failed');
      send.disabled = false;
    }
  });
  const panel: HTMLElement = h('div', { class: 'ad-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': s('title'), onclick: (e: Event) => e.target === panel && close() }, form);
  document.body.append(panel);
  addEventListener('keydown', esc);
  message.focus();
}
