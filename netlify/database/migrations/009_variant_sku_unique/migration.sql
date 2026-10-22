-- Port of supabase/migrations/0007_variant_sku_unique.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- 0007_variant_sku_unique.sql — make SKU the unique match key for all import/export/update.
-- The seed feed repeats SKUs across editions (e.g. ASPOSE-230), so SKUs must be de-collided
-- BEFORE the unique index. We keep the first occurrence's SKU and suffix later ones (-2, -3 ...),
-- deterministically by (created_at, id). NULL skus (POA rows) are left alone.

WITH ranked AS (
  SELECT id, sku,
         row_number() OVER (PARTITION BY org_id, sku ORDER BY created_at, id) AS rn
    FROM offering_variants
   WHERE sku IS NOT NULL AND deleted_at IS NULL
)
UPDATE offering_variants v
   SET sku = v.sku || '-' || r.rn
  FROM ranked r
 WHERE v.id = r.id AND r.rn > 1;

-- Canonical match key. Partial: NULL skus allowed; soft-deleted rows excluded so a deleted SKU
-- can be re-created on a later import.
DROP INDEX IF EXISTS idx_variants_sku;
CREATE UNIQUE INDEX IF NOT EXISTS uq_variants_org_sku
  ON offering_variants (org_id, sku)
  WHERE sku IS NOT NULL AND deleted_at IS NULL;
