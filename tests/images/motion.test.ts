import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { findMotionVideo } from '../../src/categories/images/photo/motion';

test('motion photo: the appended MP4 is found exactly; an ordinary photo has none', async () => {
  const video = await findMotionVideo(new Blob([readFileSync('samples/images/motion-photo.jpg')]));
  const mp4 = readFileSync('samples/videos/turbine.mp4');
  expect(video!.size).toBe(mp4.length);
  expect(new Uint8Array(await video!.slice(0, 64).arrayBuffer())).toEqual(new Uint8Array(mp4.subarray(0, 64)));
  expect(await findMotionVideo(new Blob([readFileSync('samples/images/wind-farm.jpg')]))).toBeNull();
});
