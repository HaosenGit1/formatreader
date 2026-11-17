// Copies browser engines that must be served as separate files (workers,
// WebAssembly) from node_modules into public/vendor/<name>-<version>/.
// Runs before dev/build, so updating the npm package updates the site.
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'public', 'vendor');
rmSync(out, { recursive: true, force: true });

const pkg = (name) => JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'));
const copies = [{ name: 'libarchive.js', files: ['dist/worker-bundle.js', 'dist/libarchive.wasm'] }];

for (const { name, files } of copies) {
  const dir = join(out, `${name.replace(/[^a-z0-9]+/gi, '-')}-${pkg(name).version}`);
  mkdirSync(dir, { recursive: true });
  for (const f of files) cpSync(join(root, 'node_modules', name, f), join(dir, f.split('/').pop()));
  console.log(`vendor: ${name}@${pkg(name).version} → ${dir.replace(root + '/', '')}`);
}
