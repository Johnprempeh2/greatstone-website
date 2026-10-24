import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv/dist/2020.js';
import schema from './collections.v1.schema.json' with { type: 'json' };
import baked from '../data/release.json' with { type: 'json' };
import { validateRelease } from '../release-validator.mjs';
import { publicCatalogue, publicPeople, publicForms } from './import-source.mjs';

const ajv = new Ajv({ strict: false });
ajv.addSchema(schema);
const valid = (key) => ajv.getSchema(`${schema.$id}#/$defs/${key}`);

test('version 1 validates every field in the dated public import sources', () => {
  for (const key of ['vendors', 'categories', 'offerings']) {
    for (const data of publicCatalogue[key]) assert.equal(valid(key)({ data }), true, `${key}: ${ajv.errorsText(valid(key).errors)}`);
  }
  for (const person of publicPeople) assert.equal(valid('public-people')(person), true);
  for (const form of publicForms) assert.equal(valid('forms')(form), true, ajv.errorsText(valid('forms').errors));
  assert.deepEqual([publicCatalogue.vendors.length, publicCatalogue.categories.length, publicCatalogue.offerings.length, publicPeople.length, publicForms.length], [10, 32, 24, 6, 3]);
  assert.equal(JSON.stringify(publicPeople).includes('email'), false);
  assert.equal(JSON.stringify(publicPeople).includes('token'), false);
});

test('field schema rejects a missing required field, a private staff field and an invalid option', () => {
  const product = structuredClone(publicCatalogue.offerings[0]);
  delete product.name;
  assert.equal(valid('offerings')({ data: product }), false);
  assert.equal(valid('public-people')({ ...publicPeople[0], email: 'private@example.test' }), false);
  assert.equal(valid('forms')({ ...publicForms[0], fields: [{ ...publicForms[0].fields[0], type: 'script' }] }), false);
});

test('release reader applies field versions and refuses private team collections', () => {
  const release = structuredClone(baked);
  const revisionId = release.pages[0].revisionId;
  const orgId = release.orgId;
  release.collections.offerings.entries = publicCatalogue.offerings.map((data, order) => ({
    id: data.id, revisionId, orgId, order, fields: { data },
  }));
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId }), null);
  release.collections.team = { fieldsVersion: 1, entries: [] };
  assert.equal(validateRelease(release, { siteId: release.siteId, orgId })?.rule, 'R10');
});
