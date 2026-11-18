/**
 * "Extract all": every file of the archive, with its folders and repaired names.
 *  - Chrome / Edge (and the portable file in them): written into a NEW folder inside a
 *    folder you choose — existing files are never overwritten.
 *  - Other browsers (Safari, Firefox, phones): one ordinary ZIP with UTF-8 names, which
 *    every system opens (also turns RAR / 7z / TAR… into a ZIP).
 * Nothing leaves the computer either way.
 */

export interface ExtractEntry {
  path: string;
  size: number;
  extract(): Promise<File>;
}

export interface ExtractResult {
  written: number;
  failed: string[];
  /** Folder or file name the user will find. */
  where: string;
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/** Safe path parts: no "..", no absolute paths, no characters Windows can't store. */
export function safeParts(path: string): string[] {
  return path
    .split(/[\\/]+/)
    .filter((p) => p && p !== '.' && p !== '..')
    .map((p) => {
      let q = p.replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '');
      if (!q) q = '_';
      if (RESERVED.test(q)) q = `_${q}`;
      return q.slice(0, 200);
    });
}

/** Can files be written straight into a folder (File System Access API)? */
export const canWriteFolder = () => typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

/** The parts of a folder handle used here (a fake one in tests). */
export interface DirHandle {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;
}

/** Must be called directly from the click (the folder picker needs the user's gesture). */
export function pickFolder(): Promise<DirHandle> {
  return (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker({ mode: 'readwrite', id: 'formatreader-extract' });
}

async function exists(dir: DirHandle, name: string) {
  try {
    await dir.getDirectoryHandle(name);
    return true;
  } catch {
    try {
      await dir.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  }
}

export async function extractToFolder(parent: DirHandle, baseName: string, entries: ExtractEntry[], progress: (done: number, total: number) => void): Promise<ExtractResult> {
  // Always a new folder: "report", then "report (2)"…
  const base = safeParts(baseName)[0] ?? 'archive';
  let name = base;
  for (let n = 2; await exists(parent, name); n++) name = `${base} (${n})`;
  const root = await parent.getDirectoryHandle(name, { create: true });
  const dirs = new Map<string, DirHandle>([['', root]]);
  const dirFor = async (parts: string[]) => {
    let key = '';
    let dir = root;
    for (const p of parts) {
      key += `/${p}`;
      let next = dirs.get(key);
      if (!next) dirs.set(key, (next = await dir.getDirectoryHandle(p, { create: true })));
      dir = next;
    }
    return dir;
  };
  const failed: string[] = [];
  let written = 0;
  for (const [i, e] of entries.entries()) {
    progress(i, entries.length);
    const parts = safeParts(e.path);
    if (!parts.length) continue;
    try {
      const file = await e.extract();
      const dir = await dirFor(parts.slice(0, -1));
      const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const out = await handle.createWritable();
      await out.write(file);
      await out.close();
      written++;
    } catch {
      failed.push(e.path);
    }
  }
  progress(entries.length, entries.length);
  return { written, failed, where: name };
}

export async function extractToZip(baseName: string, entries: ExtractEntry[], progress: (done: number, total: number) => void): Promise<{ result: ExtractResult; blob: Blob }> {
  const { Zip, ZipPassThrough } = await import('fflate');
  const chunks: Uint8Array[] = [];
  let finished: () => void = () => {};
  const done = new Promise<void>((r) => (finished = r));
  const zip = new Zip((err, chunk, final) => {
    if (!err) chunks.push(chunk);
    if (final || err) finished();
  });
  const failed: string[] = [];
  let written = 0;
  const used = new Set<string>();
  for (const [i, e] of entries.entries()) {
    progress(i, entries.length);
    let path = safeParts(e.path).join('/');
    if (!path) continue;
    for (let n = 2; used.has(path.toLowerCase()); n++) path = path.replace(/(\.[^./]*)?$/, ` (${n})$1`);
    try {
      const data = new Uint8Array(await (await e.extract()).arrayBuffer());
      used.add(path.toLowerCase());
      // Stored as-is (no recompression): fast, and the content is already compressed or small.
      const f = new ZipPassThrough(path);
      zip.add(f);
      f.push(data, true);
      written++;
    } catch {
      failed.push(e.path);
    }
  }
  zip.end();
  await done;
  progress(entries.length, entries.length);
  const name = `${safeParts(baseName)[0] ?? 'archive'}.zip`;
  return { result: { written, failed, where: name }, blob: new Blob(chunks as BlobPart[], { type: 'application/zip' }) };
}

/** Offers the ZIP as a download (browsers without folder access). */
export function saveZip(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
