export type Lang = 'en' | 'zh';

const STRINGS = {
  // Shell-level strings only (the info card). Viewers declare their own with strings().
  catWords: { en: 'Words', zh: '文字' },
  catImages: { en: 'Images', zh: '图片' },
  catDrawings: { en: 'Drawings', zh: '图纸' },
  catSounds: { en: 'Sounds', zh: '音频' },
  catVideos: { en: 'Videos', zh: '视频' },
  recognized: { en: 'Recognised as', zh: '识别为' },
  notYet: {
    en: 'The viewer for this format is on the way. FormatReader will open it in a coming update.',
    zh: '这个格式的查看器正在开发中，后续版本会支持。',
  },
  notYetCategory: {
    en: 'This category is coming after Words. The file was identified correctly.',
    zh: '这一类会在“文字”之后支持。文件类型已正确识别。',
  },
  unknown: { en: 'Unknown binary file', zh: '未知的二进制文件' },
  unknownNote: {
    en: 'This is not a text file and its format is not recognised yet. Here is what can be read from it.',
    zh: '这不是文本文件，格式暂时无法识别。下面是能从中读出的信息。',
  },
  size: { en: 'Size', zh: '大小' },
  type: { en: 'Type', zh: '类型' },
  category: { en: 'Category', zh: '类别' },
  firstBytes: { en: 'First bytes', zh: '开头字节' },
  foundText: { en: 'Readable text found inside', zh: '文件中可读的文字' },
  noText: { en: 'No readable text found.', zh: '没有找到可读的文字。' },
  drm: {
    en: 'Kindle KFX/AZW books bought from a store are usually DRM-protected and can only be opened in Kindle apps.',
    zh: '从商店购买的 Kindle KFX/AZW 电子书通常有 DRM 加密，只能用 Kindle 应用打开。',
  },
} as const;

export type StringKey = keyof typeof STRINGS;

/** The interface follows the browser's language: Chinese browsers get Chinese, others English. */
function initialLang(): Lang {
  const langs = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  return /^zh/i.test(langs[0] ?? '') ? 'zh' : 'en';
}

let current: Lang = initialLang();
const listeners = new Set<() => void>();

export const lang = () => current;
export const t = (key: StringKey) => STRINGS[key][current];

export function setLang(next: Lang) {
  current = next;
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void) {
  listeners.add(fn);
}

/**
 * Per-module translations: each viewer module declares its own strings, so
 * editing one module's wording never touches another module or the shell.
 *   const s = strings({ rows: { en: 'rows', zh: '行' } });  s('rows')
 */
export function strings<K extends string>(dict: Record<K, { en: string; zh: string }>): (key: K) => string {
  return (key) => dict[key][current];
}
