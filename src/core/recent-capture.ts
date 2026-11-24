/**
 * "Recent files", the part that must run at once (the rest is in recent.ts, loaded later).
 *
 * Chrome and Edge on computers can give a site a link ("handle") to a file the visitor opened,
 * so it can be opened again later from the same place. Only VIEW permission is ever asked
 * for: nothing here can write, rename or delete (tests/core/read-only.test.ts checks this).
 * Other browsers: none of this runs, and the ordinary file chooser is used.
 */

/** The parts of the File System Access API used here (read only). */
export interface FileLink {
  kind: 'file' | 'directory';
  name: string;
  getFile(): Promise<File>;
  isSameEntry(other: FileLink): Promise<boolean>;
  queryPermission(o: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'read' }): Promise<PermissionState>;
}

/** A folder the visitor chose (view only): its files and folders can be listed and opened. */
export interface FolderLink {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileLink | FolderLink>;
  isSameEntry(other: FileLink | FolderLink): Promise<boolean>;
  queryPermission(o: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(o: { mode: 'read' }): Promise<PermissionState>;
}

type PickerWindow = Window & {
  showOpenFilePicker?: (o: { multiple: boolean; id?: string }) => Promise<FileLink[]>;
  showDirectoryPicker?: (o: { mode: 'read'; id?: string }) => Promise<FolderLink>;
};

/** Whether this browser can remember files to reopen them (Chrome / Edge on a computer). */
export function canRemember(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showOpenFilePicker === 'function' && typeof indexedDB !== 'undefined';
}

/**
 * Links to the files in a drop. Must be called during the drop event itself (the browser
 * forgets the dropped items right after), before anything is awaited.
 */
export function dropLinks(dt: DataTransfer | null | undefined): Promise<FileLink[]> | null {
  if (!dt?.items || !canRemember()) return null;
  type LinkItem = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileLink | null> };
  const asks = [...(dt.items as unknown as Iterable<LinkItem>)]
    .filter((i) => i.kind === 'file' && typeof i.getAsFileSystemHandle === 'function')
    .map((i) => i.getAsFileSystemHandle!().catch(() => null));
  if (!asks.length) return null;
  return Promise.all(asks).then((links) => links.filter((l): l is FileLink => l?.kind === 'file'));
}

/**
 * The browser's file chooser, giving links as well as the files. `null`: the visitor closed it.
 * `'plain'`: not available here; use the ordinary <input type=file> instead.
 */
export async function chooseWithLinks(): Promise<{ files: File[]; links: FileLink[] } | 'plain' | null> {
  if (!canRemember()) return 'plain';
  try {
    const links = await (window as PickerWindow).showOpenFilePicker!({ multiple: true, id: 'formatreader' });
    return { files: await Promise.all(links.map((l) => l.getFile())), links };
  } catch (err) {
    return (err as DOMException)?.name === 'AbortError' ? null : 'plain';
  }
}

/**
 * The browser's folder chooser, view only. Must be called straight from a click (before
 * anything is awaited). `null`: closed, or not available here.
 */
export async function chooseFolder(): Promise<FolderLink | null> {
  const w = window as PickerWindow;
  if (typeof w.showDirectoryPicker !== 'function') return null;
  try {
    return await w.showDirectoryPicker({ mode: 'read', id: 'formatreader-folder' });
  } catch {
    return null;
  }
}
