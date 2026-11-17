import { describe, expect, test } from 'vitest';
import { withDetectedType } from '../../src/core/mime';

const pdf = { id: 'pdf', name: 'PDF document', category: 'words' as const };

describe('withDetectedType', () => {
  test('labels an untyped file (taken out of an archive)', () => {
    const f = withDetectedType(new File([new Uint8Array([1, 2, 3])], 'a.pdf'), pdf);
    expect(f.type).toBe('application/pdf');
    expect(f.name).toBe('a.pdf');
    expect(f.size).toBe(3);
  });
  test('corrects a wrong label (a renamed file)', () => {
    expect(withDetectedType(new File(['x'], 'a.txt', { type: 'text/plain' }), pdf).type).toBe('application/pdf');
  });
  test('leaves the file alone when the label is right or the format is unknown', () => {
    const ok = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    expect(withDetectedType(ok, pdf)).toBe(ok);
    const t = new File(['x'], 'a.txt', { type: 'text/plain' });
    expect(withDetectedType(t, null)).toBe(t);
    expect(withDetectedType(t, { id: 'hwp', name: 'HWP', category: 'words' })).toBe(t);
  });
});
