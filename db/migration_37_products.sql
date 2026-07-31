-- migration_37_products.sql
-- Phase 3: Product Selling schema.
-- Follows ADR 0001 (docs/adr/0001-marketplace-ownership-entitlements-payments.md):
--   - owner_id (not seller_id) for platform-wide ownership naming consistency
--     with articles.owner_id / businesses.owner_id. The Phase 3 prompt's
--     "seller_id" naming was informal, same situation articles.owner_id was
--     in before migration_35 formalized the convention.
--   - business_id is a separate, optional, nullable FK — never a polymorphic
--     "user or business" seller column. A product is always owned by a user;
--     the business tag is just an affiliation, exactly like articles.business_id.
--   - No entitlements table. products.status is both the paid/live flag and
--     the public-visibility RLS gate, same as businesses.status.
--   - Products are sold as repeatable orders (buyer, quantity, payment IDs,
--     fulfillment), so — unlike businesses, which store payment IDs directly
--     on the entity — purchases get their own product_orders table,
--     mirroring ticket_orders.

-- ── 1. Products ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 3 AND 180),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description TEXT NOT NULL CHECK (char_length(trim(description)) >= 20),
  images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  price_type TEXT NOT NULL DEFAULT 'one_time'
    CHECK (price_type IN ('one_time', 'subscription')),
  stripe_price_id TEXT,
  stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'out_of_stock', 'archived')),
  seo_title TEXT CHECK (seo_title IS NULL OR char_length(seo_title) <= 70),
  seo_description TEXT CHECK (seo_description IS NULL OR char_length(seo_description) <= 180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN products.owner_id IS
  'Per-table owner reference to auth.users, matching the platform-wide ownership convention (see articles.owner_id, businesses.owner_id, and ADR 0001).';

COMMENT ON COLUMN products.business_id IS
  'Optional business affiliation, mirroring articles.business_id. A product is always owned by a user (owner_id); this only tags it for business-page display/attribution.';

COMMENT ON COLUMN products.stock_quantity IS
  'NULL = unlimited/digital good. Decremented by the payment webhook on confirmed purchase, never client-side. Guard decrements with `WHERE stock_quantity >= <qty>` for idempotency under webhook retries.';

CREATE INDEX IF NOT EXISTS idx_products_owner_id ON products(owner_id);
CREATE INDEX IF NOT EXISTS idx_products_business_id ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_public_listing ON products(status, created_at DESC);

CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_products_updated_at();

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS "Public can view active products" ON products;
CREATE POLICY "Public can view active products"
  ON products FOR SELECT
  USING (status = 'active' OR status = 'out_of_stock');

DROP POLICY IF EXISTS "Owners can view their own products" ON products;
CREATE POLICY "Owners can view their own products"
  ON products FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Admins can view all products" ON products;
CREATE POLICY "Admins can view all products"
  ON products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- INSERT
DROP POLICY IF EXISTS "Active authenticated users can create products" ON products;
CREATE POLICY "Active authenticated users can create products"
  ON products FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.status = 'active'
    )
    AND (
      business_id IS NULL
      OR EXISTS (
        SELECT 1 FROM businesses
        WHERE businesses.id = products.business_id
          AND businesses.owner_id = auth.uid()
      )
    )
  );

-- UPDATE
DROP POLICY IF EXISTS "Owners can update their own products" ON products;
CREATE POLICY "Owners can update their own products"
  ON products FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND (
      business_id IS NULL
      OR EXISTS (
        SELECT 1 FROM businesses
        WHERE businesses.id = products.business_id
          AND businesses.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Admins can update any product" ON products;
CREATE POLICY "Admins can update any product"
  ON products FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- DELETE
DROP POLICY IF EXISTS "Owners can delete archived products" ON products;
CREATE POLICY "Owners can delete archived products"
  ON products FOR DELETE
  USING (auth.uid() = owner_id AND status = 'archived');

DROP POLICY IF EXISTS "Admins can delete any product" ON products;
CREATE POLICY "Admins can delete any product"
  ON products FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- ── 2. Product orders ─────────────────────────────────────────────────────
-- Mirrors ticket_orders: a product can be purchased repeatedly by different
-- buyers, so the purchase record (buyer, quantity, payment IDs, status)
-- can't live on the products row itself the way businesses.status can.

-- product_id uses ON DELETE RESTRICT (not CASCADE) deliberately — a product
-- with order history must never be hard-deletable, since that would destroy
-- sales/financial records. The owner-facing DELETE policy on products already
-- only allows removing a product when status = 'archived', so this never
-- blocks a real workflow: archiving pulls it from public listings instantly
-- without touching the row or anything referencing it.
CREATE TABLE IF NOT EXISTS product_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_email TEXT,
  buyer_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  payment_method TEXT NOT NULL DEFAULT 'stripe'
    CHECK (payment_method IN ('stripe', 'crypto')),
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  crypto_payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN product_orders.product_name IS
  'Snapshot of products.name at order-creation time, written explicitly by the checkout route (not a trigger/default). Never re-derived from products at display time, so a later rename or deletion of the product does not rewrite historical order/receipt text.';

COMMENT ON COLUMN product_orders.unit_price IS
  'Snapshot of the price actually charged per unit at order-creation time, written explicitly by the checkout route. Same rationale as product_name — total_amount already captures the charged total, but unit_price preserves the per-item breakdown independent of any later products.stripe_price_id change.';

COMMENT ON COLUMN product_orders.buyer_id IS
  'Nullable — guest checkout is allowed platform-wide (see platform_settings.allow_guest_checkout), same as donations.user_id and ticket_orders.buyer_email being the only guest identifier.';

COMMENT ON COLUMN product_orders.status IS
  'Flipped pending -> paid exclusively by the payment webhook (Stripe checkout.session.completed kind="product", or the crypto webhook''s "product" kind), same idempotency pattern as ticket_orders/businesses. Stock decrement on products.stock_quantity happens in the same webhook transaction, guarded so retries cannot double-decrement.';

CREATE INDEX IF NOT EXISTS idx_product_orders_product_id ON product_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_product_orders_buyer_id ON product_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_product_orders_stripe_session_id ON product_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_product_orders_stripe_payment_intent_id ON product_orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_product_orders_crypto_payment_id ON product_orders(crypto_payment_id);

CREATE OR REPLACE FUNCTION update_product_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_orders_updated_at ON product_orders;
CREATE TRIGGER trg_product_orders_updated_at
  BEFORE INSERT OR UPDATE ON product_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_product_orders_updated_at();

ALTER TABLE product_orders ENABLE ROW LEVEL SECURITY;

-- SELECT: buyer can see their own orders; product owner can see orders on
-- their products; admins see everything. No public SELECT policy — orders
-- are never publicly listed.
DROP POLICY IF EXISTS "Buyers can view their own product orders" ON product_orders;
CREATE POLICY "Buyers can view their own product orders"
  ON product_orders FOR SELECT
  USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Product owners can view orders on their products" ON product_orders;
CREATE POLICY "Product owners can view orders on their products"
  ON product_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_orders.product_id
        AND products.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view all product orders" ON product_orders;
CREATE POLICY "Admins can view all product orders"
  ON product_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- INSERT: checkout routes always insert via the service-role client (same
-- pattern as donations/ticket_orders), which bypasses RLS. This policy exists
-- for defense-in-depth only, in case a future client-side insert path is added.
DROP POLICY IF EXISTS "Authenticated users can create their own pending order" ON product_orders;
CREATE POLICY "Authenticated users can create their own pending order"
  ON product_orders FOR INSERT
  WITH CHECK (auth.uid() = buyer_id AND status = 'pending');

-- UPDATE: no owner/buyer policy — status transitions are exclusively
-- webhook-driven via the service-role client, same as ticket_orders/donations.
DROP POLICY IF EXISTS "Admins can update any product order" ON product_orders;
CREATE POLICY "Admins can update any product order"
  ON product_orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

NOTIFY pgrst, 'reload schema';
