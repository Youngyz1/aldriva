-- Rollback for migration_179_romantic_envelope_presets.sql
-- Restores the exact blocks_layout and published_snapshot JSONB values saved
-- before migration 179, then removes the private migration backup and helpers.

BEGIN;

UPDATE public.event_invitation_pages AS pages
SET blocks_layout = backup.blocks_layout,
    published_snapshot = backup.published_snapshot
FROM public._migration_179_invitation_layout_backup AS backup
WHERE pages.event_id = backup.event_id;

DROP TABLE public._migration_179_invitation_layout_backup;
DROP FUNCTION IF EXISTS public.append_migration_179_countdown(JSONB);
DROP FUNCTION IF EXISTS public.ensure_romantic_envelope_layout(JSONB);

COMMENT ON COLUMN public.event_invitation_pages.blocks_layout IS
  'Optional canonical draft page composition: {version, global_theme, layout_blocks:[{id,type,content}]}. Null uses the legacy template-id adapter.';

COMMIT;

NOTIFY pgrst, 'reload schema';
