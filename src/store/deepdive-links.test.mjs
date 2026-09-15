// A stored link is opened by a click, so it is checked on the way OUT.
//
// The schema validates a link when an item is BUILT. That is the wrong and only moment: it does
// nothing for a row stored before the check existed, nor for one written by any path that did not
// go through `buildItem`. `safeLink` exists precisely to re-check at render, and its own comment in
// the schema says so, but nothing made anybody use it: BuildPage handed `item.demoLink` straight to
// an href and to an `<iframe src>`, while EvidencePage and the record screen both went through
// `OutLink`, which re-checks. Same class of value, two different levels of care, decided by whoever
// wrote the JSX that day.
//
// This scans the portal's own components for a stored link reaching an href or a src without
// passing through either guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** A field that a RECORD stores, rather than a target this code just built.
 *
 *  ⚠ The first version of this guessed from the object instead (`item.`, `r.`, `c.` and so on) and
 *  flagged two navigation configs assembled in JavaScript a few lines above their own use, which
 *  can no more carry a `javascript:` URL than a string literal can. The object name says nothing;
 *  the FIELD name says everything. Anything a person typed and a database kept is called what it
 *  is (`link`, `url`, `logo`, `demoLink`, `external_url`); a target the code computed is called
 *  `href`, because that is the attribute it was made for. */
const STORED = /\.(link|url|logo|demoLink|external_url|[a-zA-Z]+Link|[a-zA-Z]+Url)$/;

test('no stored link reaches an href or src unchecked', () => {
  const files = readdirSync(here).filter((f) => f.endsWith('.jsx'));
  assert.ok(files.length >= 10, `only ${files.length} components scanned: this test is looking in the wrong place`);

  const bad = [];
  let bindings = 0;
  for (const file of files) {
    const src = readFileSync(join(here, file), 'utf8');
    src.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/\b(href|src)=\{([^}]+)\}/g)) {
        const expr = m[2].trim();
        // Route helpers and template literals building a hash route are ours, not the record's.
        if (/Href\(|^`#|^'#|^"#/.test(expr)) return;
        bindings += 1;
        if (!STORED.test(expr)) return;
        // Three ways to be guarded, all of them real: re-checked inline with the portal's
        // `safeLink`, re-checked with the site's `safeHref`, or rendered through `OutLink`, whose
        // whole job is to run safeLink and return nothing at all when the link is not one.
        if (/safeLink|safeHref|<OutLink/.test(line)) return;
        bad.push(`${file}:${i + 1}  ${m[1]}={${expr}}`);
      }
    });
  }
  // ⚠ The floor: if the scan stops recognising href bindings at all it would report clean.
  assert.ok(bindings >= 15,
    `only ${bindings} href/src bindings found across ${files.length} components: the scan has gone blind`);
  assert.deepEqual(bad, [],
    'these hand a stored value straight to the browser: re-check it with safeLink, or render it through OutLink');
});
