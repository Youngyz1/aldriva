-- migration_128_website_draft_blocks_and_dec0016_status.sql
--
-- 1. DEC-0016 approval policy implementation:
--    - Businesses, articles, and products publish/activate immediately without admin approval.
--    - enforce_article_status_transition: allows non-admins to transition to 'published'.
--    - enforce_business_status_transition: allows non-admins to transition to 'published'.
--    - enforce_product_status_transition: allows non-admins to transition to 'active'.
--    - enforce_fundraiser_status_transition is UNCHANGED (crowdfunding campaigns still require admin approval).
--    - NOTE: no backfill — existing pending_review records remain unchanged; policy applies to new writes going forward.
--
-- 2. Phase 4 visual website editor canvas support:
--    - Adds draft_blocks column (JSONB, default NULL) to website_pages for working draft blocks.
--
-- 3. Tenant-scoped media upload support:
--    - Adds tenant-scoped INSERT/UPDATE/DELETE storage RLS policies for cms-media bucket,
--      allowing team members (owner, admin, manager, editor) to upload/manage assets under
--      their tenant folder (<tenant_id>/...).

BEGIN;

-- ── 1. DEC-0016 Status Transition Triggers ────────────────────────────────

-- 1A. articles (migration_38 / migration_105)
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

  -- DEC-0016: Non-admin authors and editors may publish articles directly.
  IF NEW.status NOT IN ('draft', 'pending_review', 'scheduled', 'archived', 'published') THEN
    RAISE EXCEPTION 'Only an admin can set article status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1B. businesses (migration_38 / migration_105)
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

  -- DEC-0016: Non-admin owners and managers may publish businesses directly.
  IF NEW.status NOT IN ('pending_review', 'archived', 'published') THEN
    RAISE EXCEPTION 'Only an admin can set business status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1C. products (migration_38 / migration_105)
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

  -- DEC-0016: Non-admin owners and managers may set product status to active directly.
  IF NEW.status IN ('pending_review', 'archived', 'active', 'out_of_stock') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an admin can set product status to %', NEW.status;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Add draft_blocks to website_pages ──────────────────────────────────

ALTER TABLE website_pages
  ADD COLUMN IF NOT EXISTS draft_blocks JSONB DEFAULT NULL;

COMMENT ON COLUMN website_pages.draft_blocks IS 'Unpublished draft block payload for visual page builder canvas.';

-- ── 3. Tenant-scoped storage RLS for cms-media ────────────────────────────

DROP POLICY IF EXISTS "Tenant team members can upload CMS media" ON storage.objects;
CREATE POLICY "Tenant team members can upload CMS media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'cms-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
          AND profiles.status = 'active'
      )
      OR
      (
        (storage.foldername(storage.objects.name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (
          is_entity_member(
            ((storage.foldername(storage.objects.name))[1])::uuid,
            ARRAY['owner', 'admin', 'manager', 'editor']
          )
          OR EXISTS (
            SELECT 1 FROM public.organizers
            WHERE organizers.id = ((storage.foldername(storage.objects.name))[1])::uuid
              AND organizers.user_id = auth.uid()
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "Tenant team members can update CMS media" ON storage.objects;
CREATE POLICY "Tenant team members can update CMS media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'cms-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
          AND profiles.status = 'active'
      )
      OR
      (
        (storage.foldername(storage.objects.name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (
          is_entity_member(
            ((storage.foldername(storage.objects.name))[1])::uuid,
            ARRAY['owner', 'admin', 'manager', 'editor']
          )
          OR EXISTS (
            SELECT 1 FROM public.organizers
            WHERE organizers.id = ((storage.foldername(storage.objects.name))[1])::uuid
              AND organizers.user_id = auth.uid()
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "Tenant team members can delete CMS media" ON storage.objects;
CREATE POLICY "Tenant team members can delete CMS media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'cms-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
          AND profiles.status = 'active'
      )
      OR
      (
        (storage.foldername(storage.objects.name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (
          is_entity_member(
            ((storage.foldername(storage.objects.name))[1])::uuid,
            ARRAY['owner', 'admin', 'manager', 'editor']
          )
          OR EXISTS (
            SELECT 1 FROM public.organizers
            WHERE organizers.id = ((storage.foldername(storage.objects.name))[1])::uuid
              AND organizers.user_id = auth.uid()
          )
        )
      )
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
