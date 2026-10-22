-- Port of supabase/migrations/0001_initial_schema.sql (GRE-1795). Unchanged unless a "Netlify:" note below says otherwise.

-- Greatstone Commerce Platform — Postgres schema (companion to SYSTEM-SPEC.md)
-- Money = integer minor units (pence) + currency code. See SYSTEM-SPEC.md Part 2.

-- =====================================================================
-- GREATSTONE INTERNATIONAL — UNIFIED OFFERINGS PLATFORM
-- Canonical Postgres schema (source of truth)
-- Target: PostgreSQL 15+ (works on Supabase; mirrors the contract the
--         agency's Laravel 12 + Inertia backend must implement)
--
-- Conventions enforced everywhere:
--   * Money:        integer MINOR UNITS (pence) + ISO-4217 currency code.
--                   Stored as BIGINT (the live feed has a £125k+ outlier;
--                   minor units of large enterprise/site licences overflow int4).
--   * Identity:     UUID v4 PKs (gen_random_uuid via pgcrypto), PLUS a stable
--                   human/business key (slug / sku) carried as the upsert key.
--   * Tenancy:      every business table carries org_id -> organisations(id);
--                   RLS policies key off current_setting('app.current_org').
--   * Soft delete:  deleted_at TIMESTAMPTZ NULL on mutable domain rows.
--   * Audit cols:   created_at / updated_at / created_by / updated_by.
--   * Concurrency:  row_version INTEGER for optimistic locking on edited rows.
--   * Drafts:       status enum (draft|published|archived) + published_at;
--                   public reads are scoped to status='published'.
--   * Time:         TIMESTAMPTZ everywhere (UTC).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email / slug compares
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram search on names/descriptions

-- ---------------------------------------------------------------------
-- ENUM TYPES (centralised; referenced across tables)
-- ---------------------------------------------------------------------
CREATE TYPE publish_status      AS ENUM ('draft', 'published', 'archived');
CREATE TYPE offering_type       AS ENUM ('product', 'service');
CREATE TYPE fulfilment_mode     AS ENUM ('license', 'subscription', 'engagement', 'enquiry');
CREATE TYPE billing_period      AS ENUM ('one_time', 'perpetual', 'monthly', 'quarterly', 'annual', 'multi_year');
CREATE TYPE adjustment_type     AS ENUM ('percentage', 'fixed');
CREATE TYPE rule_scope_type     AS ENUM ('all', 'vendor', 'category', 'offering', 'tier');
CREATE TYPE rule_audience       AS ENUM ('public', 'tier');           -- 'tier' pairs with audience_tier_id
CREATE TYPE quote_status        AS ENUM ('new', 'contacted', 'quoted', 'won', 'lost', 'cancelled');
CREATE TYPE quote_source        AS ENUM ('product_page', 'enquiry_basket', 'contact_form', 'import', 'api', 'admin');
CREATE TYPE order_status        AS ENUM ('pending', 'confirmed', 'fulfilled', 'cancelled', 'refunded');
CREATE TYPE import_type         AS ENUM ('offerings', 'variants', 'pricing', 'vendors', 'categories', 'mixed');
CREATE TYPE import_status       AS ENUM ('uploaded', 'validating', 'validated', 'failed', 'applying', 'applied', 'rolled_back');
CREATE TYPE import_row_action   AS ENUM ('insert', 'update', 'noop', 'skip', 'error');
CREATE TYPE ai_action_kind      AS ENUM ('bulk_edit', 'mapping', 'description_gen', 'seo_gen', 'dedupe', 'cleanup', 'other');
CREATE TYPE ai_action_status    AS ENUM ('proposed', 'approved', 'applied', 'rejected', 'failed');
CREATE TYPE org_role            AS ENUM ('owner', 'admin', 'editor', 'sales', 'viewer');
CREATE TYPE audit_action        AS ENUM ('create', 'update', 'soft_delete', 'restore', 'publish', 'unpublish',
                                         'archive', 'import_apply', 'import_rollback', 'ai_apply', 'login', 'role_change');

-- ---------------------------------------------------------------------
-- 1. ORGANISATIONS (tenant root)
-- ---------------------------------------------------------------------
CREATE TABLE organisations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        CITEXT NOT NULL UNIQUE,                 -- 'greatstone'
    name        TEXT   NOT NULL,                        -- 'Greatstone International'
    domain      TEXT,                                   -- 'greatstonesoftware.co.uk'
    settings    JSONB  NOT NULL DEFAULT '{}'::jsonb,    -- branding, default currency, feature flags
    base_currency CHAR(3) NOT NULL DEFAULT 'GBP' CHECK (base_currency ~ '^[A-Z]{3}$'),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- 2. USERS  (internal Greatstone staff — the CMS operators)
--    Customer-side contacts live in customer_users (see §6) to keep the
--    staff identity table clean and separately governed.
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    email         CITEXT NOT NULL,
    full_name     TEXT,
    role          org_role NOT NULL DEFAULT 'viewer',   -- coarse role; fine grain via permissions matrix
    auth_subject  TEXT,                                  -- external IdP subject (Laravel/Supabase auth id); NEVER a password hash here
    is_active     BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID REFERENCES users(id),
    deleted_at    TIMESTAMPTZ,
    UNIQUE (org_id, email)
);
CREATE INDEX idx_users_org ON users(org_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 3. ROLES & PERMISSIONS
--    org_role enum gives the coarse default; the permission matrix below
--    lets an org grant/deny named capabilities per role WITHOUT a code deploy.
--    Sensitive ops (publish, import.apply, pricing.publish, user.manage)
--    are admin/owner only by seeded default.
-- ---------------------------------------------------------------------
CREATE TABLE permissions (
    key         TEXT PRIMARY KEY,                       -- 'offering.publish', 'pricing.publish', 'import.apply', 'user.manage', 'ai.approve'
    description TEXT NOT NULL
);

CREATE TABLE role_permissions (
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    role        org_role NOT NULL,
    permission  TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    allowed     BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (org_id, role, permission)
);

-- Per-user explicit grant/deny override (rarely used; for one-off elevation).
CREATE TABLE user_permissions (
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    allowed     BOOLEAN NOT NULL,                       -- TRUE grant / FALSE explicit deny (deny wins)
    granted_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, user_id, permission)
);

-- ---------------------------------------------------------------------
-- 4. CUSTOMERS (companies) + tiers + their contacts
-- ---------------------------------------------------------------------
CREATE TABLE customer_tiers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    slug        CITEXT NOT NULL,                        -- 'enterprise', 'partner', 'standard'
    name        TEXT NOT NULL,
    rank        INTEGER NOT NULL DEFAULT 0,             -- ordering / seniority
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    UNIQUE (org_id, slug)
);

CREATE TABLE customers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    slug        CITEXT NOT NULL,
    name        TEXT NOT NULL,                          -- company name
    tier_id     UUID REFERENCES customer_tiers(id) ON DELETE SET NULL,
    domain      TEXT,
    billing_currency CHAR(3) CHECK (billing_currency ~ '^[A-Z]{3}$'),
    notes       TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID REFERENCES users(id),
    updated_by  UUID REFERENCES users(id),
    deleted_at  TIMESTAMPTZ,
    row_version INTEGER NOT NULL DEFAULT 1,
    UNIQUE (org_id, slug)
);
CREATE INDEX idx_customers_org_tier ON customers(org_id, tier_id) WHERE deleted_at IS NULL;

-- Customer-side people (buyers, contacts) — separate from internal users.
CREATE TABLE customer_users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    email       CITEXT NOT NULL,
    full_name   TEXT,
    phone       TEXT,
    is_primary  BOOLEAN NOT NULL DEFAULT false,
    auth_subject TEXT,                                  -- if the buyer gets a portal login
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    UNIQUE (org_id, customer_id, email)
);
CREATE INDEX idx_customer_users_customer ON customer_users(customer_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 5. VENDORS (brands — Aspose, GroupDocs, …)  10 in the live feed.
--    Vendor is a FIRST-CLASS entity, distinct from category. Services
--    have no vendor (offerings.vendor_id is nullable for type='service').
-- ---------------------------------------------------------------------
CREATE TABLE vendors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    slug        CITEXT NOT NULL,                        -- 'aspose'  (the feed's vendor id)
    name        TEXT NOT NULL,                          -- 'Aspose'
    domain      TEXT,                                   -- 'aspose.com'
    logo_asset_id UUID,                                 -- FK added after media_assets (see ALTER below)
    logo_url    TEXT,                                   -- fallback / external logo
    description TEXT,
    status      publish_status NOT NULL DEFAULT 'published',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID REFERENCES users(id),
    updated_by  UUID REFERENCES users(id),
    published_at TIMESTAMPTZ,
    deleted_at  TIMESTAMPTZ,
    row_version INTEGER NOT NULL DEFAULT 1,
    UNIQUE (org_id, slug)
);
CREATE INDEX idx_vendors_org ON vendors(org_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 6. CATEGORIES (functional product types — 32 in the feed).
--    Self-referencing hierarchy (parent_id), slug unique per org.
--    parentId exists in the feed (currently all NULL) → modelled for depth.
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    parent_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
    slug        CITEXT NOT NULL,                        -- 'annotation'  (feed: cat-annotation)
    name        TEXT NOT NULL,                          -- 'Annotation'
    description TEXT,
    icon_asset_id UUID,                                 -- FK added after media_assets
    icon_url    TEXT,
    status      publish_status NOT NULL DEFAULT 'published',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID REFERENCES users(id),
    updated_by  UUID REFERENCES users(id),
    published_at TIMESTAMPTZ,
    deleted_at  TIMESTAMPTZ,
    row_version INTEGER NOT NULL DEFAULT 1,
    UNIQUE (org_id, slug),
    CHECK (parent_id <> id)                             -- no self-parenting (full cycle guard in app/trigger)
);
CREATE INDEX idx_categories_parent ON categories(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_categories_org ON categories(org_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 7. MEDIA ASSETS (single library: icons, logos, galleries, social images)
--    Defined here so offerings / vendors / categories can FK to it.
-- ---------------------------------------------------------------------
CREATE TABLE media_assets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL,                          -- object-store key / path ('catalog/icons/aspose_tex-for-cpp.png')
    url         TEXT,                                   -- public/CDN URL
    mime_type   TEXT,
    width_px    INTEGER,
    height_px   INTEGER,
    bytes       BIGINT,
    alt_text    TEXT,
    checksum    TEXT,                                   -- for dedupe / idempotent media import
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID REFERENCES users(id),
    deleted_at  TIMESTAMPTZ,
    UNIQUE (org_id, storage_key)
);
CREATE INDEX idx_media_org ON media_assets(org_id) WHERE deleted_at IS NULL;

-- Wire the deferred logo/icon FKs now that media_assets exists.
ALTER TABLE vendors    ADD CONSTRAINT fk_vendors_logo
    FOREIGN KEY (logo_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE categories ADD CONSTRAINT fk_categories_icon
    FOREIGN KEY (icon_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 8. OFFERINGS  (UNIFIED products + services — the heart of the system)
--    type='product'  -> vendor_id required, fulfilment license|subscription|enquiry
--    type='service'  -> vendor_id NULL,     fulfilment engagement|enquiry
-- ---------------------------------------------------------------------
CREATE TABLE offerings (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    type              offering_type NOT NULL,
    vendor_id         UUID REFERENCES vendors(id) ON DELETE RESTRICT,    -- NULL for services
    category_id       UUID REFERENCES categories(id) ON DELETE SET NULL,
    slug              CITEXT NOT NULL,                  -- globally-unique business key (feed slugs are global-unique)
    name              TEXT NOT NULL,
    short_description TEXT,                              -- feed: shortDescription
    description       TEXT,                              -- feed: description (overview body)
    platforms         TEXT[] NOT NULL DEFAULT '{}',     -- feed: ['.NET','Java','C++',…]
    tags              TEXT[] NOT NULL DEFAULT '{}',
    status            publish_status NOT NULL DEFAULT 'draft',
    featured          BOOLEAN NOT NULL DEFAULT false,
    fulfilment        fulfilment_mode NOT NULL DEFAULT 'enquiry',
    primary_image_id  UUID REFERENCES media_assets(id) ON DELETE SET NULL,
    -- Cached lowest active price for listing/sort (derived from variants; NULL = POA/'Contact for licence').
    from_price_minor  BIGINT CHECK (from_price_minor IS NULL OR from_price_minor >= 0),
    from_price_currency CHAR(3) CHECK (from_price_currency IS NULL OR from_price_currency ~ '^[A-Z]{3}$'),
    -- Type-specific extension fields kept in JSONB so products & services share one table
    -- without a sparse wide schema (e.g. service: {duration_weeks, delivery_mode}; product: {trial_url}).
    attributes        JSONB NOT NULL DEFAULT '{}'::jsonb,
    seo               JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {metaTitle, metaDescription, socialImage}
    search_tsv        tsvector,                          -- maintained by trigger over name+short+tags
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID REFERENCES users(id),
    updated_by        UUID REFERENCES users(id),
    published_at      TIMESTAMPTZ,
    deleted_at        TIMESTAMPTZ,
    row_version       INTEGER NOT NULL DEFAULT 1,
    UNIQUE (org_id, slug),
    -- Unified-model invariants: products carry a vendor; services do not.
    CONSTRAINT chk_product_has_vendor
        CHECK (type <> 'product' OR vendor_id IS NOT NULL),
    CONSTRAINT chk_service_no_vendor
        CHECK (type <> 'service' OR vendor_id IS NULL),
    CONSTRAINT chk_fulfilment_for_type
        CHECK (
          (type = 'product' AND fulfilment IN ('license','subscription','enquiry'))
          OR
          (type = 'service' AND fulfilment IN ('engagement','enquiry','subscription'))
        ),
    CONSTRAINT chk_from_price_pair
        CHECK ((from_price_minor IS NULL) = (from_price_currency IS NULL))  -- both or neither
);
CREATE INDEX idx_offerings_org_status   ON offerings(org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_offerings_vendor       ON offerings(vendor_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_offerings_category     ON offerings(category_id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_offerings_type         ON offerings(org_id, type)   WHERE deleted_at IS NULL;
CREATE INDEX idx_offerings_featured     ON offerings(org_id) WHERE featured AND deleted_at IS NULL;
CREATE INDEX idx_offerings_platforms    ON offerings USING GIN (platforms);
CREATE INDEX idx_offerings_tags         ON offerings USING GIN (tags);
CREATE INDEX idx_offerings_search       ON offerings USING GIN (search_tsv);
CREATE INDEX idx_offerings_name_trgm    ON offerings USING GIN (name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 9. OFFERING MEDIA (ordered gallery — many images per offering)
-- ---------------------------------------------------------------------
CREATE TABLE offering_media (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    offering_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
    asset_id    UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (offering_id, asset_id)
);
CREATE INDEX idx_offering_media_offering ON offering_media(offering_id, sort_order);

-- ---------------------------------------------------------------------
-- 10. OFFERING VARIANTS / EDITIONS  (819 rows in the feed)
--     The numeric price substrate. base_price_minor is MINOR UNITS.
--     sku is NOT globally unique in the feed (e.g. ASPOSE-230 repeats per
--     edition row) → uniqueness is (offering_id, sku, license_type, billing_period).
-- ---------------------------------------------------------------------
CREATE TABLE offering_variants (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    offering_id      UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
    sku              TEXT,                               -- feed: 'ASPOSE-230' (nullable; not always present)
    name             TEXT NOT NULL,                      -- 'Developer, C++'
    license_type     TEXT,                               -- 'Developer OEM - Single Developer, Unlimited Deployment'
    platform         TEXT,                               -- reserved (empty in feed)
    billing_period   billing_period NOT NULL DEFAULT 'perpetual',
    base_price_minor BIGINT CHECK (base_price_minor IS NULL OR base_price_minor >= 0),  -- NULL = POA / 'Contact for licence'
    currency         CHAR(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),       -- 'GBP'
    min_order_qty    INTEGER NOT NULL DEFAULT 1 CHECK (min_order_qty >= 1),
    list_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0    -- feed: discountPct (manufacturer list discount, 0 today)
                       CHECK (list_discount_pct >= 0 AND list_discount_pct <= 100),
    sort_order       INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by       UUID REFERENCES users(id),
    updated_by       UUID REFERENCES users(id),
    deleted_at       TIMESTAMPTZ,
    row_version      INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT chk_variant_price_pair
        CHECK ((base_price_minor IS NULL) = (currency IS NULL))          -- price implies currency
    -- NOTE: no natural UNIQUE key on variants. Validated against the real feed: editions collide on
    -- (sku, license_type, billing_period) — e.g. Aspose "+1yr" vs "+5yr" support share all three — AND
    -- on name (aspose-tex-for-c++ has 6 "Developer, C++" rows). So the bulk importer upserts by
    -- REPLACING all variants for an offering (keyed by offering slug), not per-variant; variant
    -- dedup/identity is a data-cleanup task for the bulk/AI tooling. idx_variants_sku aids lookup.
);
CREATE INDEX idx_variants_offering ON offering_variants(offering_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_variants_sku      ON offering_variants(org_id, sku)  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 11. OFFERING SPECS  ([{label, value}] feature/spec rows; ordered)
--     IronPDF alone has ~24 — a real child table, not a JSON blob, so
--     specs are queryable/diffable and survive bulk edits cleanly.
-- ---------------------------------------------------------------------
CREATE TABLE offering_specs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    offering_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,                          -- 'Load TeX source files from disk'
    value       TEXT NOT NULL DEFAULT '✓',              -- '✓' or a real value
    sort_order  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (offering_id, sort_order)
);
CREATE INDEX idx_specs_offering ON offering_specs(offering_id);

-- ---------------------------------------------------------------------
-- 12. PRICING RULES  (the discount/repricing engine)
--     scope_type drives WHICH targets; targets resolved via a JOIN table
--     (pricing_rule_targets) for type in (vendor,category,offering,tier),
--     and implicitly all offerings for scope_type='all'.
--     SINGLE-WINNER, floor-clamped, never negative, never on POA.
-- ---------------------------------------------------------------------
CREATE TABLE pricing_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                  -- 'Aspose Summer Sale'
    active              BOOLEAN NOT NULL DEFAULT false, -- new rules ship OFF; never silently live
    scope_type          rule_scope_type NOT NULL,
    applies_to_offering_type offering_type,             -- NULL = both products & services
    adjustment_type     adjustment_type NOT NULL,       -- 'percentage' | 'fixed'
    adjustment_value    BIGINT NOT NULL                 -- percentage: basis points? no — see note. We store:
                          CHECK (adjustment_value >= 0),--   percentage -> whole/2dp pct in adjustment_value_pct
                                                        --   fixed      -> MINOR UNITS reduction here.
    adjustment_value_pct NUMERIC(5,2)                   -- used when adjustment_type='percentage' (e.g. 20.00 = -20%)
                          CHECK (adjustment_value_pct IS NULL
                                 OR (adjustment_value_pct >= 0 AND adjustment_value_pct <= 100)),
    currency            CHAR(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),  -- required for 'fixed'
    audience            rule_audience NOT NULL DEFAULT 'public',
    audience_tier_id    UUID REFERENCES customer_tiers(id) ON DELETE CASCADE,         -- set iff audience='tier'
    starts_at           TIMESTAMPTZ,                    -- NULL = open start
    ends_at             TIMESTAMPTZ,                    -- NULL = open end
    priority            INTEGER NOT NULL DEFAULT 100,   -- LOWER wins on overlap (single-winner)
    floor_fraction      NUMERIC(4,3) NOT NULL DEFAULT 0.000   -- final >= base * floor_fraction (and >= 0)
                          CHECK (floor_fraction >= 0 AND floor_fraction <= 1),
    label               TEXT,                           -- public badge text ('Offer', 'Preferred pricing')
    status              publish_status NOT NULL DEFAULT 'draft',  -- rides catalogue publish gate
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID REFERENCES users(id),
    updated_by          UUID REFERENCES users(id),
    published_at        TIMESTAMPTZ,
    deleted_at          TIMESTAMPTZ,
    row_version         INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT chk_rule_schedule       CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
    CONSTRAINT chk_rule_pct_present    CHECK (adjustment_type <> 'percentage' OR adjustment_value_pct IS NOT NULL),
    CONSTRAINT chk_rule_fixed_currency CHECK (adjustment_type <> 'fixed' OR currency IS NOT NULL),
    CONSTRAINT chk_rule_tier_audience  CHECK ((audience = 'tier') = (audience_tier_id IS NOT NULL))
);
CREATE INDEX idx_rules_org_active ON pricing_rules(org_id) WHERE active AND deleted_at IS NULL;
CREATE INDEX idx_rules_window     ON pricing_rules(org_id, starts_at, ends_at) WHERE deleted_at IS NULL;

-- Join table for rule targets (RECOMMENDED over a scope_ids[] array — see narrative).
-- Holds the concrete vendor/category/offering/tier targets for a rule.
CREATE TABLE pricing_rule_targets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    rule_id     UUID NOT NULL REFERENCES pricing_rules(id) ON DELETE CASCADE,
    -- Exactly one of the four target FKs is set, matching the rule's scope_type.
    vendor_id   UUID REFERENCES vendors(id)        ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id)     ON DELETE CASCADE,
    offering_id UUID REFERENCES offerings(id)      ON DELETE CASCADE,
    tier_id     UUID REFERENCES customer_tiers(id) ON DELETE CASCADE,
    CONSTRAINT chk_exactly_one_target CHECK (
        (vendor_id   IS NOT NULL)::int
      + (category_id IS NOT NULL)::int
      + (offering_id IS NOT NULL)::int
      + (tier_id     IS NOT NULL)::int = 1
    )
);
CREATE INDEX idx_rule_targets_rule     ON pricing_rule_targets(rule_id);
CREATE INDEX idx_rule_targets_vendor   ON pricing_rule_targets(vendor_id)   WHERE vendor_id   IS NOT NULL;
CREATE INDEX idx_rule_targets_category ON pricing_rule_targets(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_rule_targets_offering ON pricing_rule_targets(offering_id) WHERE offering_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 13. QUOTES / INQUIRIES  (the browse-and-enquire core; the cart was wrong)
-- ---------------------------------------------------------------------
CREATE TABLE quotes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    reference     CITEXT NOT NULL,                      -- human ref 'Q-2026-000123'
    customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,   -- may be NULL until matched
    customer_user_id UUID REFERENCES customer_users(id) ON DELETE SET NULL,
    -- Captured contact details (the enquiry form), independent of any matched customer row.
    contact_name  TEXT,
    contact_email CITEXT,
    contact_company TEXT,
    contact_phone TEXT,
    message       TEXT,
    status        quote_status NOT NULL DEFAULT 'new',
    source        quote_source NOT NULL DEFAULT 'product_page',
    currency      CHAR(3) NOT NULL DEFAULT 'GBP' CHECK (currency ~ '^[A-Z]{3}$'),
    -- Snapshot of indicative total at capture (minor units; informational only — no checkout).
    indicative_total_minor BIGINT CHECK (indicative_total_minor IS NULL OR indicative_total_minor >= 0),
    assigned_to   UUID REFERENCES users(id) ON DELETE SET NULL,       -- sales owner
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,                 -- type=quote|trial, utm, applied_rule_ids
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    row_version   INTEGER NOT NULL DEFAULT 1,
    UNIQUE (org_id, reference)
);
CREATE INDEX idx_quotes_org_status ON quotes(org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_customer   ON quotes(customer_id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_assigned   ON quotes(assigned_to)    WHERE deleted_at IS NULL;

CREATE TABLE quote_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    quote_id        UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    offering_id     UUID REFERENCES offerings(id) ON DELETE SET NULL,        -- keep snapshot if offering later deleted
    variant_id      UUID REFERENCES offering_variants(id) ON DELETE SET NULL,
    applied_rule_id UUID REFERENCES pricing_rules(id) ON DELETE SET NULL,    -- winning rule at capture
    -- Denormalised snapshot so the quote is immutable even if the catalogue changes.
    offering_name   TEXT NOT NULL,
    variant_name    TEXT,
    qty             INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),
    list_price_minor    BIGINT CHECK (list_price_minor IS NULL OR list_price_minor >= 0),     -- base before rule
    captured_price_minor BIGINT CHECK (captured_price_minor IS NULL OR captured_price_minor >= 0), -- after rule (NULL=POA)
    currency        CHAR(3) NOT NULL DEFAULT 'GBP' CHECK (currency ~ '^[A-Z]{3}$'),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quote_items_quote    ON quote_items(quote_id);
CREATE INDEX idx_quote_items_offering ON quote_items(offering_id);

-- ---------------------------------------------------------------------
-- 14. ORDERS + ORDER ITEMS  (modelled now; CHECKOUT IS OUT OF SCOPE.
--     Present so the contract is complete and a quote can be converted
--     when/if real purchasing is enabled. No payment fields are faked.)
-- ---------------------------------------------------------------------
CREATE TABLE orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    reference     CITEXT NOT NULL,
    quote_id      UUID REFERENCES quotes(id) ON DELETE SET NULL,    -- converted from
    customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
    status        order_status NOT NULL DEFAULT 'pending',
    currency      CHAR(3) NOT NULL DEFAULT 'GBP' CHECK (currency ~ '^[A-Z]{3}$'),
    subtotal_minor BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
    total_minor    BIGINT NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
    placed_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    row_version   INTEGER NOT NULL DEFAULT 1,
    UNIQUE (org_id, reference)
);
CREATE INDEX idx_orders_org_status ON orders(org_id, status) WHERE deleted_at IS NULL;

CREATE TABLE order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    offering_id     UUID REFERENCES offerings(id) ON DELETE SET NULL,
    variant_id      UUID REFERENCES offering_variants(id) ON DELETE SET NULL,
    applied_rule_id UUID REFERENCES pricing_rules(id) ON DELETE SET NULL,
    offering_name   TEXT NOT NULL,
    variant_name    TEXT,
    qty             INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),
    unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
    line_total_minor BIGINT NOT NULL CHECK (line_total_minor >= 0),
    currency        CHAR(3) NOT NULL DEFAULT 'GBP' CHECK (currency ~ '^[A-Z]{3}$'),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ---------------------------------------------------------------------
-- 15. IMPORT JOBS + ROWS  (Excel/CSV round-trip: dry-run, diff, rollback)
-- ---------------------------------------------------------------------
CREATE TABLE import_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    type          import_type NOT NULL,
    status        import_status NOT NULL DEFAULT 'uploaded',
    dry_run       BOOLEAN NOT NULL DEFAULT true,
    source_checksum TEXT,                               -- idempotency: identical file → reuse/refuse
    column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,  -- messy-header → schema field map (often AI-proposed)
    diff_summary  JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {inserts, updates, noops, errors, byEntity:{…}}
    error_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_rows    INTEGER NOT NULL DEFAULT 0,
    applied_at    TIMESTAMPTZ,
    rolled_back_at TIMESTAMPTZ,
    rollback_token UUID,                                -- groups audit_log entries for one-click rollback
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID REFERENCES users(id),
    deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_import_jobs_org ON import_jobs(org_id, status) WHERE deleted_at IS NULL;

CREATE TABLE import_job_rows (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    job_id        UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    row_number    INTEGER NOT NULL,
    raw           JSONB NOT NULL,                       -- the original spreadsheet row, verbatim
    mapped        JSONB,                                -- normalised to schema shape
    target_entity TEXT,                                 -- 'offering' | 'variant' | 'vendor' | …
    match_key     TEXT,                                 -- slug / sku used for upsert
    action        import_row_action NOT NULL DEFAULT 'noop',
    errors        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- per-field validation errors
    before        JSONB,                                -- snapshot for rollback (update/delete)
    after         JSONB,                                -- proposed/applied state
    UNIQUE (job_id, row_number)
);
CREATE INDEX idx_import_rows_job    ON import_job_rows(job_id);
CREATE INDEX idx_import_rows_action ON import_job_rows(job_id, action);

-- ---------------------------------------------------------------------
-- 16. AI ACTIONS  (Claude-assisted ops: propose → preview → approve → apply)
-- ---------------------------------------------------------------------
CREATE TABLE ai_actions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    kind            ai_action_kind NOT NULL,
    prompt          TEXT NOT NULL,                      -- the NL instruction
    model           TEXT,                               -- model id used (audit/repro)
    target_entity   TEXT,                               -- 'offering' | 'pricing_rule' | …
    target_filter   JSONB NOT NULL DEFAULT '{}'::jsonb, -- which rows it ran against
    proposed_changes JSONB NOT NULL DEFAULT '[]'::jsonb,-- [{entity, id, before, after}] preview payload
    status          ai_action_status NOT NULL DEFAULT 'proposed',
    is_destructive  BOOLEAN NOT NULL DEFAULT false,     -- destructive changes require explicit admin approval
    import_job_id   UUID REFERENCES import_jobs(id) ON DELETE SET NULL,  -- if the AI op materialised as an import
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    applied_at      TIMESTAMPTZ,
    rejected_reason TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id),
    CONSTRAINT chk_ai_approved CHECK (status <> 'applied' OR approved_by IS NOT NULL)  -- never auto-apply unapproved
);
CREATE INDEX idx_ai_actions_org_status ON ai_actions(org_id, status);

-- ---------------------------------------------------------------------
-- 17. CONTENT PAGES + VERSIONS  (the Puck CMS pages; draft→publish)
-- ---------------------------------------------------------------------
CREATE TABLE content_pages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    slug          CITEXT NOT NULL,                      -- '' for home, 'method', 'contact', 'products'…
    title         TEXT NOT NULL,
    status        publish_status NOT NULL DEFAULT 'draft',
    draft_data    JSONB NOT NULL DEFAULT '{}'::jsonb,   -- Puck working tree {root, content}
    published_data JSONB,                               -- live projection (public reads this)
    seo           JSONB NOT NULL DEFAULT '{}'::jsonb,
    background    TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    published_at  TIMESTAMPTZ,
    approved_by   UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID REFERENCES users(id),
    updated_by    UUID REFERENCES users(id),
    deleted_at    TIMESTAMPTZ,
    row_version   INTEGER NOT NULL DEFAULT 1,
    UNIQUE (org_id, slug)
);
CREATE INDEX idx_pages_org_status ON content_pages(org_id, status) WHERE deleted_at IS NULL;

CREATE TABLE page_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    page_id     UUID NOT NULL REFERENCES content_pages(id) ON DELETE CASCADE,
    version_no  INTEGER NOT NULL,                       -- monotonic per page
    label       TEXT,
    data        JSONB NOT NULL,                         -- full snapshot of draft_data at the time
    status_at   publish_status,                         -- editorial state when snapshotted
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID REFERENCES users(id),
    UNIQUE (page_id, version_no)
);
CREATE INDEX idx_page_versions_page ON page_versions(page_id, version_no DESC);

-- Editorial governance trail (draft→review→approved→published transitions).
CREATE TABLE page_status_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    page_id     UUID NOT NULL REFERENCES content_pages(id) ON DELETE CASCADE,
    from_status publish_status,
    to_status   publish_status NOT NULL,
    note        TEXT,
    actor_id    UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_page_status_history_page ON page_status_history(page_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 18. AUDIT LOG  (universal before/after trail across the whole domain)
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    actor_id    UUID REFERENCES users(id),              -- NULL for system/import jobs
    actor_label TEXT,                                   -- 'import_job:…', 'ai_action:…', 'system'
    entity      TEXT NOT NULL,                          -- 'offering', 'pricing_rule', 'content_page', …
    entity_id   UUID,
    action      audit_action NOT NULL,
    before      JSONB,
    after       JSONB,
    context     JSONB NOT NULL DEFAULT '{}'::jsonb,     -- {import_job_id, ai_action_id, rollback_token, ip}
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_org_at      ON audit_log(org_id, at DESC);
CREATE INDEX idx_audit_entity      ON audit_log(org_id, entity, entity_id);
CREATE INDEX idx_audit_rollback    ON audit_log((context->>'rollback_token')) WHERE context ? 'rollback_token';

-- ---------------------------------------------------------------------
-- 19. updated_at / row_version maintenance trigger (apply to mutable tables)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_row() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    IF TG_OP = 'UPDATE' AND NEW.row_version = OLD.row_version THEN
        NEW.row_version := OLD.row_version + 1;          -- optimistic-lock bump
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_offerings BEFORE UPDATE ON offerings
    FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER trg_touch_variants  BEFORE UPDATE ON offering_variants
    FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER trg_touch_rules     BEFORE UPDATE ON pricing_rules
    FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER trg_touch_pages     BEFORE UPDATE ON content_pages
    FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER trg_touch_vendors   BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER trg_touch_categories BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER trg_touch_customers BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER trg_touch_quotes    BEFORE UPDATE ON quotes
    FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER trg_touch_orders    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION touch_row();

-- offerings.search_tsv maintenance
CREATE OR REPLACE FUNCTION offerings_tsv() RETURNS trigger AS $$
BEGIN
    NEW.search_tsv :=
        setweight(to_tsvector('simple', coalesce(NEW.name,'')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.short_description,'')), 'B') ||
        setweight(to_tsvector('simple', array_to_string(NEW.tags,' ')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_offerings_tsv BEFORE INSERT OR UPDATE ON offerings
    FOR EACH ROW EXECUTE FUNCTION offerings_tsv();

-- ---------------------------------------------------------------------
-- 20. ROW-LEVEL SECURITY (tenant isolation)
--     Pattern: every business table gets an org policy keyed off a GUC
--     the app sets per request:  SET app.current_org = '<uuid>';
--     (Supabase: derive from auth.jwt(); Laravel: set in a DB middleware.)
--     Shown for offerings; the SAME policy is applied to every org-scoped
--     table. Service-role/admin connections bypass via BYPASSRLS role.
-- ---------------------------------------------------------------------
ALTER TABLE offerings ENABLE ROW LEVEL SECURITY;
CREATE POLICY offerings_tenant_isolation ON offerings
    USING (org_id = current_setting('app.current_org', true)::uuid)
    WITH CHECK (org_id = current_setting('app.current_org', true)::uuid);
-- (Repeat ALTER … ENABLE ROW LEVEL SECURITY + identical USING/WITH CHECK
--  policy for: vendors, categories, offering_variants, offering_specs,
--  offering_media, media_assets, pricing_rules, pricing_rule_targets,
--  customers, customer_tiers, customer_users, quotes, quote_items,
--  orders, order_items, import_jobs, import_job_rows, ai_actions,
--  content_pages, page_versions, page_status_history, audit_log, users.)
