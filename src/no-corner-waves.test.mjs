// John, 8 Nov 2026: the thin lime corner "wave" curves (footer bottom right, interview pages top right,
// Featured Article corner) are retired. They kept coming back because the SVG was copy-pasted from an old
// mockup into new components. This fails if the ornament, its class names or its path signature return.
// Approved content motion (the tide background, ContainedMotion bg.waves) is not affected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BANNED = [
  /WaveDecoration/, /foot-wave/, /corner-wave/, /wave-decoration/, /\bgs-wave\b/, /gsWaveEmit/,
  /M500 40 Q392 72/, // footer + interview ornament path signature
  /M170 30 A140 140/, // Featured Article corner arcs
];
const roots = ['src', 'public', 'index.html'];
const files = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => files(join(p, n))) : [p]);

test('the retired corner-wave ornament is not reintroduced', () => {
  const self = new URL(import.meta.url).pathname;
  const hits = [];
  for (const root of roots) {
    let list; try { list = files(root); } catch { continue; }
    for (const f of list) {
      if (!/\.(jsx?|mjs|css|html|svg)$/.test(f) || self.endsWith(f)) continue;
      const s = readFileSync(f, 'utf8');
      for (const re of BANNED) if (re.test(s)) hits.push(`${f}: ${re}`);
    }
  }
  assert.deepEqual(hits, [], 'Corner-wave ornament is retired (John, 8 Nov 2026). Remove it, do not restyle it.');
});
