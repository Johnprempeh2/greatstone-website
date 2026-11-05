import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// The public site builds from the checkout itself (root netlify.toml, GRE-3873). Only the gsam-editor alias
// still needs a prepared copy: its own config, no visitor functions and no Netlify Database dependencies.
const root = resolve(import.meta.dirname, '../..');
const target = process.argv[2];
if (!target) throw new Error('Pass a new scratch directory for the editor alias.');
if (process.argv[3] !== '--editor') throw new Error('Only the editor alias is prepared: pass --editor. The site builds from the checkout.');
await mkdir(target, { recursive: true });
// The editor has no functions, but the portal and catalogue pages import the shared helpers (GRE-3768).
const files = ['src', 'app', 'next-proof', 'public', 'scripts', 'contracts', 'package.json', 'package-lock.json', 'next.config.mjs', 'middleware.js', 'netlify/functions/lib/shared'];
for (const name of files) await cp(resolve(root, name), resolve(target, name), { recursive: true });
await cp(resolve(root, 'next-proof/netlify.editor.toml'), resolve(target, 'netlify.toml'));
const packagePath = resolve(target, 'package.json');
const lockPath = resolve(target, 'package-lock.json');
const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
const lock = JSON.parse(await readFile(lockPath, 'utf8'));
for (const name of ['@netlify/database', '@netlify/database-dev']) {
  delete pkg.dependencies?.[name];
  delete pkg.devDependencies?.[name];
  delete lock.packages[''].dependencies?.[name];
  delete lock.packages[''].devDependencies?.[name];
}
pkg.scripts['build:next:editor'] = 'node scripts/gen-seo-files.mjs && node scripts/gen-contract-file.mjs && node scripts/prepare-puck-css.mjs && next build';
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`Prepared isolated Next editor at ${target}`);
