/**
 * Password-protected Word / Excel / PowerPoint: asks for the password, decrypts on this
 * computer (decrypt.ts), then opens the result in the normal viewer. Nothing is sent anywhere
 * and the file itself is not changed.
 */
import './locked.css';
import { h } from '../../../core/dom';
import { strings } from '../../../core/i18n';
import type { OpenContext, OpenedView } from '../../../core/viewer';

const s = strings({
  title: { en: 'This file is password-protected', zh: '这个文件设置了打开密码' },
  note: { en: 'Enter its password to open it here. The password and the file stay on this computer.', zh: '输入密码即可在这里打开。密码和文件都只留在这台电脑上。' },
  password: { en: 'Password', zh: '密码' },
  open: { en: 'Open', zh: '打开' },
  working: { en: 'Unlocking…', zh: '正在解密…' },
  wrong: { en: 'That password is not right. Passwords are case-sensitive.', zh: '密码不正确。密码区分大小写。' },
  failed: { en: 'This file could not be unlocked:', zh: '无法解密这个文件：' },
});

export async function open(file: File, ctx: OpenContext): Promise<OpenedView> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const input = h('input', { type: 'password', class: 'locked-input', autocomplete: 'off', 'aria-label': s('password'), placeholder: s('password') }) as HTMLInputElement;
  const msg = h('p', { class: 'locked-msg', role: 'alert' });
  const button = h('button', { type: 'submit', class: 'btn btn-primary' }, s('open')) as HTMLButtonElement;
  const form = h(
    'form',
    {
      class: 'locked-card',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        if (!input.value) return input.focus();
        button.disabled = true;
        msg.textContent = s('working');
        try {
          const { decryptOffice } = await import('./decrypt');
          const plain = await decryptOffice(bytes, input.value);
          // The unlocked copy (in memory only) opens in the right viewer, in place of this one.
          ctx.openFile(new File([plain as BlobPart], file.name, { lastModified: file.lastModified }), { replace: true });
        } catch (err) {
          msg.textContent = (err as Error)?.name === 'WrongPassword' ? s('wrong') : `${s('failed')} ${String((err as Error)?.message ?? err)}`;
          button.disabled = false;
          input.select();
        }
      },
    },
    h('div', { class: 'locked-icon', 'aria-hidden': 'true' }, '🔒'),
    h('h2', {}, s('title')),
    h('p', { class: 'locked-note' }, s('note')),
    h('div', { class: 'locked-row' }, input, button),
    msg,
  );
  ctx.mount.replaceChildren(h('div', { class: 'view view-locked' }, form));
  setTimeout(() => input.focus(), 0);
  return { meta: () => [s('title')] };
}
