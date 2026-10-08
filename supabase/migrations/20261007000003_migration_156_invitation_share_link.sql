-- migration_156_invitation_share_link.sql
-- Round 3 COMMIT 3: general share link for invitation-kind events.
--
-- Schema additions on event_invitation_pages (1:1 with events, keeps the
-- events table clean):
-- 1. Column: share_token TEXT UNIQUE (nullable until first enable; multiple
--    NULLs allowed). The token is generated in code (256-bit random hex),
--    never the event slug and never a guest token.
-- 2. Column: share_enabled BOOLEAN NOT NULL DEFAULT false (default off until
--    the host turns it on).
-- 3. Column: share_regenerated_at TIMESTAMPTZ (audit stamp for rotation).
--
-- No data conversion: all existing rows take share_enabled=false.
-- Safe to re-run (IF NOT EXISTS guards throughout).
-- Rollback: db/migration_156_invitation_share_link_rollback.sql

BEGIN;

-- ── 1. Column: share_token ──────────────────────────────────────────────

ALTER TABLE public.event_invitation_pages
  ADD COLUMN IF NOT EXISTS share_token TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_invitation_pages_share_token_key') THEN
    ALTER TABLE public.event_invitation_pages
      ADD CONSTRAINT event_invitation_pages_share_token_key UNIQUE (share_token);
  END IF;
END $$;

-- ── 2. Column: share_enabled ─────────────────────────────────────────────

ALTER TABLE public.event_invitation_pages
  ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN NOT NULL DEFAULT false;

-- ── 3. Column: share_regenerated_at ──────────────────────────────────────

ALTER TABLE public.event_invitation_pages
  ADD COLUMN IF NOT EXISTS share_regenerated_at TIMESTAMPTZ;

COMMIT;

NOTIFY pgrst, 'reload schema';
