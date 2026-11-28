-- migration_259_staff_invitation_token_scrub.sql
-- Phase 2 of invitation hardening. No BEGIN/COMMIT. Apply statement by statement.
-- Requires migration 258 (token_hash, lookup by hash) and the app change that
-- generates the token itself and inserts only token_hash.
-- Effect: the plaintext token column is kept but emptied. Existing pending links
-- keep working (accept looks up token_hash, which is untouched). Nothing can store
-- a plaintext token again (CHECK token IS NULL, no default).

-- ============================================================
-- STATEMENT 0: PREFLIGHT
-- ============================================================
DO $pre$
BEGIN
  IF to_regclass('public.staff_invitations') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT: public.staff_invitations missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='staff_invitations' AND column_name='token') THEN
    RAISE EXCEPTION 'PREFLIGHT: staff_invitations.token missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='staff_invitations'
                   AND column_name='token_hash' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'PREFLIGHT: token_hash missing or nullable (migration 258 not applied)';
  END IF;
  IF to_regclass('public.uq_staff_invitations_token_hash') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT: uq_staff_invitations_token_hash missing (migration 258 not applied)';
  END IF;
  IF pg_get_functiondef('public.accept_staff_invitation(uuid)'::regprocedure) NOT LIKE '%token_hash%' THEN
    RAISE EXCEPTION 'PREFLIGHT: accept_staff_invitation does not look up by token_hash';
  END IF;
  IF pg_get_functiondef('public.staff_invitations_guard_accept_fields()'::regprocedure) NOT LIKE '%token_hash%' THEN
    RAISE EXCEPTION 'PREFLIGHT: guard_accept_fields not updated by 258';
  END IF;
END
$pre$;

-- ============================================================
-- STATEMENT 1: drop the plaintext default
-- ============================================================
ALTER TABLE public.staff_invitations ALTER COLUMN token DROP DEFAULT;

-- ============================================================
-- STATEMENT 2: allow NULL
-- ============================================================
ALTER TABLE public.staff_invitations ALTER COLUMN token DROP NOT NULL;

-- ============================================================
-- STATEMENT 3: null every stored plaintext token
-- (token_hash is untouched, so pending links keep working)
-- ============================================================
UPDATE public.staff_invitations SET token = NULL WHERE token IS NOT NULL;

-- ============================================================
-- STATEMENT 4: forbid storing plaintext again
-- ============================================================
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'chk_staff_invitations_token_null'
                    AND conrelid = 'public.staff_invitations'::regclass) THEN
    ALTER TABLE public.staff_invitations
      ADD CONSTRAINT chk_staff_invitations_token_null CHECK (token IS NULL);
  END IF;
END
$c$;

-- ============================================================
-- STATEMENT 5: HARD CHECK
-- ============================================================
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='staff_invitations'
                   AND column_name='token' AND is_nullable='YES') THEN
    RAISE EXCEPTION 'HARD CHECK: token is still NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='staff_invitations'
               AND column_name='token' AND column_default IS NOT NULL) THEN
    RAISE EXCEPTION 'HARD CHECK: token still has a default';
  END IF;
  IF EXISTS (SELECT 1 FROM public.staff_invitations WHERE token IS NOT NULL) THEN
    RAISE EXCEPTION 'HARD CHECK: plaintext tokens remain';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'chk_staff_invitations_token_null'
                    AND conrelid = 'public.staff_invitations'::regclass) THEN
    RAISE EXCEPTION 'HARD CHECK: token-null constraint missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='staff_invitations'
                   AND column_name='token_hash' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'HARD CHECK: token_hash missing or nullable';
  END IF;
  IF to_regclass('public.uq_staff_invitations_token_hash') IS NULL THEN
    RAISE EXCEPTION 'HARD CHECK: uq_staff_invitations_token_hash missing';
  END IF;
END
$chk$;