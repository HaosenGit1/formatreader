/**
 * Files that belong together: a Shapefile is a .shp (shapes) with a .dbf (attributes),
 * .prj (coordinate system) and .cpg (text code page) of the same name. When the .shp is
 * opened from a folder, a ZIP or a multi-file drop, its partners come along.
 */
export const SHAPE_PARTS = ['dbf', 'prj', 'cpg'] as const;

export type ShapeParts = Partial<Record<(typeof SHAPE_PARTS)[number], File>>;

const base = (path: string) => path.replace(/\.[^./\\]+$/, '').toLowerCase();

/** Attaches the partner files found by `find` (given a sibling's path) to a .shp file. */
export async function attachShapeParts(file: File, path: string, siblings: string[], get: (path: string) => Promise<File>): Promise<File> {
  if (!/\.shp$/i.test(path)) return file;
  const parts: ShapeParts = {};
  for (const ext of SHAPE_PARTS) {
    const match = siblings.find((p) => base(p) === base(path) && p.toLowerCase().endsWith(`.${ext}`));
    if (match) {
      try {
        parts[ext] = await get(match);
      } catch {
        /* a missing partner only means fewer details */
      }
    }
  }
  if (Object.keys(parts).length) Object.defineProperty(file, 'shapeParts', { value: parts });
  return file;
}

/** Several files dropped or picked at once: the one to open (a .shp brings its partners). */
export async function pickFromMany(files: File[]): Promise<File> {
  const shp = files.find((f) => /\.shp$/i.test(f.name));
  if (!shp) return files[0];
  const byName = new Map(files.map((f) => [f.name, f]));
  return attachShapeParts(shp, shp.name, [...byName.keys()], async (n) => byName.get(n)!);
}
