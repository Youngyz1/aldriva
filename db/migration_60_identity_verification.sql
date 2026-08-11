-- migration_60_identity_verification.sql
-- Phase 2 of the Entity architecture: adds the Identity Verified tier,
-- kept deliberately separate from organizers.status ("Organization/
-- Business Verified", already live in production — see
-- migration_58/59's header comments for that tier's history). Identity
-- lives on profiles, not organizers, because a person verifies their
-- identity once and it should apply across every entity they manage,
-- not be re-verified per organizer (User != Entity, per the spec).
--
-- No document upload/KYC storage exists yet (a later phase) — this is
-- purely an admin-settable status, same maturity level organizers.status
-- already has today.

BEGIN;

-- 1. New columns.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS identity_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (identity_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ;

-- 2. Extend the existing self-service lockout trigger (from
-- migration_12_profile_account_info.sql) rather than adding a second,
-- overlapping one. Same auth.role() <> 'service_role' bypass already
-- governing role/status — every admin write already goes through
-- supabaseAdmin (service role), confirmed by reading
-- app/api/admin/users/[id]/route.ts.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_status_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.identity_status IS DISTINCT FROM OLD.identity_status
       OR NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at THEN
      RAISE EXCEPTION 'Role, status, and identity verification cannot be changed from account settings.';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. Audit log for identity status changes, mirroring
-- organizer_visibility_audit's shape from
-- migration_20_organizer_visibility_boost.sql — TEXT old/new values here
-- since identity_status is a text enum, not an integer offset.
CREATE TABLE IF NOT EXISTS profile_verification_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL CHECK (field_name IN ('identity_status')),
  old_value TEXT,
  new_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_verification_audit_profile_id
  ON profile_verification_audit(profile_id);

ALTER TABLE profile_verification_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view profile verification audit logs" ON profile_verification_audit;
CREATE POLICY "Admins can view profile verification audit logs"
  ON profile_verification_audit FOR SELECT
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
