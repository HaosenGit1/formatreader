/**
 * Minimal ZIP central-directory reader: lists entry names without unpacking,
 * so we can tell DOCX / XLSX / EPUB / ODT / … apart from plain ZIP archives.
 */

export interface BlobLike {
  size: number;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

async function read(blob: BlobLike, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(Math.max(0, start), Math.min(blob.size, end)).arrayBuffer());
}

/** Returns entry names (up to `limit`), or null if this isn't a readable ZIP. */
export async function listZipEntries(blob: BlobLike, limit = 4000): Promise<string[] | null> {
  // End-of-central-directory record is in the last 22 + up to 65535 (comment) bytes.
  const tailLen = Math.min(blob.size, 22 + 65535);
  const tail = await read(blob, blob.size - tailLen, blob.size);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  let count = tv.getUint16(eocd + 10, true);
  let cdSize = tv.getUint32(eocd + 12, true);
  let cdOffset = tv.getUint32(eocd + 16, true);

  // ZIP64: values are 0xFFFFFFFF and the real ones live in the ZIP64 EOCD record.
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || count === 0xffff) {
    const locIdx = eocd - 20;
    if (locIdx >= 0 && tv.getUint32(locIdx, true) === 0x07064b50) {
      const z64Off = Number(tv.getBigUint64(locIdx + 8, true));
      const z = await read(blob, z64Off, z64Off + 56);
      const zv = new DataView(z.buffer, z.byteOffset, z.byteLength);
      if (z.length >= 56 && zv.getUint32(0, true) === 0x06064b50) {
        count = Number(zv.getBigUint64(32, true));
        cdSize = Number(zv.getBigUint64(40, true));
        cdOffset = Number(zv.getBigUint64(48, true));
      }
    }
  }

  const maxRead = Math.min(cdSize, 8 * 1024 * 1024);
  const cd = await read(blob, cdOffset, cdOffset + maxRead);
  const cv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const names: string[] = [];
  const utf8 = new TextDecoder('utf-8');
  const fallback = new TextDecoder('gb18030'); // many Chinese ZIPs store GBK names without the UTF-8 flag
  let p = 0;
  for (let i = 0; i < count && names.length < limit; i++) {
    if (p + 46 > cd.length || cv.getUint32(p, true) !== CEN_SIG) break;
    const flags = cv.getUint16(p + 8, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const commentLen = cv.getUint16(p + 32, true);
    const raw = cd.subarray(p + 46, p + 46 + nameLen);
    let name: string;
    if (flags & 0x800) {
      name = utf8.decode(raw);
    } else {
      try {
        name = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      } catch {
        name = fallback.decode(raw);
      }
    }
    names.push(name);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}
