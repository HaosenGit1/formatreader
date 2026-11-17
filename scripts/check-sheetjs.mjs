// SheetJS is installed from its own CDN (its npm package is outdated), so
// Dependabot cannot see new versions. This prints the newer version, if any.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const current = /xlsx-(\d+\.\d+\.\d+)\.tgz/.exec(pkg.dependencies.xlsx)?.[1];
const res = await fetch('https://cdn.sheetjs.com/xlsx-latest/package/package.json');
const latest = res.ok ? (await res.json()).version : null;
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
if (current && latest && newer(latest, current)) {
  console.log(latest);
} else {
  console.error(`SheetJS up to date (installed ${current}, latest ${latest ?? 'unknown'})`);
}
