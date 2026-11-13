-- Migration 208: scanner Phase 0 hardening.
--   * entrance_label columns so a free-text gate name can never be written into
--     a uuid entrance_id column (the insert must not fail because of a label).
--   * scanner_token_revocations, the service-role-only revocation list for
--     8-hour offline scanner tokens (jti and/or subject based).
-- Requires migration 197 (event_ticket_scan_attempts) and 122 (offline scanner
-- columns on ticket_checkins). db/ is canonical; mirror this file byte-for-byte
-- into supabase/migrations/ with a timestamped name. Nothing here is applied by
-- the application code path itself.

BEGIN;

-- 1. Keep the human-readable gate label next to the uuid.
ALTER TABLE public.ticket_checkins
  ADD COLUMN IF NOT EXISTS entrance_label text;

ALTER TABLE public.event_ticket_scan_attempts
  ADD COLUMN IF NOT EXISTS entrance_label text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.ticket_checkins'::regclass
       AND conname = 'ticket_checkins_entrance_label_length_check'
  ) THEN
    ALTER TABLE public.ticket_checkins
      ADD CONSTRAINT ticket_checkins_entrance_label_length_check
      CHECK (entrance_label IS NULL OR char_length(entrance_label) <= 120) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.event_ticket_scan_attempts'::regclass
       AND conname = 'event_ticket_scan_attempts_entrance_label_length_check'
  ) THEN
    ALTER TABLE public.event_ticket_scan_attempts
      ADD CONSTRAINT event_ticket_scan_attempts_entrance_label_length_check
      CHECK (entrance_label IS NULL OR char_length(entrance_label) <= 120) NOT VALID;
  END IF;
END
$migration$;

-- 2. Revocation list for offline scanner tokens.
--    A row is either token-specific (jti set) or subject-wide (jti null and the
--    removed member's staff_member_id / user_id set), which is how removing a
--    team member invalidates any 8-hour token they still hold.
CREATE TABLE IF NOT EXISTS public.scanner_token_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  jti text,
  staff_member_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'removed_from_team'
    CHECK (char_length(reason) <= 64),
  revoked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT scanner_token_revocations_target_check
    CHECK (jti IS NOT NULL OR staff_member_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scanner_token_revocations_jti
  ON public.scanner_token_revocations(jti)
  WHERE jti IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scanner_token_revocations_subject
  ON public.scanner_token_revocations(event_id, staff_member_id, user_id)
  WHERE jti IS NULL;
CREATE INDEX IF NOT EXISTS idx_scanner_token_revocations_expiry
  ON public.scanner_token_revocations(expires_at);

ALTER TABLE public.scanner_token_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scanner_token_revocations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.scanner_token_revocations TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
