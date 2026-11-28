-- migration_259_staff_invitation_token_scrub_rollback.sql
-- No BEGIN/COMMIT. Apply statement by statement.
-- Restores the column SHAPE of 258 (NOT NULL, default gen_random_uuid()).
-- The original plaintext values cannot be restored: they were deliberately erased.
-- Rows get fresh random values that do NOT match token_hash, which is harmless
-- because accept looks up token_hash only. Existing links keep working.

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
END
$pre$;

-- ============================================================
-- STATEMENT 1: drop the token-null constraint
-- ============================================================
ALTER TABLE public.staff_invitations DROP CONSTRAINT IF EXISTS chk_staff_invitations_token_null;

-- ============================================================
-- STATEMENT 2: refill with fresh random values
-- ============================================================
UPDATE public.staff_invitations SET token = gen_random_uuid() WHERE token IS NULL;

-- ============================================================
-- STATEMENT 3: restore the default
-- ============================================================
ALTER TABLE public.staff_invitations ALTER COLUMN token SET DEFAULT gen_random_uuid();

-- ============================================================
-- STATEMENT 4: restore NOT NULL
-- ============================================================
ALTER TABLE public.staff_invitations ALTER COLUMN token SET NOT NULL;

-- ============================================================
-- STATEMENT 5: HARD CHECK
-- ============================================================
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='staff_invitations'
                   AND column_name='token' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'HARD CHECK: token is nullable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='staff_invitations'
                   AND column_name='token' AND column_default IS NOT NULL) THEN
    RAISE EXCEPTION 'HARD CHECK: token default missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'chk_staff_invitations_token_null'
                AND conrelid = 'public.staff_invitations'::regclass) THEN
    RAISE EXCEPTION 'HARD CHECK: token-null constraint still present';
  END IF;
  IF EXISTS (SELECT 1 FROM public.staff_invitations WHERE token IS NULL) THEN
    RAISE EXCEPTION 'HARD CHECK: rows with null token remain';
  END IF;
END
$chk$;