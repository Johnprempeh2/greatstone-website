import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import {
  PINNED, MIGRATIONS_PREFIX, carrierManifest, checkBundle, checkRealInstall, checkRequired, compareResponses,
  cutoverApproved, headerNamesFrom, importsOf, migrationNames, readZip,
} from './carrier-deploy.mjs';

const sha1 = (text) => createHash('sha1').update(text).digest('hex');
const pinned = Object.fromEntries(PINNED.map((p) => [p.path, p.sha1]));
const source = { ...pinned, '/index.html': sha1('index') };
for (let i = 0; i < 120; i++) source[`/assets/a${i}.js`] = sha1(`asset ${i}`);
const migrations = { '001_enquiry_inbox': sha1('one'), '064_portal_mcp_register': sha1('sixty-four') };

// A minimal zip writer (no CRC: readZip does not check it), one deflated entry and the rest stored.
function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  Object.entries(entries).forEach(([name, text], i) => {
    const raw = Buffer.from(text);
    const method = i === 0 ? 8 : 0;
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    central.push(dir, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  });
  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dirBuf, end]);
}

const entry = [
  'import {createRequire as ___nfyCreateRequire} from "module";',
  'import { getStore } from "@netlify/blobs";',
  'import { getDatabase } from "@netlify/database";',
  'import { createHash } from "node:crypto";',
  'const u = import.meta.url;',
].join('\n');

test('fault 1: a carrier with an empty deploy folder is refused', () => {
  assert.throws(() => carrierManifest({ sourceFiles: source, deployFolder: {}, migrations }), /deploy folder is empty/);
});

test('fault 1: a carrier that lost its migrations is refused', () => {
  assert.throws(() => carrierManifest({ sourceFiles: source, deployFolder: pinned, migrations: {} }), /no migrations/);
});

test('the carrier map is the 12 Jul digests plus one migration.sql per migration', () => {
  const files = carrierManifest({ sourceFiles: source, deployFolder: pinned, migrations });
  assert.equal(Object.keys(files).length, Object.keys(source).length + 2);
  assert.equal(files[`${MIGRATIONS_PREFIX}064_portal_mcp_register/migration.sql`], sha1('sixty-four'));
  for (const [path, sha] of Object.entries(source)) assert.equal(files[path], sha);
});

test('_headers or _redirects that differ from the pinned commit or from 12 Jul are refused', () => {
  assert.throws(() => carrierManifest({ sourceFiles: source, deployFolder: { ...pinned, '/_headers': sha1('new') }, migrations }), /_headers in the deploy folder/);
  assert.throws(() => carrierManifest({ sourceFiles: { ...source, '/_redirects': sha1('new') }, deployFolder: pinned, migrations }), /_redirects differs/);
});

test('fault 2: an importer bundle without @netlify/blobs is refused', () => {
  const missing = readZip(zip({
    'netlify/functions/owner-import.mjs': entry,
    'node_modules/@netlify/database/package.json': '{}',
  }));
  assert.throws(() => checkBundle(missing), /missing @netlify\/blobs/);
  const whole = readZip(zip({
    'netlify/functions/owner-import.mjs': entry,
    'node_modules/@netlify/blobs/package.json': '{}',
    'node_modules/@netlify/database/package.json': '{}',
  }));
  assert.deepEqual(checkBundle(whole), ['@netlify/blobs', '@netlify/database']);
});

test('a relative import the bundle does not contain is refused', () => {
  const bundle = readZip(zip({
    'netlify/functions/owner-import.mjs': 'import { x } from "./lib/owner-import.mjs";',
    'node_modules/@netlify/blobs/package.json': '{}',
  }));
  assert.throws(() => checkBundle(bundle), /imports \.\/lib\/owner-import\.mjs/);
});

test('importsOf keeps packages and relative paths, not builtins', () => {
  assert.deepEqual(importsOf(entry).sort(), ['@netlify/blobs', '@netlify/database']);
});

test('readZip reads stored and deflated entries', () => {
  const read = readZip(zip({ 'a.txt': 'deflated text', 'b.txt': 'stored text' }));
  assert.equal(read.get('a.txt')().toString(), 'deflated text');
  assert.equal(read.get('b.txt')().toString(), 'stored text');
});

test('fault 2: a symlinked node_modules or package is refused', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'carrier-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const elsewhere = join(dir, 'other', 'node_modules', '@netlify', 'blobs');
  mkdirSync(elsewhere, { recursive: true });
  writeFileSync(join(elsewhere, 'package.json'), '{}');
  const linked = join(dir, 'linked');
  mkdirSync(linked);
  symlinkSync(join(dir, 'other', 'node_modules'), join(linked, 'node_modules'));
  assert.throws(() => checkRealInstall(linked, ['@netlify/blobs']), /symlink/);
  const pkgLinked = join(dir, 'pkg');
  mkdirSync(join(pkgLinked, 'node_modules', '@netlify'), { recursive: true });
  symlinkSync(elsewhere, join(pkgLinked, 'node_modules', '@netlify', 'blobs'));
  assert.throws(() => checkRealInstall(pkgLinked, ['@netlify/blobs']), /symlink out of the tree/);
  const real = join(dir, 'real', 'node_modules', '@netlify', 'blobs');
  mkdirSync(real, { recursive: true });
  writeFileSync(join(real, 'package.json'), '{}');
  checkRealInstall(join(dir, 'real'), ['@netlify/blobs']);
  assert.throws(() => checkRealInstall(join(dir, 'real'), ['@netlify/database']), /not installed/);
});

test('the deploy may ask only for migrations and the importer', () => {
  const shas = new Set([sha1('one'), sha1('sixty-four')]);
  assert.deepEqual(checkRequired({ required: [sha1('one')], required_functions: ['fn'] }, shas, 'fn'), { files: 1, functions: 1 });
  assert.deepEqual(checkRequired({ required: [], required_functions: [] }, shas, 'fn'), { files: 0, functions: 0 });
  assert.throws(() => checkRequired({ required: [sha1('one'), sha1('index')] }, shas, 'fn'), /not migrations/);
  assert.throws(() => checkRequired({ required: [], required_functions: ['other'] }, shas, 'fn'), /not the importer/);
});

test('migration folders follow Netlify rules', () => {
  const e = (name, hasSql = true) => ({ name, dir: true, hasSql });
  assert.deepEqual(migrationNames([e('002_b'), e('001_a'), { name: 'README.md', dir: false }]), ['001_a', '002_b']);
  assert.throws(() => migrationNames([e('061_a'), e('061_b')]), /Duplicate migration number 61/);
  assert.throws(() => migrationNames([e('001_a', false)]), /no migration.sql/);
  assert.throws(() => migrationNames([]), /No migrations/);
});

test('parity compares status, body and the named headers', () => {
  const names = headerNamesFrom('/*\n  X-Frame-Options: DENY\n  Strict-Transport-Security: max-age=1\n  Referrer-Policy: same-origin\n/assets/*\n  Cache-Control: immutable\n');
  assert.deepEqual(names, ['cache-control', 'content-type', 'location', 'referrer-policy', 'x-frame-options']);
  const a = { status: 200, bodySha1: 'x', headers: { 'content-type': 'text/html', 'x-frame-options': 'DENY', date: '1' } };
  assert.deepEqual(compareResponses(a, { ...a, headers: { ...a.headers, date: '2' } }, names), []);
  assert.deepEqual(compareResponses(a, { ...a, headers: { 'content-type': 'text/html' } }, names), ['x-frame-options']);
  assert.deepEqual(compareResponses(a, { ...a, bodySha1: 'y' }, names), ['body']);
  assert.deepEqual(compareResponses(a, { ...a, status: 404 }, names), ['status 200 != 404']);
  const moved = { status: 301, bodySha1: 'r', headers: { location: '/#shop/iris', 'content-type': 'text/plain' } };
  assert.deepEqual(compareResponses(moved, { ...moved, bodySha1: 's', headers: { ...moved.headers, 'x-frame-options': 'DENY' } }, names), []);
  assert.deepEqual(compareResponses(moved, { ...moved, headers: { location: '/' } }, names), ['location']);
});

test('publishing greatstone-home needs a person-accepted cut-over card for that exact SHA', () => {
  const sha = 'a'.repeat(40);
  const card = {
    kind: 'request_confirmation', status: 'accepted', requestedResolverPolicy: 'human_only', effectiveResolverPolicy: 'human_only',
    resolvedByUserId: 'john', resolvedByAgentId: null, idempotencyKey: `confirmation:GRE-2567:cutover:${sha}`,
    payload: { detailsMarkdown: `Approve cut-over: greatstone-home ${sha}` },
  };
  assert.equal(cutoverApproved([card], sha), true);
  assert.equal(cutoverApproved([{ ...card, idempotencyKey: `${card.idempotencyKey}:v2` }], sha), true);
  assert.equal(cutoverApproved([card], 'b'.repeat(40)), false);
  assert.equal(cutoverApproved([{ ...card, resolvedByAgentId: 'ridge' }], sha), false);
  assert.equal(cutoverApproved([{ ...card, status: 'pending' }], sha), false);
  assert.equal(cutoverApproved([{ ...card, payload: { detailsMarkdown: 'Approve' } }], sha), false);
});

test('the pinned _headers and _redirects commits hold the 12 Jul bytes', (t) => {
  for (const pin of PINNED) {
    const data = spawnSync('git', ['show', `${pin.commit}:${pin.file}`]);
    if (data.status !== 0) return t.skip('shallow clone: pinned commits not present');
    assert.equal(createHash('sha1').update(data.stdout).digest('hex'), pin.sha1, pin.path);
  }
});
