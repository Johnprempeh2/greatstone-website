// The sniffer decides what a stored document is from its bytes, and it is the ONLY thing standing
// between "a practitioner uploaded a file" and "the record holds something mislabelled". It is now
// shared by the dev endpoint and the browser, so a change here changes both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sniff, FILE_ID_RE, fileId } from './deepdive-sniff.mjs';

const bytes = (...xs) => new Uint8Array(xs);
const utf8 = (s) => new TextEncoder().encode(s);

test('real signatures are recognised', () => {
  assert.deepEqual(sniff(bytes(0x24, 0x46, 0x4c, 0x32, 1, 2)), { mime: 'application/x-spss-sav', ext: 'sav' });
  assert.deepEqual(sniff(utf8('%PDF-1.7 junk')), { mime: 'application/pdf', ext: 'pdf' });
  assert.deepEqual(sniff(bytes(0x50, 0x4b, 0x03, 0x04, 9)).ext, 'xlsx');
  assert.deepEqual(sniff(bytes(0xd0, 0xcf, 0x11, 0xe0, 9)).ext, 'xls');
  assert.deepEqual(sniff(bytes(0x89, 0x50, 0x4e, 0x47, 9)).ext, 'png');
  assert.deepEqual(sniff(bytes(0xff, 0xd8, 0xff, 9)).ext, 'jpg');
  assert.deepEqual(sniff(utf8('GIF89a')).ext, 'gif');
  assert.deepEqual(sniff(utf8('RIFF....WEBP')).ext, 'webp');
});

test('plain text is accepted, and only when it really is UTF-8', () => {
  assert.deepEqual(sniff(utf8('name,value\nGCB,1\n')), { mime: 'text/plain', ext: 'txt' });
  assert.equal(sniff(bytes(0xc3, 0x28)), null, 'invalid UTF-8 is not text');
  assert.equal(sniff(bytes(0x01, 0x00, 0x02)), null, 'a NUL byte means binary');
  assert.equal(sniff(bytes()), null, 'nothing is not a document');
});

// ⚠ THE ONE THAT MATTERS. Markup is valid UTF-8, so without this branch a script-carrying file is
// stored as text/plain and sits there waiting for the first feature that trusts the recorded type.
test('markup is refused even though it is valid UTF-8', () => {
  for (const s of ['<!DOCTYPE html><p>hi', '<html>', '<svg xmlns="...">', '<?xml version="1.0"?>',
                   '  \n<SVG onload=alert(1)>', 'hello <script>alert(1)</script>']) {
    assert.equal(sniff(utf8(s)), null, `should refuse: ${s.slice(0, 30)}`);
  }
});

test('an id is content-addressed and shaped', () => {
  assert.match(fileId('0123456789abcdef0123'), FILE_ID_RE);
  assert.equal(fileId('0123456789abcdef0123'), 'a:0123456789ab');
  for (const bad of ['a:XYZ', 'a:0123', '0123456789ab', 'a:0123456789abc']) {
    assert.equal(FILE_ID_RE.test(bad), false, `should not match: ${bad}`);
  }
});
