// Attachments: the parts that two processes have to agree on.
//
// A file is content-addressed, so the same bytes must land on the same id whether the browser sent
// them straight to Supabase Storage or through the dev-only endpoint. That means the id function,
// the size cap and the magic-byte table are all shared contracts, and all three were quietly
// duplicated: vite.config.js re-typed the cap as a literal and re-implemented the id inline,
// twelve lines under its own comment saying a second copy is exactly how things drift.
//
// They agreed by luck. The one that drifts first decides it silently: a cap raised in the browser
// and not on the server rejects an upload the person was told was fine, and an id sliced
// differently gives the same bytes two identities depending on which backend answered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileId, FILE_ID_RE, BARE_ID_RE, MAX_FILE_BYTES, sniff } from '../data/deepdive-sniff.mjs';
import { prettyBytes, filesFor, ACCEPTED } from './deepdive-files.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('a file id is derived, never re-implemented', { todo: 'GRE-470: needs the Deep Dive dev endpoint in vite.config.js, not yet committed' }, () => {
  const hex = createHash('sha256').update(Buffer.from('some bytes')).digest('hex');
  const id = fileId(hex);
  assert.match(id, FILE_ID_RE, 'the id no longer matches the pattern the download route enforces');
  assert.match(id.slice(2), BARE_ID_RE, 'the bare form must match too: both are accepted on download');
  assert.equal(id, `a:${hex.slice(0, 12)}`);

  // ⚠ The server must USE that function rather than spell it out again.
  const vite = readFileSync(join(root, 'vite.config.js'), 'utf8');
  const minting = vite.split('\n').filter((l) => /sha256/.test(l) && /createHash/.test(l));
  assert.ok(minting.length >= 1, 'the dev endpoint no longer mints a file id: this test is now blind');
  for (const line of minting) {
    assert.ok(/fileId\(/.test(line),
      `the dev endpoint spells the file id out instead of using the shared fileId(): ${line.trim()}`);
  }
});

test('the size cap is one number, not two', { todo: 'GRE-470: needs the Deep Dive dev endpoint in vite.config.js, not yet committed' }, () => {
  assert.equal(MAX_FILE_BYTES, 25 * 1024 * 1024);
  const vite = readFileSync(join(root, 'vite.config.js'), 'utf8');
  // Nothing in the dev endpoint may re-type the cap as its own literal.
  assert.ok(!/=\s*25\s*\*\s*1024\s*\*\s*1024/.test(vite),
    'vite.config.js declares its own copy of the upload cap: import MAX_FILE_BYTES instead');
  assert.ok(/MAX_FILE_BYTES/.test(vite),
    'the dev endpoint does not reference the shared cap at all, so nothing bounds an upload there');
});

test('the refusal quotes the cap it actually enforces', () => {
  // prettyBytes is what the message uses, so the message and the check cannot disagree.
  assert.equal(prettyBytes(MAX_FILE_BYTES), '25.0 MB');
  assert.equal(prettyBytes(1024), '1 KB');
  assert.equal(prettyBytes(1023), '1023 bytes');
  assert.equal(prettyBytes(1048576), '1.0 MB');
  // ⚠ SKIP THE COMMENTS. The first form of this took the first line matching "The limit is", and
  // the explanatory comment written directly above the throw says those words too: the test read
  // the prose, found no hardcoded size in it, and passed while the code below it was hardcoded.
  // A planted regression proved it. Match the throw, not the sentence about the throw.
  const src = readFileSync(join(root, 'src/store/deepdive-files.mjs'), 'utf8');
  const lines = src.split('\n')
    .filter((l) => /The limit is/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
  assert.equal(lines.length, 1,
    `expected exactly one line to state the size limit, found ${lines.length}: this test is now blind`);
  assert.ok(/prettyBytes\(MAX_FILE_BYTES\)/.test(lines[0]),
    `the refusal hardcodes a size instead of quoting the constant it just compared against: ${lines[0].trim()}`);
});

test('acceptance is by magic bytes, and the extension list only shapes the file picker', () => {
  // A PNG signature is accepted whatever it is called; a lone "<" is not a file type we take.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.ok(sniff(png), 'a real PNG must be accepted');
  assert.equal(sniff(new Uint8Array([0x3c, 0x73, 0x76, 0x67])), null,
    'an SVG is script that renders: it must never be accepted');
  assert.equal(sniff(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c])), null, 'HTML must never be accepted');
  assert.equal(sniff(new Uint8Array([])), null, 'nothing is not a file type');
  // ⚠ The picker list is a courtesy, so it must not advertise anything the sniffer refuses.
  for (const ext of ['.svg', '.html', '.htm', '.zip', '.exe', '.js']) {
    assert.ok(!ACCEPTED.includes(ext), `the file picker offers ${ext}, which acceptance refuses`);
  }
});

test('a document is attached to the item that names it, and to no other', () => {
  const files = [
    { id: 'a:aaaaaaaaaaaa', attachedTo: ['q:1', 'e:1'] },
    { id: 'a:bbbbbbbbbbbb', attachedTo: ['e:1'] },
    { id: 'a:cccccccccccc' },                       // never attached, and must not throw
  ];
  assert.deepEqual(filesFor(files, 'q:1').map((f) => f.id), ['a:aaaaaaaaaaaa']);
  assert.deepEqual(filesFor(files, 'e:1').map((f) => f.id), ['a:aaaaaaaaaaaa', 'a:bbbbbbbbbbbb']);
  assert.deepEqual(filesFor(files, 'p:1'), []);
  assert.deepEqual(filesFor(null, 'q:1'), [], 'a record with no manifest yet is not an error');
});
