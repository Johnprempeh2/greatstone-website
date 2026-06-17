import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offeringsToCsv, parseCsv, csvToObjects, diffOfferings, changesToPatch } from './bulkCsv.mjs';

const current = [
  { id: 'a', slug: 'ironpdf', name: 'IronPDF for .NET', status: 'published', featured: true, short_description: 'PDF lib', vendor: { name: 'Iron Software' }, category: { name: 'PDF' }, type: 'product' },
  { id: 'b', slug: 'aspose-cells', name: 'Aspose.Cells', status: 'published', featured: false, short_description: 'Spreadsheets', vendor: { name: 'Aspose' }, category: { name: 'Spreadsheets' }, type: 'product' },
];

test('export → parse round-trips, quoting commas', () => {
  const withComma = [{ ...current[0], short_description: 'Build, format, and ship PDFs' }];
  const csv = offeringsToCsv(withComma);
  const objs = csvToObjects(csv);
  assert.equal(objs.length, 1);
  assert.equal(objs[0].slug, 'ironpdf');
  assert.equal(objs[0].short_description, 'Build, format, and ship PDFs'); // comma survived quoting
});

test('parseCsv handles quoted newlines + escaped quotes', () => {
  const rows = parseCsv('slug,name\n"x","a ""b"" c\nline2"\n');
  assert.deepEqual(rows[1], ['x', 'a "b" c\nline2']);
});

test('diff: detects a name change', () => {
  const d = diffOfferings([{ slug: 'ironpdf', name: 'IronPDF 2026' }], current);
  assert.equal(d.updates.length, 1);
  assert.deepEqual(d.updates[0].changes.name, { from: 'IronPDF for .NET', to: 'IronPDF 2026' });
});

test('diff: featured + status changes; unchanged ignored', () => {
  const d = diffOfferings([
    { slug: 'ironpdf', featured: 'false', status: 'published' }, // featured changes true→false; status same
    { slug: 'aspose-cells', name: 'Aspose.Cells' },              // unchanged
  ], current);
  assert.equal(d.updates.length, 1);
  assert.deepEqual(d.updates[0].changes.featured, { from: true, to: false });
  assert.ok(!d.updates[0].changes.status); // status unchanged not recorded
  assert.deepEqual(d.unchanged, ['aspose-cells']);
});

test('diff: unknown slug + invalid status → errors', () => {
  const d = diffOfferings([
    { slug: 'nope', name: 'X' },
    { slug: 'ironpdf', status: 'live' }, // invalid
    { slug: '', name: 'Y' },             // missing slug
  ], current);
  assert.equal(d.errors.length, 3);
  assert.ok(d.errors.some(e => /unknown slug/.test(e.reason)));
  assert.ok(d.errors.some(e => /invalid status/.test(e.reason)));
  assert.ok(d.errors.some(e => /missing slug/.test(e.reason)));
});

test('changesToPatch flattens to {field:value}', () => {
  assert.deepEqual(changesToPatch({ name: { from: 'a', to: 'b' }, featured: { from: false, to: true } }), { name: 'b', featured: true });
});

test('empty rows / blank cells ignored', () => {
  const d = diffOfferings([{ slug: 'ironpdf', name: '', short_description: '' }], current); // blanks = no change
  assert.equal(d.updates.length, 0);
  assert.deepEqual(d.unchanged, ['ironpdf']);
});
