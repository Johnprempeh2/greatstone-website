// Browser-facing catalogue API. Pricing and published-row checks run in the Netlify Function.
async function read(op, params = {}, fetchImpl = fetch) {
  const query = new URLSearchParams({ op });
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value != null) query.set(key, String(value));
  }
  const response = await fetchImpl('/api/catalogue?' + query);
  if (!response.ok) throw new Error('Catalogue unavailable (' + response.status + ')');
  return response.json();
}

export const listOfferings = (params, fetchImpl) => read('list', params, fetchImpl);
export const listVendors = (fetchImpl) => read('vendors', {}, fetchImpl);
export const listCategories = (fetchImpl) => read('categories', {}, fetchImpl);
export const getOffering = (slug, fetchImpl) => read('detail', { slug }, fetchImpl);
export const relatedOfferings = (offering, fetchImpl) => read('related', { slug: offering.slug }, fetchImpl);
