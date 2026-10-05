#!/usr/bin/env node
// seo-report.mjs — a read-only indexability report for a built site.
//
//   npm run seo:report            # reads dist/
//   npm run seo:report -- <dir>   # reads another build
//   npm run launch:check          # the same report with --launch: a gate for go-live
//
// Prints one line per HTML page, INDEXABLE or NOINDEX with where the noindex comes from (meta tag,
// X-Robots-Tag in _headers, or a robots.txt Disallow), then a summary line. Logic: src/lib/seo-report.mjs.
//
// Without --launch it ALWAYS exits 0: before cutover the site is meant to say noindex, so preview builds
// and `npm run preflight` must never fail on it. With --launch (GRE-836, GRE-483 row 94) it exits 1 unless
// the summary is INDEXABLE. The switch is the explicit flag, not an env var: `vite build` is always a
// production build and VITE_SITE_ORIGIN may be pinned before go-live, so neither tells us "this is launch".
// Run it at cutover only (docs/DOMAIN-CUTOVER.md).

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { indexabilityReport } from '../src/lib/seo-report.mjs';

const args = process.argv.slice(2);
const launch = args.includes('--launch');
const dir = args.find((a) => !a.startsWith('--')) || 'dist';

function walk(d) {
  const out = [];
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const read = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null);

if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.log('Summary: NO PAGES. No %s/ to read; run `npm run build` first.', dir);
  if (launch) console.log('Launch check: FAIL. There is no build to check.');
  process.exit(launch ? 1 : 0);
}

const pages = walk(dir)
  .filter((f) => f.endsWith('.html'))
  .map((f) => ({ file: relative(dir, f), html: readFileSync(f, 'utf8') }));
const headers = read('_headers');
const robots = read('robots.txt');
const { rows, status } = indexabilityReport({ pages, headers, robots });

for (const r of rows) {
  console.log('%s  %s%s', r.status.padEnd(9), r.path, r.sources.length ? '  ← ' + r.sources.join('; ') : '');
}
const blocked = rows.filter((r) => r.status === 'NOINDEX').length;
console.log(
  'Summary: %s. %d of %d HTML page(s) indexable in %s/ (_headers %s, robots.txt %s).',
  status, rows.length - blocked, rows.length, dir, headers === null ? 'absent' : 'read', robots === null ? 'absent' : 'read',
);

if (launch) {
  if (status === 'INDEXABLE') {
    console.log('Launch check: PASS. Search engines may index every page.');
  } else {
    console.log('Launch check: FAIL. Remove the noindex source named above, rebuild, and run this again.');
    process.exit(1);
  }
}
