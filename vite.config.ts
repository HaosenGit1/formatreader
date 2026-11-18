import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { defineConfig, loadEnv, type Plugin } from 'vite';
// @ts-expect-error plain JS module shared with the tests
import { formatsHtml } from './scripts/formats-catalog.mjs';
// @ts-expect-error plain JS module shared with the tests
import { withAnalyticsCsp } from './scripts/analytics-csp.mjs';

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
      // Workers are emitted as assets: what they load (e.g. WebAssembly) is found in their source.
      const assetText = (f: string) => {
        const a = bundle[f];
        return a?.type === 'asset' && f.endsWith('.js') ? String(a.source) : '';
      };
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
            for (const a of assets) {
              if (!c.code.includes(a.split('/').pop()!)) continue; // e.g. WebAssembly loaded by URL
              files.add(a);
              const inner = assetText(a);
              for (const b of assets) if (inner && inner.includes(b.split('/').pop()!)) files.add(b);
            }
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

/** Fills formats.html with the supported-format list (static HTML, readable by search engines). */
function formatsPagePlugin(): Plugin {
  return {
    name: 'formatreader-formats-page',
    transformIndexHtml(html, ctx) {
      if (!ctx.filename.endsWith('formats.html')) return html;
      const { html: list, count } = formatsHtml();
      return html.replace('<!--FORMATS-->', list).replace('<!--FORMATS_COUNT-->', String(count));
    },
  };
}

/**
 * Website build with VITE_GA_ID set: lets the pages reach Google Analytics
 * (see scripts/analytics-csp.mjs). Not used in development or the portable file.
 */
function analyticsCspPlugin(gaId: string | undefined): Plugin {
  return {
    name: 'formatreader-analytics-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return gaId && /^G-[A-Z0-9]{4,20}$/.test(gaId) ? withAnalyticsCsp(html) : html;
    },
  };
}

/**
 * Portable build (`npm run build:portable`): the whole app in ONE file,
 * dist-portable/FormatReader.html, for computers without internet. Carry it on
 * a USB stick and open it in any browser (double-click, or drag it in).
 * Every script, style and WebAssembly engine is inlined; the page's security
 * rule allows only this exact inlined script (by its hash), so scripts inside
 * opened documents still cannot run.
 */
function portablePlugin(): Plugin {
  let outDir = 'dist-portable';
  return {
    name: 'formatreader-portable',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    // Runs on the finished files (after every Vite step), then leaves only FormatReader.html.
    closeBundle() {
      const read = (file: string) => readFileSync(join(outDir, file), 'utf8');
      let page = read('index.html');
      const scripts: string[] = [];
      page = page.replace(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/g, (_m, file) => {
        const code = read(file).replace(/<\/script/gi, '<\\/script');
        scripts.push(code);
        return `<script type="module">${code}</script>`;
      });
      page = page.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g, (_m, file) => `<style>${read(file)}</style>`);
      page = page.replace(/<link rel="modulepreload"[^>]*>/g, '');
      // Only the favicon is kept (inlined); the app manifest and touch icon belong to the website.
      page = page.replace(/<link rel="(manifest|apple-touch-icon)"[^>]*>\s*/g, '');
      const favicon = readFileSync('public/favicon.svg');
      page = page.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/svg+xml;base64,${favicon.toString('base64')}" />`);
      // Node-style `process` that some bundled libraries (Access reader) touch when they load:
      // in the single file they load together, so the stand-in must exist before anything runs.
      const shim = "globalThis.process ??= { browser: true, version: '', versions: {}, env: {}, nextTick: (f, ...a) => queueMicrotask(() => f(...a)) };";
      scripts.unshift(shim);
      page = page.replace('<script type="module">', `<script>${shim}</script>\n    <script type="module">`);
      const hashes = scripts.map((code) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`).join(' ');
      // 'unsafe-eval': the CAD engines' glue builds functions at run time. On the website they run in a
      // worker, outside this policy; a file opened from disk can't start such a worker. Inline scripts
      // (e.g. inside documents) stay blocked: only the hashed scripts above may run.
      page = page.replace(/script-src 'self'/, `script-src 'self' ${hashes} 'unsafe-eval'`).replace(/default-src 'self' blob:;/, "default-src 'self' blob:; worker-src blob: data:;");
      const stamp = new Date().toISOString().slice(0, 10);
      page = page.replace('<title>FormatReader</title>', `<title>FormatReader</title>\n    <meta name="formatreader-portable" content="${stamp}" />`);
      if (/src="\.?\/?assets\//.test(page) || page.includes('__VITE_PRELOAD__')) throw new Error('portable: something was not inlined');
      for (const f of readdirSync(outDir)) rmSync(join(outDir, f), { recursive: true, force: true });
      writeFileSync(join(outDir, 'FormatReader.html'), page);
      console.log(`  portable: ${outDir}/FormatReader.html ${(page.length / 1e6).toFixed(1)} MB (${stamp})`);
    },
  };
}

export default defineConfig(({ mode }) =>
  mode === 'portable'
    ? {
        resolve: {
          alias: [
            // No workers in the single file: stand-ins keep the worker bundles (and a second copy of each engine) out.
            { find: /^\.\/(dwg|cad|drawing|sheet)-worker-host$/, replacement: resolve('src/offline/worker-host-stub.ts') },
          ],
        },
        base: './',
        plugins: [portablePlugin()],
        build: {
          target: 'es2022',
          sourcemap: false,
          outDir: 'dist-portable',
          emptyOutDir: true,
          copyPublicDir: false,
          assetsInlineLimit: 100_000_000, // WebAssembly engines become data: URLs
          cssCodeSplit: false,
          chunkSizeWarningLimit: 100_000,
          rollupOptions: { input: resolve('index.html'), output: { inlineDynamicImports: true } },
        },
      }
    : {
        base: './',
        plugins: [formatsPagePlugin(), analyticsCspPlugin(loadEnv(mode, process.cwd(), 'VITE_').VITE_GA_ID), offlinePlugin()],
        build: {
          target: 'es2022',
          sourcemap: false,
          rollupOptions: {
            input: { main: resolve('index.html'), formats: resolve('formats.html') },
            output: {
              // Small helpers shared by the app and every viewer live in their own file. Otherwise they sit
              // in the app's entry file, and any change to the front page would rename every viewer file
              // (each refers to the entry by name) and make returning visitors download everything again.
              manualChunks(id: string) {
                if (/[\\/]src[\\/]core[\\/](dom|i18n|viewer|info-view|info-entry|registry|detect-format|zip|mime)\.ts$/.test(id)) return 'core';
                // Vite's helper for loading viewers (and their styles) on demand.
                if (id.includes('vite/preload-helper') || id.includes('vite/modulepreload-polyfill')) return 'core';
                return undefined;
              },
            },
          },
        },
        test: {
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
);
