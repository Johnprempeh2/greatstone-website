import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('a brand page leads with the brand; the shop keeps the catalogue heading', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { catalogueHeading } = await vite.ssrLoadModule('/app/catalogue.jsx');
    const catalogue = { vendors: [{ slug: 'aspose', name: 'Aspose', description: 'File format APIs.' }, { slug: 'pdflib', name: 'PDFlib' }] };
    assert.deepEqual(catalogueHeading(catalogue, { vendor: 'aspose' }), { kicker: 'Brand', title: 'Aspose', lead: 'File format APIs.' });
    assert.equal(catalogueHeading(catalogue, { vendor: 'pdflib' }).lead, 'PDFlib software, licensed and supported by us in the UK.');
    assert.equal(catalogueHeading(catalogue, {}).title, 'Developer software,');
  } finally {
    await vite.close();
  }
});
