// Build-time SEO generator: stamps the canonical origin into public/sitemap.xml + public/robots.txt.
// Wired as the npm `prebuild` hook, so it runs automatically before every `vite build`. The origin comes
// from VITE_SITE_ORIGIN (the same var Vite injects), so the cutover to the real domain stays a config
// change, not a migration. With the var unset it falls back to the live host. Dependency-free (node builtins).
import { rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildSitemapXml, buildRobotsTxt, normaliseOrigin } from '../src/lib/seo-files.mjs';

const DEFAULT_ORIGIN = 'https://greatstoneint.com'; // the canonical domain (decided 2 Jul: permanent, no move); VITE_SITE_ORIGIN overrides it

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '..', 'public');

const origin = normaliseOrigin(process.env.VITE_SITE_ORIGIN, DEFAULT_ORIGIN);
const lastmod = new Date().toISOString().slice(0, 10);

// The Next build serves /sitemap.xml from app/sitemap.js (every published page), so it skips the
// one-URL SPA file, and removes a stale copy that Next would refuse as a clash.
if (process.argv.includes('--no-sitemap')) await rm(resolve(publicDir, 'sitemap.xml'), { force: true });
else await writeFile(resolve(publicDir, 'sitemap.xml'), buildSitemapXml(origin, { lastmod }), 'utf8');
await writeFile(resolve(publicDir, 'robots.txt'), buildRobotsTxt(origin), 'utf8');

console.log('[seo] stamped ' + (process.argv.includes('--no-sitemap') ? '' : 'sitemap.xml + ') + 'robots.txt for origin ' + origin + ' (lastmod ' + lastmod + ')');
