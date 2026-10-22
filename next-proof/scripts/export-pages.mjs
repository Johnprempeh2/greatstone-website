import { build } from 'esbuild';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { toProofRelease } from '../release-adapter.mjs';

const root = resolve(import.meta.dirname, '../..');
const temp = await mkdtemp(join(root, 'node_modules/.next-proof-'));
try {
  const outfile = join(temp, 'seed.mjs');
  await build({
    entryPoints: [join(root, 'src/store.js')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    loader: { '.js': 'jsx', '.jsx': 'jsx' },
    jsx: 'automatic',
    define: { 'import.meta.env.VITE_TWO_DOORS_DRAFT_CONTENT': 'false' },
    logLevel: 'warning',
  });
  const { seedState } = await import(pathToFileURL(outfile).href);
  const originalRandom = Math.random;
  let randomState = 0x1833;
  Math.random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  let snapshot;
  try { snapshot = seedState(); }
  finally { Math.random = originalRandom; }
  const { pages, settings, navigation } = snapshot;
  const publishedSlugs = snapshot.order.filter((slug) => pages[slug]?.status === 'published' && pages[slug]?.published?.content?.length);
  const selected = { settings, navigation: navigation.filter((item) => item.type === 'page' && publishedSlugs.includes(item.pageSlug)), pages: Object.fromEntries(publishedSlugs.map((slug) => [slug, {
    title: pages[slug].title,
    seo: pages[slug].seo,
    data: pages[slug].published,
  }])) };
  await writeFile(resolve(import.meta.dirname, '../data/release.json'), JSON.stringify(toProofRelease(selected), null, 2) + '\n');
  console.log(`Exported schema 1 release for ${publishedSlugs.length} published pages`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
