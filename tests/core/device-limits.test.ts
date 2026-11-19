// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { device, resetDevice } from '../../src/core/device';
import { LIMITS, limit } from '../../src/core/limits';
import { readText, isSource } from '../../src/categories/words/shared/read';

const as = (q: string) => {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(`http://localhost/${q}`);
  resetDevice();
};
afterEach(() => as(''));

describe('device', () => {
  it('honours the test overrides', () => {
    as('?device=phone');
    expect(device()).toMatchObject({ kind: 'phone', tier: 'low' });
    as('?device=tablet');
    expect(device().tier).toBe('mid');
    as('?device=desktop&mem=2');
    expect(device().tier).toBe('low');
    as('?device=desktop&mem=16');
    expect(device().tier).toBe('high');
  });
  it('limits grow from phones to computers', () => {
    for (const v of Object.values(LIMITS)) {
      if (v.low === v.high) continue;
      expect(v.low <= v.mid || v.low === 0 || v.mid === 0).toBe(true);
    }
    as('?device=phone');
    expect(limit('textPreview')).toBe(LIMITS.textPreview.low);
  });
});

describe('large text opens its start first', () => {
  const big = () => new File([('line of a log file 0123456789\n').repeat(200_000)], 'big.log'); // ~6 MB
  it('phone: preview with "load the whole file"', async () => {
    as('?device=phone');
    const reopened: number[] = [];
    const f = big();
    const src = await readText(f, document.createElement('div'), () => reopened.push(1));
    expect(isSource(src)).toBe(true);
    if (!isSource(src)) return;
    expect(src.partial?.shown).toBeLessThanOrEqual(LIMITS.textPreviewPart.low);
    expect(src.partial?.more?.all).toBe(true);
    src.partial!.more!.load();
    const full = await readText(f, document.createElement('div'), () => {});
    expect(isSource(full) && full.partial).toBe(null);
  });
  it('computer: the same file opens whole, as before', async () => {
    as('?device=desktop');
    const src = await readText(big(), document.createElement('div'));
    expect(isSource(src) && src.partial).toBe(null);
  });
});
