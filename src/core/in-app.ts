/**
 * Inside WeChat (and QQ / WeCom / DingTalk) the page runs in the app's own browser, which limits
 * choosing files and blocks saving. A small card at the top says how to open the page in the
 * phone's real browser (top-right ··· → Open in browser), with the link ready to copy.
 * Shown once per visit; can be closed.
 */
import { h } from './dom';
import { strings } from './i18n';

const s = strings({
  title: { en: 'Open in your browser', zh: '请在浏览器中打开' },
  text: {
    en: 'WeChat limits choosing and saving files. Tap ··· at the top right, then “Open in Browser”.',
    zh: '微信里选文件、保存文件会受限制。点右上角 ··· ，选择「在浏览器打开」。',
  },
  stay: { en: 'Stay here', zh: '继续在这里用' },
  copy: { en: 'Copy link', zh: '复制网址' },
  copied: { en: 'Copied — paste it into your browser', zh: '已复制，粘贴到浏览器打开' },
});

/** WeChat, WeCom, DingTalk, and QQ the app (it says " QQ/8.9…"; QQ Browser, a real browser, does not). */
export function inAppBrowser(ua = navigator.userAgent): boolean {
  return /MicroMessenger|wxwork|DingTalk/i.test(ua) || /\sQQ\/\d/.test(ua);
}

export function inAppNotice(): void {
  if (!inAppBrowser()) return;
  try {
    if (sessionStorage.getItem('fr.inapp') === 'closed') return;
  } catch {
    /* storage unavailable: show it */
  }
  const card = h(
    'div',
    { class: 'inapp-card', role: 'dialog', 'aria-label': s('title') },
    h('span', { class: 'inapp-arrow', 'aria-hidden': 'true' }, '↗'),
    h('strong', { class: 'inapp-title' }, s('title')),
    h('p', { class: 'inapp-text' }, s('text')),
    h(
      'div',
      { class: 'inapp-buttons' },
      copyButton(),
      h(
        'button',
        {
          type: 'button',
          class: 'inapp-stay',
          onclick: () => {
            card.remove();
            try {
              sessionStorage.setItem('fr.inapp', 'closed');
            } catch {
              /* ignore */
            }
          },
        },
        s('stay'),
      ),
    ),
  );
  document.body.append(card);
}

/** "Copy link": the site's address, to paste into Safari / Chrome (also where the clipboard API is missing). */
function copyButton(): HTMLButtonElement {
  const url = `${location.origin}/`;
  const btn = h('button', { type: 'button', class: 'inapp-copy' }, s('copy')) as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // Older in-app browsers: copy from a selected text box.
      const box = h('textarea', { readonly: true, style: 'position:fixed;top:0;left:0;opacity:0' }, url) as HTMLTextAreaElement;
      document.body.append(box);
      box.select();
      box.setSelectionRange(0, url.length);
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      box.remove();
    }
    // If copying failed, show the address itself to copy by hand.
    btn.textContent = ok ? s('copied') : url;
  });
  return btn;
}
