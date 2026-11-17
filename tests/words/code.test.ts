import { describe, expect, test } from 'vitest';
import { codeKind, languageName } from '../../src/categories/words/code/languages';

describe('Code viewer: codeKind', () => {
  test.each([
    ['script.py', 'python'],
    ['app.tsx', 'typescript'],
    ['Main.java', 'java'],
    ['pump.st', 'delphi'],
    ['part.nc', 'gcode'],
    ['config.yaml', 'yaml'],
    ['data.xml', 'xml'],
    ['Dockerfile', 'dockerfile'],
    ['Makefile', 'makefile'],
    ['settings.json', 'json'],
  ])('%s → %s', (name, language) => {
    expect(codeKind(name, '')?.language).toBe(language);
  });

  test('JSON documents are pretty-printed, JSON Lines are not', () => {
    expect(codeKind('a.json', '')?.json).toBe('document');
    expect(codeKind('a.jsonl', '')?.json).toBe('lines');
  });

  test('no extension: shebang and content decide', () => {
    expect(codeKind('run', '#!/bin/bash\necho hi')?.language).toBe('bash');
    expect(codeKind('deploy', '#!/usr/bin/env python3\nprint(1)')?.language).toBe('python');
    expect(codeKind('response', '{"ok": true}')?.language).toBe('json');
    expect(codeKind('feed', '<?xml version="1.0"?><rss/>')?.language).toBe('xml');
  });

  test('plain text, documents and tables are not code', () => {
    for (const name of ['novel.txt', 'notes.md', 'page.html', 'movie.srt', 'data.csv', 'README']) {
      expect(codeKind(name, 'just some words'), name).toBeNull();
    }
  });

  test('display names', () => {
    expect(languageName('csharp')).toBe('C#');
    expect(languageName('python')).toBe('Python');
  });
});

describe('Code viewer: shared extensions decided by content', () => {
  test('.m: MATLAB unless it is clearly Objective-C', () => {
    expect(codeKind('analysis.m', "power = [2410 2385 0];\nfprintf('%d online\\n', sum(power > 0));")?.language).toBe('matlab');
    expect(codeKind('AppDelegate.m', '#import "AppDelegate.h"\n@implementation AppDelegate\n@end')?.language).toBe('objectivec');
    expect(codeKind('View.m', 'NSString *s = [obj description];')?.language).toBe('objectivec');
  });
  test('Terraform and Solidity have their own grammars', () => {
    expect(codeKind('main.tf', '')?.language).toBe('hcl');
    expect(codeKind('Token.sol', '')?.language).toBe('solidity');
  });
});
