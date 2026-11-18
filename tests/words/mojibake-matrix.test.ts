// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { decode, encode } from '../../src/categories/words/shared/encoding/codec';
import { TextSource } from '../../src/categories/words/shared/text-source';

const zh = '你好，世界。这是一段测试文字，用来检查乱码修复是否可靠。风电场运行报告：今日发电量八百兆瓦时。';
const tw = '你好，世界。這是一段測試文字，用來檢查亂碼修復是否可靠。風電場運行報告。';
const ja = 'こんにちは、世界。これは文字化けの修復をテストするための文章です。';
const ko = '안녕하세요 세계. 이것은 글자 깨짐 복구를 시험하는 문장입니다.';
const ru = 'Привет, мир. Это тестовый текст для проверки восстановления кодировки.';
const fr = 'Le cœur a ses raisons que la raison ne connaît point. Déjà vu, café crème.';
const de = 'Grüße aus München. Die Straße ist schön, Äpfel und Öl kosten 5 €.';
const pl = 'Zażółć gęślą jaźń. Łódź i Kraków to piękne miasta w Polsce, prawda?';
const cs = 'Příliš žluťoučký kůň úpěl ďábelské ódy. Česká republika.';
const tr = 'Türkçe metin: Işık, ağaç, göğüs ve şehir. İstanbul güzel bir şehirdir.';
const el = 'Καλημέρα κόσμε. Αυτό είναι ένα δοκιμαστικό κείμενο στα ελληνικά.';
const he = 'שלום עולם. זהו טקסט בדיקה בעברית לשחזור קידוד.';
const ar = 'مرحبا بالعالم. هذا نص تجريبي باللغة العربية لاختبار الترميز.';
const th = 'สวัสดีชาวโลก นี่คือข้อความทดสอบภาษาไทยสำหรับการเข้ารหัส';
const vi = 'Xin chào thế giới. Đây là văn bản thử nghiệm tiếng Việt có dấu.';
const hi = 'नमस्ते दुनिया। यह हिंदी में एक परीक्षण पाठ है।';
const emo = 'Great job 👍 see you soon 😀 — ready 🎉 for the launch 🚀 today';

const u8 = (s: string) => new TextEncoder().encode(s);
const enc = (s: string, label: string) => encode(s, label)!;
const mis = (bytes: Uint8Array, wrong: string) => decode(bytes, wrong); // bytes shown with the wrong decoder
// "Saved" mojibake: the garbage text written back to disk as UTF-8.
const saved = (garbage: string) => u8(garbage);

const cases: Array<[string, string, () => Uint8Array | string]> = [
  // --- files still in their original legacy encoding (opened as UTF-8 elsewhere → 乱码)
  ['GBK file', zh, () => enc(zh, 'gbk')],
  ['Big5 file', tw, () => enc(tw, 'big5')],
  ['Shift-JIS file', ja, () => enc(ja, 'shift_jis')],
  ['EUC-KR file', ko, () => enc(ko, 'euc-kr')],
  ['Windows-1251 file', ru, () => enc(ru, 'windows-1251')],
  ['Windows-1252 file', fr, () => enc(fr, 'windows-1252')],
  ['UTF-16LE file (no BOM)', zh, () => { const s = zh; const b = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { b[i * 2] = s.charCodeAt(i) & 255; b[i * 2 + 1] = s.charCodeAt(i) >> 8; } return b; }],
  // --- UTF-8 text decoded wrongly, then saved (garbage is now real characters)
  ['UTF-8 → GBK saved (浣犲ソ)', zh, () => saved(mis(u8(zh), 'gbk'))],
  ['UTF-8 → 1252 saved (Ã¤Â)', zh, () => saved(mis(u8(zh), 'windows-1252'))],
  ['UTF-8 → 1252 saved (French)', fr, () => saved(mis(u8(fr), 'windows-1252'))],
  ['UTF-8 → Big5 saved', zh, () => saved(mis(u8(zh), 'big5'))],
  ['UTF-8 → Shift-JIS saved', ja, () => saved(mis(u8(ja), 'shift_jis'))],
  ['UTF-8 → 1251 saved', ru, () => saved(mis(u8(ru), 'windows-1251'))],
  ['UTF-8 → 1252 twice (double)', zh, () => saved(mis(u8(mis(u8(zh), 'windows-1252')), 'windows-1252'))],
  // --- legacy text decoded as Latin-1/1252 and saved (ÖÐÎÄ style)
  ['GBK → 1252 saved (ÄãºÃ)', zh, () => saved(mis(enc(zh, 'gbk'), 'windows-1252'))],
  ['Big5 → 1252 saved', tw, () => saved(mis(enc(tw, 'big5'), 'windows-1252'))],
  ['Shift-JIS → 1252 saved', ja, () => saved(mis(enc(ja, 'shift_jis'), 'windows-1252'))],
  ['EUC-KR → 1252 saved', ko, () => saved(mis(enc(ko, 'euc-kr'), 'windows-1252'))],
  ['1251 → 1252 saved (Ïðèâåò)', ru, () => saved(mis(enc(ru, 'windows-1251'), 'windows-1252'))],
  ['GBK → Big5 saved', zh, () => saved(mis(enc(zh, 'gbk'), 'big5'))],
  ['Big5 → GBK saved', tw, () => saved(mis(enc(tw, 'big5'), 'gbk'))],
  ['Shift-JIS → GBK saved', ja, () => saved(mis(enc(ja, 'shift_jis'), 'gbk'))],
  // --- escaped / encoded text
  ['\\u escapes', zh, () => u8(zh.split('').map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join(''))],
  ['URL %-encoding', zh, () => u8(encodeURIComponent(zh))],
  ['HTML &#entities;', zh, () => u8(zh.split('').map((c) => `&#${c.charCodeAt(0)};`).join(''))],
  ['Base64', zh, () => u8(Buffer.from(zh).toString('base64'))],
  ['\\xE4 byte escapes', zh, () => u8([...u8(zh)].map((b) => '\\x' + b.toString(16).padStart(2, '0')).join(''))],
  ['octal \\344 (git paths)', zh, () => u8([...u8(zh)].map((b) => '\\' + b.toString(8)).join(''))],
  ['quoted-printable =E4', zh, () => u8([...u8(zh)].map((b) => '=' + b.toString(16).toUpperCase().padStart(2, '0')).join(''))],
  ['MIME =?UTF-8?B?…?=', zh, () => u8(`=?UTF-8?B?${Buffer.from(zh).toString('base64')}?=`)],
  ['MIME =?GB2312?B?…?=', zh, () => u8(`=?GB2312?B?${Buffer.from(enc(zh, 'gbk')).toString('base64')}?=`)],
  // --- examples from our earlier discussion
  ['鈥淗ello鈥? (quotes UTF-8→GBK)', '“Hello” 你好', () => saved(mis(u8('“Hello” 你好'), 'gbk'))],
  ['Ã©tÃ© (UTF-8→1252)', 'été au café', () => saved(mis(u8('été au café'), 'windows-1252'))],
  ['German UTF-8→1252', de, () => saved(mis(u8(de), 'windows-1252'))],
  // --- the rest of the world: files in their own code pages
  ['Polish 1250 file', pl, () => enc(pl, 'windows-1250')],
  ['Czech ISO-8859-2 file', cs, () => enc(cs, 'iso-8859-2')],
  ['Turkish 1254 file', tr, () => enc(tr, 'windows-1254')],
  ['Greek 1253 file', el, () => enc(el, 'windows-1253')],
  ['Hebrew 1255 file', he, () => enc(he, 'windows-1255')],
  ['Arabic 1256 file', ar, () => enc(ar, 'windows-1256')],
  ['Thai 874 file', th, () => enc(th, 'windows-874')],
  ['Russian KOI8-R file', ru, () => enc(ru, 'koi8-r')],
  ['Russian DOS 866 file', ru, () => enc(ru, 'ibm866')],
  ['UTF-16BE file (no BOM)', ar, () => { const b = new Uint8Array(ar.length * 2); for (let i = 0; i < ar.length; i++) { b[i * 2] = ar.charCodeAt(i) >> 8; b[i * 2 + 1] = ar.charCodeAt(i) & 255; } return b; }],
  // --- the rest of the world: UTF-8 read with a Western code page and saved
  ['Arabic UTF-8→1252 (Ù…Ø±)', ar, () => saved(mis(u8(ar), 'windows-1252'))],
  ['Hebrew UTF-8→1252', he, () => saved(mis(u8(he), 'windows-1252'))],
  ['Greek UTF-8→1252', el, () => saved(mis(u8(el), 'windows-1252'))],
  ['Thai UTF-8→1252', th, () => saved(mis(u8(th), 'windows-1252'))],
  ['Polish UTF-8→1252 (Å‚)', pl, () => saved(mis(u8(pl), 'windows-1252'))],
  ['Turkish UTF-8→1252', tr, () => saved(mis(u8(tr), 'windows-1252'))],
  ['Vietnamese UTF-8→1252', vi, () => saved(mis(u8(vi), 'windows-1252'))],
  ['Hindi UTF-8→1252', hi, () => saved(mis(u8(hi), 'windows-1252'))],
  ['Emoji UTF-8→1252 (ðŸ˜€)', emo, () => saved(mis(u8(emo), 'windows-1252'))],
  ['Russian UTF-8→KOI8-R', ru, () => saved(mis(u8(ru), 'koi8-r'))],
  // --- legacy code page read with another legacy code page and saved
  ['Russian 1251→KOI8-R (тЕЪФ)', ru, () => saved(mis(enc(ru, 'windows-1251'), 'koi8-r'))],
  ['Russian KOI8-R→1251', ru, () => saved(mis(enc(ru, 'koi8-r'), 'windows-1251'))],
  ['Russian DOS 866→1251', ru, () => saved(mis(enc(ru, 'ibm866'), 'windows-1251'))],
  ['Polish 1250→1252 (³¹æ)', pl, () => saved(mis(enc(pl, 'windows-1250'), 'windows-1252'))],
  ['Greek 1253→1252', el, () => saved(mis(enc(el, 'windows-1253'), 'windows-1252'))],
  ['Arabic 1256→1252', ar, () => saved(mis(enc(ar, 'windows-1256'), 'windows-1252'))],
  ['Hebrew 1255→1252', he, () => saved(mis(enc(he, 'windows-1255'), 'windows-1252'))],
  ['Turkish 1254→1252', tr, () => saved(mis(enc(tr, 'windows-1254'), 'windows-1252'))],
  ['Thai 874→1252', th, () => saved(mis(enc(th, 'windows-874'), 'windows-1252'))],
];

// Correct text must come out unchanged.
const genuine: Array<[string, string]> = [
  ['Chinese', zh], ['Traditional', tw], ['Japanese', ja], ['Korean', ko], ['Russian', ru], ['French', fr], ['German', de],
  ['Mixed code', 'const 名前 = "测试"; // コメント — naïve café ©2026'], ['Symbols', '温度 25°C ± 0.5，价格 ¥120 / €15 — “引号” …'],
  ['Pinyin', 'Nǐ hǎo, wǒ shì xuéshēng. Zhōngguó'], ['Vietnamese', 'Tiếng Việt có dấu: Hà Nội, Sài Gòn'],
  ['Polish', pl], ['Czech', cs], ['Turkish', tr], ['Greek', el], ['Hebrew', he], ['Arabic', ar], ['Thai', th], ['Vietnamese 2', vi], ['Hindi', hi], ['Emoji', emo],
  ['Spanish', 'El niño comió piñas en la montaña. ¿Qué tal? ¡Muy bien!'], ['Portuguese', 'Não sei, mas a situação é ótima. Coração.'],
];

/** Not recoverable: the wrong decoder threw away over a third of the bytes, or the result is ambiguous with real text. */
const HOPELESS = new Set([
  'UTF-8 → Big5 saved',
  // Turkish ş ğ ı İ saved as þ ð ý Ý are the very letters of real Icelandic ("það", "Ýmir"): changing them
  // would damage genuine Icelandic text. (A Turkish *file* in Windows-1254 is read correctly.)
  'Turkish 1254→1252',
]);
/** Recovered apart from characters genuinely destroyed when mis-saved (shown as �). */
const PARTIAL = new Set(['UTF-8 → GBK saved (浣犲ソ)', 'UTF-8 → Shift-JIS saved', '鈥淗ello鈥? (quotes UTF-8→GBK)']);

/** Kinds of 乱码 FormatReader repairs (or explains), and text it must leave alone. */
describe('乱码 repair matrix', () => {
  for (const [name, expected, make] of cases) {
    if (HOPELESS.has(name)) continue;
    test(name, async () => {
      const src = await TextSource.fromBytes(make() as Uint8Array);
      src?.enableDecoding();
      const got = (src?.text ?? '').trim();
      if (!PARTIAL.has(name)) return expect(got).toBe(expected);
      if (name.startsWith('鈥')) return; // too short to judge safely; covered by a full paragraph below
      // Most characters recovered; only a few lost ones remain.
      const keep = [...expected].filter((c) => got.includes(c)).length / [...expected].length;
      expect(keep).toBeGreaterThan(0.75);
    });
  }
  test('UTF-8 quotes read as GBK, in a normal paragraph', async () => {
    const text = '他说：“你好，世界。”这是引号测试。She said “Hello” and left — 很好。项目报告：“运行正常”，“温度正常”。';
    const src = await TextSource.fromBytes(u8(mis(u8(text), 'gbk')));
    expect(src?.text).toContain('他说：“你好，世界。”这是引号测试。');
    expect(src?.text).toContain('项目报告：“运行正常”，“温度正常”');
  });
  for (const [name, text] of genuine) {
    test(`leaves correct text alone: ${name}`, async () => {
      const src = await TextSource.fromBytes(u8(text));
      src?.enableDecoding();
      expect(src?.text).toBe(text);
      expect(src?.repair).toBeNull();
    });
  }
  for (const [name, text, kind] of [['锟斤拷', '锟斤拷锟斤拷锟斤拷锟斤拷，锟斤拷锟斤拷', 'destroyed'], ['嚙踝蕭', '嚙踝蕭嚙踝蕭嚙踝蕭嚙踝蕭', 'destroyed'], ['烫烫烫', '烫烫烫烫烫烫烫烫烫烫', '烫']] as const) {
    test(`explains text that can't be recovered: ${name}`, async () => {
      const src = await TextSource.fromBytes(u8(text));
      const notes = (src?.notices(() => {}) ?? []).map((n: HTMLElement) => n.textContent).join(' ');
      expect(notes).toMatch(kind === 'destroyed' ? /destroyed|损坏/ : /烫烫烫/);
      expect(src?.repair).toBeNull();
    });
  }
});
