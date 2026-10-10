-- migration_166_invite_token_hash_rollback.sql
-- Rollback for migration_166_invite_token_hash.sql.
-- Restores the plaintext `token` column (nullable + unique index, since
-- hash-era rows cannot be reversed into tokens) and drops the hash
-- artifacts and the email helper. Aborts while any invitation holds a
-- hash without a token — re-invite in plaintext first.
-- Note: rolling back also requires redeploying the pre-A2 routes, which
-- read `token`; the A2 routes read `token_hash` only.
-- Safe to re-run.

BEGIN;

-- Abort guard: hashes are one-way; rows holding only a hash cannot go back.
DO $$
DECLARE
  v_hashed BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_hashed
  FROM public.event_team_invitations
  WHERE token_hash IS NOT NULL;
  IF v_hashed > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED: % invitations hold token hashes with no plaintext to restore; re-invite them first', v_hashed;
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_column THEN
    -- 166 objects already gone: nothing to guard.
    NULL;
END;
$$;

-- Reverse in reverse order: plaintext column back, then hash artifacts out.
ALTER TABLE public.event_team_invitations ADD COLUMN IF NOT EXISTS token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_invitations_token
  ON public.event_team_invitations(token);

DROP INDEX IF EXISTS public.idx_event_team_invitations_token_hash;
ALTER TABLE public.event_team_invitations DROP CONSTRAINT IF EXISTS event_team_invitations_token_hash_format;
ALTER TABLE public.event_team_invitations DROP COLUMN IF EXISTS token_hash;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.get_user_id_by_email(TEXT);

COMMIT;

NOTIFY pgrst, 'reload schema';
