import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectConflicts, rowsFromSource } from './catalogue-rebuild.mjs';

test('same ID is a no-op; another ID cannot take its slug or SKU', () => {
  const org_id = 'org';
  const rows = { vendors: [{ id: 'vendor-1', org_id, slug: 'alpha', name: 'Alpha' }], offering_variants: [{ id: 'variant-1', org_id, sku: 'A-1', name: 'A' }] };
  const existing = structuredClone(rows);
  const clean = inspectConflicts(rows, existing);
  assert.deepEqual(clean.errors, []);
  assert.equal(clean.counts.vendors.noop, 1);
  rows.vendors[0].id = 'vendor-2';
  rows.offering_variants[0].id = 'variant-2';
  assert.match(inspectConflicts(rows, existing).errors.join(' '), /slug belongs to another ID.*sku belongs to another ID/);
});

test('source duplicates and changed identity are refused', () => {
  const rows = { offerings: [{ id: '1', org_id: 'org', slug: 'one' }, { id: '2', org_id: 'org', slug: 'one' }] };
  assert.match(inspectConflicts(rows, {}).errors.join(' '), /duplicate source slug/);
  const existing = { offerings: [{ id: '1', org_id: 'org', slug: 'other', deleted_at: null }] };
  assert.match(inspectConflicts({ offerings: rows.offerings.slice(0, 1) }, existing).errors.join(' '), /ID conflict/);
  const specs = { offering_specs: [{ id: 'spec-2', org_id: 'org', offering_id: 'offer', label: 'Label', value: 'Value', sort_order: 0 }] };
  const stored = { offering_specs: [{ ...specs.offering_specs[0], id: 'spec-1' }] };
  assert.match(inspectConflicts(specs, stored).errors.join(' '), /slot belongs to another ID/);
});

test('service rows are draft, enquiry-only and price-free', () => {
  const source = {
    manifest: { source_project_ref: 'source', exported_at: '2026-10-28T00:00:00Z', files: { 'source-catalogue.json': 'digest', 'service-offerings.json': 'service-digest' } },
    catalogue: { offerings: [{ id: 'product', org_id: 'org', vendor_id: 'vendor', category_id: 'category', attributes: {}, from_price_minor: null }], vendors: [{ id: 'vendor', org_id: 'org' }], categories: [{ id: 'category', org_id: 'org' }], variants: [], specs: [] },
    identity: { service_categories: [{ id: 'service-category', slug: 'service-category', source_category: 'Service category' }], service_records: [{ id: 'service', slug: 'service', name: 'Service', category_id: 'service-category', provenance: { source_slug: 'service' }, copy_review: 'Review required' }] },
  };
  // A minimal synthetic product row does not satisfy all schema fields, so inspect only the generated service.
  assert.throws(() => rowsFromSource(source), /Missing/);
  source.catalogue.offerings[0] = { ...source.catalogue.offerings[0], type: 'product', slug: 'product', name: 'Product', short_description: '', description: '', platforms: [], tags: [], status: 'published', featured: false, fulfilment: 'license', from_price_currency: null, seo: {}, published_at: null };
  source.catalogue.vendors[0] = { ...source.catalogue.vendors[0], slug: 'vendor', name: 'Vendor', status: 'published', sort_order: 0 };
  source.catalogue.categories[0] = { ...source.catalogue.categories[0], slug: 'category', name: 'Category', status: 'published', sort_order: 0 };
  const service = rowsFromSource(source).rows.offerings[1];
  assert.equal(service.status, 'draft');
  assert.equal(service.fulfilment, 'enquiry');
  assert.equal(service.from_price_minor, null);
  assert.equal(service.from_price_currency, null);
  assert.equal(service.description, null);
  assert.equal(service.vendor_id, null);
});
