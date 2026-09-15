// Every component a JSX file renders must actually be in scope.
//
// This exists because `esbuild --loader:.jsx=jsx` reports "syntax ok" on a file that renders an
// undefined component, and the failure only appears when a human opens that exact page: a blank
// screen and "X is not defined" in the console. It happened here — SessionPage rendered <Labelled>
// with no import — and the check that was supposed to catch it reported success, which is the same
// shape as a gate that scans the wrong directory.
//
// Deliberately narrow. It checks capitalised JSX tags against imports and same-file declarations.
// It does not type-check, it does not follow re-exports, and it says so rather than implying more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const roots = [here, path.join(here, '..', 'cms'), path.join(here, '..', 'intel')];

const files = roots.flatMap((d) => (fs.existsSync(d) ? fs.readdirSync(d) : [])
  .filter((f) => f.endsWith('.jsx'))
  .map((f) => path.join(roots.find((r) => fs.existsSync(path.join(r, f))), f)));

// React.Fragment and friends are member expressions, already qualified by their object.
const BUILTIN = new Set(['React']);

// Comments are not code. The first run flagged <RichText> twice, and both were sentences in a
// header comment explaining the sanitising chokepoint. A check that cries wolf gets switched off.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
}

function scopeOf(src) {
  const names = new Set(BUILTIN);
  // import X, {a, b as c} from '...'
  for (const m of src.matchAll(/import\s+([^'"]+?)\s+from\s*['"]/g)) {
    const clause = m[1];
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) for (const part of braces[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n) names.add(n);
    }
    const def = clause.replace(/\{[^}]*\}/g, '').replace(/,/g, ' ').trim().split(/\s+/)[0];
    if (def && def !== '*') names.add(def);
  }
  for (const m of src.matchAll(/^\s*(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Z]\w*)/gm)) names.add(m[1]);
  // Anything destructured or renamed, anywhere: `const { A, B }`, and `{ as: Tag = 'span' }` in a
  // parameter list, which is how a polymorphic component takes its element.
  for (const m of src.matchAll(/\{([^{}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(':').pop().trim().split('=')[0].trim();
      if (/^[A-Z]\w*$/.test(n)) names.add(n);
    }
  }
  // Capitalised function parameters: `function lime(key, Tag, base)` renders <Tag>.
  for (const m of src.matchAll(/(?:function\s+\w*\s*|=>\s*|\)\s*=>|\()\(?([^)]*)\)/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split('=')[0].trim();
      if (/^[A-Z]\w*$/.test(n)) names.add(n);
    }
  }
  return names;
}

test('every capitalised JSX tag is in scope in its own file', () => {
  assert.ok(files.length > 5, 'found almost no jsx files — the glob is wrong, which would make this pass vacuously');
  const missing = [];
  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const scope = scopeOf(src);
    for (const m of src.matchAll(/<([A-Z][\w]*)(?=[\s/>])/g)) {
      const tag = m[1];
      if (!scope.has(tag)) missing.push(`${path.relative(here, file)}: <${tag}>`);
    }
  }
  assert.deepEqual([...new Set(missing)], [], 'these components are rendered but never imported or declared');
});
