import type { Category, FormatInfo } from './detect-format';
import { formatBytes, h } from './dom';
import { t, type StringKey } from './i18n';

const CATEGORY_KEY: Record<Category, StringKey | null> = {
  words: 'catWords',
  images: 'catImages',
  drawings: 'catDrawings',
  sounds: 'catSounds',
  videos: 'catVideos',
  archives: null,
  other: null,
};

/** Printable runs of text inside a binary file (ASCII and UTF-16LE), like the `strings` tool. */
export function extractStrings(bytes: Uint8Array, minLen = 6, max = 200): string[] {
  const out: string[] = [];
  const n = Math.min(bytes.length, 2 * 1024 * 1024);
  let run = '';
  for (let i = 0; i < n && out.length < max; i++) {
    const b = bytes[i];
    if (b >= 0x20 && b < 0x7f) run += String.fromCharCode(b);
    else {
      if (run.length >= minLen) out.push(run);
      run = '';
    }
  }
  if (run.length >= minLen && out.length < max) out.push(run);
  return out;
}

function hexDump(bytes: Uint8Array, length = 256): string {
  const lines: string[] = [];
  for (let off = 0; off < Math.min(bytes.length, length); off += 16) {
    const row = bytes.subarray(off, off + 16);
    const hex = [...row].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const asc = [...row].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·')).join('');
    lines.push(`${off.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${asc}`);
  }
  return lines.join('\n');
}

export function infoView(fileSize: number, head: Uint8Array, format: FormatInfo | null): HTMLElement {
  const catKey = format ? CATEGORY_KEY[format.category] : null;
  const strings = format ? [] : extractStrings(head);
  const isLaterCategory = format && format.category !== 'words';

  const rows: Array<[string, string]> = [[t('size'), formatBytes(fileSize)]];
  if (format) rows.unshift([t('type'), format.name]);
  if (catKey) rows.push([t('category'), t(catKey)]);

  return h(
    'div',
    { class: 'view view-info' },
    h(
      'div',
      { class: 'info-card' },
      h('div', { class: 'info-kicker' }, format ? t('recognized') : t('unknown')),
      h('h2', {}, format ? format.name : t('unknown')),
      h('p', { class: 'info-note' }, format ? (isLaterCategory ? t('notYetCategory') : t('notYet')) : t('unknownNote')),
      format && (format.id === 'kfx' || format.id === 'azw') ? h('p', { class: 'info-note' }, t('drm')) : null,
      h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    ),
    !format
      ? h(
          'section',
          { class: 'info-section' },
          h('h3', {}, t('foundText')),
          strings.length ? h('pre', { class: 'strings' }, strings.join('\n')) : h('p', { class: 'muted' }, t('noText')),
        )
      : null,
    // Raw bytes only help when we couldn't tell what the file is.
    !format ? h('section', { class: 'info-section' }, h('h3', {}, t('firstBytes')), h('pre', { class: 'hex', dir: 'ltr' }, hexDump(head))) : null,
  );
}

/** A simple centred card with a title and a sentence (empty files, viewer errors). */
export function messageView(title: string, note: string): HTMLElement {
  return h('div', { class: 'view view-info' }, h('div', { class: 'info-card' }, h('h2', {}, title), h('p', { class: 'info-note' }, note)));
}
