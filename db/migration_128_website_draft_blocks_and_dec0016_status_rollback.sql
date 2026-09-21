-- migration_128_website_draft_blocks_and_dec0016_status_rollback.sql
--
-- Rollback for migration_128:
-- 1. Restores migration_105 versions of enforce_article_status_transition,
--    enforce_business_status_transition, and enforce_product_status_transition.
-- 2. Drops draft_blocks column from website_pages.
-- 3. Drops tenant-scoped storage RLS policies from cms-media bucket.

BEGIN;

-- ── 1. Revert DEC-0016 Status Transition Triggers to migration_105 state ──

CREATE OR REPLACE FUNCTION enforce_article_status_transition()
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

  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('draft', 'pending_review', 'scheduled', 'archived') THEN
    RAISE EXCEPTION 'Only an admin can set article status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('pending_review', 'archived') THEN
    RAISE EXCEPTION 'Only an admin can set business status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('pending_review', 'archived') THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('active', 'out_of_stock') AND NEW.status IN ('active', 'out_of_stock') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an admin can set product status to %', NEW.status;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Drop draft_blocks column from website_pages ────────────────────────

ALTER TABLE website_pages DROP COLUMN IF EXISTS draft_blocks;

-- ── 3. Drop tenant-scoped storage RLS policies from cms-media ─────────────

DROP POLICY IF EXISTS "Tenant team members can delete CMS media" ON storage.objects;
DROP POLICY IF EXISTS "Tenant team members can update CMS media" ON storage.objects;
DROP POLICY IF EXISTS "Tenant team members can upload CMS media" ON storage.objects;

COMMIT;

NOTIFY pgrst, 'reload schema';
