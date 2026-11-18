/**
 * Motion photos: a still photo with a short video appended after it — Samsung "Motion
 * photo", Google Pixel "Top Shot"/MVIMG, Huawei/Honor "Moving picture", Xiaomi, OPPO…
 * The video is an ordinary MP4 starting with an "ftyp" box somewhere after the picture.
 */
const VIDEO_BRANDS = /^(mp4[12]|isom|iso[2-9]|avc1|qt  |M4V |3gp[4-6]|mmp4|hvc1|hev1)$/;

/** The embedded video, or null. Only the file's own bytes are read; nothing is changed. */
export async function findMotionVideo(file: Blob): Promise<Blob | null> {
  if (file.size < 50_000 || file.size > 200 * 1024 * 1024) return null;
  const b = new Uint8Array(await file.arrayBuffer());
  for (let i = 1024; i + 12 < b.length; i++) {
    // "ftyp" preceded by a plausible box size, followed by a video brand.
    if (b[i] !== 0x66 || b[i + 1] !== 0x74 || b[i + 2] !== 0x79 || b[i + 3] !== 0x70) continue;
    const size = (b[i - 4] << 24) | (b[i - 3] << 16) | (b[i - 2] << 8) | b[i - 1];
    const brand = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (size >= 16 && size <= 256 && VIDEO_BRANDS.test(brand)) return file.slice(i - 4, file.size, 'video/mp4');
  }
  return null;
}
