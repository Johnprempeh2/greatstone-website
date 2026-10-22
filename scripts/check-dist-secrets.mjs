#!/usr/bin/env node
// check-dist-secrets.mjs — a build guard. Scans the built client bundle (dist/) for the shapes of
// server-only secrets that must NEVER ship to the browser: Stripe secret keys, Stripe webhook signing
// secrets, and Supabase access tokens / the service-role key. Vite only exposes VITE_-prefixed env vars
// to import.meta.env, so a leak means someone prefixed a secret with VITE_ or hardcoded one — this fails
// the build before it can be deployed. Runs as `postbuild` (see package.json) and is the go-live gate.
//
// Publishable/anon keys (pk_..., the Supabase anon JWT) are MEANT to be public and are not flagged.
//
// Every file in dist/ is read, whatever its extension: `_headers` and `_redirects` have none, they ship,
// and they are where a proxy credential would end up. A file with a NUL byte is binary; it is skipped
// and counted as skipped, never as checked.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] || 'dist';

// high-signal server-secret markers; publishable keys (pk_) are intentionally excluded
const PATTERNS = [
  { name: 'Stripe secret key', re: /sk_(live|test)_[A-Za-z0-9]{10,}/ },
  { name: 'Stripe webhook signing secret', re: /whsec_[A-Za-z0-9]{10,}/ },
  { name: 'Supabase personal access token', re: /sbp_[A-Za-z0-9]{20,}/ },
  { name: 'service_role literal', re: /service_role/ },
  { name: 'DB connection string', re: /postgres(ql)?:\/\/[^\s"']+:[^\s"'@]+@/ },
];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

let files;
try { files = walk(DIST); }
catch { console.error('✗ No ' + DIST + '/ to scan — run `npm run build` first.'); process.exit(2); }

const hits = [];
let read = 0;
let binary = 0;
for (const f of files) {
  const buf = readFileSync(f);
  if (buf.includes(0)) { binary += 1; continue; }
  read += 1;
  const text = buf.toString('utf8');
  for (const { name, re } of PATTERNS) {
    const m = text.match(re);
    if (m) hits.push({ file: f, name, snippet: m[0].slice(0, 12) + '…' });
  }
}

if (hits.length) {
  console.error('✗ SECRET-SHAPED STRINGS FOUND IN THE CLIENT BUNDLE — do not deploy:');
  for (const h of hits) console.error('  %s  in %s  (%s)', h.name, h.file, h.snippet);
  console.error('\nServer secrets must live in Supabase Edge Function secrets / the host env, never a VITE_ var.');
  process.exit(1);
}
console.log('✓ %s/ secret scan clean: %d text files read, %d binary files skipped. No server secrets in the client bundle.', DIST, read, binary);
