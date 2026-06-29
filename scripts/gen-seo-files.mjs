// Build-time SEO generator: stamps the canonical origin into public/sitemap.xml + public/robots.txt.
// Wired as the npm `prebuild` hook, so it runs automatically before every `vite build`. The origin comes
// from VITE_SITE_ORIGIN (the same var Vite injects), so the cutover to the real domain stays a config
// change, not a migration. With the var unset it falls back to the live host. Dependency-free (node builtins).
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildSitemapXml, buildRobotsTxt, normaliseOrigin } from '../src/lib/seo-files.mjs';

const DEFAULT_ORIGIN = 'https://greatstone-home.netlify.app'; // the one place a default host lives; VITE_SITE_ORIGIN overrides it

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '..', 'public');

const origin = normaliseOrigin(process.env.VITE_SITE_ORIGIN, DEFAULT_ORIGIN);
const lastmod = new Date().toISOString().slice(0, 10);

await writeFile(resolve(publicDir, 'sitemap.xml'), buildSitemapXml(origin, { lastmod }), 'utf8');
await writeFile(resolve(publicDir, 'robots.txt'), buildRobotsTxt(origin), 'utf8');

console.log('[seo] stamped sitemap.xml + robots.txt for origin ' + origin + ' (lastmod ' + lastmod + ')');
