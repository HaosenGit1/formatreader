import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { mhtmlToHtml } from '../../src/categories/words/email/mhtml';
import { splitMbox } from '../../src/categories/words/email/view';

const dir = join(process.cwd(), 'samples', 'email');

describe('MHTML', () => {
  const page = mhtmlToHtml(new Uint8Array(readFileSync(join(dir, 'page.mhtml'))));
  test('page, title and resources', () => {
    expect(page.html).toContain('Wind farm status 风场状态');
    expect(page.resources).toBe(2);
  });
  test('stylesheet and picture are inlined, nothing points to the network', () => {
    expect(page.html).toContain('data:image/png;base64,');
    expect(page.html).toContain('data:text/css;base64,');
    expect(page.html).not.toContain('http://127.0.0.1:8765/chart.png');
  });
});

describe('MBOX', () => {
  test('splits into messages and unescapes >From', () => {
    const msgs = splitMbox('From a@x Mon Jan  1 00:00:00 2026\nSubject: one\n\nhello\n>From the start\n\nFrom b@x Tue Jan  2 00:00:00 2026\nSubject: two\n\nbye\n');
    expect(msgs.length).toBe(2);
    expect(msgs[0]).toContain('From the start');
    expect(msgs[1]).toContain('Subject: two');
  });
  test('sample mailbox has three messages', () => {
    const raw = readFileSync(join(dir, 'archive.mbox'), 'latin1');
    expect(splitMbox(raw).length).toBe(3);
  });
});

import { htmlFromRtf, isHtmlInRtf } from '../../src/categories/words/email/rtf-html';

describe('Outlook HTML wrapped in RTF (\\fromhtml1)', () => {
  const rtf = "{\\rtf1\\ansi\\ansicpg932\\fromhtml1 {\\*\\htmltag19 <html>}{\\*\\htmltag34 <body>}\\htmlrtf {\\f0 RTF only}\\htmlrtf0 {\\*\\htmltag84 <p>}\\'93\\'fa\\'96\\'7b Hello{\\*\\htmltag92 </p>}\\htmlrtf\\par\\htmlrtf0 {\\*\\htmltag42 </body></html>}}";
  test('detected', () => expect(isHtmlInRtf(rtf)).toBe(true));
  test('original HTML recovered, RTF-only parts dropped, code page 932 decoded', () => {
    expect(htmlFromRtf(rtf)).toBe('<html><body><p>日本 Hello</p></body></html>');
  });
});
