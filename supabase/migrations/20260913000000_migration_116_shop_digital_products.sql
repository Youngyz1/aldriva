-- 20260913000000_migration_116_shop_digital_products.sql
--
-- Supabase-CLI mirror of db/migration_116_shop_digital_products.sql
-- (identical body; the db/ file is canonical per CLAUDE.md). Kept in sync so
-- `supabase db push` deploys the same schema as the manual db/ history.
--
-- migration_116_shop_digital_products.sql
--
-- Aldriva Shop Phases 1+2: evolve the existing Products system (migration_37,
-- approval gate in migration_38) into a generic digital-product marketplace.
--
-- Design (additive only — no existing column is renamed, dropped, or
-- retyped; no existing policy/trigger is weakened):
--
--   1. products gains commercial-listing metadata: subtitle, product_type
--      (generic, NOT pdf-only), category, tags, cover_image_url, license,
--      version, update_policy, preview_images. Pricing stays on
--      products.stripe_price_id (Stripe is source of truth per ADR 0001) —
--      no local price column is added. status/approval flow (pending_review
--      gate, enforce_product_status_transition) is untouched.
--   2. product_assets holds the deliverable files (one product -> many
--      assets). product_id uses ON DELETE CASCADE: a product row can only be
--      hard-deleted when it is archived AND has no order history (product_orders
--      is ON DELETE RESTRICT), so cascading assets can never destroy financial
--      history.
--   3. product_downloads logs served downloads for analytics/abuse review.
--   4. storage bucket product-assets (PRIVATE) holds paid deliverables.
--      Covers/previews stay public (existing fundraiser-media flow). All
--      reads/writes go through the service role + signed URLs; storage RLS
--      below is defense-in-depth (owner/admin only, no public access).
--   5. notifications type/related_type CHECKs gain product_* values so the
--      existing bell+Resend pipeline (lib/notifications.ts) can carry
--      purchase/update/refund events. No other notification behavior changes.

BEGIN;

-- ── 1. products: digital-listing metadata ─────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS subtitle TEXT
  CHECK (subtitle IS NULL OR char_length(trim(subtitle)) BETWEEN 1 AND 180);

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT;
UPDATE products SET product_type = 'other' WHERE product_type IS NULL;
ALTER TABLE products ALTER COLUMN product_type SET DEFAULT 'other';
ALTER TABLE products ALTER COLUMN product_type SET NOT NULL;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE products ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN (
    'ebook', 'guide', 'workbook', 'template', 'spreadsheet',
    'presentation', 'resource_pack', 'course', 'audio', 'video',
    'bundle', 'other'
  ));

COMMENT ON COLUMN products.product_type IS
  'Generic digital-product classification. ''other'' covers physical merch and unspecified listings (the pre-116 default), so existing inventory behavior is preserved; any other value marks a digital listing (stock controls hidden, quantity fixed at 1).';

ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT
  CHECK (category IS NULL OR char_length(trim(category)) BETWEEN 1 AND 80);

ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE products ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

ALTER TABLE products ADD COLUMN IF NOT EXISTS license TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_license_check;
ALTER TABLE products ADD CONSTRAINT products_license_check
  CHECK (license IN ('personal', 'commercial', 'extended', 'custom'));

ALTER TABLE products ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT '1.0'
  CHECK (char_length(trim(version)) BETWEEN 1 AND 20);

ALTER TABLE products ADD COLUMN IF NOT EXISTS update_policy TEXT
  CHECK (update_policy IS NULL OR char_length(update_policy) <= 500);

ALTER TABLE products ADD COLUMN IF NOT EXISTS preview_images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_products_product_type ON products(product_type);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_tags_gin ON products USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_products_status_type_created
  ON products(status, product_type, created_at DESC);

-- ── 2. product_assets: deliverable files ──────────────────────────────────

CREATE TABLE IF NOT EXISTS product_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  mime_type TEXT NOT NULL CHECK (char_length(mime_type) BETWEEN 1 AND 127),
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_preview BOOLEAN NOT NULL DEFAULT false,
  version TEXT NOT NULL DEFAULT '1.0' CHECK (char_length(trim(version)) BETWEEN 1 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN product_assets.file_path IS
  'Private-bucket path (product-assets/{product_id}/{asset_id}/{safe_filename}). Never rendered as a public URL — delivery is exclusively via short-lived signed URLs minted by the download route after a paid-order check.';
COMMENT ON TABLE product_assets IS
  'One product -> many downloadable assets. Rows are written only by the service role (upload confirm route), never by direct client inserts. ON DELETE CASCADE is safe: products with order history cannot be hard-deleted (product_orders is ON DELETE RESTRICT).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_assets_path_unique ON product_assets(file_path);
CREATE INDEX IF NOT EXISTS idx_product_assets_product_position ON product_assets(product_id, position);
CREATE INDEX IF NOT EXISTS idx_product_assets_product_preview ON product_assets(product_id) WHERE is_preview = true;

ALTER TABLE product_assets ENABLE ROW LEVEL SECURITY;

-- SELECT: product owner sees assets on their products; admins see everything.
-- No public SELECT — asset paths of paid products are never publicly listed.
DROP POLICY IF EXISTS "Product owners can view assets on their products" ON product_assets;
CREATE POLICY "Product owners can view assets on their products"
  ON product_assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_assets.product_id
        AND products.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view all product assets" ON product_assets;
CREATE POLICY "Admins can view all product assets"
  ON product_assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- No INSERT/UPDATE/DELETE policies: all asset writes go through the service
-- role in the upload/confirm/manage API routes (ownership checked in code),
-- same pattern as product_orders status transitions.

-- ── 3. product_downloads: served-download log ─────────────────────────────

CREATE TABLE IF NOT EXISTS product_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES product_assets(id) ON DELETE SET NULL,
  order_id UUID REFERENCES product_orders(id) ON DELETE SET NULL,
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_downloads_product_created
  ON product_downloads(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_downloads_asset_id ON product_downloads(asset_id);
CREATE INDEX IF NOT EXISTS idx_product_downloads_order_id ON product_downloads(order_id);
CREATE INDEX IF NOT EXISTS idx_product_downloads_buyer_id ON product_downloads(buyer_id);

ALTER TABLE product_downloads ENABLE ROW LEVEL SECURITY;

-- SELECT: downloader sees their own rows; product owner sees rows on their
-- products; admins see everything. No public SELECT.
DROP POLICY IF EXISTS "Downloaders can view their own download log" ON product_downloads;
CREATE POLICY "Downloaders can view their own download log"
  ON product_downloads FOR SELECT
  USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Product owners can view downloads on their products" ON product_downloads;
CREATE POLICY "Product owners can view downloads on their products"
  ON product_downloads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_downloads.product_id
        AND products.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view all product downloads" ON product_downloads;
CREATE POLICY "Admins can view all product downloads"
  ON product_downloads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- No INSERT/UPDATE/DELETE policies: rows are written by the service role in
-- the download route only.

-- ── 4. notifications: product event types ─────────────────────────────────

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'donation', 'comment', 'like', 'fundraiser_approved',
    'fundraiser_rejected', 'follow', 'ticket_purchase',
    'product_purchase', 'product_update', 'product_refund'
  ));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_related_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_related_type_check
  CHECK (related_type IN ('fundraiser', 'comment', 'event', 'profile', 'product'));

-- ── 5. storage: private product-assets bucket ─────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-assets',
  'product-assets',
  false,
  209715200, -- 200MB, matching the event-videos service-role import cap
  ARRAY[
    'application/pdf',
    'application/epub+zip',
    'application/x-mobipocket-ebook',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'audio/mpeg',
    'video/mp4',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path convention: {product_id}/{asset_id}/{safe_filename} — first segment is
-- the product id so RLS can scope to products.owner_id (same shape as the
-- organizer-verification-docs bucket; storage.objects.name is explicitly
-- qualified per the migration_85 fix).
--
-- Uploads go through service-role signed upload URLs (upload-url route);
-- these policies are defense-in-depth for any direct authenticated call.
DROP POLICY IF EXISTS "Product owners can upload product assets" ON storage.objects;
CREATE POLICY "Product owners can upload product assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-assets'
    AND EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id::text = (storage.foldername(storage.objects.name))[1]
        AND products.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Product owners can read own product assets" ON storage.objects;
CREATE POLICY "Product owners can read own product assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'product-assets'
    AND EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id::text = (storage.foldername(storage.objects.name))[1]
        AND products.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can read all product assets" ON storage.objects;
CREATE POLICY "Admins can read all product assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'product-assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- No public SELECT, no UPDATE/DELETE policies: buyers download exclusively
-- via short-lived service-role signed URLs minted after a paid-order check;
-- deletes/replacements go through the service role in the manage API route.

COMMIT;

NOTIFY pgrst, 'reload schema';
