import { infoView } from '../../../core/info-view';
import { strings } from '../../../core/i18n';
import type { OpenedView } from '../../../core/viewer';
import { TextSource } from './text-source';
import { nextPaint, readWithProgress, type Progress } from '../../../core/progress';

const s = strings({
  reading: { en: 'Reading the file…', zh: '正在读取文件…' },
  detecting: { en: 'Recognising the text encoding…', zh: '正在识别文字编码…' },
});

/**
 * Browsers can't hold more than about 500 million characters as one text, and big texts use
 * a lot of memory: larger files show one part (the start, or the end — where the newest log
 * lines are) with a notice. Phones get a smaller part.
 */
const isPhone = () => /iPhone|iPad|Android/i.test(navigator.userAgent) || (navigator as { deviceMemory?: number }).deviceMemory! <= 4;
export const textLimit = () => (isPhone() ? 64 : 256) * 1024 * 1024;

/** Which part of each large file the user chose to see (kept while the page is open). */
const partChoice = new WeakMap<File, 'start' | 'end'>();

/** Cut at a line break so no line (or multi-byte character) is split. */
function wholeLines(b: Uint8Array, fromEnd: boolean): Uint8Array {
  if (fromEnd) {
    const nl = b.indexOf(0x0a);
    return nl >= 0 && nl < 1 << 20 ? b.subarray(nl + 1) : b;
  }
  const nl = b.lastIndexOf(0x0a);
  return nl > b.length - (1 << 20) ? b.subarray(0, nl + 1) : b;
}

/**
 * Reads a file as text. When it is empty or turns out to be binary, returns
 * a ready view explaining that instead (so every text viewer behaves alike).
 */
export async function readText(file: File, mount: HTMLElement, reopen?: () => void, progress?: Progress): Promise<TextSource | OpenedView> {
  const limit = textLimit();
  const part = file.size > limit ? (partChoice.get(file) ?? 'start') : null;
  const blob = part ? file.slice(part === 'end' ? file.size - limit : 0, part === 'end' ? file.size : limit) : file;
  const raw = progress && blob.size > 8 * 1024 * 1024 ? await readWithProgress(blob, (f) => progress(s('reading'), f)) : await blob.arrayBuffer();
  if (progress && raw.byteLength > 8 * 1024 * 1024) {
    progress(s('detecting'));
    await nextPaint();
  }
  const bytes = part ? wholeLines(new Uint8Array(raw), part === 'end') : new Uint8Array(raw);
  // An empty file opens blank, so it can be edited (and saved as a copy) like any other.
  if (bytes.length === 0) return TextSource.empty();
  const src = await TextSource.fromBytes(bytes);
  if (!src) {
    mount.replaceChildren(infoView(file.size, bytes.subarray(0, 64 * 1024), null));
    return {};
  }
  if (part) {
    src.partial = {
      part,
      shown: bytes.length,
      total: file.size,
      toggle: reopen
        ? () => {
            partChoice.set(file, part === 'end' ? 'start' : 'end');
            reopen();
          }
        : undefined,
    };
  }
  return src;
}

export const isSource = (x: TextSource | OpenedView): x is TextSource => x instanceof TextSource;
