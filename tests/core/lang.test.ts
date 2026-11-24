/**
 * The site's language follows the browser's first language: Chinese (any region) → Chinese,
 * every other language → English (for now).
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

const langFor = async (languages: string[]) => {
  vi.resetModules();
  vi.stubGlobal('navigator', { languages, language: languages[0] });
  return (await import('../../src/core/i18n')).lang();
};

describe('site language', () => {
  afterEach(() => vi.unstubAllGlobals());

  test.each([
    [['zh-CN', 'zh'], 'zh'],
    [['zh-TW'], 'zh'],
    [['zh-HK'], 'zh'],
    [['zh'], 'zh'],
    [['en-US', 'en'], 'en'],
    [['en-GB'], 'en'],
    [['ja-JP'], 'en'],
    [['es-ES'], 'en'],
    [['de-DE', 'zh-CN'], 'en'], // the first choice decides
    [['en-US', 'zh-CN'], 'en'],
  ])('%j → %s', async (languages, want) => {
    expect(await langFor(languages)).toBe(want);
  });
});
