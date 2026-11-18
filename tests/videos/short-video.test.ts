// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { allViewers } from '../../src/categories';
import { detectFormat } from '../../src/core/detect-format';
import { openEntry } from '../../src/core/folder-view';
import { pickViewer } from '../../src/core/registry';

/** A folder made of in-memory files, behaving like the browser's dropped-folder entries. */
function fakeDir(files: Record<string, string | Uint8Array>) {
  const fileEntry = (name: string) => ({ isFile: true, isDirectory: false, name, fullPath: `/${name}`, file: (ok: (f: File) => void) => ok(new File([files[name] as BlobPart], name)) });
  const dir = { isFile: false, isDirectory: true, name: 'cache', fullPath: '/cache', getFile: (path: string, _o: object, ok: (e: unknown) => void, fail: () => void) => (path in files ? ok(fileEntry(path)) : fail()) };
  return { dir, entries: Object.keys(files).map(fileEntry) };
}

const viewerOf = async (bytes: Uint8Array, name: string) => {
  const format = await detectFormat(new Blob([bytes as BlobPart]), name);
  return pickViewer(allViewers, { format, name, ext: name.split('.').pop()!, head: bytes.subarray(0, 8192) })?.id;
};

describe('short-video and app formats', () => {
  test('.m3u8 playlist: pieces joined in order (ts)', async () => {
    const { dir, entries } = fakeDir({ 'index.m3u8': '#EXTM3U\n#EXTINF:4,\nseg1.ts\n#EXTINF:4,\nseg2.ts\n#EXT-X-ENDLIST\n', 'seg1.ts': 'AAAA', 'seg2.ts': 'BBBB' });
    const f = await openEntry(entries[0] as never, entries as never, dir as never);
    expect(f.name).toBe('index.ts');
    expect(await f.text()).toBe('AAAABBBB');
  });

  test('.m3u8 with an fMP4 init file', async () => {
    const { dir, entries } = fakeDir({ 'v.m3u8': '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\n0.m4s\n#EXTINF:2,\n1.m4s\n', 'init.mp4': 'I', '0.m4s': 'A', '1.m4s': 'B' });
    const f = await openEntry(entries[0] as never, entries as never, dir as never);
    expect([f.name, await f.text()]).toEqual(['v.mp4', 'IAB']);
  });

  test('encrypted or online playlists are explained, never downloaded', async () => {
    const enc = fakeDir({ 'a.m3u8': '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\nseg.ts\n', 'seg.ts': 'x' });
    await expect(openEntry(enc.entries[0] as never, enc.entries as never, enc.dir as never)).rejects.toThrow(/encrypted/);
    const web = fakeDir({ 'b.m3u8': '#EXTM3U\nhttps://cdn.example.com/seg.ts\n' });
    await expect(openEntry(web.entries[0] as never, web.entries as never, web.dir as never)).rejects.toThrow(/internet/);
  });

  test('B站 cache: video.m4s gets its audio.m4s', async () => {
    const { dir, entries } = fakeDir({ 'video.m4s': 'V', 'audio.m4s': 'A', 'entry.json': '{}' });
    const f = (await openEntry(entries[0] as never, entries as never, dir as never)) as File & { companionAudio?: File };
    expect(f.companionAudio?.name).toBe('audio.m4s');
  });

  test('m4s / f4v / blv / app formats go to the video viewer', async () => {
    const mp4 = new Uint8Array(readFileSync('samples/videos/turbine.mp4'));
    const flv = new Uint8Array(readFileSync('samples/videos/turbine-h264.flv'));
    expect(await viewerOf(mp4, 'video.m4s')).toBe('videos/video');
    expect(await viewerOf(mp4, 'clip.f4v')).toBe('videos/video');
    expect(await viewerOf(flv, 'old.blv')).toBe('videos/video');
    for (const ext of ['qsv', 'kux', 'qlv', 'xv']) expect(await viewerOf(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), `movie.${ext}`)).toBe('videos/video');
  });
});
