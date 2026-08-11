-- migration_60_identity_verification_rollback.sql
--
-- WARNING: drops profile_verification_audit entirely, including every
-- logged identity-status change since this migration was applied —
-- permanently lost, no recorded distinction to preserve selectively.
--
-- Restores prevent_profile_role_status_self_update() to its exact
-- pre-migration_60 body (migration_12_profile_account_info.sql) so
-- role/status self-service lockout keeps working unchanged after the
-- identity columns are dropped below.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_profile_role_status_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Role and status cannot be changed from account settings.';
    END IF;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TABLE IF EXISTS profile_verification_audit;

ALTER TABLE profiles
  DROP COLUMN IF EXISTS identity_status,
  DROP COLUMN IF EXISTS identity_verified_at;

COMMIT;

NOTIFY pgrst, 'reload schema';
