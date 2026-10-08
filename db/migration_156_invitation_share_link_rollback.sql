-- migration_156_invitation_share_link_rollback.sql
-- Rollback for migration_156_invitation_share_link.sql — reverses in
-- reverse order. Dropping these columns kills every general share link,
-- which is the safe direction (links die closed, nothing becomes public).
-- Safe to re-run (IF EXISTS guards throughout).

BEGIN;

-- ── 3. Drop: share_regenerated_at ────────────────────────────────────────

ALTER TABLE public.event_invitation_pages DROP COLUMN IF EXISTS share_regenerated_at;

-- ── 2. Drop: share_enabled ───────────────────────────────────────────────

ALTER TABLE public.event_invitation_pages DROP COLUMN IF EXISTS share_enabled;

-- ── 1. Drop: share token UNIQUE, then column ─────────────────────────────

ALTER TABLE public.event_invitation_pages DROP CONSTRAINT IF EXISTS event_invitation_pages_share_token_key;
ALTER TABLE public.event_invitation_pages DROP COLUMN IF EXISTS share_token;

COMMIT;

NOTIFY pgrst, 'reload schema';
