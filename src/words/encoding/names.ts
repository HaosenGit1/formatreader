/** Human-friendly names for the encodings we can decode (WHATWG labels). */
export interface EncodingChoice {
  label: string;
  en: string;
  zh: string;
}

export const ENCODING_CHOICES: EncodingChoice[] = [
  { label: 'utf-8', en: 'UTF-8 (Unicode)', zh: 'UTF-8（Unicode）' },
  { label: 'utf-16le', en: 'UTF-16 LE (Unicode)', zh: 'UTF-16 LE（Unicode）' },
  { label: 'utf-16be', en: 'UTF-16 BE (Unicode)', zh: 'UTF-16 BE（Unicode）' },
  { label: 'gb18030', en: 'GBK / GB18030 — Simplified Chinese', zh: 'GBK / GB18030 — 简体中文' },
  { label: 'big5', en: 'Big5 — Traditional Chinese', zh: 'Big5 — 繁体中文' },
  { label: 'shift_jis', en: 'Shift_JIS — Japanese', zh: 'Shift_JIS — 日文' },
  { label: 'euc-jp', en: 'EUC-JP — Japanese', zh: 'EUC-JP — 日文' },
  { label: 'iso-2022-jp', en: 'ISO-2022-JP — Japanese', zh: 'ISO-2022-JP — 日文' },
  { label: 'euc-kr', en: 'EUC-KR / CP949 — Korean', zh: 'EUC-KR / CP949 — 韩文' },
  { label: 'windows-1251', en: 'Windows-1251 — Cyrillic', zh: 'Windows-1251 — 西里尔文' },
  { label: 'koi8-r', en: 'KOI8-R — Russian', zh: 'KOI8-R — 俄文' },
  { label: 'koi8-u', en: 'KOI8-U — Ukrainian', zh: 'KOI8-U — 乌克兰文' },
  { label: 'ibm866', en: 'CP866 — Cyrillic (DOS)', zh: 'CP866 — 西里尔文（DOS）' },
  { label: 'x-mac-cyrillic', en: 'Mac Cyrillic', zh: 'Mac 西里尔文' },
  { label: 'windows-1252', en: 'Windows-1252 — Western European', zh: 'Windows-1252 — 西欧' },
  { label: 'windows-1250', en: 'Windows-1250 — Central European', zh: 'Windows-1250 — 中欧' },
  { label: 'windows-1253', en: 'Windows-1253 — Greek', zh: 'Windows-1253 — 希腊文' },
  { label: 'windows-1254', en: 'Windows-1254 — Turkish', zh: 'Windows-1254 — 土耳其文' },
  { label: 'windows-1255', en: 'Windows-1255 — Hebrew', zh: 'Windows-1255 — 希伯来文' },
  { label: 'windows-1256', en: 'Windows-1256 — Arabic', zh: 'Windows-1256 — 阿拉伯文' },
  { label: 'windows-1257', en: 'Windows-1257 — Baltic', zh: 'Windows-1257 — 波罗的海' },
  { label: 'windows-1258', en: 'Windows-1258 — Vietnamese', zh: 'Windows-1258 — 越南文' },
  { label: 'windows-874', en: 'Windows-874 / TIS-620 — Thai', zh: 'Windows-874 / TIS-620 — 泰文' },
  { label: 'iso-8859-2', en: 'ISO-8859-2 — Central European', zh: 'ISO-8859-2 — 中欧' },
  { label: 'iso-8859-5', en: 'ISO-8859-5 — Cyrillic', zh: 'ISO-8859-5 — 西里尔文' },
  { label: 'iso-8859-6', en: 'ISO-8859-6 — Arabic', zh: 'ISO-8859-6 — 阿拉伯文' },
  { label: 'iso-8859-7', en: 'ISO-8859-7 — Greek', zh: 'ISO-8859-7 — 希腊文' },
  { label: 'iso-8859-8', en: 'ISO-8859-8 — Hebrew', zh: 'ISO-8859-8 — 希伯来文' },
  { label: 'iso-8859-13', en: 'ISO-8859-13 — Baltic', zh: 'ISO-8859-13 — 波罗的海' },
  { label: 'iso-8859-15', en: 'ISO-8859-15 — Western European (€)', zh: 'ISO-8859-15 — 西欧（€）' },
  { label: 'macintosh', en: 'Mac Roman', zh: 'Mac Roman' },
];

export function encodingName(label: string, lang: 'en' | 'zh'): string {
  const c = ENCODING_CHOICES.find((e) => e.label === label);
  return c ? c[lang] : label.toUpperCase();
}

/** Map detector output names (jschardet / chardet style) to WHATWG labels. */
const ALIASES: Record<string, string> = {
  ascii: 'utf-8',
  'utf-8': 'utf-8',
  'utf-8-sig': 'utf-8',
  'utf-16': 'utf-16le',
  'utf-16le': 'utf-16le',
  'utf-16be': 'utf-16be',
  gb2312: 'gb18030',
  gbk: 'gb18030',
  gb18030: 'gb18030',
  hz: 'gb18030',
  big5: 'big5',
  'big5-hkscs': 'big5',
  cp950: 'big5',
  shift_jis: 'shift_jis',
  'shift-jis': 'shift_jis',
  cp932: 'shift_jis',
  sjis: 'shift_jis',
  'euc-jp': 'euc-jp',
  'iso-2022-jp': 'iso-2022-jp',
  'euc-kr': 'euc-kr',
  cp949: 'euc-kr',
  uhc: 'euc-kr',
  'koi8-r': 'koi8-r',
  'koi8-u': 'koi8-u',
  ibm866: 'ibm866',
  cp866: 'ibm866',
  maccyrillic: 'x-mac-cyrillic',
  'x-mac-cyrillic': 'x-mac-cyrillic',
  macroman: 'macintosh',
  tis620: 'windows-874',
  'tis-620': 'windows-874',
  cp874: 'windows-874',
  'iso-8859-11': 'windows-874',
  'iso-8859-1': 'windows-1252',
  'iso-8859-9': 'windows-1254',
};

/** Normalise a detector name to a label TextDecoder accepts, or null. */
export function toWhatwgLabel(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.toLowerCase().replace(/_/g, '-').replace(/^cp-/, 'cp');
  const mapped =
    ALIASES[key] ??
    ALIASES[name.toLowerCase()] ??
    (/^windows-12(5[0-8])$/.test(key) ? key : null) ??
    (/^iso-8859-\d+$/.test(key) ? key : null);
  if (!mapped) return null;
  try {
    new TextDecoder(mapped);
    return mapped;
  } catch {
    return null;
  }
}
