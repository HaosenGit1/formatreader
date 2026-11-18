/** A folder the user dropped: kept on the trail so it can be shown again (view in folder-view.ts). */
export class FolderSource {
  readonly kind = 'folder';
  constructor(readonly entry: FileSystemDirectoryEntry) {}
  get name(): string {
    return this.entry.name;
  }
}
