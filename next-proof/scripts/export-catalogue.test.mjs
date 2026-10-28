import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from '../fixtures/public-catalogue-2026-10-22.json' with { type: 'json' };
import { buildCatalogueImport, compareImportedCatalogue } from './export-catalogue.mjs';
import { collectPublishedCatalogue } from '../catalogue-source.mjs';

test('maps all dated public rows to version 1 without exporting private team data', () => {
  const source = { ...fixture, team: [{ email: 'private@example.test', token: 'private' }] };
  const result = buildCatalogueImport(source);
  assert.deepEqual(result.counts, {
    vendors: { source: 10, imported: 10 },
    categories: { source: 32, imported: 32 },
    offerings: { source: 24, imported: 24 },
  });
  assert.deepEqual(Object.keys(result.collections), ['vendors', 'categories', 'offerings']);
  assert.equal(JSON.stringify(result).includes('private@example.test'), false);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.deepEqual(result.collections.categories.entries[0].fields.data, source.categories[0]);
});

test('maps persisted product detail fields and drops computed prices and join IDs', () => {
  const source = structuredClone(fixture);
  const offering = source.offerings[0];
  offering.pricing = { final: 1 };
  offering.from = { final: 1 };
  offering.vendor_id = 'internal-join';
  offering.category_id = 'internal-join';
  offering.variants[0].pricing = { final: 1 };
  const { data } = buildCatalogueImport(source).collections.offerings.entries[0].fields;
  assert.equal(data.id, offering.id);
  assert.deepEqual(data.vendor, offering.vendor);
  assert.deepEqual(data.category, offering.category);
  assert.deepEqual(data.attributes, offering.attributes);
  assert.deepEqual(data.seo, offering.seo);
  assert.deepEqual(data.offering_specs, offering.offering_specs);
  assert.deepEqual(data.offering_variants, offering.offering_variants);
  assert.equal('pricing' in data, false);
  assert.equal('from' in data, false);
  assert.equal('vendor_id' in data, false);
  assert.equal('category_id' in data, false);
  assert.equal('pricing' in data.variants[0], false);
});

test('converts database bigint prices to release integers without losing precision', () => {
  const source = structuredClone(fixture);
  source.offerings[0].from_price_minor = '120000';
  source.offerings[0].variants[0].base_price_minor = '120000';
  source.offerings[0].offering_variants[0].base_price_minor = '120000';
  const fields = buildCatalogueImport(source).collections.offerings.entries[0].fields.data;
  assert.equal(fields.from_price_minor, 120000);
  assert.equal(fields.variants[0].base_price_minor, 120000);
  assert.equal(fields.offering_variants[0].base_price_minor, 120000);

  source.offerings[0].from_price_minor = '9007199254740993';
  assert.throws(() => buildCatalogueImport(source), /Unsafe from_price_minor/);
});

test('fails on omitted, duplicate or invalid source rows', () => {
  const draft = structuredClone(fixture);
  draft.offerings[0].status = 'draft';
  assert.throws(() => buildCatalogueImport(draft), /source and imported row counts/);
  const duplicate = structuredClone(fixture);
  duplicate.categories.push(duplicate.categories[0]);
  assert.throws(() => buildCatalogueImport(duplicate), /source and imported row counts or identities/);
  const invalid = structuredClone(fixture);
  delete invalid.offerings[0].name;
  assert.throws(() => buildCatalogueImport(invalid), /invalid version 1 fields/);
  const newField = structuredClone(fixture);
  newField.offerings[0].unmapped_public_field = 'new value';
  assert.throws(() => buildCatalogueImport(newField), /Unmapped offering fields/);
});

test('collects every page and detail before comparing imported counts', async () => {
  const cards = Array.from({ length: 205 }, (_, index) => ({ id: `p-${index}`, slug: `product-${index}` }));
  const requests = [];
  const source = await collectPublishedCatalogue(async (op, params) => {
    if (op === 'vendors' || op === 'categories') return [];
    if (op === 'list') {
      requests.push(params.page);
      return { total: cards.length, items: cards.slice((params.page - 1) * params.pageSize, params.page * params.pageSize) };
    }
    return { ...fixture.offerings[0], ...cards.find((card) => card.slug === params.slug) };
  });
  assert.deepEqual(requests, [1, 2, 3]);
  assert.equal(source.offerings.length, 205);
  assert.deepEqual(buildCatalogueImport(source).counts.offerings, { source: 205, imported: 205 });
});

test('compares the editor import by row identity, not count alone', () => {
  const exported = buildCatalogueImport(fixture);
  const imported = structuredClone(exported);
  assert.deepEqual(compareImportedCatalogue(exported, imported), exported.counts);
  imported.collections.offerings.entries[0].id = 'different-id';
  assert.throws(() => compareImportedCatalogue(exported, imported), /editor-imported rows differ/);
  imported.collections.offerings.entries.pop();
  assert.throws(() => compareImportedCatalogue(exported, imported), /editor-imported rows differ/);
});
