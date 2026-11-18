/**
 * Camera RAW files (Canon CR2/CR3, Nikon NEF, Sony ARW, Fujifilm RAF, Adobe DNG,
 * Olympus ORF, Panasonic RW2, Pentax PEF…) all carry a JPEG preview made by the
 * camera, usually full size. Showing that preview needs no RAW decoder at all.
 *
 * This finds every embedded JPEG (start marker FF D8 FF, then walks the marker
 * segments to the end marker) and returns them largest first; the caller uses
 * the first one the browser can decode (lossless-JPEG raw data is skipped).
 */

// Small enough for old cameras that saved only a thumbnail (e.g. Olympus E-10, ~6 KB).
const MIN_SIZE = 2 * 1024;

/** End of the JPEG starting at `start`, or -1 if it is not a well-formed JPEG. */
function jpegEnd(b: Uint8Array, start: number): number {
  let i = start + 2;
  const n = b.length;
  while (i + 2 <= n) {
    if (b[i] !== 0xff) return -1;
    const m = b[i + 1];
    if (m === 0xff) {
      i++; // fill byte
      continue;
    }
    if (m === 0xd9) return i + 2; // end of image
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      i += 2;
      continue;
    }
    if (i + 4 > n) return -1;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return -1;
    i += 2 + len;
    if (m === 0xda) {
      // Entropy-coded data: runs until a marker that isn't a stuffed byte or a restart marker.
      while (i + 1 < n && !(b[i] === 0xff && b[i + 1] !== 0 && !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7))) i++;
    }
  }
  return -1;
}

export interface EmbeddedJpeg {
  start: number;
  end: number;
}

export function findEmbeddedJpegs(bytes: Uint8Array): EmbeddedJpeg[] {
  const found: EmbeddedJpeg[] = [];
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue;
    const end = jpegEnd(bytes, i);
    if (end > 0 && end - i >= MIN_SIZE) {
      found.push({ start: i, end });
      i = end - 1; // don't look inside this JPEG (its own thumbnail)
    }
  }
  return found.sort((a, b) => b.end - b.start - (a.end - a.start));
}
