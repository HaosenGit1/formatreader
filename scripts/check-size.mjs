// Speed budget: the code a visitor downloads before seeing the front page
// must stay small. Everything else (viewers, libraries) loads on demand.
// Runs after `vite build`; fails the build if the budget is exceeded.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 60; // gzipped JS + CSS needed for the first screen

const dist = join(process.cwd(), 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*href="\.?\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const files = [...new Set([...assets, ...preloads])];

let total = 0;
for (const f of files) {
  const gz = gzipSync(readFileSync(join(dist, f))).length;
  total += gz;
  console.log(`  ${f.padEnd(44)} ${(gz / 1024).toFixed(1).padStart(6)} KB gz`);
}
const kb = total / 1024;
console.log(`  first load: ${kb.toFixed(1)} KB gz (budget ${BUDGET_KB} KB)`);
if (kb > BUDGET_KB) {
  console.error(`✗ First-load size ${kb.toFixed(1)} KB exceeds the ${BUDGET_KB} KB budget.`);
  process.exit(1);
}
console.log('✓ within budget');
