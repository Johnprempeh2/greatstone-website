import assert from 'node:assert/strict';
import test from 'node:test';
import baked from '../../next-proof/data/release.json' with { type: 'json' };
import { validateRelease } from '../../next-proof/release-validator.mjs';
import { proofBarsProblem } from './proof-bars.mjs';

test('proof bars block publication until the measurements have a source and date', () => {
  const block = { type: 'ProofBars', props: { id: 'proof-1', bars: [{ label: 'Measured outcome', value: 12, ours: true }] } };
  const release = structuredClone(baked);
  release.pages[0].data.content.push(block);
  assert.match(proofBarsProblem([block]), /source/);
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId })?.rule, 'R6');
  block.props.source = 'Measurement record';
  block.props.date = '2026-10-31';
  assert.equal(proofBarsProblem([block]), null);
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId }), null);
});
