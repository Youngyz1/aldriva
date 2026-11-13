-- Rollback for migration_208_scanner_hardening.sql.
-- Refuses to discard the revocation list while entries are still live, because
-- dropping it would silently re-enable tokens of removed staff members.

BEGIN;

LOCK TABLE public.scanner_token_revocations IN ACCESS EXCLUSIVE MODE;

DO $rollback$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.scanner_token_revocations
     WHERE expires_at > now()
  ) THEN
    RAISE EXCEPTION 'MIGRATION_208_ROLLBACK_BLOCKED: live scanner token revocations exist; wait for them to expire or clear them deliberately';
  END IF;
END
$rollback$;

DROP TABLE IF EXISTS public.scanner_token_revocations;

ALTER TABLE public.event_ticket_scan_attempts
  DROP CONSTRAINT IF EXISTS event_ticket_scan_attempts_entrance_label_length_check,
  DROP COLUMN IF EXISTS entrance_label;

ALTER TABLE public.ticket_checkins
  DROP CONSTRAINT IF EXISTS ticket_checkins_entrance_label_length_check,
  DROP COLUMN IF EXISTS entrance_label;

COMMIT;

NOTIFY pgrst, 'reload schema';
