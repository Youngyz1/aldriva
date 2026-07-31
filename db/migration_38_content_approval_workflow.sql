-- migration_38_content_approval_workflow.sql
-- Platform-wide policy: listing anything (Articles, Businesses, Products) is
-- free — no payment required — but nothing goes publicly live until an admin
-- approves it. This migration adds a pending_review -> active|rejected gate
-- to all three tables and decouples Businesses' payment system from
-- visibility entirely (payment becomes an optional "Featured" upgrade).
--
-- Audited current behavior before writing this (see conversation record):
--   - Businesses: payment alone activated listings, zero admin review, ever.
--   - Articles: owner's own "Publish Immediately" form option set status
--     directly, zero admin review, ever. `rejected` existed in the CHECK
--     domain but nothing ever wrote it (dead value).
--   - Products: already free (no payment ever gated listing), but also had
--     zero admin review — createProduct defaulted straight to 'active'.
--
-- Live data audited immediately before writing this migration:
--   - businesses: 1 row (status='active', listing_tier='one_time', paid via
--     crypto). Zero rows in 'pending_payment' or 'expired'.
--   - articles: 2 'published', 1 'scheduled', 1 'draft'. Zero 'rejected'.
--   - products: 0 rows.
-- The businesses pending_payment->pending_review and expired->active remaps
-- below are therefore no-ops today, but must be correct for whenever they
-- aren't.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ARTICLES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE articles ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_status_check;
ALTER TABLE articles ADD CONSTRAINT articles_status_check
  CHECK (status IN ('draft', 'pending_review', 'published', 'scheduled', 'archived', 'expired', 'rejected'));

-- 'draft' stays the INSERT default — unlike businesses/products, articles
-- retain a genuine "still being written, not yet submitted" state that
-- predates the approval gate. No DEFAULT change needed here.

-- Owner INSERT: restrict to the values an owner may set unilaterally.
-- 'published'/'rejected' are no longer owner-writable — see the transition
-- trigger below for why this couldn't just be a static WITH CHECK list.
DROP POLICY IF EXISTS "Active users can create their own articles" ON articles;
CREATE POLICY "Active users can create their own articles"
  ON articles FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND status IN ('draft', 'pending_review', 'scheduled')
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.status = 'active'
    )
    AND (
      organizer_id IS NULL
      OR EXISTS (
        SELECT 1 FROM organizers
        WHERE organizers.id = articles.organizer_id
          AND organizers.user_id = auth.uid()
      )
    )
  );

-- UPDATE policy is intentionally left unchanged (still ownership + active
-- profile + organizer check, no status restriction) — the transition trigger
-- below is what actually gates status changes on UPDATE. A static WITH CHECK
-- restricting status values here would break an owner editing any OTHER
-- field (title, body) on an already-published article, since WITH CHECK
-- evaluates the whole proposed row, including the unchanged status.

CREATE OR REPLACE FUNCTION enforce_article_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW; -- no status change in this UPDATE — nothing to enforce
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  -- auth.uid() IS NULL means this write came from a service-role connection
  -- (supabaseAdmin), not an authenticated user session — e.g. the admin
  -- approve/reject routes (isAdmin() checked in application code before the
  -- write) or a webhook (signature-verified before the write). This trigger
  -- has no way to tell "a legitimately gated service-role call" apart from
  -- "any service-role call" — it relies entirely on every such call already
  -- being authorized upstream. A future service-role write to this table's
  -- status column that skips its own gate (a new admin route missing an
  -- isAdmin() check, a one-off script, an ad hoc migration) will pass through
  -- here unchecked. This trigger only protects against authenticated
  -- non-admin users self-approving/rejecting — that is its entire job. See
  -- ADR 0001 §10 "Standing risk."
  is_admin_user := is_admin_user OR auth.uid() IS NULL;

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('draft', 'pending_review', 'scheduled', 'archived') THEN
    RAISE EXCEPTION 'Only an admin can set article status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_article_status_transition ON articles;
CREATE TRIGGER trg_enforce_article_status_transition
  BEFORE UPDATE ON articles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_article_status_transition();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. BUSINESSES — payment decoupled from visibility entirely
-- ═══════════════════════════════════════════════════════════════════════════

-- Safety snapshot for exact rollback — see migration discussion. Cheap,
-- droppable later once confident this migration won't need reverting.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS pre_approval_status_snapshot TEXT;
UPDATE businesses SET pre_approval_status_snapshot = status
WHERE pre_approval_status_snapshot IS NULL;

-- New column: featured/paid-upgrade state, fully decoupled from visibility.
-- Written only by the Stripe/crypto webhooks (service-role) — never exposed
-- in lib/actions/businesses.ts's owner-facing input type.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Backfill is_featured from payment that already happened under the old
-- model, before the status remap below collapses that information.
UPDATE businesses
SET is_featured = true
WHERE status = 'active' AND listing_tier IN ('one_time', 'subscription');

-- Remap old status values into the new domain:
--   pending_payment -> pending_review  (never went live under the old model
--                                        — give it a real shot at going live
--                                        for free, gated by admin instead)
--   expired         -> active          (was previously approved/live; only
--                                        the featured perk lapsed — is_featured
--                                        is already false for these per the
--                                        backfill above. The listing itself
--                                        should not stay hidden just because
--                                        a payment lapsed.)
UPDATE businesses SET status = 'pending_review' WHERE status = 'pending_payment';
UPDATE businesses SET status = 'active' WHERE status = 'expired';

ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_status_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_status_check
  CHECK (status IN ('pending_review', 'active', 'rejected', 'archived'));

ALTER TABLE businesses ALTER COLUMN status SET DEFAULT 'pending_review';

-- Owner INSERT: every new business starts pending_review regardless of
-- listing_tier — payment no longer has any bearing on whether this succeeds.
DROP POLICY IF EXISTS "Active authenticated users can create businesses" ON businesses;
CREATE POLICY "Active authenticated users can create businesses"
  ON businesses FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND status = 'pending_review'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.status = 'active'
    )
  );

-- Owner delete policy is unchanged in intent (status <> 'active' — anything
-- not currently publicly live is safe to self-delete) — the underlying value
-- domain just changed. Kept identical to the pre-migration policy on purpose,
-- not narrowed to pending_review/rejected only, so this doesn't quietly
-- diverge from how self-delete already behaves. (Products' equivalent policy
-- is stricter — archived-only — left as-is since that predates this
-- migration and wasn't part of what was asked; noting the cross-table
-- inconsistency rather than silently changing it here.)
DROP POLICY IF EXISTS "Owners can delete inactive businesses" ON businesses;
CREATE POLICY "Owners can delete inactive businesses"
  ON businesses FOR DELETE
  USING (auth.uid() = owner_id AND status <> 'active');

CREATE OR REPLACE FUNCTION enforce_business_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  -- See the identical comment on enforce_article_status_transition() above —
  -- same standing risk, same reasoning, not repeated here verbatim.
  is_admin_user := is_admin_user OR auth.uid() IS NULL;

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('pending_review', 'archived') THEN
    RAISE EXCEPTION 'Only an admin can set business status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_business_status_transition ON businesses;
CREATE TRIGGER trg_enforce_business_status_transition
  BEFORE UPDATE ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION enforce_business_status_transition();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. PRODUCTS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE products ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD CONSTRAINT products_status_check
  CHECK (status IN ('pending_review', 'active', 'out_of_stock', 'rejected', 'archived'));

ALTER TABLE products ALTER COLUMN status SET DEFAULT 'pending_review';

-- Table is empty (0 rows as of this migration) — no data remap needed.

DROP POLICY IF EXISTS "Active authenticated users can create products" ON products;
CREATE POLICY "Active authenticated users can create products"
  ON products FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND status = 'pending_review'
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

CREATE OR REPLACE FUNCTION enforce_product_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  ) INTO is_admin_user;

  -- See the identical comment on enforce_article_status_transition() above.
  is_admin_user := is_admin_user OR auth.uid() IS NULL;

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('pending_review', 'archived') THEN
    RETURN NEW;
  END IF;

  -- Owner may freely toggle between active <-> out_of_stock post-approval —
  -- restocking doesn't need re-review. Allowed regardless of admin status,
  -- which is also what makes this safe for decrementProductStock's
  -- service-role write (lib/productOrders.ts) — that write always performs
  -- exactly this transition, so it passes here without needing the
  -- auth.uid() IS NULL carve-out at all.
  IF OLD.status IN ('active', 'out_of_stock') AND NEW.status IN ('active', 'out_of_stock') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an admin can set product status to %', NEW.status;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_product_status_transition ON products;
CREATE TRIGGER trg_enforce_product_status_transition
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION enforce_product_status_transition();

NOTIFY pgrst, 'reload schema';
