import { describe, expect, test } from 'vitest';
import { encode } from '../../src/categories/words/shared/encoding/codec';
import { fastLegacy } from '../../src/categories/words/shared/encoding/fast';

const enc = (text: string, label: string) => {
  const b = encode(text, label);
  if (!b) throw new Error(`cannot encode for ${label}`);
  return b;
};

const ZH_S = '第一章 少年\n\n天色渐渐暗了下来，远处的山峦被晚霞染成了一片金红色。少年站在村口，望着那条通往外面世界的小路，心中充满了期待。';
const ZH_T = '第一章 少年\n\n天色漸漸暗了下來，遠處的山巒被晚霞染成了一片金紅色。少年站在村口，望著那條通往外面世界的小路，心中充滿了期待。';
const JA = '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。';
const KO = '대한민국은 민주공화국이다. 대한민국의 주권은 국민에게 있고, 모든 권력은 국민으로부터 나온다.';
const RU = 'Все счастливые семьи похожи друг на друга, каждая несчастливая семья несчастлива по-своему.';
const FR = 'Le cœur a ses raisons que la raison ne connaît point. Ça a été très difficile, n’est-ce pas ?';
const PL = 'Zażółć gęślą jaźń. Pchnąć w tę łódź jeża lub ośm skrzyń fig. Łódź jest piękna.';
const TR = 'Pijamalı hasta yağız şoföre çabucak güvendi. İstanbul çok güzel bir şehir.';

describe('fast path decides clear cases', () => {
  test.each([
    ['Simplified Chinese (GBK)', ZH_S, 'gbk', 'gb18030'],
    ['Simplified Chinese, short', '你好，世界！这是一个测试，我们的项目很好。', 'gbk', 'gb18030'],
    ['Traditional Chinese (Big5)', ZH_T, 'big5', 'big5'],
    ['Japanese (Shift_JIS)', JA, 'shift_jis', 'shift_jis'],
    ['Japanese (EUC-JP)', JA, 'euc-jp', 'euc-jp'],
    ['Korean (EUC-KR)', KO, 'euc-kr', 'euc-kr'],
    ['French (Windows-1252)', FR, 'windows-1252', 'windows-1252'],
    ['Russian (Windows-1251)', RU, 'windows-1251', 'windows-1251'],
    ['Russian (KOI8-R)', RU, 'koi8-r', 'koi8-r'],
    ['Russian (CP866, DOS)', RU, 'ibm866', 'ibm866'],
  ])('%s', (_name, text, label, expected) => {
    expect(fastLegacy(enc(text, label))?.encoding).toBe(expected);
  });
});

describe('fast path stays out of unclear cases (falls back to the full detector)', () => {
  test.each([
    ['Polish (Windows-1250)', PL, 'windows-1250'],
    ['Greek (Windows-1253)', 'Η γλώσσα μου έδωσαν ελληνική· το σπίτι φτωχικό στις αμμουδιές του Ομήρου.', 'windows-1253'],
    ['Arabic (Windows-1256)', 'في البدء كان الكلمة، والكلمة كان عند الله، وكان الكلمة الله.', 'windows-1256'],
    ['Hebrew (Windows-1255)', 'בראשית ברא אלהים את השמים ואת הארץ. והארץ היתה תהו ובהו.', 'windows-1255'],
    ['Short Russian', 'Привет мир', 'windows-1251'],
    ['Turkish (Windows-1254)', TR, 'windows-1254'],
    ['Very short Chinese', '你好', 'gbk'],
  ])('%s → null', (_name, text, label) => {
    expect(fastLegacy(enc(text, label))).toBeNull();
  });

  test('never mistakes Big5 for GBK or the reverse', () => {
    expect(fastLegacy(enc(ZH_T, 'big5'))?.encoding).not.toBe('gb18030');
    expect(fastLegacy(enc(ZH_S, 'gbk'))?.encoding).not.toBe('big5');
  });
});

describe('Korean vs Chinese (they share byte ranges)', () => {
  test('a GBK spreadsheet export is not taken for Korean', () => {
    const csv = '日期,地区,产品,数量,金额\n2026-01-03,北京,风机叶片,12,1240000\n2026-01-05,上海,齿轮箱,4,860000\n2026-01-09,广州,变流器,7,1530000\n';
    expect(fastLegacy(enc(csv, 'gbk'))?.encoding).not.toBe('euc-kr');
  });
  test('Korean prose is not taken for Chinese', () => {
    expect(fastLegacy(enc(KO, 'euc-kr'))?.encoding).not.toBe('gb18030');
  });
  test('a sample cut in the middle of a character still works', () => {
    const b = enc(ZH_S, 'gbk');
    expect(fastLegacy(b.subarray(0, b.length - 1))?.encoding).toBe('gb18030');
  });
});
