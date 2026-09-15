// A hook whose dependency array names a const declared LATER in the same component throws
// `Cannot access 'x' before initialization` on every render. The page is blank.
//
// This happened, and nothing caught it: the build succeeds (bundlers do not run components) and the
// whole test suite passed, because not one test renders the portal. A crash-on-render in the main
// component was invisible to 621 green tests. Until something renders it, this is the cheap check
// that would have caught it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const FILES = fs.readdirSync(here).filter((f) => f.endsWith('.jsx'));

test('no hook depends on a const declared after it', () => {
  const problems = [];
  // ⚠ AND COUNT WHAT WAS ACTUALLY LOOKED AT. This file exists because "a crash-on-render in the
  // main component was invisible to 621 green tests", and the check written to end that blindness
  // was blind in the same way: it asserts `problems` is empty and never that it examined anything.
  // A rename that empties FILES, or a refactor to a hook style the dependency regex stops matching,
  // leaves it reporting clean forever. Both are counted below, and both have a floor.
  let deps = 0;
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(here, f), 'utf8');
    // ⚠ PER COMPONENT, NOT PER FILE. A .jsx file holds several components, and a name that is a
    // PROP of one is often a const in another. Scanning the file as one scope reported three
    // perfectly good hooks as broken — and a check that cries wolf is a check somebody deletes.
    // Components start at column 0, so that is the boundary.
    const lines = src.split('\n');
    const starts = [];
    // ⚠ `export function` at column 0 was NOT a boundary, so five store files merged two components
    // into one scope — and because only the FIRST declaration of a name is kept, a real dead zone in
    // the second component could resolve to the first one's line and go unreported.
    lines.forEach((l, i) => { if (/^(export\s+(default\s+)?)?(async\s+)?(function|const|class)\s/.test(l)) starts.push(i); });
    starts.push(lines.length);

    for (let b = 0; b < starts.length - 1; b++) {
      const from = starts[b], to = starts[b + 1];
      const declaredAt = new Map();
      for (let i = from; i < to; i++) {
        const single = lines[i].match(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*[=,]/);
        if (single && !declaredAt.has(single[1])) declaredAt.set(single[1], i);
        for (const m of lines[i].matchAll(/^\s*(?:const|let)\s*\[\s*([\w$]+)\s*,\s*([\w$]+)\s*\]/g)) {
          if (!declaredAt.has(m[1])) declaredAt.set(m[1], i);
          if (!declaredAt.has(m[2])) declaredAt.set(m[2], i);
        }
      }
      for (let i = from; i < to; i++) {
        const dep = lines[i].match(/\},\s*\[([^\]]*)\]\s*\)/);
        if (!dep || !dep[1].trim()) continue;
        deps += 1;
        for (const raw of dep[1].split(',')) {
          const name = raw.trim().split(/[.?[]/)[0];
          if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
          const at = declaredAt.get(name);
          if (at !== undefined && at > i) {
            problems.push(`${f}:${i + 1} depends on "${name}", declared at line ${at + 1}`);
          }
        }
      }
    }
  }
  assert.ok(FILES.length >= 20,
    `only ${FILES.length} components found beside this test: the scan is looking in the wrong place`);
  assert.ok(deps >= 40,
    `only ${deps} hooks with a dependency array were examined across ${FILES.length} files, which is far too few: the pattern that finds them has stopped matching`);
  assert.deepEqual(problems, [],
    'these throw "Cannot access X before initialization" on every render — the page is blank');
});
