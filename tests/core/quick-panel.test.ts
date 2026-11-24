// @vitest-environment happy-dom
/** Quick access panel: the usual folder's files, into folders and back, open with one click. */
import { describe, expect, test, vi } from 'vitest';

const file = (name: string, body = 'x') => {
  const f = new File([body], name, { lastModified: 0 });
  return { kind: 'file' as const, name, getFile: async () => f, isSameEntry: async () => false, queryPermission: async () => 'granted' as PermissionState, requestPermission: async () => 'granted' as PermissionState };
};
const folder = (name: string, items: unknown[]) => ({
  kind: 'directory' as const,
  name,
  async *values() {
    yield* items;
  },
  isSameEntry: async () => false,
  queryPermission: async () => 'granted' as PermissionState,
  requestPermission: async () => 'granted' as PermissionState,
});

const desk = folder('Desktop', [file('b.csv'), folder('Project', [file('inner.dxf')]), file('.DS_Store'), file('a.txt')]);
const remembered: string[] = [];
vi.mock('../../src/core/recent', async (orig) => ({
  ...(await orig<typeof import('../../src/core/recent')>()),
  getFolder: async () => desk,
  listRecent: async () => [],
  remember: async (links: Array<{ name: string }>) => void remembered.push(...links.map((l) => l.name)),
}));

const settle = () => new Promise((r) => setTimeout(r, 30));
const rows = () => [...document.querySelectorAll('.quick-row')].map((b) => b.querySelector('.quick-name')?.textContent);

describe('quick access panel', () => {
  test('folders first, hidden files left out; into a folder and back; a click opens', async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    const { openQuickPanel } = await import('../../src/core/folder-panel');
    const opened: string[] = [];
    await openQuickPanel({ open: (files) => void opened.push(...files.map((f) => f.name)), elsewhere: () => undefined });
    await settle();
    expect(rows()).toEqual(['Project', 'a.txt', 'b.csv']);

    document.querySelector<HTMLButtonElement>('.quick-dir')!.click();
    await settle();
    expect(rows()).toEqual(['inner.dxf']);
    expect(document.querySelector('.quick-path')?.textContent).toContain('Desktop›Project');

    document.querySelector<HTMLButtonElement>('button.quick-crumb')!.click(); // back to Desktop
    await settle();
    expect(rows()).toEqual(['Project', 'a.txt', 'b.csv']);

    [...document.querySelectorAll<HTMLButtonElement>('.quick-row')].find((b) => b.textContent?.includes('b.csv'))!.click();
    await settle();
    expect(opened).toEqual(['b.csv']);
    expect(remembered).toEqual(['b.csv']); // joins Frequent files
  });
});
