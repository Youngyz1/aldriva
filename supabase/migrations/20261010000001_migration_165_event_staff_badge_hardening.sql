-- migration_165_event_staff_badge_hardening.sql
-- STAFF ROUND Phase A, step A1b: grant + secrecy hardening for the 164 schema.
-- Schema only (no app code, no RPC changes).
--
-- Finding from staging (information_schema.column_privileges): anon and
-- authenticated hold TABLE-level SELECT/INSERT/UPDATE grants, so the
-- column-level `REVOKE SELECT (badge_token)` in 164 is ineffective —
-- Postgres has no DENY, and a column REVOKE cannot subtract from a table
-- grant. 165 therefore uses only table-level REVOKEs and never relies on
-- column REVOKE (pinned by tests).
--
-- Code evidence (A1b addendum item 3): every read/write of
-- event_team_members and event_team_invitations in app/, lib/, and
-- components/ goes through createSupabaseAdmin()/supabaseAdmin; the
-- anon/authenticated clients are used only for auth.getUser(). No hits in
-- components/ or scripts/. event_staff_checkins has zero app references
-- (schema-only by design). Pinned by static tests, so 165 takes the
-- full write-REVOKE path:
--   REVOKE INSERT, UPDATE, DELETE ON <all three tables> FROM anon, authenticated,
-- leaving SELECT under the existing RLS policies. All writes go through
-- service-role routes (which bypass RLS and are unaffected by grants).
--
-- Badge secrecy (decisions 8 + A1b): store SHA-256 hex hash + short display
-- code instead of the plaintext token. The plaintext badge_token columns
-- from 164 are dropped behind an abort guard (any minted badge or any
-- staff check-in row stops the migration — rotate/re-scan instead of
-- silently destroying audit linkage). A4 routes hash-compare and show only
-- the display code (e.g. STF-7K2Q) plus prefix/last-4 in logs.
--
-- Audit preservation (A1b): event_staff_checkins.staff_member_id becomes
-- nullable with ON DELETE SET NULL (was CASCADE). Deleting a member row
-- keeps its scan history; event_id + badge hash snapshot columns retain
-- context. NULL rows match no self-read branch — managers/admins still see
-- them via the unchanged SELECT policy.
--
-- SELECT-only check-ins (A1b): the FOR ALL manage policy on
-- event_staff_checkins is dropped, leaving the SELECT policy (with the
-- self-read branch) as the only policy. Combined with the write REVOKEs,
-- direct PostgREST writes are impossible; service-role inserts are
-- unaffected.
--
-- Out of scope (deliberate): the migration_76 invitations.token column
-- REVOKE has the same flaw (see A1b report). Fixing it here would break
-- the live token accept flow before A2, so it is deferred to a later
-- migration with A2 (token_hash + accept-route hash compare, same guard
-- pattern). 165 does not touch event_team_invitations.token.
--
-- Safe to re-run (IF NOT EXISTS / DROP IF EXISTS guards throughout).
-- Rollback: db/migration_165_event_staff_badge_hardening_rollback.sql

BEGIN;

-- 1. Table-level write REVOKEs. No column-level REVOKE anywhere in 165.
REVOKE INSERT, UPDATE, DELETE ON public.event_team_members FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.event_team_invitations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.event_staff_checkins FROM anon, authenticated;

-- 2. Badge hash + display code on members.
ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS badge_token_hash TEXT;
ALTER TABLE public.event_team_members ADD COLUMN IF NOT EXISTS badge_display_code TEXT;

ALTER TABLE public.event_team_members DROP CONSTRAINT IF EXISTS event_team_members_badge_hash_format;
ALTER TABLE public.event_team_members ADD CONSTRAINT event_team_members_badge_hash_format
  CHECK (badge_token_hash IS NULL OR badge_token_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE public.event_team_members DROP CONSTRAINT IF EXISTS event_team_members_badge_display_len;
ALTER TABLE public.event_team_members ADD CONSTRAINT event_team_members_badge_display_len
  CHECK (badge_display_code IS NULL OR char_length(badge_display_code) <= 16);

-- Unique hash (re-runnable index, not a table constraint); NULLs (members
-- without a badge) never conflict. Display code unique so organizers can
-- name a badge unambiguously when revoking/reissuing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_members_badge_token_hash
  ON public.event_team_members(badge_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_members_badge_display_code
  ON public.event_team_members(badge_display_code);

-- Hash snapshot on check-ins. Nullable for re-run safety; the A4 scan
-- route always writes it, and the guard above guarantees no legacy row
-- predates the hash column.
ALTER TABLE public.event_staff_checkins ADD COLUMN IF NOT EXISTS badge_token_hash TEXT;

-- 3. Guard + drop of the 164 plaintext badge columns.
DO $$
DECLARE
  v_badges BIGINT;
  v_scans BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_badges
  FROM public.event_staff_checkins;
  SELECT COUNT(*) INTO v_scans
  FROM public.event_team_members
  WHERE badge_token IS NOT NULL;
  IF v_badges > 0 OR v_scans > 0 THEN
    RAISE EXCEPTION 'MIGRATION_165_ABORTED: % staff check-in rows and % members with plaintext badge tokens remain; rotate badges to hashes before dropping plaintext columns', v_badges, v_scans;
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_column THEN
    -- 164 objects already gone (re-run after rollback): nothing to guard.
    NULL;
END;
$$;

DROP INDEX IF EXISTS public.idx_event_team_members_badge_token;
ALTER TABLE public.event_team_members DROP COLUMN IF EXISTS badge_token;
ALTER TABLE public.event_staff_checkins DROP COLUMN IF EXISTS badge_token;

-- 4. Member-link FK to SET NULL (audit survives member deletion).
ALTER TABLE public.event_staff_checkins ALTER COLUMN staff_member_id DROP NOT NULL;
ALTER TABLE public.event_staff_checkins DROP CONSTRAINT IF EXISTS event_staff_checkins_staff_member_id_fkey;
ALTER TABLE public.event_staff_checkins ADD CONSTRAINT event_staff_checkins_staff_member_id_fkey
  FOREIGN KEY (staff_member_id) REFERENCES public.event_team_members(id) ON DELETE SET NULL;

-- 5. SELECT-only check-ins: drop the manager write policy, keep SELECT.
DROP POLICY IF EXISTS "Organizers manage staff checkins" ON public.event_staff_checkins;

COMMIT;

NOTIFY pgrst, 'reload schema';
