-- Rollback for migration 41: remove the fundraiser approval gate and restore
-- the prior "everything is public, instant publish" behavior.
--
-- Order matters: drop the trigger/function and the status-referencing policies
-- and restore get_total_raised() (which references `status`) BEFORE dropping the
-- `status` column, or the drops fail on the dependency.

-- ── 1. Transition trigger + function ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_enforce_fundraiser_status_transition ON fundraisers;
DROP FUNCTION IF EXISTS enforce_fundraiser_status_transition();

-- ── 2. Restore the original permissive SELECT policies ─────────────────────
DROP POLICY IF EXISTS "Published fundraisers are public" ON fundraisers;
DROP POLICY IF EXISTS "Owners can read their own fundraisers" ON fundraisers;
DROP POLICY IF EXISTS "Admins can read all fundraisers" ON fundraisers;

CREATE POLICY "Allow public select" ON fundraisers FOR SELECT USING (true);
CREATE POLICY "Fundraisers are publicly readable" ON fundraisers FOR SELECT USING (true);

-- ── 3. Restore the original INSERT policies ────────────────────────────────
DROP POLICY IF EXISTS "Anyone can create a fundraiser pending review" ON fundraisers;

CREATE POLICY "Allow public insert" ON fundraisers FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can create fundraisers for their organizer profiles"
  ON fundraisers FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      organizer_id IS NULL
      OR EXISTS (
        SELECT 1 FROM organizers
        WHERE organizers.id = fundraisers.organizer_id
          AND organizers.user_id = auth.uid()
      )
    )
  );

-- ── 4. Restore get_total_raised() to the migration_40 definition (no status) ─
CREATE OR REPLACE FUNCTION public.get_total_raised()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(raised), 0)
  FROM public.fundraisers
  WHERE deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_total_raised() TO anon, authenticated, service_role;

-- ── 5. Drop the columns (destructive — loses status/rejection_reason data) ──
ALTER TABLE fundraisers DROP CONSTRAINT IF EXISTS fundraisers_status_check;
ALTER TABLE fundraisers DROP COLUMN IF EXISTS status;
ALTER TABLE fundraisers DROP COLUMN IF EXISTS rejection_reason;

NOTIFY pgrst, 'reload schema';
