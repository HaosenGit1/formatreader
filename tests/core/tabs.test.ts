// @vitest-environment happy-dom
/**
 * Several files open at once, each in a tab of its own (drop, pick or paste).
 * Drives the real shell with a tiny test viewer.
 */
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { MAX_TABS, startApp } from '../../src/core/shell';
import type { ViewerEntry } from '../../src/core/viewer';

const destroyed: string[] = [];
const opened: string[] = [];
const testViewer: ViewerEntry = {
  id: 'test/any',
  category: 'words',
  accepts: () => true,
  priority: 1000,
  load: async () => ({
    open: async (file: File, ctx) => {
      opened.push(file.name);
      const parts = (file as File & { shapeParts?: Record<string, File> }).shapeParts;
      const p = document.createElement('p');
      p.className = 'test-view';
      p.textContent = `${file.name}${parts ? ` + ${Object.keys(parts).sort().join(',')}` : ''}`;
      ctx.mount.append(p);
      return { destroy: () => void destroyed.push(file.name) };
    },
  }),
};

const app = () => document.getElementById('app')!;
const file = (name: string, body = name) => new File([body], name, { type: 'text/plain', lastModified: 1 });
const drop = (files: File[]) => {
  const e = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
  Object.defineProperty(e, 'dataTransfer', { value: { files, items: [], types: ['Files'] } });
  window.dispatchEvent(e);
};
const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 5));
};
const tabNames = () => [...app().querySelectorAll('.tab-btn')].map((b) => b.textContent);
const activeName = () => app().querySelector('.tab-btn[aria-selected="true"]')?.textContent;
const shown = () => app().querySelector('.test-view')?.textContent;
const strip = () => app().querySelector<HTMLElement>('.tab-strip')!;
const closeBtn = (name: string) => [...app().querySelectorAll<HTMLButtonElement>('.tab-close')].find((b) => b.getAttribute('aria-label')?.endsWith(name))!;

describe('tabs', () => {
  beforeAll(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    startApp([testViewer]);
  });

  test('one file: no tab strip', async () => {
    drop([file('one.txt')]);
    await settle();
    expect(shown()).toBe('one.txt');
    expect(strip().hidden).toBe(true);
  });

  test('dropping 3 more files adds 3 tabs; the first new one is shown, the others open when chosen', async () => {
    drop([file('a.txt'), file('b.txt'), file('c.txt')]);
    await settle();
    expect(strip().hidden).toBe(false);
    expect(tabNames()).toEqual(['one.txt', 'a.txt', 'b.txt', 'c.txt']);
    expect(activeName()).toBe('a.txt');
    expect(shown()).toBe('a.txt');
    expect(opened).not.toContain('b.txt');
  });

  test('switching keeps each viewer (no reopening)', async () => {
    const before = opened.length;
    (app().querySelectorAll<HTMLButtonElement>('.tab-btn')[0]).click();
    await settle();
    expect(shown()).toBe('one.txt');
    expect(opened.length).toBe(before); // one.txt was kept, not opened again
    expect(destroyed).toEqual([]);
  });

  test('the same file dropped again shows its tab instead of a new one', async () => {
    drop([file('c.txt')]);
    await settle();
    expect(tabNames()).toHaveLength(4);
    expect(activeName()).toBe('c.txt');
    expect(shown()).toBe('c.txt');
  });

  test('closing the shown tab shows its neighbour and releases the viewer', async () => {
    closeBtn('c.txt').click();
    await settle();
    expect(destroyed).toContain('c.txt');
    expect(tabNames()).toEqual(['one.txt', 'a.txt', 'b.txt']);
    expect(activeName()).toBe('b.txt');
    expect(shown()).toBe('b.txt');
  });

  test('closing a background tab releases its viewer too', async () => {
    closeBtn('a.txt').click();
    await settle();
    expect(destroyed).toContain('a.txt');
    expect(tabNames()).toEqual(['one.txt', 'b.txt']);
    expect(shown()).toBe('b.txt');
  });

  test('a shapefile set opens as one map, not one tab per file', async () => {
    drop([file('turbines.dbf'), file('turbines.shp'), file('turbines.prj'), file('notes.csv')]);
    await settle();
    expect(tabNames()).toEqual(['one.txt', 'b.txt', 'turbines.shp', 'notes.csv']);
    expect(shown()).toBe('turbines.shp + dbf,prj');
  });

  test(`at most ${MAX_TABS} tabs; the rest are named in a notice`, async () => {
    drop(Array.from({ length: 10 }, (_, i) => file(`n${i}.txt`)));
    await settle();
    expect(tabNames()).toHaveLength(MAX_TABS);
    expect(document.querySelector('.tab-toast')?.textContent).toMatch(/Opened 6 of 10 files/);
  });

  test('closing every tab returns to the front page', async () => {
    while (app().querySelector('.tab-close')) {
      app().querySelector<HTMLButtonElement>('.tab-close')!.click();
      await settle();
    }
    expect(app().querySelector('.landing')).not.toBeNull();
    expect(strip().hidden).toBe(true);
    expect(new Set(destroyed).has('one.txt')).toBe(true);
  });
});
