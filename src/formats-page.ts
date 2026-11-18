/** formats.html: language (same rule as the app) and the extension search. */
import './style.css';
import './formats-page.css';
import { lang } from './core/i18n';
import { registerOffline } from './offline/register';

if (lang() === 'zh') {
  document.documentElement.lang = 'zh';
  for (const el of document.querySelectorAll<HTMLElement>('[data-zh]')) el.textContent = el.dataset.zh!;
  const search = document.querySelector<HTMLInputElement>('.fmt-search');
  if (search?.dataset.placeholderZh) search.placeholder = search.dataset.placeholderZh;
  document.title = '支持的格式 — FormatReader';
}

const search = document.querySelector<HTMLInputElement>('.fmt-search')!;
const none = document.querySelector<HTMLElement>('.fmt-none')!;
search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase().replace(/^\*?\./, '');
  let any = false;
  for (const cat of document.querySelectorAll<HTMLElement>('.fmt-cat')) {
    let catHit = false;
    for (const group of cat.querySelectorAll<HTMLElement>('.fmt-group')) {
      let hit = !q || (group.querySelector('.fmt-name')?.textContent ?? '').toLowerCase().includes(q);
      for (const ext of group.querySelectorAll<HTMLElement>('.fmt-ext')) {
        const match = !!q && ext.textContent!.slice(1).startsWith(q);
        ext.classList.toggle('fmt-hit', match);
        hit ||= match;
      }
      group.hidden = !hit;
      catHit ||= hit;
    }
    cat.hidden = !catHit;
    if (catHit && !cat.classList.contains('fmt-coming')) any = true;
  }
  none.hidden = !q || any;
});

registerOffline();
