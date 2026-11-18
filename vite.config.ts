import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';

/** Viewer id → its module file, read from src/categories/<category>/index.ts. */
function viewerModules(): Map<string, string> {
  const map = new Map<string, string>();
  const root = resolve('src/categories');
  for (const cat of readdirSync(root)) {
    const index = join(root, cat, 'index.ts');
    let src = '';
    try {
      src = readFileSync(index, 'utf8');
    } catch {
      continue;
    }
    const ids = [...src.matchAll(/\bid:\s*'([^']+)'/g)];
    for (const m of src.matchAll(/\bid:\s*'([^']+)'[\s\S]*?load:\s*\(\)\s*=>\s*import\('([^']+)'\)/g)) map.set(m[1], resolve(dirname(index), m[2] + '.ts'));
    for (const [, id] of ids) if (!map.has(id)) throw new Error(`offline: could not find the module of viewer ${id} in ${index}`);
  }
  return map;
}

/** Writes dist/sw.js (offline support) with the exact file list of this build. */
function offlinePlugin(): Plugin {
  let outDir = 'dist';
  /**
   * Viewer id → files it needs. `base`: the viewer itself (enough for its common
   * types, e.g. CSV). `all`: plus engines it loads for some types (e.g. Excel).
   */
  const viewers: Record<string, { base: string[]; all: string[] }> = {};
  return {
    name: 'formatreader-offline',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    generateBundle(_options, bundle) {
      type Chunk = { type: 'chunk'; isEntry: boolean; fileName: string; facadeModuleId: string | null; imports: string[]; dynamicImports: string[]; code: string; viteMetadata?: { importedCss: Set<string>; importedAssets: Set<string> } };
      const chunks = Object.values(bundle).filter((c): c is Chunk & typeof c => c.type === 'chunk') as unknown as Chunk[];
      const byFile = new Map(chunks.map((c) => [c.fileName, c]));
      const assets = Object.values(bundle).filter((a) => a.type === 'asset').map((a) => a.fileName);
      // Optional extras a viewer works without: the encoding detector (detection falls back to
      // built-in checks) and syntax colouring (code shows uncoloured).
      const optional = (c: Chunk) => /jschardet|highlight\.js|\/langs\//.test(c.facadeModuleId ?? c.fileName);
      for (const [id, module] of viewerModules()) {
        const entry = chunks.find((c) => c.facadeModuleId === module);
        if (!entry) throw new Error(`offline: no chunk for viewer ${id} (${module})`);
        const walk = (withDynamic: boolean) => {
          const files = new Set<string>();
          const visit = (c: Chunk) => {
            // The app's entry file is always stored (core); walking into it would reach every viewer.
            if (files.has(c.fileName) || optional(c) || (c.isEntry && c !== entry)) return;
            files.add(c.fileName);
            c.viteMetadata?.importedCss.forEach((f) => files.add(f));
            c.viteMetadata?.importedAssets.forEach((f) => files.add(f));
            for (const a of assets) if (c.code.includes(a.split('/').pop()!)) files.add(a); // e.g. WebAssembly loaded by URL
            for (const f of withDynamic ? [...c.imports, ...c.dynamicImports] : c.imports) {
              const next = byFile.get(f);
              if (next) visit(next);
            }
          };
          visit(entry);
          return [...files];
        };
        viewers[id] = { base: walk(false), all: walk(true) };
      }
    },
    closeBundle() {
      const walk = (dir: string): string[] =>
        readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [relative(outDir, join(dir, f)).split('\\').join('/')]));
      const files = walk(outDir).filter((f) => f !== 'sw.js' && !f.startsWith('.')).sort();
      const html = readFileSync(join(outDir, 'index.html'), 'utf8');
      // The page plus everything it links directly (entry script, styles, icons, manifest).
      const linked = [...html.matchAll(/(?:src|href)="\.?\/?([^"#?]+)"/g)].map((m) => m[1]).filter((f) => files.includes(f));
      const core = [...new Set(['index.html', ...linked])];
      // Engines served from public/vendor (loaded by URL at run time) belong to the viewer that names them.
      for (const v of Object.values(viewers))
        for (const list of [v.base, v.all]) {
          const code = list.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(outDir, f), 'utf8')).join('\n');
          for (const f of files) if (f.startsWith('vendor/') && code.includes(f.split('/')[1].replace(/-[\d.]+$/, ''))) list.push(f);
        }
      const sizeOf = (f: string) => {
        const b = readFileSync(join(outDir, f));
        return /\.(js|css|html|json|svg|mjs)$/.test(f) ? gzipSync(b).length : b.length;
      };
      const totalBytes = files.reduce((n, f) => n + sizeOf(f), 0);
      const version = createHash('sha256').update(files.map((f) => f + ':' + statSync(join(outDir, f)).size).join('\n') + html).digest('hex').slice(0, 12);
      const sw = readFileSync('scripts/sw-template.js', 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('__FILES__', JSON.stringify(files))
        .replace('__CORE__', JSON.stringify(core))
        .replace('__VIEWERS__', JSON.stringify(viewers))
        .replace('__TOTAL_BYTES__', String(totalBytes));
      writeFileSync(join(outDir, 'sw.js'), sw);
      console.log(`  offline: sw.js ${version}, ${core.length} core files, ${Object.keys(viewers).length} viewers, ${files.length} files, ${(totalBytes / 1e6).toFixed(1)} MB to store everything`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [offlinePlugin()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
