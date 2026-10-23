import assert from 'node:assert/strict';
import test from 'node:test';
import baked from './data/release.json' with { type: 'json' };
import { bindFormBlock } from './form-bindings.mjs';
import { validateRelease } from './release-validator.mjs';

const formTypes = ['BookDeepDive', 'AiBaselineSurvey', 'AiCostCalculator'];
const blocks = baked.pages.flatMap((page) => page.data.content
  .filter((block) => formTypes.includes(block.type)).map((block) => ({ page, block })));

test('approved collection form edits replace page wording and options on every bound block', () => {
  assert.equal(blocks.length, 3);
  for (const { page, block } of blocks) {
    const key = `${page.slug}-${block.type.toLowerCase()}`;
    const fields = [{ key: 'name', label: 'Your full name', type: 'text', required: true },
      { key: 'email', label: 'Your email', type: 'email', required: true },
      { key: 'company', label: 'Organisation name', type: 'text', required: false }];
    if (block.type === 'BookDeepDive') fields.push({ key: 'interest', label: 'Choose a topic', type: 'select', required: false,
      options: [{ value: 'topic-1', label: 'Topic one' }] });
    const forms = { fieldsVersion: 1, entries: [{ fields: { key, title: 'Revised form heading', submitLabel: 'Send now', fields } }] };
    const result = bindFormBlock(page.slug, block, forms);
    assert.equal(result.nameLabel, 'Your full name');
    assert.equal(result.submitLabel, 'Send now');
    assert.equal(result[block.type === 'BookDeepDive' ? 'headline' : 'gateHeading'], 'Revised form heading');
    if (block.type === 'BookDeepDive') assert.deepEqual(result.interests, [{ value: 'topic-1', label: 'Topic one' }]);
    assert.strictEqual(bindFormBlock(page.slug, block, null), block.props);
  }
});

test('release refuses form changes that cannot use the existing visitor submission path', () => {
  const release = structuredClone(baked);
  const { page, block } = blocks[0];
  const entry = { id: crypto.randomUUID(), revisionId: crypto.randomUUID(), orgId: release.orgId, order: 0,
    fields: { key: `${page.slug}-${block.type.toLowerCase()}`, title: 'Form', submitLabel: 'Send',
      fields: [{ key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'company', label: 'Company', type: 'text', required: false }] } };
  release.collections.forms = { fieldsVersion: 1, entries: [entry] };
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId }), null);
  entry.fields.fields.push({ key: 'unhandled', label: 'Unhandled', type: 'text', required: false });
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId })?.rule, 'R10');
  entry.fields.fields.pop();
  entry.fields.fields[1].required = false;
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId: release.orgId })?.rule, 'R10');
});
