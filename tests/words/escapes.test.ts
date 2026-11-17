import { describe, expect, test } from 'vitest';
import { decodeEscapes } from '../../src/categories/words/shared/encoding/escapes';

describe('escapes: decoded when clearly encoded', () => {
  test.each([
    ['Unicode escapes', '\\u4f60\\u597d\\uff0c\\u4e16\\u754c', '你好，世界', 'unicode'],
    ['Emoji as surrogate pair', '\\ud83d\\ude00\\u0020ok\\u0021', '😀 ok!', 'unicode'],
    ['Python bytes (UTF-8 \\x)', '\\xe4\\xbd\\xa0\\xe5\\xa5\\xbd', '你好', 'unicode'],
    ['URL encoding', '%E4%BD%A0%E5%A5%BD%EF%BC%8C%E4%B8%96%E7%95%8C', '你好，世界', 'url'],
    ['URL query', 'q=%E9%A3%8E%E6%9C%BA&lang=zh+CN', 'q=风机&lang=zh CN', 'url'],
    ['HTML entities', '&#20320;&#22909;&#65292;&#19990;&#30028;', '你好，世界', 'html'],
    ['Hex HTML entities', '&#x4f60;&#x597d;&#x4e16;&#x754c;', '你好世界', 'html'],
    ['Base64', '5L2g5aW977yM5LiW55WM77yB', '你好，世界！', 'base64'],
    ['Base64 of English', 'SGVsbG8sIEZvcm1hdFJlYWRlciE=', 'Hello, FormatReader!', 'base64'],
  ])('%s', (_name, input, expected, kind) => {
    const r = decodeEscapes(input);
    expect(r?.text).toBe(expected);
    expect(r?.kinds[0]).toBe(kind);
  });

  test('two layers: Base64 of URL-encoded text', () => {
    const inner = '%E4%BD%A0%E5%A5%BD%E4%B8%96%E7%95%8C';
    const r = decodeEscapes(btoa(inner));
    expect(r?.text).toBe('你好世界');
    expect(r?.kinds).toEqual(['base64', 'url']);
  });
});

describe('escapes: normal text is left alone', () => {
  test.each([
    ['Plain English', 'The quick brown fox jumps over the lazy dog.'],
    ['Plain Chinese', '你好，世界！这是正常的中文。'],
    ['One escape in prose', 'Use \\n for a new line in strings, and keep writing normal text here.'],
    ['A URL with a few escapes', 'See https://example.com/a%20b for details about the turbine maintenance plan.'],
    ['A word that fits the Base64 alphabet', 'Administrator'],
    ['Numbers only', '123456789012'],
    ['Code with entities', 'if (a &lt; b) { return a; } // compare the two values and return the smaller one'],
  ])('%s', (_name, input) => {
    expect(decodeEscapes(input)).toBeNull();
  });
});
