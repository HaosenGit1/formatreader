import { describe, expect, test } from 'vitest';
import { classifyText } from '../../src/categories/words/text/text-kind';
import { parseAss, parseSrtVtt } from '../../src/categories/words/text/subtitles';

describe('Text viewer: classifyText', () => {
  test.each([
    ['notes.md', '# hi', 'markdown'],
    ['page.html', '<p>x</p>', 'html'],
    ['movie.srt', '1\n00:00:01,000 --> 00:00:02,000\nHi', 'subtitle'],
    ['novel.txt', '第一章', 'plain'],
    ['server.log', 'INFO started', 'plain'],
  ])('%s → %s', (name, text, kind) => {
    expect(classifyText(name, text).kind).toBe(kind);
  });

  test('no extension: content decides', () => {
    expect(classifyText('noext', 'WEBVTT\n\n00:01.000 --> 00:02.000\nhi').kind).toBe('subtitle');
    expect(classifyText('page', '<!DOCTYPE html><html></html>').kind).toBe('html');
  });

  test('a .txt that looks like HTML stays readable text', () => {
    expect(classifyText('book.txt', '<html>not really</html>').kind).toBe('plain');
  });
});

describe('Text viewer: subtitles', () => {
  test('SRT', () => {
    const cues = parseSrtVtt('1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>你好</i>\r\n世界\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\nBye');
    expect(cues).toEqual([
      { start: '00:00:01,000', end: '00:00:03,500', text: '你好\n世界' },
      { start: '00:00:04,000', end: '00:00:05,000', text: 'Bye' },
    ]);
  });
  test('ASS strips override tags and keeps commas in text', () => {
    const ass = `[Script Info]\nTitle: x\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,Alice,0,0,0,,{\\b1}Hello, world\\Nsecond line`;
    expect(parseAss(ass)).toEqual([{ start: '0:00:01.00', end: '0:00:02.00', text: 'Hello, world\nsecond line', speaker: 'Alice' }]);
  });
});
