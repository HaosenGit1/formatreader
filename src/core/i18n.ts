export type Lang = 'en' | 'zh';

const STRINGS = {
  tagline: { en: 'Drop any file. It just opens.', zh: '任何文件，拖进来就能看。' },
  dropTitle: { en: 'Drop a file here', zh: '把文件拖到这里' },
  dropOr: { en: 'or', zh: '或' },
  choose: { en: 'Choose a file', zh: '选择文件' },
  pasteHint: { en: 'You can also paste text with ⌘V / Ctrl+V', zh: '也可以直接粘贴文字（⌘V / Ctrl+V）' },
  privacy: { en: 'Files never leave your device — nothing is uploaded.', zh: '文件只在你的电脑上打开，不会上传。' },
  dropOverlay: { en: 'Drop to open', zh: '松开即可打开' },
  catWords: { en: 'Words', zh: '文字' },
  catImages: { en: 'Images', zh: '图片' },
  catDrawings: { en: 'Drawings', zh: '图纸' },
  catSounds: { en: 'Sounds', zh: '音频' },
  catVideos: { en: 'Videos', zh: '视频' },
  available: { en: 'available', zh: '可用' },
  soon: { en: 'coming soon', zh: '即将支持' },
  openAnother: { en: 'Open another', zh: '换个文件' },
  encoding: { en: 'Encoding', zh: '编码' },
  auto: { en: 'Auto', zh: '自动' },
  wrap: { en: 'Wrap', zh: '换行' },
  rendered: { en: 'Rendered', zh: '预览' },
  source: { en: 'Source', zh: '源码' },
  pasted: { en: 'Pasted text', zh: '粘贴的文字' },
  reading: { en: 'Opening…', zh: '正在打开…' },
  // Encoding notes
  whyBom: { en: 'Encoding marked inside the file:', zh: '文件内标明的编码：' },
  whyAscii: { en: 'Plain ASCII text', zh: '纯 ASCII 文本' },
  whyUtf8: { en: 'Detected', zh: '检测为' },
  whyStat: { en: 'Detected', zh: '检测为' },
  whyFallback: { en: 'Best guess:', zh: '最可能是：' },
  legacyNote: {
    en: 'Apps that assume UTF-8 show this file as garbled text — here it is decoded correctly.',
    zh: '默认用 UTF-8 打开的软件会把这个文件显示成乱码，这里已按正确编码显示。',
  },
  lowConfidence: { en: 'Not sure? Try another encoding from the list.', zh: '不确定？可以在列表里换一种编码试试。' },
  repaired: {
    en: 'This text had been garbled and saved that way. It was repaired automatically.',
    zh: '这段文字之前被错误编码并保存过，已自动修复。',
  },
  lostChar: {
    en: 'character (shown as �) was already destroyed in the file and cannot be recovered.',
    zh: '个字符（显示为 �）在文件里已经损坏，无法恢复。',
  },
  lostChars: {
    en: 'characters (shown as �) were already destroyed in the file and cannot be recovered.',
    zh: '个字符（显示为 �）在文件里已经损坏，无法恢复。',
  },
  showOriginal: { en: 'Show original', zh: '查看原文' },
  showRepaired: { en: 'Show repaired', zh: '查看修复后' },
  invalidJson: { en: 'This JSON has an error, shown as-is:', zh: 'JSON 有错误，按原样显示：' },
  rows: { en: 'rows', zh: '行' },
  columns: { en: 'columns', zh: '列' },
  lines: { en: 'lines', zh: '行' },
  cues: { en: 'subtitles', zh: '条字幕' },
  showMore: { en: 'Show more', zh: '显示更多' },
  // Info view
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
  empty: { en: 'This file is empty.', zh: '这个文件是空的。' },
  failed: { en: 'Could not open this file:', zh: '无法打开这个文件：' },
  drm: {
    en: 'Kindle KFX/AZW books bought from a store are usually DRM-protected and can only be opened in Kindle apps.',
    zh: '从商店购买的 Kindle KFX/AZW 电子书通常有 DRM 加密，只能用 Kindle 应用打开。',
  },
  fullscreen: { en: 'Full screen', zh: '全屏' },
  exitFullscreen: { en: 'Exit full screen', zh: '退出全屏' },
  present: { en: 'Present', zh: '放映' },
  slides: { en: 'slides', zh: '页幻灯片' },
  showHint: { en: '← → or click to move · Esc to exit', zh: '← → 或点击翻页 · Esc 退出' },
  contents: { en: 'Contents', zh: '目录' },
  noContents: { en: 'This book has no table of contents.', zh: '这本书没有目录。' },
  progress: { en: 'Reading progress', zh: '阅读进度' },
  prevPage: { en: 'Previous page', zh: '上一页' },
  nextPage: { en: 'Next page', zh: '下一页' },
  pages: { en: 'Pages', zh: '翻页' },
  scroll: { en: 'Scroll', zh: '滚动' },
  book: { en: 'Book', zh: '电子书' },
  fontSmaller: { en: 'Smaller text', zh: '缩小文字' },
  fontLarger: { en: 'Larger text', zh: '放大文字' },
  language: { en: '中文', zh: 'English' },
} as const;

export type StringKey = keyof typeof STRINGS;

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('fr.lang');
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && /^zh/i.test(navigator.language) ? 'zh' : 'en';
}

let current: Lang = initialLang();
const listeners = new Set<() => void>();

export const lang = () => current;
export const t = (key: StringKey) => STRINGS[key][current];

export function setLang(next: Lang) {
  current = next;
  try {
    localStorage.setItem('fr.lang', next);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void) {
  listeners.add(fn);
}
