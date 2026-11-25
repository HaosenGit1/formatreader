// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPrintHtml, type PrintSection } from '../../src/categories/words/books/book-print';

const pages: Record<string, { type: string; text: string }> = {};
const xhtml = (body: string, head = '') => ({
  type: 'application/xhtml+xml',
  text: `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="zh"><head>${head}</head><body class="calibre">${body}</body></html>`,
});

vi.stubGlobal('fetch', async (url: string) => {
  const p = pages[url.replace(/^blob:/, '')];
  if (!p) throw new Error('missing');
  return { blob: async () => new Blob([p.text], { type: p.type }) };
});
afterEach(() => {
  for (const k of Object.keys(pages)) delete pages[k];
});

const section = (url: string, extra: Partial<PrintSection> = {}): PrintSection => ({ load: async () => `blob:${url}`, ...extra });

describe('whole-book printing', () => {
  it('puts every chapter in reading order, each on a new page, and skips side notes', async () => {
    pages.a = xhtml('<h1>第一章</h1><p>一</p>', '<link rel="stylesheet" href="blob:x/style.css"/>');
    pages.b = xhtml('<h1>第二章</h1><p>二</p>', '<link rel="stylesheet" href="blob:x/style.css"/><style>p{color:red}</style>');
    pages.n = xhtml('<p>note</p>');
    const progress: number[] = [];
    const { html, pages: n } = await buildPrintHtml({ sections: [section('a'), section('n', { linear: 'no' }), section('b')] }, '书 <名>', false, (d) => progress.push(d));
    expect(n).toBe(2);
    expect(html.indexOf('第一章')).toBeLessThan(html.indexOf('第二章'));
    expect(html).not.toContain('note');
    expect(html.match(/style\.css/g)).toHaveLength(1); // the shared stylesheet only once
    expect(html).toContain('p{color:red}');
    expect(html).toContain('<title>书 &lt;名&gt;</title>');
    expect(html).toContain('break-before: page');
    expect(html).toMatch(/class="fr-sec calibre"/); // the chapter keeps its body class
    expect(progress.at(-1)).toBe(2);
  });

  it('removes anything that could run, and links into the book file', async () => {
    pages.a = xhtml('<p onclick="alert(1)">x</p><script>alert(2)</script><a href="ch2.xhtml#n1">in book</a><a href="https://example.com/">web</a>');
    const { html } = await buildPrintHtml({ sections: [section('a')] }, 't', false, () => {});
    const body = html.slice(html.indexOf('<body>'));
    expect(body).not.toMatch(/onclick|<script|alert/);
    expect(body).not.toContain('ch2.xhtml');
    expect(body).toContain('href="https://example.com/"');
  });

  it('skips a chapter that cannot be read instead of failing the whole book', async () => {
    pages.a = xhtml('<p>ok</p>');
    const broken: PrintSection = { load: async () => { throw new Error('bad'); } };
    const web: PrintSection = { load: async () => 'https://example.com/a' }; // never read from the network
    const { pages: n, html } = await buildPrintHtml({ sections: [broken, section('missing'), web, section('a')] }, 't', false, () => {});
    expect(n).toBe(1);
    expect(html).toContain('<p>ok</p>');
  });

  it('fixed-layout books print one sheet per page, at the size the book asks for', async () => {
    pages.p1 = xhtml('<img src="blob:x/1.jpg"/>', '<meta name="viewport" content="width=1200, height=1800"/>');
    pages.p2 = xhtml('<img src="blob:x/2.jpg"/>', '<meta name="viewport" content="width=1200, height=1800"/>');
    const { html, pages: n } = await buildPrintHtml({ sections: [section('p1'), section('p2')] }, 't', true, () => {});
    expect(n).toBe(2);
    expect(html).toContain('size: 1200px 1800px; margin: 0');
    expect(html.match(/class="fr-sec fr-fixed/g)).toHaveLength(2);
  });

  it('right-to-left books stay right-to-left', async () => {
    pages.a = xhtml('<p>שלום</p>');
    const { html } = await buildPrintHtml({ sections: [section('a')], dir: 'rtl' }, 't', false, () => {});
    expect(html).toContain('<html dir="rtl">');
  });

  it('prints just a part or one chapter, and releases only what it loaded', async () => {
    for (const k of ['a', 'b', 'c', 'd']) pages[k] = xhtml(`<p>${k.toUpperCase()}-text</p>`);
    const book = { sections: ['a', 'b', 'c', 'd'].map((k) => section(k)) };
    const loaded: PrintSection[] = [];
    const part = await buildPrintHtml(book, 't', false, () => {}, { from: 1, to: 3, loaded });
    expect(part.pages).toBe(2);
    expect(part.html).toContain('B-text');
    expect(part.html).toContain('C-text');
    expect(part.html).not.toMatch(/A-text|D-text/);
    expect(loaded).toEqual([book.sections[1], book.sections[2]]);
    // one chapter: printed even when the book marks it as a side note
    book.sections[3].linear = 'no';
    const one = await buildPrintHtml(book, 't', false, () => {}, { from: 3, to: 4 });
    expect(one.html).toContain('D-text');
  });

  it('Cancel stops before the next chapter', async () => {
    for (const k of ['a', 'b', 'c']) pages[k] = xhtml(`<p>${k}</p>`);
    const ctrl = new AbortController();
    const loaded: PrintSection[] = [];
    const run = buildPrintHtml({ sections: ['a', 'b', 'c'].map((k) => section(k)) }, 't', false, (done) => { if (done === 1) ctrl.abort(); }, { signal: ctrl.signal, loaded });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(loaded).toHaveLength(1);
  });
});
