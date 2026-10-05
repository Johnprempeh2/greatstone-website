// The indexability report, run for real against throwaway builds (GRE-804, GRE-483 row 95).
//
// Each case plants one source of noindex in an otherwise clean dist/ and checks that the report names
// it, and that the exit code is 0 every time: this is a report for the cutover checklist, not a gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildRobotsTxt } from '../src/lib/seo-files.mjs';
import { robotsBlocks, parseRobots, metaNoindex } from '../src/lib/seo-report.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'seo-report.mjs');

/** Build a throwaway dist/ and run the real report over it. */
function report(files, flags = []) {
  const dir = mkdtempSync(join(tmpdir(), 'seoreport-'));
  for (const [name, content] of Object.entries(files)) {
    const p = join(dir, 'dist', name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...flags, 'dist'], { cwd: dir, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const PAGE = '<!doctype html><html><head><meta charset="utf-8" /><title>fine</title></head></html>';
const CLEAN = {
  'index.html': PAGE,
  'robots.txt': buildRobotsTxt('https://example.test'), // what the build really emits
  '_headers': '/*\n  X-Content-Type-Options: nosniff\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n',
};

test('a clean page is INDEXABLE, with the real robots.txt and _headers shapes', () => {
  const r = report(CLEAN);
  assert.equal(r.code, 0);
  assert.match(r.out, /^INDEXABLE\s+\/\s*$/m);
  assert.match(r.out, /Summary: INDEXABLE\. 1 of 1 HTML page\(s\) indexable/);
});

test('a robots meta tag makes the page NOINDEX and is named as the source', () => {
  const html = PAGE.replace('<title>', '<meta name="robots" content="noindex" /><title>');
  const r = report({ ...CLEAN, 'index.html': html });
  assert.equal(r.code, 0, 'the report must never fail the run');
  assert.match(r.out, /^NOINDEX\s+\/\s+← meta tag \(robots=noindex\)/m);
  assert.match(r.out, /Summary: NOINDEX\. 0 of 1/);
});

test('an X-Robots-Tag rule in _headers makes matching pages NOINDEX', () => {
  const r = report({
    ...CLEAN,
    'about/index.html': PAGE,
    '_headers': CLEAN._headers + '/about/*\n  X-Robots-Tag: noindex, nofollow\n',
  });
  assert.equal(r.code, 0);
  assert.match(r.out, /^NOINDEX\s+\/about\/\s+← _headers \(\/about\/\* X-Robots-Tag: noindex, nofollow\)/m);
  assert.match(r.out, /^INDEXABLE\s+\/\s*$/m, 'the rule must only touch the paths it matches');
  assert.match(r.out, /Summary: NOINDEX\. 1 of 2/);
});

test('robots.txt Disallow: / makes every page NOINDEX', () => {
  const r = report({ ...CLEAN, 'robots.txt': 'User-agent: *\nDisallow: /\n' });
  assert.equal(r.code, 0);
  assert.match(r.out, /^NOINDEX\s+\/\s+← robots\.txt \(Disallow: \/\)/m);
});

test('the report exits 0 even with no build to read', () => {
  const r = report({});
  assert.equal(r.code, 0);
  assert.match(r.out, /Summary: NO PAGES/);
});

test('robots.txt: longest rule wins, rules for other agents do not count', () => {
  const rules = parseRobots(buildRobotsTxt('https://example.test'));
  assert.equal(robotsBlocks(rules, '/'), null, 'Allow: / must not block the home page');
  assert.equal(robotsBlocks(rules, '/admin/x'), 'Disallow: /admin');
  assert.equal(robotsBlocks(parseRobots('User-agent: Googlebot\nDisallow: /\n'), '/'), null);
});

test('meta tag: attribute order, quotes and "none" are understood; other names are not', () => {
  assert.deepEqual(metaNoindex("<meta content='NOINDEX,follow' name=robots>"), ['robots=NOINDEX,follow']);
  assert.deepEqual(metaNoindex('<meta name="googlebot" content="none">'), ['googlebot=none']);
  assert.deepEqual(metaNoindex('<meta name="robots" content="index, follow">'), []);
  assert.deepEqual(metaNoindex('<meta name="description" content="noindex is a word">'), []);
});

// --launch (GRE-836, GRE-483 row 94): the same report, but a gate for go-live.
const NOINDEX_PAGE = PAGE.replace('<title>', '<meta name="robots" content="noindex" /><title>');

test('launch check: FAILS (exit 1) on a build that still has the noindex meta tag', () => {
  const r = report({ ...CLEAN, 'index.html': NOINDEX_PAGE }, ['--launch']);
  assert.equal(r.code, 1);
  assert.match(r.out, /← meta tag \(robots=noindex\)/);
  assert.match(r.out, /^Launch check: FAIL\./m);
});

test('launch check: FAILS on an X-Robots-Tag: noindex header', () => {
  const r = report({ ...CLEAN, '_headers': CLEAN._headers + '/*\n  X-Robots-Tag: noindex\n' }, ['--launch']);
  assert.equal(r.code, 1);
  assert.match(r.out, /X-Robots-Tag: noindex/);
});

test('launch check: PASSES (exit 0) on a clean build', () => {
  const r = report(CLEAN, ['--launch']);
  assert.equal(r.code, 0);
  assert.match(r.out, /^Launch check: PASS\./m);
});

test('launch check: FAILS when there is no build to check', () => {
  const r = report({}, ['--launch']);
  assert.equal(r.code, 1);
  assert.match(r.out, /^Launch check: FAIL\. There is no build/m);
});

test('without --launch a noindex preview build is never blocked', () => {
  const r = report({ ...CLEAN, 'index.html': NOINDEX_PAGE });
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /Launch check/);
});
