-- migration_58_business_entity_link.sql
-- Phase 1 of the Entity architecture: `organizers` becomes the canonical
-- Entity table. This migration links `businesses` to it via a new,
-- nullable `organizer_id` FK, auto-populated for every business (existing
-- and future) with a dedicated organizer row (org_type='business'), and
-- backfills `articles.organizer_id` from the business chain for rows that
-- were only ever linked via `business_id`.
--
-- Deliberately additive only:
--   - businesses.owner_id, businesses.status (pending_review/active/
--     rejected/archived), RLS, Stripe/crypto/is_featured fields, and all
--     existing admin moderation are untouched. organizer_id is a new,
--     independently maintained attribution column — no existing business
--     or article code path (lib/actions/businesses.ts,
--     lib/actions/articles.ts) needs to change for this migration to work.
--   - organizers.status (pending/verified/rejected/suspended) is a
--     different concept (entity-level trust) from businesses.status (this
--     one page's publish gate) and is not touched or unified here.
--   - No forward-looking trigger auto-fills articles.organizer_id from a
--     future business_id assignment: the articles INSERT policy
--     (migration_38) checks organizer_id ownership but never checked
--     business_id ownership, so auto-filling organizer_id going forward
--     would newly reject an authenticated user's insert whenever their
--     chosen business_id belongs to a business they don't own via
--     `organizers.user_id` — a real behavior change, not just plumbing.
--     Only the one-time backfill (step 5 below) is included, since
--     migrations run with elevated privileges and bypass RLS entirely.
--
-- Orphan-entity lifecycle (organizers.is_business_auto_created +
-- cleanup_business_organizer(), steps 3 and 6):
--   - is_business_auto_created is the explicit marker distinguishing "a
--     shell entity ensure_business_organizer() generated for exactly one
--     business" from an organizer a user deliberately created by hand via
--     app/create-organizer/page.tsx with org_type='business' — org_type
--     alone can't make that distinction, since both look identical there.
--   - deleteBusiness() (lib/actions/businesses.ts) and the admin hard
--     delete (app/api/admin/businesses/[id]/route.ts, via the service-role
--     supabaseAdmin client) are both left completely unchanged — the
--     cleanup happens via an AFTER DELETE trigger on businesses, not
--     application code.
--   - The cleanup only ever deletes an organizer that is
--     is_business_auto_created AND has no other usage (no other business,
--     no event, no article referencing it). Anything else — a manually
--     created organizer, or a business-shell organizer that has since
--     picked up its own events/articles — is left alone.
--   - This file's version of the safety check only knows about
--     events/articles (pre-existing tables), to avoid making this
--     migration hard-depend on migration_59's entity_members table for
--     apply-order purposes. migration_59 CREATE OR REPLACEs the same
--     function to additionally require zero non-owner entity_members rows
--     — an additive tightening, not a rewrite, once that table exists.

BEGIN;

-- 1. New column + uniqueness (one business = one dedicated business-entity)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES organizers(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_organizer_id
  ON businesses(organizer_id) WHERE organizer_id IS NOT NULL;

-- 2. Marks an organizer row as an auto-generated business shell, as opposed
-- to one a user created directly (see header comment).
ALTER TABLE organizers
  ADD COLUMN IF NOT EXISTS is_business_auto_created BOOLEAN NOT NULL DEFAULT false;

-- 3. Given a business row, create its dedicated organizer Entity row and
-- return its id. Runs as the invoking role (not SECURITY DEFINER): the
-- INSERT into organizers must still pass organizers' own RLS ("Users can
-- create organizer profiles": auth.uid() = user_id), which it always will
-- here since business_row.owner_id is the same authenticated user creating
-- the business in the first place.
--
-- Slug uniqueness is enforced by attempt-and-retry (INSERT, catch
-- unique_violation, try the next candidate) rather than check-then-insert,
-- so two businesses named identically, created at the same instant, can
-- never fail the outer business creation with a raw constraint-violation
-- error — the collision is resolved inside this function. Mirrors the
-- slug *format* already used by migration_48_organization_system.sql's
-- backfill (lowercase, dash-separated, `-2`/`-3`... suffix), just made
-- race-safe.
CREATE OR REPLACE FUNCTION ensure_business_organizer(business_row businesses)
RETURNS UUID AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  attempt INT := 0;
  max_attempts CONSTANT INT := 1000;
  new_org_id UUID;
BEGIN
  base_slug := lower(regexp_replace(trim(business_row.name), '[^a-z0-9]+', '-', 'g'));
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  IF base_slug = '' THEN base_slug := 'business'; END IF;

  LOOP
    IF attempt >= max_attempts THEN
      RAISE EXCEPTION 'Could not generate a unique organizer slug for business %', business_row.id;
    END IF;

    IF attempt = 0 THEN
      candidate := base_slug;
    ELSIF attempt <= 50 THEN
      candidate := base_slug || '-' || (attempt + 1);
    ELSE
      -- Escalate to a random suffix if plain numeric suffixes keep
      -- colliding (pathological case — many identically-named businesses
      -- created concurrently) so this still terminates quickly.
      candidate := base_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    END IF;

    BEGIN
      INSERT INTO organizers (
        user_id, name, org_type, slug, bio, photo, website, contact_email,
        is_business_auto_created
      )
      VALUES (
        business_row.owner_id,
        business_row.name,
        'business',
        candidate,
        business_row.description,
        business_row.logo,
        business_row.website,
        business_row.email,
        true
      )
      RETURNING id INTO new_org_id;

      RETURN new_org_id;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      -- loop again with the next candidate; the failed INSERT's implicit
      -- savepoint (from this EXCEPTION block) is already rolled back, so
      -- this doesn't touch the outer transaction.
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Every newly-inserted business gets its organizer Entity automatically,
-- regardless of insert path (lib/actions/businesses.ts today, any future
-- admin tooling tomorrow). BEFORE INSERT so this is one INSERT (into
-- organizers) plus the original INSERT (into businesses) with organizer_id
-- already populated in the row image — no separate UPDATE needed, and it
-- runs inside the same transaction as the original insert.
CREATE OR REPLACE FUNCTION trg_link_business_organizer()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organizer_id IS NULL THEN
    NEW.organizer_id := ensure_business_organizer(NEW);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_businesses_link_organizer ON businesses;
CREATE TRIGGER trg_businesses_link_organizer
  BEFORE INSERT ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION trg_link_business_organizer();

-- 5. One-time backfill for businesses created before this migration
-- existed. Per the pre-migration audit, production has exactly 1 such row
-- today. Runs as part of this migration (elevated privileges), not through
-- PostgREST/authenticated role, so organizers RLS is not a concern here.
DO $$
DECLARE
  rec businesses%ROWTYPE;
BEGIN
  FOR rec IN SELECT * FROM businesses WHERE organizer_id IS NULL LOOP
    UPDATE businesses SET organizer_id = ensure_business_organizer(rec) WHERE id = rec.id;
  END LOOP;
END $$;

-- 6. One-time backfill: articles that were only ever linked via business_id
-- now also get organizer_id, so organizer_id is the canonical
-- entity-attribution column for any article that has *some* known entity.
UPDATE articles a
SET organizer_id = b.organizer_id
FROM businesses b
WHERE a.business_id = b.id
  AND a.organizer_id IS NULL
  AND b.organizer_id IS NOT NULL;

-- 7. Orphan cleanup: when a business is deleted, delete its auto-created
-- organizer shell too, but only if nothing else is using it. See the
-- header comment for the full rationale; migration_59 tightens this
-- further once entity_members exists.
CREATE OR REPLACE FUNCTION cleanup_business_organizer()
RETURNS TRIGGER AS $$
DECLARE
  target_org_id UUID := OLD.organizer_id;
  auto_created BOOLEAN;
BEGIN
  IF target_org_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT is_business_auto_created INTO auto_created
  FROM organizers WHERE id = target_org_id;

  -- Not found, or not an auto-created shell (a user-created organizer that
  -- happened to be linked some other way) — never touch it.
  IF auto_created IS NOT TRUE THEN
    RETURN OLD;
  END IF;

  -- Still in use by another feature — leave it alone. The businesses check
  -- is currently unreachable (idx_businesses_organizer_id enforces 1:1),
  -- kept as a defensive guard against that constraint ever being relaxed.
  IF EXISTS (SELECT 1 FROM businesses WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM events WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM articles WHERE organizer_id = target_org_id)
  THEN
    RETURN OLD;
  END IF;

  DELETE FROM organizers WHERE id = target_org_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_businesses_cleanup_organizer ON businesses;
CREATE TRIGGER trg_businesses_cleanup_organizer
  AFTER DELETE ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_business_organizer();

COMMIT;

NOTIFY pgrst, 'reload schema';
