-- migration_83_organizer_verification_submissions.sql
-- Phase 1 of the Organizer Verification System: the submissions table, RLS
-- policies, and the self-approval trigger.
--
-- Design summary (full rationale in the Phase 0 design doc):
--   - One row per submission attempt. No UNIQUE constraint on organizer_id —
--     full history is kept. "Current submission" is always the most recent
--     row (MAX(created_at)) per organizer, not enforced by uniqueness.
--   - Status state machine:
--       draft → submitted → approved
--                         → rejected
--                         → needs_more_info → submitted  (re-submission cycle)
--   - Three independent layers of self-approval prevention:
--       Layer 1: RLS WITH CHECK prevents writing status='approved' via PostgREST
--       Layer 2: trg_prevent_submission_self_approval trigger blocks it at the
--                engine level for any UPDATE path
--       Layer 3: trg_enforce_organizer_capability_columns on organizers itself
--                blocks a non-admin from writing organizers.status='verified'
--                even if layers 1 and 2 were somehow bypassed on this table
--   - All admin writes go through supabaseAdmin (service role, auth.uid() IS
--     NULL) which bypasses RLS. The trigger is the relevant guard for admin
--     writes that should NOT be allowed (i.e., non-admin service-role writes
--     are not a threat model concern — only authenticated user REST calls are).

BEGIN;

CREATE TABLE IF NOT EXISTS organizer_verification_submissions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which organizer this submission belongs to.
  -- Not UNIQUE — full history is retained per organizer.
  organizer_id   UUID        NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,

  -- Submission state machine.
  status         TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'needs_more_info')),

  -- Snapshot of org_type at submission time, for the requirement engine.
  -- Stored here so that if the organizer changes their org_type after submitting,
  -- the admin sees what type was declared at submission time.
  org_type       TEXT,

  -- Array of submitted documents as JSONB:
  --   [{ "doc_type": "photo_id", "storage_path": "...", "uploaded_at": "..." }, ...]
  documents      JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Optional free-text context from the submitter.
  submitter_notes TEXT,

  -- Admin review fields. Null until a review action is taken.
  reviewed_by    UUID        REFERENCES auth.users(id),
  reviewed_at    TIMESTAMPTZ,
  -- Shown back to the organizer on rejection or needs_more_info.
  reviewer_notes TEXT,

  -- Set when status transitions to 'submitted' (each re-submission updates this).
  submitted_at   TIMESTAMPTZ,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_verification_submissions_organizer_id
  ON organizer_verification_submissions(organizer_id);

CREATE INDEX IF NOT EXISTS idx_org_verification_submissions_status
  ON organizer_verification_submissions(status);

-- Composite index for the most common query: "latest submission for organizer X"
CREATE INDEX IF NOT EXISTS idx_org_verification_submissions_organizer_created
  ON organizer_verification_submissions(organizer_id, created_at DESC);

ALTER TABLE organizer_verification_submissions ENABLE ROW LEVEL SECURITY;

-- ── RLS POLICIES ────────────────────────────────────────────────────────────

-- Organizer owner: read their own submissions (all statuses, all history)
DROP POLICY IF EXISTS "Organizer can view own submissions" ON organizer_verification_submissions;
CREATE POLICY "Organizer can view own submissions"
  ON organizer_verification_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = organizer_verification_submissions.organizer_id
        AND organizers.user_id = auth.uid()
    )
  );

-- Organizer owner: create a new draft submission (only for organizers they own,
-- and only in 'draft' status — cannot INSERT a pre-submitted row)
DROP POLICY IF EXISTS "Organizer can create draft submission" ON organizer_verification_submissions;
CREATE POLICY "Organizer can create draft submission"
  ON organizer_verification_submissions FOR INSERT
  WITH CHECK (
    status = 'draft'
    AND EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = organizer_verification_submissions.organizer_id
        AND organizers.user_id = auth.uid()
    )
  );

-- Organizer owner: update their own submissions, but only when in a mutable
-- state (draft or needs_more_info) and only to a non-admin-only status.
-- WITH CHECK: cannot self-approve.
DROP POLICY IF EXISTS "Organizer can update own pending submissions" ON organizer_verification_submissions;
CREATE POLICY "Organizer can update own pending submissions"
  ON organizer_verification_submissions FOR UPDATE
  USING (
    -- Can only modify a row that is in a mutable state
    status IN ('draft', 'needs_more_info')
    AND EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = organizer_verification_submissions.organizer_id
        AND organizers.user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- After update, status must not be 'approved' (Layer 1 self-approval block)
    -- Valid transitions from this policy's perspective:
    --   draft → draft (saving progress), draft → submitted
    --   needs_more_info → needs_more_info (saving), needs_more_info → submitted
    status <> 'approved'
    AND status <> 'rejected'
    AND status <> 'needs_more_info'  -- only admin can set needs_more_info
    AND EXISTS (
      SELECT 1 FROM public.organizers
      WHERE organizers.id = organizer_verification_submissions.organizer_id
        AND organizers.user_id = auth.uid()
    )
  );

-- Admin: read all submissions across all organizers
DROP POLICY IF EXISTS "Admins can view all verification submissions" ON organizer_verification_submissions;
CREATE POLICY "Admins can view all verification submissions"
  ON organizer_verification_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- ── SELF-APPROVAL PREVENTION TRIGGER (Layer 2) ──────────────────────────────
--
-- This is the database-engine-level guard. Even if the RLS WITH CHECK above
-- were bypassed (e.g. via a future policy change, a schema migration error,
-- or a direct psql session as an authenticated user), this trigger still fires.
--
-- Convention: uses the "is_admin_user OR auth.uid() IS NULL" idiom, consistent
-- with trg_enforce_organizer_capability_columns in migration_61.

CREATE OR REPLACE FUNCTION prevent_submission_self_approval()
RETURNS TRIGGER AS $$
DECLARE
  is_admin_user BOOLEAN;
BEGIN
  -- Guard: only admin or service role may transition status to a review-outcome
  -- state ('approved', 'rejected', 'needs_more_info'). Regular authenticated
  -- users may only move between 'draft' and 'submitted'.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved', 'rejected', 'needs_more_info')
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND status = 'active'
    ) INTO is_admin_user;

    -- auth.uid() IS NULL means service role (supabaseAdmin) — allowed
    is_admin_user := is_admin_user OR auth.uid() IS NULL;

    IF NOT is_admin_user THEN
      RAISE EXCEPTION
        'Only an admin can approve, reject, or request more information on a verification submission';
    END IF;
  END IF;

  -- Guard: only admin or service role may set reviewed_by, reviewed_at,
  -- or reviewer_notes (belt-and-suspenders — these are review-only fields).
  IF (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.reviewer_notes IS DISTINCT FROM OLD.reviewer_notes)
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND status = 'active'
    ) INTO is_admin_user;

    is_admin_user := is_admin_user OR auth.uid() IS NULL;

    IF NOT is_admin_user THEN
      RAISE EXCEPTION
        'Only an admin can set review fields on a verification submission';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_submission_self_approval ON organizer_verification_submissions;
CREATE TRIGGER trg_prevent_submission_self_approval
  BEFORE UPDATE ON organizer_verification_submissions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_submission_self_approval();

COMMIT;

NOTIFY pgrst, 'reload schema';
