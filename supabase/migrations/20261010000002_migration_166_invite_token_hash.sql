-- migration_166_invite_token_hash.sql
-- STAFF ROUND A2, step 5: invitation tokens stored as SHA-256 hashes.
-- Schema + one helper function (no app code, no RPC changes to check-in).
--
-- The database keeps only `token_hash` (UNIQUE). The plaintext token
-- exists solely inside the emailed accept link and is hashed on arrival
-- before lookup — the same shape as the A1b badge decision. This also
-- retires the ineffective migration_76 column REVOKE on `token` (void
-- against the table-level grants; no DENY in Postgres): the secret column
-- itself is dropped rather than re-revoked. No column-level REVOKE is
-- used anywhere in 166 (pinned by tests).
--
-- Email lookup fix (A2 item 2): `get_user_id_by_email` lets the invite
-- route resolve an auth.users id from an email without the broken
-- `profiles.ilike('email')` path (profiles has no email column).
-- SECURITY DEFINER, service-role execute only.
--
-- Guard: applying drops `token`, which orphans any still-pending
-- plaintext invitation. The migration aborts while ANY
-- status='pending' invitation exists — revoke (team tab Cancel) or let
-- expire pending invites first, apply, then re-invite. Accepted/
-- expired/revoked rows are unaffected (their links are already dead).
--
-- Safe to re-run (IF NOT EXISTS / DROP IF EXISTS guards throughout).
-- Rollback: db/migration_166_invite_token_hash_rollback.sql

BEGIN;

-- 1. Hash column + lookup helper.
ALTER TABLE public.event_team_invitations ADD COLUMN IF NOT EXISTS token_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_invitations_token_hash
  ON public.event_team_invitations(token_hash);

ALTER TABLE public.event_team_invitations DROP CONSTRAINT IF EXISTS event_team_invitations_token_hash_format;
ALTER TABLE public.event_team_invitations ADD CONSTRAINT event_team_invitations_token_hash_format
  CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email)) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO service_role;

-- 2. Guard: no pending invitation may exist when the plaintext column drops.
DO $$
DECLARE
  v_pending BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_pending
  FROM public.event_team_invitations
  WHERE status = 'pending';
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'MIGRATION_166_ABORTED: % pending invitations still exist; cancel (revoke) or let them expire first, apply, then re-invite', v_pending;
  END IF;
END;
$$;

-- 3. Drop the plaintext token column (kills the void 76 REVOKE with it).
ALTER TABLE public.event_team_invitations DROP COLUMN IF EXISTS token;

COMMIT;

NOTIFY pgrst, 'reload schema';
