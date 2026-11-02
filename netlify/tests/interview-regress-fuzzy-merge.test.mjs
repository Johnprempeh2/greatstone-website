// Port of the source's scripts/fuzzy-merge-test.mjs (GRE-2612): characterise and safety-check the synthesis fuzzy
// label merge directly (no DB), against the website's port, netlify/functions/lib/interview/synthesis/invariants.mjs.
// The CORRECTNESS property that must hold: unrelated labels that merely share one token never merge into a fabricated
// corroboration cluster. The rest characterises how near-duplicates merge.
// No mode loop: canonicaliseLabels and labelSimilarity are pure string functions with no environment, voice or
// database dependence, so typed-only and voice-on are the same run. (Spoken answers reach this code only as insight
// labels, which the corroboration suite covers in both modes.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicaliseLabels, labelSimilarity, LABEL_SIMILARITY_THRESHOLD } from '../functions/lib/interview/synthesis/invariants.mjs';

// The source script's clustering helper, verbatim.
function clusters(labels) {
  const map = canonicaliseLabels(labels);
  const byCluster = new Map();
  for (const l of labels) {
    const norm = l.toLowerCase().trim();
    const id = map.get(norm) ?? `(self:${norm})`;
    if (!byCluster.has(id)) byCluster.set(id, []);
    byCluster.get(id).push(l);
  }
  return [...byCluster.values()];
}

test('threshold is the source value', () => {
  assert.equal(LABEL_SIMILARITY_THRESHOLD, 0.6);
});

test('CORRECTNESS: unrelated labels sharing one token never merge', () => {
  assert.equal(clusters(['invoice approval delays', 'approval of new staff members']).length, 2, 'one-shared-token labels stay separate');
  assert.equal(clusters(['meeting overload eats my week', 'car parking is a nightmare']).length, 2, 'wholly unrelated labels stay separate');
  // more one-shared-token pairs in the same spirit: a single common word is never corroboration
  for (const [a, b] of [
    ['manual invoice keying', 'invoice dispute resolution'],
    ['sage crashes daily', 'sage licence renewal'],
    ['warehouse delivery confirmations', 'warehouse heating is broken'],
    ['board pack preparation', 'board meeting scheduling'],
    ['month end reconciliations', 'month long onboarding'],
  ]) {
    assert.equal(clusters([a, b]).length, 2, `${a} / ${b} (sim ${labelSimilarity(a, b).toFixed(2)})`);
    assert.ok(labelSimilarity(a, b) < LABEL_SIMILARITY_THRESHOLD, `${a} / ${b}`);
  }
  // the antonym pair is characterisation only in the source (it always passed); recorded, not asserted either way
  const antonym = clusters(['the reports are too slow', 'the reports are too fast']);
  assert.ok(antonym.length === 1 || antonym.length === 2);
});

test('CORRECTNESS: merging is transitive-safe, a chain of one-token overlaps does not glue unrelated ends together', () => {
  const chain = clusters(['invoice approval delays', 'approval of new staff members', 'new staff parking', 'parking is a nightmare']);
  const together = chain.find((c) => c.includes('invoice approval delays'));
  assert.ok(!together.includes('parking is a nightmare'), JSON.stringify(chain));
});

test('COVERAGE: obvious-same variants merge', () => {
  assert.equal(clusters(['Reporting', 'the reporting', 'reporting']).length, 1, 'single-token concept variants merge (stopword diff)');
  assert.equal(clusters(['invoice keying', 'keying invoices']).length, 1, 'word-order / plural variants merge (consistent stemmer)');
  assert.equal(clusters(['invoice keying', 'invoice keying slow']).length, 1, 'one-extra-token near-duplicate merges');
  assert.equal(clusters(['Manual invoice keying', 'Manual invoice keying slow']).length, 1, 'the corroboration seed pair merges');
  assert.equal(clusters(['  Invoice Keying ', 'invoice keying']).length, 1, 'case and whitespace never split a cluster');
});

test('CHARACTERISATION: genuine paraphrases with no lexical overlap stay apart (conservative by design)', () => {
  const paraphrase = clusters(['manual invoice keying into sage', 're-entering supplier invoices by hand', 'hand entry of invoice data']);
  assert.ok(paraphrase.length >= 2, JSON.stringify(paraphrase));
});

test('CHARACTERISATION: similarity samples', () => {
  assert.ok(labelSimilarity('invoice keying', 'invoice keying slow') >= 0.6);
  assert.ok(labelSimilarity('invoice approval delays', 'approval of new staff members') < 0.6);
  assert.ok(labelSimilarity('manual invoice keying into sage', 're-entering supplier invoices by hand') < 0.6);
  assert.equal(labelSimilarity('', 'anything'), 0, 'empties never merge');
  for (const [a, b] of [['invoice keying', 'keying invoices'], ['meeting overload', 'car parking']]) {
    assert.equal(labelSimilarity(a, b), labelSimilarity(b, a), 'symmetric');
  }
});
