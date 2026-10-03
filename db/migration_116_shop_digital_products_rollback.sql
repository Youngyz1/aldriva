-- migration_116_shop_digital_products_rollback.sql
--
-- Rollback for migration_116: removes the digital-product listing columns,
-- product_assets / product_downloads tables, product notification types, and
-- the private product-assets bucket + policies.
--
-- WARNING: dropping product_assets/product_downloads destroys rows. Only run
-- before any digital product has been sold, or after exporting what you need.
-- Historical product_orders rows are never touched by this rollback.
-- NOTE: DELETE FROM storage.buckets fails while objects remain in the
-- bucket — empty product-assets in Storage first if the rollback errors.

BEGIN;

-- Storage policies first (depend on nothing but must go before the bucket).
DROP POLICY IF EXISTS "Admins can read all product assets" ON storage.objects;
DROP POLICY IF EXISTS "Product owners can read own product assets" ON storage.objects;
DROP POLICY IF EXISTS "Product owners can upload product assets" ON storage.objects;

DELETE FROM storage.buckets WHERE id = 'product-assets';

-- Download log + assets (indexes die with the tables).
DROP TABLE IF EXISTS product_downloads;
DROP TABLE IF EXISTS product_assets;

-- Notifications: restore the pre-116 CHECK sets.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'donation', 'comment', 'like', 'fundraiser_approved',
    'fundraiser_rejected', 'follow', 'ticket_purchase'
  ));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_related_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_related_type_check
  CHECK (related_type IN ('fundraiser', 'comment', 'event', 'profile'));

-- products: drop added indexes, then added columns.
DROP INDEX IF EXISTS idx_products_status_type_created;
DROP INDEX IF EXISTS idx_products_tags_gin;
DROP INDEX IF EXISTS idx_products_category;
DROP INDEX IF EXISTS idx_products_product_type;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_license_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;

ALTER TABLE products DROP COLUMN IF EXISTS preview_images;
ALTER TABLE products DROP COLUMN IF EXISTS update_policy;
ALTER TABLE products DROP COLUMN IF EXISTS version;
ALTER TABLE products DROP COLUMN IF EXISTS license;
ALTER TABLE products DROP COLUMN IF EXISTS cover_image_url;
ALTER TABLE products DROP COLUMN IF EXISTS tags;
ALTER TABLE products DROP COLUMN IF EXISTS category;
ALTER TABLE products DROP COLUMN IF EXISTS product_type;
ALTER TABLE products DROP COLUMN IF EXISTS subtitle;

NOTIFY pgrst, 'reload schema';

COMMIT;
