-- migration_220_service_categories.sql
-- Phase: Service catalogue categories (dashboard + cleaning-fresh and every
-- template that renders services_embed).
--
-- Adds public.service_categories, tenant-scoped to organizers.id exactly like
-- public.services (same scope column, same ordering column, same visibility
-- column). Extends public.services with category_id (nullable FK, ON DELETE
-- SET NULL so deleting a category never deletes or orphans a service from
-- its tenant) plus summary / includes / hero_image_url for richer service
-- cards. Existing services with no category keep working unchanged:
-- category_id defaults to NULL and every existing resolver/query path that
-- does not SELECT the new columns is unaffected.
--
-- db/migration_136_services_and_menus.sql:4 states service categories were
-- "intentionally omitted per DEC-0018" — DEC-0018 (docs/DECISIONS.md) is
-- about business category vs. website template family and does not forbid a
-- services taxonomy. See docs/DECISIONS.md DEC-0064 for the decision record
-- clarifying this and scoping what this migration does and does not change
-- (no changes to products, menus, restaurants, or any booking table).
--
-- Idempotent forward migration: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF
-- NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE
-- POLICY throughout. Additive only — no existing table/column/constraint is
-- altered or dropped. Does not touch public.reservations or any
-- general-booking table.
--
-- Rollback twin: db/migration_220_service_categories_rollback.sql (fail-closed:
-- refuses to run while any service_categories row exists or any services row
-- uses the new optional fields).
-- Mirror: supabase/migrations/20261106000000_migration_220_service_categories.sql
--
-- Safe to re-run.

BEGIN;

-- ── 1. public.service_categories ─────────────────────────────────────────
-- Same scope column (organizer_id), ordering column (position) and
-- visibility column (is_active) as public.services (migration 136).

CREATE TABLE IF NOT EXISTS public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) >= 1 AND char_length(slug) <= 120),
  title text NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 100),
  tagline text CHECK (tagline IS NULL OR char_length(tagline) <= 160),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  image_url text CHECK (image_url IS NULL OR char_length(image_url) <= 2048),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0 AND position <= 999),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizer_id, slug)
);

COMMENT ON TABLE public.service_categories IS 'Service catalogue categories, tenant-scoped to organizers.id. A new taxonomy for public.services only — does not touch products, menus, or restaurant tables.';

CREATE INDEX IF NOT EXISTS idx_service_categories_organizer_id ON public.service_categories(organizer_id);
CREATE INDEX IF NOT EXISTS idx_service_categories_organizer_active ON public.service_categories(organizer_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_service_categories_organizer_position ON public.service_categories(organizer_id, position ASC);

-- Reuses migration 136's update_services_updated_at(): the function body is
-- generic (NEW.updated_at = now()) and already exists, so no new function
-- is created here.
DROP TRIGGER IF EXISTS trg_service_categories_updated_at ON public.service_categories;
CREATE TRIGGER trg_service_categories_updated_at
  BEFORE UPDATE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_services_updated_at();

-- ── 2. Row Level Security — mirrors public.services policies exactly ────

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active service categories" ON public.service_categories;
CREATE POLICY "Public can view active service categories"
  ON public.service_categories FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Tenant members can view service categories" ON public.service_categories;
CREATE POLICY "Tenant members can view service categories"
  ON public.service_categories FOR SELECT
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant editors can insert service categories" ON public.service_categories;
CREATE POLICY "Tenant editors can insert service categories"
  ON public.service_categories FOR INSERT
  WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant editors can update service categories" ON public.service_categories;
CREATE POLICY "Tenant editors can update service categories"
  ON public.service_categories FOR UPDATE
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Tenant managers can delete service categories" ON public.service_categories;
CREATE POLICY "Tenant managers can delete service categories"
  ON public.service_categories FOR DELETE
  USING (
    is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- ── 3. Extend public.services (additive only, no data loss) ─────────────
-- category_id is nullable and ON DELETE SET NULL: deleting a category never
-- deletes or orphans a service. Existing rows keep category_id = NULL,
-- summary = NULL, hero_image_url = NULL, includes = '[]' — no behavior
-- change for any query that does not SELECT these columns.

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS category_id uuid NULL REFERENCES public.service_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS summary text NULL CHECK (summary IS NULL OR char_length(summary) <= 160),
  ADD COLUMN IF NOT EXISTS includes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(includes) = 'array'),
  ADD COLUMN IF NOT EXISTS hero_image_url text NULL CHECK (hero_image_url IS NULL OR char_length(hero_image_url) <= 2048);

COMMENT ON COLUMN public.services.category_id IS 'Optional FK to service_categories. NULL = uncategorized. ON DELETE SET NULL so deleting a category never deletes a service.';
COMMENT ON COLUMN public.services.includes IS 'Short bullet list for the service detail/checklist UI. App code enforces max 12 items, max 80 chars each — not a DB CHECK, same convention as dietary_tags/modifiers bounds in migration 136.';

CREATE INDEX IF NOT EXISTS idx_services_category_id ON public.services(category_id);

COMMIT;

NOTIFY pgrst, 'reload schema';
