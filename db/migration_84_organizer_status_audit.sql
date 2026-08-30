-- migration_84_organizer_status_audit.sql
-- Phase 1 of the Organizer Verification System: audit log for organizers.status
-- changes.
--
-- Context: migration_61's header comment explicitly called out that no audit
-- trail existed for organizers.status transitions (Verify/Reject/Suspend/
-- Restore). The organizer_visibility_audit table from migration_20/61 stores
-- INTEGER old_value/new_value, which is the wrong type for status strings —
-- the approved design is a new table modeled on profile_verification_audit
-- (migration_60) which uses TEXT old_value/new_value.
--
-- The only field tracked here is 'status'. Future fields (e.g. 'verified_at'
-- clarifications) can be added to the CHECK constraint later without a table
-- change. The admin API route (app/api/admin/organizers/[id]/route.ts) will
-- be extended in the admin API phase to INSERT here on every PATCH that
-- changes status — this migration just creates the table so it exists and
-- can be written to when Phase 3 wires it up.
--
-- RLS: admins can read. No INSERT policy from user side — all inserts go
-- through supabaseAdmin (service role), consistent with profile_verification_audit.

BEGIN;

CREATE TABLE IF NOT EXISTS organizer_status_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which organizer's status changed
  organizer_id    UUID        NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,

  -- The admin who made the change.
  -- References auth.users (not profiles) because a deleted profile row
  -- should not cascade-delete the audit history — audit rows are permanent.
  admin_user_id   UUID        NOT NULL REFERENCES auth.users(id),

  -- Which field changed. Currently only 'status'; extend CHECK if needed later.
  field_name      TEXT        NOT NULL CHECK (field_name IN ('status')),

  -- Previous value. NULL on first-ever transition (no prior known state).
  old_value       TEXT,

  -- New value after the change.
  new_value       TEXT        NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizer_status_audit_organizer_id
  ON organizer_status_audit(organizer_id);

CREATE INDEX IF NOT EXISTS idx_organizer_status_audit_created_at
  ON organizer_status_audit(created_at DESC);

ALTER TABLE organizer_status_audit ENABLE ROW LEVEL SECURITY;

-- Admins can view audit logs for oversight.
DROP POLICY IF EXISTS "Admins can view organizer status audit logs" ON organizer_status_audit;
CREATE POLICY "Admins can view organizer status audit logs"
  ON organizer_status_audit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
