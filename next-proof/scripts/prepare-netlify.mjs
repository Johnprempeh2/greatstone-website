import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const target = process.argv[2];
const editor = process.argv[3] === '--editor';
if (!target) throw new Error('Pass a new scratch directory for the proof deploy.');
if (process.argv[3] && !editor) throw new Error('Only --editor is supported as a preparation mode.');
await mkdir(target, { recursive: true });
const EDITOR_PRICING = `// Editor build: no database, so no live prices (written by next-proof/scripts/prepare-netlify.mjs).
export async function readLivePricing() {
  return null;
}
`;
const files = ['src', 'app', 'next-proof', 'public', 'scripts', 'contracts', 'package.json', 'package-lock.json', 'next.config.mjs', 'middleware.js'];
// The functions import netlify/database (owner-import); the Vite deploy carries both, so the Next deploy does too.
if (!editor) files.push('netlify/functions', 'netlify/database');
// The editor has no functions, but the portal and catalogue pages import the shared helpers (GRE-3768).
// The voice interview client imports the dependency-free barge-in rules (GRE-4282)
// and the Deepgram region map (GRE-2687). The shop prices its cards through the catalogue store (GRE-4714).
else files.push('netlify/functions/lib/shared', 'netlify/functions/lib/interview/voice/barge-in.mjs', 'netlify/functions/lib/interview/voice/regions.mjs',
  'netlify/functions/lib/catalogue-store.mjs');
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
  // The editor has no database, so its pool is always absent and the shop reads "Price on application".
  await writeFile(resolve(target, 'netlify/functions/lib/db.mjs'),
    '// The editor has no Netlify Database (prepare-netlify.mjs --editor).\nexport function getPool() { return null; }\n');
  pkg.scripts['build:next:editor'] = 'node scripts/gen-seo-files.mjs && node scripts/gen-contract-file.mjs && node scripts/prepare-puck-css.mjs && next build';
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  // The editor has no database: shop pages read "Price on application" (GRE-4720).
  await writeFile(resolve(target, 'app/catalogue-pricing-live.js'), EDITOR_PRICING);
}
console.log(`Prepared isolated Next ${editor ? 'editor' : 'proof'} at ${target}`);
