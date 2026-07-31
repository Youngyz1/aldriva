-- migration_41_fundraiser_approval.sql
-- Extends the pending_review -> published|rejected approval gate (added for
-- articles/businesses/products in migration_38) to FUNDRAISERS, which were
-- deliberately left out then. Until now fundraisers published instantly on
-- creation: a direct browser insert, with RLS allowing public insert + public
-- select and no status column at all.
--
-- This migration:
--   1. Adds `status` (pending_review|published|rejected) + `rejection_reason`.
--   2. Backfills every EXISTING fundraiser to 'published' so nothing currently
--      live disappears; new inserts default to 'pending_review'.
--   3. Replaces the two `USING (true)` SELECT policies with status-aware ones
--      (public sees published; owners see their own; admins see everything).
--   4. Closes the self-publish hole on INSERT (the old `WITH CHECK (true)`).
--   5. Adds a BEFORE UPDATE transition trigger — a direct copy of migration_38's
--      enforce_article_status_transition() pattern — so only an admin (or a
--      service-role write) can move a fundraiser to 'published'/'rejected'.
--   6. Narrows get_total_raised() (migration_40) to published campaigns only.
--
-- Live data audited immediately before writing this: 13 non-deleted fundraisers,
-- all currently live -> all become 'published' by the backfill. Zero currently
-- carry any other state (the column doesn't exist yet).
--
-- NOTE ON SELF-PUBLISH PREVENTION: as in migration_38, the UPDATE policies are
-- left unchanged and the trigger is what gates status changes. A static WITH
-- CHECK restricting status here would block an owner editing any OTHER field on
-- an already-published campaign, because WITH CHECK re-evaluates the whole
-- proposed row (including the unchanged status).

-- ── 1. Columns ─────────────────────────────────────────────────────────────
ALTER TABLE fundraisers ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE fundraisers ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ── 2. Backfill existing rows to 'published' (grandfather everything live) ──
UPDATE fundraisers SET status = 'published' WHERE status IS NULL;

-- ── 3. Default (new inserts), NOT NULL, and value domain ───────────────────
ALTER TABLE fundraisers ALTER COLUMN status SET DEFAULT 'pending_review';
ALTER TABLE fundraisers ALTER COLUMN status SET NOT NULL;

ALTER TABLE fundraisers DROP CONSTRAINT IF EXISTS fundraisers_status_check;
ALTER TABLE fundraisers ADD CONSTRAINT fundraisers_status_check
  CHECK (status IN ('pending_review', 'published', 'rejected'));

-- ── 4. SELECT policies — replace the two `USING (true)` policies ────────────
DROP POLICY IF EXISTS "Allow public select" ON fundraisers;
DROP POLICY IF EXISTS "Fundraisers are publicly readable" ON fundraisers;

CREATE POLICY "Published fundraisers are public"
  ON fundraisers FOR SELECT
  USING (status = 'published');

CREATE POLICY "Owners can read their own fundraisers"
  ON fundraisers FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organizers
      WHERE organizers.id = fundraisers.organizer_id
        AND organizers.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read all fundraisers"
  ON fundraisers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- ── 5. INSERT — force new fundraisers to start in review ───────────────────
-- Drop BOTH existing insert policies: "Allow public insert" is the `true` hole,
-- and the organizer-scoped policy carries no status restriction, so leaving it
-- would (under permissive OR semantics) still let an owner insert as
-- 'published'. Replaced with a single policy that preserves the prior openness
-- (no ownership tightening — the create/sync/import flows rely on it) while
-- forcing status = 'pending_review'. An omitted status hits the DEFAULT above
-- before WITH CHECK is evaluated, so the normal insert paths pass unchanged.
DROP POLICY IF EXISTS "Allow public insert" ON fundraisers;
DROP POLICY IF EXISTS "Users can create fundraisers for their organizer profiles" ON fundraisers;

CREATE POLICY "Anyone can create a fundraiser pending review"
  ON fundraisers FOR INSERT
  WITH CHECK (status = 'pending_review');

-- ── 6. Status-transition enforcement (self-publish/reject guard) ───────────
CREATE OR REPLACE FUNCTION enforce_fundraiser_status_transition()
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

  -- auth.uid() IS NULL means a service-role connection (the admin approve/reject
  -- route, which checks isAdmin() in app code before writing). Same standing
  -- risk documented on migration_38's enforce_article_status_transition(): this
  -- trigger only stops authenticated non-admin users from self-approving; it
  -- trusts every service-role write to have been authorized upstream.
  is_admin_user := is_admin_user OR auth.uid() IS NULL;

  IF is_admin_user THEN
    RETURN NEW;
  END IF;

  -- Non-admins may only (re)submit for review — e.g. resubmit a rejected
  -- campaign — never move it to 'published' or 'rejected' themselves.
  IF NEW.status NOT IN ('pending_review') THEN
    RAISE EXCEPTION 'Only an admin can set fundraiser status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_fundraiser_status_transition ON fundraisers;
CREATE TRIGGER trg_enforce_fundraiser_status_transition
  BEFORE UPDATE ON fundraisers
  FOR EACH ROW
  EXECUTE FUNCTION enforce_fundraiser_status_transition();

-- ── 7. Public total-raised stat — published campaigns only ─────────────────
CREATE OR REPLACE FUNCTION public.get_total_raised()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(raised), 0)
  FROM public.fundraisers
  WHERE deleted_at IS NULL AND status = 'published';
$$;

GRANT EXECUTE ON FUNCTION public.get_total_raised() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
