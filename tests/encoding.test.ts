import { describe, expect, test } from 'vitest';
import { decode, encode } from '../src/words/encoding/codec';
import { detectEncoding, isBinaryResult, type EncodingResult } from '../src/words/encoding/detect';
import { repairMojibake } from '../src/words/encoding/mojibake';

const SAMPLES: Array<[name: string, label: string, text: string]> = [
  ['Simplified Chinese (long)', 'gb18030', '第一章 少年\n\n天色渐渐暗了下来，远处的山峦被晚霞染成了一片金红色。少年站在村口，望着那条通往外面世界的小路，心中充满了期待。他知道，总有一天，他会离开这里。'],
  ['Simplified Chinese (short)', 'gb18030', '你好，世界！这是一个测试。'],
  ['Traditional Chinese', 'big5', '第一章 少年\n\n天色漸漸暗了下來，遠處的山巒被晚霞染成了一片金紅色。少年站在村口，望著那條通往外面世界的小路，心中充滿了期待。'],
  ['Japanese', 'shift_jis', '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。'],
  ['Korean', 'euc-kr', '대한민국은 민주공화국이다. 대한민국의 주권은 국민에게 있고, 모든 권력은 국민으로부터 나온다.'],
  ['Russian (1251)', 'windows-1251', 'Все счастливые семьи похожи друг на друга, каждая несчастливая семья несчастлива по-своему. Всё смешалось в доме Облонских.'],
  ['Russian (KOI8-R)', 'koi8-r', 'Все счастливые семьи похожи друг на друга, каждая несчастливая семья несчастлива по-своему. Всё смешалось в доме Облонских.'],
  ['French', 'windows-1252', 'Le cœur a ses raisons que la raison ne connaît point. Ça a été très difficile, n’est-ce pas ? Où est la bibliothèque ?'],
  ['Greek', 'windows-1253', 'Η γλώσσα μου έδωσαν ελληνική· το σπίτι φτωχικό στις αμμουδιές του Ομήρου. Μονάχη έγνοια η γλώσσα μου.'],
  ['Hebrew', 'windows-1255', 'בראשית ברא אלהים את השמים ואת הארץ. והארץ היתה תהו ובהו וחשך על פני תהום ורוח אלהים מרחפת על פני המים.'],
  ['Arabic', 'windows-1256', 'في البدء كان الكلمة، والكلمة كان عند الله، وكان الكلمة الله. هذا كان في البدء عند الله.'],
  ['Thai', 'windows-874', 'ภาษาไทยเป็นภาษาราชการของประเทศไทย และเป็นภาษาแม่ของชาวไทย ใช้ตัวอักษรไทยในการเขียน'],
];

async function asText(p: ReturnType<typeof detectEncoding>): Promise<EncodingResult> {
  const r = await p;
  if (isBinaryResult(r)) throw new Error('detected as binary');
  return r;
}

describe('legacy encodings', () => {
  for (const [name, label, text] of SAMPLES) {
    test(name, async () => {
      const bytes = encode(text, label);
      expect(bytes, 'test data encodes').not.toBeNull();
      const r = await asText(detectEncoding(bytes!));
      // Some encodings are interchangeable for a given text (e.g. 1251 vs mac-cyrillic):
      // what matters is that the decoded text is right.
      expect(decode(bytes!, r.encoding)).toBe(text);
    });
  }
});

describe('unicode', () => {
  test('UTF-8 without BOM', async () => {
    const r = await asText(detectEncoding(new TextEncoder().encode('混合 text — ünïcödé 😀')));
    expect(r.encoding).toBe('utf-8');
    expect(r.reason).toBe('utf8');
  });

  test('UTF-8 with BOM', async () => {
    const body = new TextEncoder().encode('名字,年龄\n张三,30');
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...body]);
    const r = await asText(detectEncoding(bytes));
    expect(r).toMatchObject({ encoding: 'utf-8', reason: 'bom', bomLength: 3 });
  });

  test('UTF-16 LE with BOM', async () => {
    const s = 'Hello 你好';
    const bytes = new Uint8Array(2 + s.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      bytes[2 + i * 2] = c & 0xff;
      bytes[3 + i * 2] = c >> 8;
    }
    const r = await asText(detectEncoding(bytes));
    expect(r).toMatchObject({ encoding: 'utf-16le', bomLength: 2 });
  });

  test('UTF-16 LE without BOM (mostly ASCII)', async () => {
    const s = 'Windows registry export\r\nKey=Value\r\nAnother=Line\r\n';
    const bytes = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) bytes[i * 2] = s.charCodeAt(i);
    expect((await asText(detectEncoding(bytes))).encoding).toBe('utf-16le');
  });

  test('pure ASCII', async () => {
    expect((await asText(detectEncoding(new TextEncoder().encode('just ascii\n')))).reason).toBe('ascii');
  });

  test('UTF-8 cut in the middle of a character is still UTF-8', async () => {
    const big = new TextEncoder().encode('中文'.repeat(200000)); // > sample size
    expect((await asText(detectEncoding(big))).encoding).toBe('utf-8');
  });
});

describe('binary', () => {
  test('PNG header is binary', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0]);
    expect(isBinaryResult(await detectEncoding(png))).toBe(true);
  });
});

describe('mojibake repair', () => {
  test('UTF-8 read as GBK and saved (浣犲ソ)', async () => {
    const original = '你好，世界！这是一段被错误保存的中文。';
    const garbled = decode(new TextEncoder().encode(original), 'gb18030');
    expect(garbled).not.toBe(original);
    const r = repairMojibake(garbled);
    expect(r?.text.replace(/�/g, '')).toContain('这是一段被错误保存的中文');
    expect(r?.layers).toEqual(['gb18030']);
  });

  test('UTF-8 read as Windows-1252 and saved (cafÃ©)', async () => {
    const original = 'Café crème, naïve résumé — “quotes”';
    const garbled = decode(new TextEncoder().encode(original), 'windows-1252');
    expect(repairMojibake(garbled)?.text).toBe(original);
  });

  test('twice double-encoded', async () => {
    const original = 'Zoë’s café';
    const once = decode(new TextEncoder().encode(original), 'windows-1252');
    const twice = decode(new TextEncoder().encode(once), 'windows-1252');
    const r = repairMojibake(twice);
    expect(r?.text).toBe(original);
    expect(r?.layers.length).toBe(2);
  });

  test('genuine text is left alone', async () => {
    for (const s of ['你好，世界！这是正常的中文。', 'Café crème brûlée', 'Привет, мир', 'こんにちは世界', '正體中文測試，沒有問題。']) {
      expect(repairMojibake(s), s).toBeNull();
    }
  });
});
