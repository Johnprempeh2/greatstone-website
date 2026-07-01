#!/usr/bin/env node
// Generate the legacy → SPA 301 block in public/_redirects from the crawled old-site URL list.
//
//   node scripts/gen-legacy-redirects.mjs           # rewrite the block in public/_redirects
//   node scripts/gen-legacy-redirects.mjs --check    # verify it is in sync (exit 1 if not); for CI
//   node scripts/gen-legacy-redirects.mjs --audit     # print how every known old URL is handled
//
// The block sits between the BEGIN/END markers; everything else in _redirects (the /puck-proof rules and
// the SPA fallback, which MUST stay last) is preserved untouched. Idempotent: re-running with the same input
// changes nothing. When Ben supplies the migrated product-slug map, add exact /vendor/product → /#product/<slug>
// lines above the vendor wildcards (they win by being earlier) and the vendor fallback still covers the rest.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderBlock, auditCoverage, productRedirectRules, BLOCK_BEGIN, BLOCK_END } from '../src/lib/legacy-redirects.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const URLS = join(DIR, 'legacy-urls.txt');
const REDIRECTS = join(DIR, '..', 'public', '_redirects');
const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--audit') ? 'audit' : 'write';
// Optional migrated slug map for exact per-product redirects: --product-map <file>, else the default path
// if it exists. Absent → vendor wildcards cover every product (the default until Ben supplies the map).
const pmIdx = process.argv.indexOf('--product-map');
const PRODUCT_MAP = pmIdx >= 0 ? process.argv[pmIdx + 1] : join(DIR, 'legacy-product-map.json');

function readPaths() {
  return readFileSync(URLS, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

function readProductMap() {
  if (!PRODUCT_MAP || !existsSync(PRODUCT_MAP)) return null;
  try { return JSON.parse(readFileSync(PRODUCT_MAP, 'utf8')); }
  catch (e) { console.error('✗ could not parse product map ' + PRODUCT_MAP + ': ' + e.message); process.exit(2); }
}

// Replace the marked block in the current _redirects, or insert it before the /puck-proof or /* rules.
function spliceBlock(current, block) {
  const b = current.indexOf(BLOCK_BEGIN);
  const e = current.indexOf(BLOCK_END);
  if (b !== -1 && e !== -1) {
    return current.slice(0, b) + block + current.slice(e + BLOCK_END.length);
  }
  const lines = current.split('\n');
  let at = lines.findIndex((l) => l.startsWith('/puck-proof') || l.startsWith('/*'));
  if (at === -1) at = lines.length;
  lines.splice(at, 0, block, '');
  return lines.join('\n');
}

const paths = readPaths();
const productMap = readProductMap();
const block = renderBlock(paths, productMap);
const productCount = productRedirectRules(productMap).length;

if (mode === 'audit') {
  const cov = auditCoverage(paths);
  const order = ['home', 'vendor', 'product', 'storefront', 'account', 'blog', 'content'];
  let total = 0;
  for (const kind of order) {
    const rows = cov[kind] || [];
    if (!rows.length) continue;
    total += rows.length;
    console.log(`\n${kind.toUpperCase()} (${rows.length})`);
    for (const r of rows) console.log(`  ${r.path}  →  ${r.dest}`);
  }
  const toHome = (cov.blog || []).length + (cov.content || []).length;
  console.log(`\n${total} known URLs · ${total - toHome} to a specific destination · ${toHome} to home (blog + content).`);
  console.log(productCount ? `Product-exact overrides from the slug map: ${productCount}.` : 'No product slug map yet — every product falls back to its vendor catalogue.');
  process.exit(0);
}

const current = readFileSync(REDIRECTS, 'utf8');
const next = spliceBlock(current, block);

if (mode === 'check') {
  if (current === next) { console.log('✓ public/_redirects legacy block is in sync.'); process.exit(0); }
  console.error('✗ public/_redirects legacy block is OUT OF SYNC. Run: node scripts/gen-legacy-redirects.mjs');
  process.exit(1);
}

if (current === next) { console.log('public/_redirects already up to date (no change).'); process.exit(0); }
writeFileSync(REDIRECTS, next, 'utf8');
const n = block.split('\n').filter((l) => /\s301/.test(l)).length;
console.log(`Wrote ${n} legacy redirect rules into public/_redirects` + (productCount ? ` (incl. ${productCount} product-exact overrides).` : '.'));
