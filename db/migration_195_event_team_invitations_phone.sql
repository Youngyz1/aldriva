-- Migration 195: prepare event team invitations for an account-less staff path.
-- db/ is canonical; keep the Supabase timestamped mirror byte-identical.
-- This migration is authored for manual operator execution only.

BEGIN;

ALTER TABLE public.event_team_invitations
  ADD COLUMN IF NOT EXISTS is_accountless boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0;

UPDATE public.event_team_invitations
   SET failed_attempts = 0
 WHERE failed_attempts IS NULL;

ALTER TABLE public.event_team_invitations
  ALTER COLUMN failed_attempts SET DEFAULT 0,
  ALTER COLUMN failed_attempts SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.event_team_invitations'::regclass
       AND conname = 'event_team_invitations_phone_e164_check'
  ) THEN
    ALTER TABLE public.event_team_invitations
      ADD CONSTRAINT event_team_invitations_phone_e164_check
      CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{1,14}$') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.event_team_invitations'::regclass
       AND conname = 'event_team_invitations_accountless_phone_check'
  ) THEN
    ALTER TABLE public.event_team_invitations
      ADD CONSTRAINT event_team_invitations_accountless_phone_check
      CHECK (NOT is_accountless OR phone IS NOT NULL) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.event_team_invitations'::regclass
       AND conname = 'event_team_invitations_failed_attempts_check'
  ) THEN
    ALTER TABLE public.event_team_invitations
      ADD CONSTRAINT event_team_invitations_failed_attempts_check
      CHECK (failed_attempts BETWEEN 0 AND 5) NOT VALID;
  END IF;
END
$migration$;

COMMENT ON COLUMN public.event_team_invitations.is_accountless IS
  'True only for invitations redeemed into a limited event staff session without an Aldriva account.';
COMMENT ON COLUMN public.event_team_invitations.phone IS
  'Normalized E.164 phone number used for account-less invitation verification.';
COMMENT ON COLUMN public.event_team_invitations.failed_attempts IS
  'Atomic phone last-four verification failures; account-less invitations lock at five.';

COMMIT;
