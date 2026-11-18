import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { decodeImaAdpcm, parseAvi, soundTrack, videoCodecName, withHuffmanTables } from '../../src/categories/videos/video/avi';

const sample = (name: string) => new Blob([readFileSync(join(__dirname, '../../samples/videos', name))]);

describe('AVI reading', () => {
  test('camera MJPEG with PCM sound, from the index', async () => {
    const info = await parseAvi(sample('camera-mjpeg.avi'));
    expect(videoCodecName(info.video)).toBe('MJPEG');
    expect([info.width, info.height, info.fps]).toEqual([160, 120, 10]);
    expect(info.video!.chunks).toHaveLength(30);
    expect(info.audio!.format).toBe(1);
    const sound = await soundTrack(sample('camera-mjpeg.avi'), info.audio);
    expect(sound!.type).toBe('audio/wav');
    expect(sound!.size).toBe(44 + 3 * 8000 * 2);
  });

  test('CCTV MJPEG without index or Huffman tables, μ-law sound', async () => {
    const file = sample('cctv-mjpeg-nodht.avi');
    const info = await parseAvi(file);
    expect(info.video!.chunks).toHaveLength(30); // found by scanning
    const c = info.video!.chunks[0];
    const jpg = new Uint8Array(await file.slice(c.off, c.off + c.size).arrayBuffer());
    expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);
    const fixed = withHuffmanTables(jpg);
    expect(fixed.length).toBe(jpg.length + 420);
    expect(withHuffmanTables(fixed)).toBe(fixed); // already has tables: unchanged
    const sound = await soundTrack(file, info.audio);
    expect(sound!.size).toBe(44 + 3 * 8000 * 2); // decoded to 16-bit
  });

  test('H.264 in AVI with IMA ADPCM sound', async () => {
    const file = sample('turbine-h264.avi');
    const info = await parseAvi(file);
    expect(videoCodecName(info.video)).toBe('H.264');
    expect(info.video!.chunks.length).toBe(90);
    expect(info.video!.chunks[0].key).toBe(true);
    const sound = await soundTrack(file, info.audio);
    const pcm = new Int16Array((await sound!.arrayBuffer()).slice(44));
    // A 440 Hz tone at 30%: loud enough, never clipped.
    const peak = pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(8000);
    expect(peak).toBeLessThan(12000);
  });

  test('IMA ADPCM silence decodes to silence', () => {
    const block = new Uint8Array(256);
    expect(decodeImaAdpcm(block, 1, 256).length).toBe(505);
  });

  test('not an AVI', async () => {
    await expect(parseAvi(new Blob(['hello world, not a video']))).rejects.toThrow();
  });
});
