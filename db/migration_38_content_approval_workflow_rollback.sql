-- migration_38_content_approval_workflow_rollback.sql
-- Rollback for migration_38_content_approval_workflow.sql — Case A only:
-- safe to run ONLY before any real usage of the new model has occurred —
-- i.e. no article/business/product has actually gone through a
-- pending_review -> active|rejected admin decision yet, and no business has
-- had is_featured set to true by a payment webhook under the new model.
--
-- Unlike migration_37's rollback (pure CREATE TABLE, trivially droppable),
-- this migration ALTERed existing tables holding real content (2 published
-- articles, 1 scheduled, 1 draft; 1 live business). This rollback restores
-- exact prior values via pre_approval_status_snapshot (businesses) rather
-- than guessing, and only works because Articles/Products needed no lossy
-- remap (their old-domain values were already valid in the new domain).
--
-- Do NOT run this once real approve/reject decisions exist, or once
-- is_featured has been set by a real payment under the new model — at that
-- point dropping columns/reverting constraints destroys real information
-- with no way back. Write a forward-only corrective migration instead.
--
-- IMPORTANT — this file only reverts the DATABASE. If you run this, you must
-- ALSO revert the application code from this same change (lib/actions/
-- businesses.ts, lib/actions/products.ts, lib/actions/articles.ts,
-- app/dashboard/businesses/BusinessRowActions.tsx, and the three
-- app/api/admin/*/[id]/route.ts files), since that code now assumes the new
-- schema exists (is_featured column, 'pending_review' as a valid status,
-- etc.) and will error against the reverted schema otherwise. This SQL file
-- alone does not put the application back into a consistent state.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ARTICLES
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_enforce_article_status_transition ON articles;
DROP FUNCTION IF EXISTS enforce_article_status_transition();

DROP POLICY IF EXISTS "Active users can create their own articles" ON articles;
CREATE POLICY "Active users can create their own articles"
  ON articles FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
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

-- No data remap to undo — 'pending_review' was never written under Case A.
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_status_check;
ALTER TABLE articles ADD CONSTRAINT articles_status_check
  CHECK (status IN ('draft', 'published', 'scheduled', 'archived', 'expired', 'rejected'));

ALTER TABLE articles DROP COLUMN IF EXISTS rejection_reason;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. BUSINESSES
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_enforce_business_status_transition ON businesses;
DROP FUNCTION IF EXISTS enforce_business_status_transition();

DROP POLICY IF EXISTS "Active authenticated users can create businesses" ON businesses;
CREATE POLICY "Active authenticated users can create businesses"
  ON businesses FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.status = 'active'
    )
  );

-- The DELETE policy was kept identical in the forward migration (status <>
-- 'active', same operator, same meaning) — nothing to revert there.

-- Exact restore via the snapshot, not a guess — this is why the forward
-- migration took the snapshot before remapping.
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_status_check;
UPDATE businesses SET status = pre_approval_status_snapshot
WHERE pre_approval_status_snapshot IS NOT NULL;
ALTER TABLE businesses ADD CONSTRAINT businesses_status_check
  CHECK (status IN ('active', 'pending_payment', 'expired'));

ALTER TABLE businesses ALTER COLUMN status SET DEFAULT 'pending_payment';

ALTER TABLE businesses DROP COLUMN IF EXISTS is_featured;
ALTER TABLE businesses DROP COLUMN IF EXISTS rejection_reason;
ALTER TABLE businesses DROP COLUMN IF EXISTS pre_approval_status_snapshot;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. PRODUCTS
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_enforce_product_status_transition ON products;
DROP FUNCTION IF EXISTS enforce_product_status_transition();

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

-- No data remap to undo — table had 0 rows at migration time, and Case A
-- assumes no products have been created under the new model since.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD CONSTRAINT products_status_check
  CHECK (status IN ('active', 'out_of_stock', 'archived'));

ALTER TABLE products ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE products DROP COLUMN IF EXISTS rejection_reason;

NOTIFY pgrst, 'reload schema';
