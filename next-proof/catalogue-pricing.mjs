import { decorateOffering, priceCard } from '../src/data/catalog.mjs';

/** Each offering priced exactly as /api/catalogue prices it: the card from `from_price_minor` (op=list),
 * each edition and the "from" line from the variants (op=detail). */
export function priceCatalogue(catalogue, rules, rate) {
  return {
    ...catalogue,
    offerings: catalogue.offerings.map((row) => ({
      ...decorateOffering({ ...row, offering_variants: row.offering_variants || row.variants || [], offering_specs: row.offering_specs || row.specs || [] }, rules, rate),
      pricing: priceCard(row, rules, null, rate),
    })),
  };
}
