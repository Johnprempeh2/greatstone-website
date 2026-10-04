// One item, one id, computed in three places that never talk to each other.
//
// An item's identity is a content hash of its own identifying text, so the browser, the dev server
// and the MCP can all mint the same id for the same item without coordinating. That is what lets a
// practitioner type into the portal while Claude writes through the MCP and have the two agree on
// which record they are editing.
//
// It also means the algorithm is written out THREE TIMES, in three files, in three codebases:
//   src/store/deepdive-ops.mjs   the browser, with the Web Crypto API
//   vite.config.js               the dev-only file endpoint, with node:crypto
//   ~/.claude/mcp-servers/deepdive/store.mjs   the MCP, with node:crypto (twice, in fact)
// Nothing has ever checked that they agree. If one drifts, the failure is silent and nasty: an
// edit mints an id nothing points at, and that item's status, visibility and whole history are
// orphaned while the screen looks fine. The schema file already warns that a re-minted id orphans
// an item; it does not guard the minting itself.
//
// So the wire format is pinned here as literal values. Any change to identityParts, to the
// separator, to the hash or to how much of it is kept will fail this test by name, and whoever is
// making that change has to go and make it in all three places on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, ID_PREFIX, identityParts } from './deepdive-schema.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The canonical algorithm, written once, as the other three must implement it. */
const mint = (kind, fields) => {
  const parts = identityParts(kind, fields).map(String).join('␟');
  return `${ID_PREFIX[kind]}:${createHash('sha1').update(parts).digest('hex').slice(0, 8)}`;
};

// Fixtures chosen to exercise every shape identityParts has: a numbered item, a grouped one, a
// person-named one, a free-text one.
const SAMPLE = {
  process: [{ num: '01', name: 'Data collection' }, 'p:51a93b2c'],
  question: [{ pillar: 'Data', q: 'Who checks the returns?' }, 'q:963712a6'],
  evidence: [{ item: 'The value tables' }, 'e:8706842c'],
  session: [{ name: 'How the wave runs' }, 's:a9d3bb3e'],
  source: [{ name: 'The data lead' }, 'r:95ac8311'],
  kpi: [{ name: 'Turnaround' }, 'k:c31def0d'],
  hypothesis: [{ claim: 'Re-keying causes the delay' }, 'h:e19067d6'],
  competitor: [{ name: 'Another firm' }, 'c:7bc5f35f'],
  offering: [{ ref: '01', name: 'Tracking' }, 'o:ddfe1633'],
  unit: [{ ref: 'OPS', name: 'Operations' }, 'u:ecf86bf1'],
  person: [{ name: 'Ama' }, 'n:5f37c8c2'],
  task: [{ what: 'Re-types responses' }, 't:e3baaaff'],
  build: [{ ref: 'B1', name: 'Field capture app' }, 'b:ef48c8d0'],
};

test('an item id is the same value it has always been', () => {
  const checked = [];
  for (const [kind, [fields, expected]] of Object.entries(SAMPLE)) {
    assert.ok(KINDS.includes(kind), `${kind} is no longer a kind: this fixture is stale`);
    assert.equal(mint(kind, fields), expected,
      `the id for a ${kind} changed. Every item of this kind already in a record keeps its OLD id, so its status, visibility and history are now orphaned. If this is deliberate it needs a migration, and the same change in vite.config.js and in the MCP.`);
    checked.push(kind);
  }
  // ⚠ A fixture list that quietly stops covering the kinds would pass while guarding nothing.
  const missing = KINDS.filter((k) => !checked.includes(k) && !['opportunity', 'complexity'].includes(k));
  assert.deepEqual(missing, [],
    'these kinds have no pinned id, so their identity is unguarded');
});

test('the browser and the dev server mint ids the same way', { todo: 'GRE-470: needs the Deep Dive dev endpoint in vite.config.js, not yet committed' }, () => {
  // The browser's copy uses the Web Crypto API and cannot be imported under node without its
  // Supabase and import.meta.env dependencies, so both are read as source and compared on the four
  // things that decide the value: the hash, how much of it is kept, the separator, and the prefix.
  const sites = [
    ['the browser', 'src/store/deepdive-ops.mjs'],
    ['the dev server', 'vite.config.js'],
  ];
  const seen = [];
  for (const [who, file] of sites) {
    const src = readFileSync(join(root, file), 'utf8');
    const line = src.split('\n').find((l) => /identityParts\(/.test(l) && /join\(/.test(l));
    assert.ok(line, `${who} no longer mints an id from identityParts in ${file}: this test is now blind`);
    // '␟' and '␟' are the same character written two ways, which is exactly the kind of
    // difference that looks like a difference and is not.
    assert.ok(/join\('(␟|\\u241f)'\)/.test(line),
      `${who} joins identity parts with something other than the unit separator: ${line.trim()}`);
    const near = src.slice(src.indexOf(line), src.indexOf(line) + 400);
    assert.ok(/SHA-1|'sha1'/.test(near), `${who} no longer hashes with SHA-1`);
    assert.ok(/slice\(0,\s*8\)/.test(near), `${who} no longer keeps 8 hex characters of the hash`);
    assert.ok(/ID_PREFIX\[kind\]/.test(near), `${who} no longer prefixes the id with its kind`);
    seen.push(who);
  }
  assert.equal(seen.length, 2, 'both minting sites must be checked');
});
