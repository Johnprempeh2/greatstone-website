#!/usr/bin/env node
// seo-report.mjs — a read-only indexability report for a built site.
//
//   npm run seo:report            # reads dist/
//   npm run seo:report -- <dir>   # reads another build
//
// Prints one line per HTML page, INDEXABLE or NOINDEX with where the noindex comes from (meta tag,
// X-Robots-Tag in _headers, or a robots.txt Disallow), then a summary line. It ALWAYS exits 0: it is a
// report for the cutover checklist (docs/DOMAIN-CUTOVER.md), not a gate. Logic: src/lib/seo-report.mjs.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { indexabilityReport } from '../src/lib/seo-report.mjs';

const dir = process.argv[2] || 'dist';

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
  process.exit(0);
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
