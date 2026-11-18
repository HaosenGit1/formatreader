/**
 * Google Analytics may count visits, but never learns what a visitor opened.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { baseParams, openFileParams, validId } from '../../src/core/analytics';
// @ts-expect-error plain JS module shared with vite.config.ts
import { GA_SOURCES, withAnalyticsCsp } from '../../scripts/analytics-csp.mjs';

const root = process.cwd();

describe('analytics never sends file names', () => {
  const secret = 'Salary 2026 - Zhang Wei 工资.xlsx';

  test('opening a file sends only the viewer and the extension', () => {
    const p = openFileParams('words/sheets', secret);
    expect(p).toEqual({ viewer: 'words/sheets', ext: 'xlsx' });
    expect(JSON.stringify(p)).not.toMatch(/Salary|Zhang|工资/);
  });

  test('odd "extensions" that could carry words are not sent', () => {
    expect(openFileParams('words/text', 'notes.my private plan').ext).toBe('other');
    expect(openFileParams('words/text', 'notes.verylongextension').ext).toBe('other');
    expect(openFileParams('words/text', 'README').ext).toBe('none');
    expect(openFileParams('words/text', '.bashrc').ext).toBe('none');
  });

  test('every hit uses a fixed title and an address without query or hash', () => {
    const p = baseParams('FormatReader', 'https://formatreader.com', '/');
    expect(p.page_title).toBe('FormatReader');
    expect(p.page_location).toBe('https://formatreader.com/');
    expect(p.allow_google_signals).toBe(false);
    expect(p.allow_ad_personalization_signals).toBe(false);
  });

  test('only a GA4 measurement ID is accepted (not Tag Manager)', () => {
    expect(validId('G-4VXFDZTMF0')).toBe(true);
    expect(validId('GTM-MDMSXJD3')).toBe(false);
    expect(validId('')).toBe(false);
    expect(validId(undefined)).toBe(false);
  });

  test('the shell reports opened files only through trackOpen(viewer id, name)', () => {
    const shell = readFileSync(join(root, 'src/core/shell.ts'), 'utf8');
    expect(shell).toMatch(/trackOpen\(entry\.id, name\)/);
    expect(shell).not.toMatch(/gtag|dataLayer/);
  });
});

describe('analytics security rule (website build only)', () => {
  const page = readFileSync(join(root, 'index.html'), 'utf8');
  const csp = (html: string) => /Content-Security-Policy"\s+content="([^"]+)"/.exec(html)![1];
  const directive = (c: string, name: string) => new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`).exec(c)?.[1].trim();

  test('adds only Google analytics servers, only to scripts, connections and images', () => {
    const before = csp(page);
    const after = csp(withAnalyticsCsp(page));
    for (const name of ['default-src', 'style-src', 'font-src', 'media-src', 'frame-src', 'object-src', 'form-action', 'base-uri']) expect(directive(after, name)).toBe(directive(before, name));
    for (const name of Object.keys(GA_SOURCES)) {
      const added = directive(after, name)!.slice(directive(before, name)!.length).trim().split(/\s+/);
      expect(added).toEqual(GA_SOURCES[name]);
      for (const host of added) expect(host).toMatch(/^https:\/\/(\*\.google-analytics\.com|\*\.analytics\.google\.com|www\.googletagmanager\.com)$/);
    }
    expect(directive(after, 'form-action')).toBe("'none'");
  });
});
