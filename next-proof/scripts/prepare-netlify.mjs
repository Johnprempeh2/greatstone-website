import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const target = process.argv[2];
const editor = process.argv[3] === '--editor';
if (!target) throw new Error('Pass a new scratch directory for the proof deploy.');
if (process.argv[3] && !editor) throw new Error('Only --editor is supported as a preparation mode.');
await mkdir(target, { recursive: true });
const files = ['src', 'app', 'contracts', 'next-proof', 'public', 'scripts', 'package.json', 'package-lock.json', 'next.config.mjs', 'middleware.js'];
if (!editor) files.push('netlify/functions', 'supabase/functions/_shared');
for (const name of files) {
  await cp(resolve(root, name), resolve(target, name), {
    recursive: true,
    filter: (path) => !['public/_redirects', 'public/_headers'].some((suffix) => path.endsWith(suffix)),
  });
}
await cp(resolve(root, editor ? 'next-proof/netlify.editor.toml' : 'next-proof/netlify.toml'), resolve(target, 'netlify.toml'));
if (editor) {
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
  pkg.scripts['build:next:editor'] = 'node scripts/gen-seo-files.mjs && node scripts/prepare-puck-css.mjs && next build';
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}
console.log(`Prepared isolated Next ${editor ? 'editor' : 'proof'} at ${target}`);
