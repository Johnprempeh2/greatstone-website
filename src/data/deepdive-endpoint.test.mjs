// The dev endpoint's gate, and the headers on what it serves.
//
// This middleware hands out whole Investigation Plans, which are Confidential. It is development
// only and never exists in a build, but "development only" has already been the wrong reassurance
// once here: the records used to live inside the repo, where Vite served them as static files to
// any LAN peer, straight past this plugin's own gate.
//
// The gate has three arms and only the first is load-bearing on its own:
//   the socket must be loopback        a LAN peer cannot fake this
//   the Host header must be localhost  stops DNS rebinding, where the socket IS loopback
//   an Origin, if sent, must match     stops a page on another site reading it with fetch
// The failure this guards is not the logic, which is sound and was verified live against the
// running server. It is a NEW ROUTE being added without the first line, which is exactly how a
// gate that "covers everything" stops doing so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'vite.config.js'), 'utf8');
const lines = src.split('\n');

test('every route on this middleware checks the gate first', () => {
  const routes = lines
    .map((l, i) => [i, l])
    .filter(([, l]) => /server\.middlewares\.use\(/.test(l));
  // ⚠ The floor: if the routes stop being registered this way, the scan finds nothing and would
  // report a clean sheet over an ungated server.
  assert.ok(routes.length >= 2,
    `only ${routes.length} routes found on the record middleware: this test has gone blind`);

  for (const [i, line] of routes) {
    const path = (line.match(/use\('([^']+)'/) || [])[1] || '(unnamed)';
    // The gate has to be the FIRST thing the handler does, before it reads a slug or touches disk.
    const body = lines.slice(i + 1, i + 4).join('\n');
    assert.ok(/if \(!permitted\(req\)\)/.test(body),
      `the route ${path} does not check permitted(req) in its first lines: it serves Confidential records to anything that can reach the port`);
  }
});

test('the gate keeps all three arms', () => {
  const gate = src.slice(src.indexOf('const permitted = (req)'));
  const body = gate.slice(0, gate.indexOf('};') + 2);
  assert.ok(/remoteAddress/.test(body) && /LOOPBACK/.test(body),
    'the gate no longer checks that the socket is loopback, which is the arm a LAN peer cannot fake');
  assert.ok(/headers\.host/.test(body) && /HOSTS/.test(body),
    'the gate no longer checks the Host header, which is what stops DNS rebinding reaching a loopback socket');
  assert.ok(/headers\.origin/.test(body),
    'the gate no longer checks Origin, which is what stops another site reading a record with fetch');
  // The host pattern must stay anchored: an unanchored one would accept "localhost.evil.com".
  const hosts = lines.find((l) => /const HOSTS\s*=/.test(l));
  assert.ok(hosts && /\^\(/.test(hosts) && /\$\//.test(hosts),
    `the allowed-host pattern is not anchored at both ends, so a hostname that merely contains one would pass: ${hosts}`);
});

test('what the endpoint serves is typed, and stays the type it says', () => {
  // The attached bytes have always carried these. The plan itself, which is the more sensitive of
  // the two, had neither nosniff nor a place in this test until it was noticed beside them.
  // ⚠ ANCHOR ON SOMETHING ONLY THIS ROUTE HAS. There are two `if (req.method === 'GET')` blocks in
  // this file and the first belongs to the attachments route, so slicing from the first match
  // measured the wrong handler and failed on a header the plan route sets perfectly well. The ETag
  // is minted for the plan alone, because only the plan takes a versioned write back.
  const at = src.indexOf("res.setHeader('ETag'");
  assert.ok(at > 0, 'the plan route no longer mints an ETag: this test can no longer find it');
  const planBody = src.slice(src.lastIndexOf("if (req.method === 'GET') {", at), at + 200);
  for (const header of ['Content-Type', 'Cache-Control', 'X-Content-Type-Options']) {
    assert.ok(planBody.includes(header),
      `the plan route no longer sets ${header}: a Confidential record must be typed, uncacheable and unsniffable`);
  }
  assert.ok(/nosniff/.test(planBody), 'the plan route sets X-Content-Type-Options to something other than nosniff');

  // And every JSON reply, including the refusals, goes out the same way.
  const send = src.slice(src.indexOf('const send = (res, code, body)'));
  const sendBody = send.slice(0, send.indexOf('};') + 2);
  assert.ok(/no-store/.test(sendBody) && /nosniff/.test(sendBody),
    'the JSON helper no longer sets no-store and nosniff, so an error reply is treated differently from the record it refused');
});

// ── the journey strip must not claim two places at once ────────────────────────────────────────
// The strip marks the current stage with a badge derived from the record's own `stage` field. One
// stage description ALSO had "You are here." written into it, so a record at Executive discovery,
// GITA or Build plan showed the badge on its real stage and the Deep Dive card still claiming to be
// where you are. Three of the four stages contradicted themselves, on a strip the client sees.
test('no stage description says where you are: that is the badge’s job', () => {
  const portal = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'store', 'DeepDivePortal.jsx'), 'utf8');
  const at = portal.indexOf('const STAGES = [');
  assert.ok(at > 0, 'the STAGES list is gone: this test can no longer find it');
  const block = portal.slice(at, portal.indexOf('];', at));

  const whats = [...block.matchAll(/what:\s*'([^']*)'/g)].map((m) => m[1]);
  assert.ok(whats.length >= 4, `only ${whats.length} stage descriptions read: the scan has gone blind`);

  const claiming = whats.filter((w) => /you are here/i.test(w));
  assert.deepEqual(claiming, [],
    'a stage description claims to be the current stage, which it cannot know: only one stage is '
    + 'current and the badge is the thing that moves');
});
