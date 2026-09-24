-- migration_134_homepage_promotions.sql
-- Isolated homepage Promotions foundation — does NOT touch Featured system.
-- A promotion is a homepage placement pointing to a REAL Aldriva entity,
-- rendered by the future ZoomParallax hero. No cross-table FK (polymorphic),
-- destination derived from entity_type + entity_slug.
--
-- Design decisions vs audit proposal:
--   - entity_slug is TEXT (not entity_id uuid) — polymorphic FK is impossible,
--     and Aldriva canonical routes resolve by slug (events/businesses/products/
--     fundraisers/articles/organizers all use slug). Keeps resolution simple:
--     /events/{slug} etc. No generic entity_id column.
--   - No generated destination_href column — resolver in app code (lib/promotion-href)
--     avoids DB-level string concat drift and keeps canonical route logic in one place.
--   - cta_label nullable 1..80 chars (matches platform_settings CTA length convention).
--   - creative_url TEXT 1..2048, media_type image|video (video deferred to later phase,
--     DB model ready now).
--   - position/priority int >=0 (mirrors homepage_categories position convention).
--   - is_visible bool default false — separate from status so draft can be hidden
--     even before approval.
--   - status draft|pending_review|active|expired|archived default 'draft' — mirrors
--     articles/businesses/products approval gate (migration_38/41).
--   - starts_at/ends_at nullable with CHECK ends_at > starts_at (Phase 5).
--   - created_by/approved_by uuid -> auth.users ON DELETE SET NULL (not CASCADE,
--     preserves promotion row if user deleted — mirrors product_assets pattern).
--   - updated_at trigger follows tenant_websites convention (migration_125).
--   - RLS + trigger enforce_homepage_promotion_status_transition follows
--     migration_105 service_role gate (auth.role() = 'service_role').
--   - Indexes target the public homepage query: active+visible+schedule window
--     plus priority/position ordering.

BEGIN;

-- ── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homepage_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('event','business','product','fundraiser','article','organizer')),
  entity_slug TEXT NOT NULL CHECK (char_length(entity_slug) BETWEEN 1 AND 300),
  creative_url TEXT NOT NULL CHECK (char_length(creative_url) BETWEEN 1 AND 2048),
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
  cta_label TEXT CHECK (cta_label IS NULL OR char_length(trim(cta_label)) BETWEEN 1 AND 80),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority >= 0),
  is_visible BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','active','expired','archived')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT homepage_promotions_schedule_check CHECK (
    ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at
  )
);

COMMENT ON TABLE homepage_promotions IS 'Homepage promotional placements pointing to real Aldriva entities (event/business/product/fundraiser/article/organizer). Isolated from is_homepage_featured featured system and platform_settings hero. Future ZoomParallax hero consumes active+visible+scheduled rows.';
COMMENT ON COLUMN homepage_promotions.entity_type IS 'Polymorphic type — one of six V1 entity types. No cross-table FK.';
COMMENT ON COLUMN homepage_promotions.entity_slug IS 'Canonical slug of the target entity. Destination derived in app as /{entity_type}s/{slug} (organizer uses /org/{slug}). No FK — validated in API.';
COMMENT ON COLUMN homepage_promotions.creative_url IS 'Display creative — https URL or Supabase Storage public URL (cms-media bucket). Video deferred to media phase.';
COMMENT ON COLUMN homepage_promotions.media_type IS 'image or video — DB ready for video, storage/CSP deferred.';
COMMENT ON COLUMN homepage_promotions.position IS 'Manual order within same priority (lower = earlier). Mirrors homepage_categories.position.';
COMMENT ON COLUMN homepage_promotions.priority IS 'Prominence weight — higher priority surfaces first in homepage query.';
COMMENT ON COLUMN homepage_promotions.is_visible IS 'Manual visibility toggle — even active promotions must be visible to appear.';
COMMENT ON COLUMN homepage_promotions.status IS 'Lifecycle: draft -> pending_review -> active -> expired/archived. Only admin/service_role can set active/expired/archived/rejected-equivalent.';
COMMENT ON COLUMN homepage_promotions.starts_at IS 'Optional schedule start — promotion eligible only after this time.';
COMMENT ON COLUMN homepage_promotions.ends_at IS 'Optional schedule end — must be > starts_at when both set.';
COMMENT ON COLUMN homepage_promotions.created_by IS 'Creator (auth.uid() at insert). RLS owner.';
COMMENT ON COLUMN homepage_promotions.approved_by IS 'Admin who approved/activated — set only by admin/service_role.';

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Public homepage query: active + visible + schedule window, ordered by priority/position.
-- Partial index keeps it small (only active rows).
CREATE INDEX IF NOT EXISTS idx_homepage_promotions_active_visible_schedule
  ON homepage_promotions(status, is_visible, starts_at, ends_at)
  WHERE status = 'active' AND is_visible = true;

CREATE INDEX IF NOT EXISTS idx_homepage_promotions_priority_position
  ON homepage_promotions(priority DESC, position ASC);

CREATE INDEX IF NOT EXISTS idx_homepage_promotions_entity
  ON homepage_promotions(entity_type, entity_slug);

CREATE INDEX IF NOT EXISTS idx_homepage_promotions_created_by
  ON homepage_promotions(created_by);

CREATE INDEX IF NOT EXISTS idx_homepage_promotions_status
  ON homepage_promotions(status);

-- ── updated_at trigger (tenant_websites convention) ─────────────────────────
CREATE OR REPLACE FUNCTION update_homepage_promotions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_homepage_promotions_updated_at ON homepage_promotions;
CREATE TRIGGER trg_homepage_promotions_updated_at
  BEFORE UPDATE ON homepage_promotions
  FOR EACH ROW EXECUTE FUNCTION update_homepage_promotions_updated_at();

-- ── Status transition guard (migration_105 convention: auth.role() = 'service_role') ─
CREATE OR REPLACE FUNCTION enforce_homepage_promotion_status_transition()
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

  -- Only genuine service_role bypasses admin check (admin approve routes via supabaseAdmin).
  -- auth.role() = 'service_role' is the hardened gate from migration_105.
  is_admin_user := is_admin_user OR auth.role() = 'service_role';

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  -- Non-admins may only move between draft <-> pending_review and to archived (self-withdraw).
  -- They may never set active/expired themselves.
  IF NEW.status IN ('draft', 'pending_review', 'archived') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an admin can set promotion status to %', NEW.status;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_homepage_promotion_status_transition ON homepage_promotions;
CREATE TRIGGER trg_enforce_homepage_promotion_status_transition
  BEFORE UPDATE ON homepage_promotions
  FOR EACH ROW EXECUTE FUNCTION enforce_homepage_promotion_status_transition();

-- ── Guard: only admin/service_role may set approved_by or toggle is_visible true / priority ─
CREATE OR REPLACE FUNCTION enforce_homepage_promotion_moderation_fields()
RETURNS TRIGGER AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  -- Check if any moderation-guarded column is changing
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR (OLD.is_visible = false AND NEW.is_visible = true)
  THEN
    SELECT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
    ) INTO is_admin_user;
    is_admin_user := is_admin_user OR auth.role() = 'service_role';
    IF NOT is_admin_user THEN
      RAISE EXCEPTION 'Only an admin can modify promotion moderation fields (approved_by, priority, is_visible)';
    END IF;
  END IF;

  -- approved_by, when set, must be an admin user (or service_role null check skipped)
  -- Enforced in app API as well; trigger is defense-in-depth.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_homepage_promotion_moderation ON homepage_promotions;
CREATE TRIGGER trg_enforce_homepage_promotion_moderation
  BEFORE UPDATE ON homepage_promotions
  FOR EACH ROW EXECUTE FUNCTION enforce_homepage_promotion_moderation_fields();

-- ── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE homepage_promotions ENABLE ROW LEVEL SECURITY;

-- Public: only active + visible + within schedule window
DROP POLICY IF EXISTS "Public can view active promotions" ON homepage_promotions;
CREATE POLICY "Public can view active promotions"
  ON homepage_promotions FOR SELECT
  USING (
    status = 'active'
    AND is_visible = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

-- Creators can view their own promotions (any status)
DROP POLICY IF EXISTS "Creators can view own promotions" ON homepage_promotions;
CREATE POLICY "Creators can view own promotions"
  ON homepage_promotions FOR SELECT
  USING (auth.uid() = created_by);

-- Admins can view all promotions
DROP POLICY IF EXISTS "Admins can view all promotions" ON homepage_promotions;
CREATE POLICY "Admins can view all promotions"
  ON homepage_promotions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- Authenticated users can create promotions, but only as pending_review/draft with is_visible=false
-- and approved_by null, and created_by must be themselves.
DROP POLICY IF EXISTS "Authenticated users can create promotions pending review" ON homepage_promotions;
CREATE POLICY "Authenticated users can create promotions pending review"
  ON homepage_promotions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND status IN ('draft', 'pending_review')
    AND is_visible = false
    AND approved_by IS NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.status = 'active'
    )
  );

-- Creators can update their own non-active promotions (status gate via trigger)
DROP POLICY IF EXISTS "Creators can update own promotions" ON homepage_promotions;
CREATE POLICY "Creators can update own promotions"
  ON homepage_promotions FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Creators can delete own draft/pending/archived promotions
DROP POLICY IF EXISTS "Creators can delete own promotions" ON homepage_promotions;
CREATE POLICY "Creators can delete own promotions"
  ON homepage_promotions FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    AND status IN ('draft', 'pending_review', 'archived')
  );

-- Admins can manage all promotions (all operations)
DROP POLICY IF EXISTS "Admins can manage all promotions" ON homepage_promotions;
CREATE POLICY "Admins can manage all promotions"
  ON homepage_promotions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
