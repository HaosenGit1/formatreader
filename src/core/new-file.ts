/**
 * "New file": the ✏️ next to an editable format on the Formats page links to /?new=<ext>,
 * which opens an empty file of that kind straight in the editor. Saving downloads it
 * (nothing is written anywhere else).
 */
export const freshFiles = new WeakSet<File>();

/** The empty file asked for by ?new=<ext>, or null. */
export function newFileFromAddress(untitled: string): File | null {
  let ext: string | null = null;
  try {
    ext = new URLSearchParams(location.search).get('new');
  } catch {
    return null;
  }
  if (!ext || !/^[a-z0-9]{1,10}$/i.test(ext)) return null;
  const file = new File([], `${untitled}.${ext.toLowerCase()}`, { type: '' });
  freshFiles.add(file);
  // Don't create another one on reload.
  try {
    const url = new URL(location.href);
    url.searchParams.delete('new');
    history.replaceState(history.state, '', url);
  } catch {
    /* fine */
  }
  return file;
}
