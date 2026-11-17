// Small, idempotent fixes to dependencies, applied before dev/build/test.
// Each patch names the exact text it replaces; if an update changes that text
// the build stops here, so the patch is re-checked instead of silently lost.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const patches = [
  {
    // mdb-reader: one column of a type it does not know made the whole table
    // unreadable. Name the type instead of throwing; its values are then
    // reported as unsupported and the viewer leaves just that column out.
    files: ['node_modules/mdb-reader/lib/browser/column.js', 'node_modules/mdb-reader/lib/node/column.js'],
    from: 'throw new Error("Unsupported column type");',
    to: 'return `unsupported-0x${Number(typeValue).toString(16)}`;',
  },
];

for (const { files, from, to } of patches)
  for (const rel of files) {
    const file = join(root, rel);
    if (!existsSync(file)) continue;
    const src = readFileSync(file, 'utf8');
    if (src.includes(to)) continue;
    if (!src.includes(from)) throw new Error(`patch-deps: expected text not found in ${rel}; re-check this patch after the update.`);
    writeFileSync(file, src.replace(from, to));
    console.log(`patched ${rel}`);
  }
