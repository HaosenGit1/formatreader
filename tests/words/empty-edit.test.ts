// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { copyName } from '../../src/categories/words/shared/edit/save';
import { readText, isSource } from '../../src/categories/words/shared/read';

describe('empty files', () => {
  it('open as an empty, editable text', async () => {
    const src = await readText(new File([], 'notes.txt'), document.createElement('div'));
    expect(isSource(src)).toBe(true);
    if (isSource(src)) expect(src.text).toBe('');
  });
  it('keep plain-text names but save typed-into Office files as .txt / .csv', () => {
    expect(copyName('notes.md', true)).toBe('notes (edited).md');
    expect(copyName('report.docx', true)).toBe('report (edited).txt');
    expect(copyName('book.xlsx', true, true)).toBe('book (edited).csv');
    expect(copyName('report.docx')).toBe('report (edited).docx');
  });
});
