-- Guarded rollback for migration 195. Account-less invitations must be
-- revoked and removed manually before their phone verification data is dropped.

BEGIN;

-- Keep the data guard and column removal atomic with respect to invitation writes.
LOCK TABLE public.event_team_invitations IN ACCESS EXCLUSIVE MODE;

DO $rollback_guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.event_team_invitations
     WHERE is_accountless = true OR phone IS NOT NULL OR failed_attempts > 0
  ) THEN
    RAISE EXCEPTION 'MIGRATION_195_ROLLBACK_BLOCKED: invitation phone data still exists';
  END IF;
END
$rollback_guard$;

ALTER TABLE public.event_team_invitations
  DROP CONSTRAINT IF EXISTS event_team_invitations_phone_e164_check,
  DROP CONSTRAINT IF EXISTS event_team_invitations_accountless_phone_check,
  DROP CONSTRAINT IF EXISTS event_team_invitations_failed_attempts_check,
  DROP COLUMN IF EXISTS is_accountless,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS failed_attempts;

COMMIT;
