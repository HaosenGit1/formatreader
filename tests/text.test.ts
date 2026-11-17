import { describe, expect, test } from 'vitest';
import { classifyText, sniffDelimiter } from '../src/words/text-kind';
import { parseAss, parseDelimited, parseSrtVtt } from '../src/words/parse';

describe('classifyText', () => {
  test.each([
    ['data.csv', 'a,b\n1,2', 'table'],
    ['notes.md', '# hi', 'markdown'],
    ['page.html', '<p>x</p>', 'html'],
    ['config.json', '{"a":1}', 'json'],
    ['script.py', 'print(1)', 'code'],
    ['Dockerfile', 'FROM node', 'code'],
    ['movie.srt', '1\n00:00:01,000 --> 00:00:02,000\nHi', 'subtitle'],
    ['novel.txt', '第一章', 'plain'],
    ['program.st', 'IF x THEN y := 1; END_IF;', 'code'],
  ])('%s → %s', (name, text, kind) => {
    expect(classifyText(name, text).kind).toBe(kind);
  });

  test('no extension: sniff content', () => {
    expect(classifyText('README', '{"x": [1,2]}').kind).toBe('json');
    expect(classifyText('noext', 'WEBVTT\n\n00:01.000 --> 00:02.000\nhi').kind).toBe('subtitle');
    expect(classifyText('run', '#!/bin/bash\necho hi').kind).toBe('code');
  });

  test('a .txt that looks like JSON stays readable text', () => {
    expect(classifyText('book.txt', '{ not really json').kind).toBe('plain');
  });
});

describe('delimited', () => {
  test('sniffs semicolons (European Excel)', () => {
    expect(sniffDelimiter('name;age;city\nAnna;30;Berlin\nBen;25;Paris')).toBe(';');
  });
  test('parses quotes, escaped quotes and embedded newlines', () => {
    const rows = parseDelimited('a,b,c\n"x, y","he said ""hi""","line1\nline2"\r\n1,2,3', ',');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'he said "hi"', 'line1\nline2'],
      ['1', '2', '3'],
    ]);
  });
});

describe('subtitles', () => {
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
