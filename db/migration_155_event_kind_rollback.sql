-- migration_155_event_kind_rollback.sql
-- Rollback for migration_155_event_kind.sql — reverses in reverse order.
--
-- Guards (run first; either aborts the whole transaction, changing nothing):
-- - aborts if any row still has kind='invitation'. Convert such rows to
--   kind='public' (they stay visibility='private') or delete them first —
--   an invitation event must never be left looking public.
-- - aborts if any row still has status='draft' (the restored pre-155 CHECK
--   would reject them).
-- Assumes no later migration altered events_kind_check,
-- events_invitation_private_check, events_status_check or idx_events_kind.
--
-- Safe to re-run (IF EXISTS guards throughout; guards no-op once kind is gone).

BEGIN;

-- ── Guards ───────────────────────────────────────────────────────────────

DO $$
DECLARE
  invitation_count INTEGER := 0;
  has_kind BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'kind'
  ) INTO has_kind;
  IF has_kind THEN
    SELECT count(*) INTO invitation_count FROM public.events WHERE kind = 'invitation';
    IF invitation_count > 0 THEN
      RAISE EXCEPTION 'migration 155 rollback aborted: % event(s) still have kind=invitation. Convert them to kind=public (visibility stays private) or delete them first — an invitation event must never look public.', invitation_count;
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  draft_count INTEGER := 0;
BEGIN
  SELECT count(*) INTO draft_count FROM public.events WHERE status = 'draft';
  IF draft_count > 0 THEN
    RAISE EXCEPTION 'migration 155 rollback aborted: % event(s) still have status=draft. Publish, re-target or delete them first — the restored status check only allows pending/approved/rejected.', draft_count;
  END IF;
END $$;

-- ── 5. Drop: index ───────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_events_kind;

-- ── 4. Drop: invitation-implies-private ──────────────────────────────────

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_invitation_private_check;

-- ── 3. Restore: pre-155 status CHECK ─────────────────────────────────────

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- ── 2+1. Drop: kind CHECK, then column ────────────────────────────────────

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_kind_check;
ALTER TABLE public.events DROP COLUMN IF EXISTS kind;

COMMIT;

NOTIFY pgrst, 'reload schema';
