/**
 * FormatReader's promise: a user's file is only ever READ. It is never
 * changed, saved over, downloaded or sent anywhere. This test fails the build
 * if code that could do any of that appears in src/, or if the page's
 * Content-Security-Policy is loosened to allow sending data elsewhere.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = process.cwd();
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|js)$/.test(f) ? [p] : [];
  });

/** APIs that can write to the user's disk, trigger downloads, or send data out. */
const FORBIDDEN: Array<[RegExp, string]> = [
  [/showSaveFilePicker|showOpenFilePicker|showDirectoryPicker/, 'File System Access pickers (write access to disk)'],
  [/createWritable|createSyncAccessHandle|FileSystem(File|Directory)Handle|getAsFileSystemHandle/, 'file handles that can write'],
  [/\bdownload\s*[:=]|\.download\b|['"]download['"]/, 'download links'],
  [/sendBeacon|XMLHttpRequest|new WebSocket|\bEventSource\b|RTCPeerConnection/, 'network senders'],
  [/\bfetch\s*\(/, 'fetch (only local blob/URL reads are allowed; add an explicit exception if ever needed)'],
  [/method\s*:\s*['"](POST|PUT|PATCH|DELETE)/i, 'HTTP writes'],
];

/**
 * Exceptions, asked for by the user: "Extract all" saves the files *inside* an
 * archive as NEW files — into a new folder it creates, or as a new ZIP download. It never
 * writes to the archive or to anything that already exists (tests/archives/extract-all.test.ts).
 */
const EXCEPTIONS: Record<string, string[]> = {
  // Basic editing of simple text formats: "Save a copy" offers a NEW file as a download;
  // the original is never written (tests/words/edit.test.ts).
  'src/categories/words/shared/edit/save.ts': ['download links'],
  // The feedback form: sends the visitor's message (and a file they attach) only when they press
  // Send, to formatreader.com/api/feedback — the one network write, stated on the form.
  'src/core/feedback.ts': ['fetch (only local blob/URL reads are allowed; add an explicit exception if ever needed)', 'HTTP writes'],
  // "Recent" files on the front page: a VIEW-only link to each file opened (Chrome / Edge), so it
  // can be opened again. Never write access: the test below checks every permission asked for.
  'src/core/recent-capture.ts': ['File System Access pickers (write access to disk)', 'file handles that can write'],
  'src/core/recent.ts': ['file handles that can write'],
  // Printing a whole ebook reads each chapter back from the book engine's in-memory blob:
  // addresses. Only blob: is ever read (checked below); nothing goes to the network.
  'src/categories/words/books/book-print.ts': ['fetch (only local blob/URL reads are allowed; add an explicit exception if ever needed)'],
  'src/categories/archives/archive/extract-all.ts': ['File System Access pickers (write access to disk)', 'file handles that can write', 'download links'],
};

describe('read-only guarantee', () => {
  for (const file of files(join(root, 'src'))) {
    const rel = file.slice(root.length + 1);
    test(rel, () => {
      const code = readFileSync(file, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '');
      for (const [re, what] of FORBIDDEN) if (!EXCEPTIONS[rel]?.includes(what)) expect(re.test(code), `${rel} uses ${what}`).toBe(false);
    });
  }

  test('Book printing reads only in-memory blob: addresses', () => {
    const code = readFileSync(join(root, 'src/categories/words/books/book-print.ts'), 'utf8');
    expect(code.match(/\bfetch\s*\(/g)).toHaveLength(1);
    expect(code).toMatch(/if \(!url\.startsWith\('blob:'\)\) return READ_FAIL;\s*try \{\s*const blob = await \(await fetch\(url\)\)/);
  });

  test('Recent files: links to files are view-only, never write access', () => {
    for (const rel of ['src/core/recent-capture.ts', 'src/core/recent.ts']) {
      const code = readFileSync(join(root, rel), 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '');
      expect(code, rel).not.toMatch(/createWritable|createSyncAccessHandle|showSaveFilePicker|showDirectoryPicker|removeEntry|\.move\(|getDirectoryHandle|getFileHandle/);
      // Every permission asked for is { mode: 'read' }.
      const asks = code.match(/(query|request)Permission\([^)]*\)/g) ?? [];
      for (const a of asks) expect(a, rel).toMatch(/\((o: )?\{ mode: ['"]read['"] \}\)/);
      expect(code, rel).not.toMatch(/mode:\s*['"]readwrite['"]/);
    }
  });

  test('CSP: data can only go to this site, never to another server or a form target', () => {
    const csp = /Content-Security-Policy"\s+content="([^"]+)"/.exec(readFileSync(join(root, 'index.html'), 'utf8'))?.[1] ?? '';
    const directive = (name: string) => new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`).exec(csp)?.[1].trim();
    expect(directive('connect-src')).toBe("'self' blob: data:");
    expect(directive('form-action')).toBe("'none'");
    expect(csp).not.toMatch(/https?:\/\/|\*/);
  });
});

describe('offline service worker (scripts/sw-template.js)', () => {
  const sw = readFileSync(join(root, 'scripts/sw-template.js'), 'utf8');
  test('only handles GET requests for this site', () => {
    expect(sw).toContain("if (req.method !== 'GET' || !req.url.startsWith(scope)) return;");
  });
  test('only stores the build’s own files and the page', () => {
    // Every cache.put stores either the page or a URL from this build's file list.
    const puts = [...sw.matchAll(/cache\.put\(([^,]+),/g)].map((m) => m[1].trim());
    expect(new Set(puts)).toEqual(new Set(['STATE', 'key', 'clean', 'href', 'req']));
    // STATE is only the visitor's choice ({ all, viewers }), never file content.
    expect(sw).toContain('JSON.stringify(state)');
    expect(sw).toContain('if (!KNOWN.has(clean)) return;');
    expect(sw).not.toMatch(/https?:\/\//);
  });
});
