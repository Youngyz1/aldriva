-- migration_167_invitation_music_links.sql
-- Invitation music links (external Spotify / Apple Music / SoundCloud URLs).
--
-- A single nullable JSONB column holds at most 3 validated link items
-- ({provider, url, embedUrl, tall, label}); shape + provider validation
-- live in lib/invitation-music-links.ts and the Zod draft schema, not in
-- CHECK constraints, so provider rules can evolve without a migration.
-- Existing invitations (NULL) render exactly as before. No RLS change:
-- the column inherits the event_invitation_pages policies. No audio is
-- downloaded or rehosted — players are official provider embeds.
--
-- Safe to re-run (IF NOT EXISTS guard).
-- Rollback: db/migration_167_invitation_music_links_rollback.sql

BEGIN;

ALTER TABLE public.event_invitation_pages ADD COLUMN IF NOT EXISTS music_links JSONB;

COMMIT;

NOTIFY pgrst, 'reload schema';
