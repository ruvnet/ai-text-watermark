// Runs every README quickstart snippet that is marked runnable.
//
// A snippet is runnable when the line `<!-- quickstart:run -->` sits directly
// above its ```js fence in packages/*/README.md. Each snippet is written into
// the directory given as argv[2] (where the packed tarballs are installed) and
// run with node; any non-zero exit fails the job.
//
// Usage: node scripts/ci/run-quickstarts.mjs <install-dir> [--min N]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = process.argv[2] && resolve(process.argv[2]);
const minIdx = process.argv.indexOf('--min');
const min = minIdx > 0 ? Number(process.argv[minIdx + 1]) : 0;
if (!dir || !existsSync(dir) || !Number.isInteger(min) || min < 0) {
  console.error('usage: run-quickstarts.mjs <install-dir> [--min N]');
  process.exit(2);
}

const marker = /<!--\s*quickstart:run\s*-->\s*\n```js\n([\s\S]*?)\n```/g;
let ran = 0;
let failed = 0;
for (const pkg of readdirSync(join(root, 'packages')).sort()) {
  const readme = join(root, 'packages', pkg, 'README.md');
  if (!existsSync(readme)) continue;
  let i = 0;
  for (const m of readFileSync(readme, 'utf8').matchAll(marker)) {
    const file = join(dir, `quickstart-${pkg}-${i++}.cjs`);
    writeFileSync(file, m[1] + '\n');
    const r = spawnSync(process.execPath, [file], { cwd: dir, encoding: 'utf8' });
    ran++;
    console.log(`--- ${pkg} snippet ${i} (exit ${r.status})\n${r.stdout}${r.stderr}`);
    if (r.status !== 0) failed++;
  }
}
console.log(`${ran} snippet(s) run, ${failed} failed`);
if (failed > 0 || ran < min) process.exit(1);
