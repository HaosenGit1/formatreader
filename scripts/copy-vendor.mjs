// Copies browser engines that must be served as separate files (workers,
// WebAssembly) from node_modules into public/vendor/<name>-<version>/.
// Runs before dev/build, so updating the npm package updates the site.
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'public', 'vendor');
rmSync(out, { recursive: true, force: true });

const pkg = (name) => JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'));
const ruffleFiles = readdirSync(join(root, 'node_modules', '@ruffle-rs', 'ruffle')).filter((f) => /^(ruffle\.js|core\.ruffle\.[\w]+\.js|[\w]+\.wasm)$/.test(f));
const copies = [
  { name: 'libarchive.js', files: ['dist/worker-bundle.js', 'dist/libarchive.wasm'] },
  // Flash (SWF) player: loads its own core and WebAssembly from this folder.
  { name: '@ruffle-rs/ruffle', dir: 'ruffle', files: ruffleFiles },
];

for (const { name, dir: short, files } of copies) {
  const dir = join(out, `${short ?? name.replace(/[^a-z0-9]+/gi, '-')}-${pkg(name).version}`);
  mkdirSync(dir, { recursive: true });
  for (const f of files) cpSync(join(root, 'node_modules', name, f), join(dir, f.split('/').pop()));
  console.log(`vendor: ${name}@${pkg(name).version} → ${dir.replace(root + '/', '')}`);
}
