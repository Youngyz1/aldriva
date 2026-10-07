-- migration_155_event_kind.sql
-- Round 3 COMMIT 1: first-class invitation events.
--
-- Schema additions:
-- 1. Column: events.kind ('public' | 'invitation'), NOT NULL DEFAULT 'public'.
--    - Existing rows take kind='public' from the column default: no data
--      conversion, no silent reclassification of public events.
-- 2. Constraint: events_kind_check (kind IN ('public', 'invitation')).
-- 3. Constraint: events_status_check relaxed to also allow 'draft', so an
--    invitation can be created without a prior ticketed event (placeholder
--    title + generated unique slug from code; title/date/time/timezone/venue
--    are collected in the builder's Basics section and placeholders never
--    reach public or guest pages). Existing rows (pending/approved/rejected)
--    remain valid. No NOT NULL column is relaxed: title/slug stay required
--    (code supplies them), dates/venue/organizer stay nullable already.
-- 4. Constraint: events_invitation_private_check (kind='invitation' forces
--    visibility='private'), so an invitation event can never look public.
-- 5. Index: idx_events_kind for kind routing and public-listable filters.
--
-- Share-link columns (per-event token, enabled flag, regenerated_at) are
-- intentionally NOT here — they land in migration 156 with Commit 3.
--
-- Safe to re-run (IF NOT EXISTS guards throughout).
-- Rollback: db/migration_155_event_kind_rollback.sql

BEGIN;

-- ── 1. Column: events.kind ──────────────────────────────────────────────

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'public';

-- ── 2. Constraint: kind values ───────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_kind_check') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_kind_check CHECK (kind IN ('public', 'invitation'));
  END IF;
END $$;

-- ── 3. Constraint: status gains 'draft' ──────────────────────────────────
-- Drop-then-add keeps a single named CHECK (matches schema.sql naming).
-- No other migration touches events_status_check (verified), so the
-- pre-155 value set is exactly ('pending', 'approved', 'rejected').

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_status_check') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'draft'));
  END IF;
END $$;

-- ── 4. Constraint: invitation implies private ───────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_invitation_private_check') THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_invitation_private_check
      CHECK (kind <> 'invitation' OR visibility = 'private');
  END IF;
END $$;

-- ── 5. Index ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_events_kind ON public.events (kind);

COMMIT;

NOTIFY pgrst, 'reload schema';
