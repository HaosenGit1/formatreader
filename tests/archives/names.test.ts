import { describe, expect, test } from 'vitest';
import { nameRepair } from '../../src/categories/archives/archive/names';
import { encode } from '../../src/categories/words/shared/encoding/codec';

// What a zip made on Chinese/Japanese Windows shows elsewhere: legacy name bytes read as DOS code page 437.
const CP437 =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const as437 = (name: string, enc: string) => [...encode(name, enc)!].map((b) => (b < 0x80 ? String.fromCharCode(b) : CP437[b - 0x80])).join('');

describe('archive file names', () => {
  test('GBK names from Chinese Windows are repaired', () => {
    const names = ['维护清单/', '维护清单/风机运行报告.xlsx', '维护清单/照片/塔筒.jpg'];
    const fix = nameRepair(names.map((n) => as437(n, 'gb18030')));
    expect(fix).not.toBeNull();
    expect(names.map((n) => fix!(as437(n, 'gb18030')))).toEqual(names);
  });
  test('Shift-JIS names from Japanese Windows are repaired', () => {
    const names = ['報告書/点検記録.xlsx', '報告書/写真.jpg'];
    const fix = nameRepair(names.map((n) => as437(n, 'shift_jis')));
    expect(names.map((n) => fix!(as437(n, 'shift_jis')))).toEqual(names);
  });
  test('normal names are left alone', () => {
    expect(nameRepair(['level1/report.xlsx', 'docs/notes.txt'])).toBeNull();
    expect(nameRepair(['Résumé.pdf', 'Straße/Grüße.txt'])).toBeNull();
    expect(nameRepair(['风机运行报告.xlsx', 'Привет.txt'])).toBeNull();
  });
});
