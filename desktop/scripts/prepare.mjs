// Builds the web app (Next "standalone" output) and copies it, with its static files, into desktop/build/server,
// which the app starts as its local server. `--skip-build` reuses an existing web/.next.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const web = path.resolve(desktop, '..', 'web');
const out = path.join(desktop, 'build', 'server');

if (!process.argv.includes('--skip-build')) {
  console.log('> building the web app');
  const r = spawnSync('npm', ['run', 'build'], { cwd: web, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const standalone = path.join(web, '.next', 'standalone');
if (!fs.existsSync(standalone)) {
  console.error('web/.next/standalone is missing: run without --skip-build');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(standalone, out, { recursive: true, dereference: true });

// server.js sits at the root of the standalone folder, or one level down when Next traced from a parent folder.
function findEntry(dir, depth = 0) {
  if (fs.existsSync(path.join(dir, 'server.js'))) return dir;
  if (depth >= 2) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') {
      const f = findEntry(path.join(dir, e.name), depth + 1);
      if (f) return f;
    }
  }
  return null;
}
const entryDir = findEntry(out);
if (!entryDir) {
  console.error('no server.js in the standalone output');
  process.exit(1);
}
// Next's file tracing drags the project's own sources and test files along; the running server needs none of them.
for (const junk of ['src', 'tests', 'scripts', 'test-results', 'Dockerfile', '.dockerignore', 'package-lock.json', 'next.config.ts', 'playwright.config.ts', 'playwright.prod.config.ts', 'vitest.config.ts', 'tsconfig.json', 'tsconfig.tsbuildinfo', 'next-env.d.ts']) {
  fs.rmSync(path.join(entryDir, junk), { recursive: true, force: true });
}
// electron-builder silently drops any top-level "node_modules" folder from extra resources, so the server's
// dependencies travel as "lib_modules" and the app points NODE_PATH at them (see main.js).
for (const d of new Set([out, entryDir])) {
  if (fs.existsSync(path.join(d, 'node_modules'))) fs.renameSync(path.join(d, 'node_modules'), path.join(d, 'lib_modules'));
}
fs.cpSync(path.join(web, '.next', 'static'), path.join(entryDir, '.next', 'static'), { recursive: true });
if (fs.existsSync(path.join(web, 'public'))) fs.cpSync(path.join(web, 'public'), path.join(entryDir, 'public'), { recursive: true });
fs.writeFileSync(path.join(out, 'entry.json'), JSON.stringify({ entry: path.relative(out, path.join(entryDir, 'server.js')).split(path.sep).join('/') }));

fs.mkdirSync(path.join(desktop, 'build'), { recursive: true });
fs.copyFileSync(path.join(web, 'public', 'icon-512.png'), path.join(desktop, 'build', 'icon.png'));
console.log('> local server ready in', path.relative(process.cwd(), out));
