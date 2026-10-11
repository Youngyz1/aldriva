-- migration_167_invitation_music_links_rollback.sql
-- Rollback for migration_167_invitation_music_links.sql.
-- Drops the music_links column. Aborts while any draft or snapshot still
-- references music links, so no host setting is silently destroyed.
-- Safe to re-run.

BEGIN;

DO $$
DECLARE
  v_drafts BIGINT;
  v_snapshots BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_drafts
  FROM public.event_invitation_pages
  WHERE music_links IS NOT NULL;
  SELECT COUNT(*) INTO v_snapshots
  FROM public.event_invitation_pages
  WHERE published_snapshot IS NOT NULL
    AND (published_snapshot::jsonb -> 'music_links') IS NOT NULL
    AND (published_snapshot::jsonb -> 'music_links') <> 'null'::jsonb;
  IF v_drafts > 0 OR v_snapshots > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORTED: % drafts and % snapshots reference music links; clear them first', v_drafts, v_snapshots;
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_column THEN
    -- 167 objects already gone: nothing to guard.
    NULL;
END;
$$;

ALTER TABLE public.event_invitation_pages DROP COLUMN IF EXISTS music_links;

COMMIT;

NOTIFY pgrst, 'reload schema';
