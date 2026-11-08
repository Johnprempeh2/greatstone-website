import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const IMPORT = /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*\(?\s*['"]([^'"]+)['"]/gm;

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(m?js|jsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

function resolveRelative(from, spec) {
  const base = resolve(dirname(from), spec);
  return ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'].map((ext) => base + ext).find((path) => existsSync(path) && statSync(path).isFile());
}

// Walks every import reachable from the Next app, as `next build` would, so the editor build's
// missing files show here rather than in a deploy (GRE-4720).
test('editor prep leaves every app import resolvable without @netlify/database', () => {
  const target = join(mkdtempSync(join(tmpdir(), 'editor-prep-')), 'editor');
  try {
    execFileSync(process.execPath, [join(root, 'next-proof/scripts/prepare-netlify.mjs'), target, '--editor'], { stdio: 'pipe' });
    const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
    assert.equal(pkg.dependencies?.['@netlify/database'], undefined);
    const missing = [];
    const seen = new Set();
    const queue = sources(join(target, 'app'));
    while (queue.length) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
        const spec = match[1] ?? match[2];
        if (spec.startsWith('@netlify/database')) missing.push(`${file.slice(target.length)} imports ${spec}`);
        // Styles are generated during the build (prepare-puck-css); only code is checked here.
        if (!spec.startsWith('.') || /\.(css|json|svg|png)$/.test(spec)) continue;
        const next = resolveRelative(file, spec);
        if (next) queue.push(next);
        else missing.push(`${file.slice(target.length)} cannot resolve ${spec}`);
      }
    }
    assert.deepEqual(missing, []);
    assert.match(readFileSync(join(target, 'app/catalogue-pricing-live.js'), 'utf8'), /return null/);
  } finally {
    rmSync(dirname(target), { recursive: true, force: true });
  }
});
