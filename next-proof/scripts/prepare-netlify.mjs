import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const target = process.argv[2];
if (!target) throw new Error('Pass a new scratch directory for the proof deploy.');
await mkdir(target, { recursive: true });
for (const name of ['src', 'app', 'next-proof', 'public', 'scripts', 'netlify/functions', 'supabase/functions/_shared', 'package.json', 'package-lock.json', 'next.config.mjs']) {
  await cp(resolve(root, name), resolve(target, name), {
    recursive: true,
    filter: (path) => !['public/_redirects', 'public/_headers'].some((suffix) => path.endsWith(suffix)),
  });
}
await cp(resolve(root, 'next-proof/netlify.toml'), resolve(target, 'netlify.toml'));
console.log(`Prepared isolated Next proof at ${target}`);
