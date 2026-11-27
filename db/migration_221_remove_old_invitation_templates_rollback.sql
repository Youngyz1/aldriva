-- migration_221_remove_old_invitation_templates_rollback.sql
-- Rollback for migration 221: restores invitation templates, event associations,
-- and event invitation page records from backup tables.
-- Preserves backup tables for manual operator inspection.

BEGIN;

-- ── 1. Restore invitation_templates ──────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public._migration_221_invitation_templates_backup') IS NOT NULL THEN
    INSERT INTO public.invitation_templates
    SELECT *
    FROM public._migration_221_invitation_templates_backup
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      category = EXCLUDED.category,
      background_image_url = EXCLUDED.background_image_url,
      thumbnail_url = EXCLUDED.thumbnail_url,
      layout_config = EXCLUDED.layout_config,
      is_active = EXCLUDED.is_active,
      sort_order = EXCLUDED.sort_order,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at;
  END IF;
END $$;

-- ── 2. Restore events.invitation_template_id ─────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public._migration_221_events_template_backup') IS NOT NULL THEN
    UPDATE public.events e
    SET invitation_template_id = b.invitation_template_id
    FROM public._migration_221_events_template_backup b
    WHERE e.id = b.event_id;
  END IF;
END $$;

-- ── 3. Restore event_invitation_pages ────────────────────────────────────────

DO $$
DECLARE
  v_skipped_count integer;
BEGIN
  IF to_regclass('public._migration_221_event_invitation_pages_backup') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_skipped_count
    FROM public._migration_221_event_invitation_pages_backup b
    WHERE EXISTS (
      SELECT 1
      FROM public.event_invitation_pages p
      WHERE p.event_id = b.event_id
    );

    INSERT INTO public.event_invitation_pages
    SELECT b.* FROM public._migration_221_event_invitation_pages_backup b
    WHERE NOT EXISTS (SELECT 1 FROM public.event_invitation_pages p WHERE p.event_id = b.event_id)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Restored event_invitation_pages from backup. Skipped % backup rows because their event already has a page.', v_skipped_count;
  END IF;
END $$;

-- ── 4. Re-add DEFAULT 'gala-editorial' on event_invitation_pages.template_id ──

ALTER TABLE public.event_invitation_pages
  ALTER COLUMN template_id SET DEFAULT 'gala-editorial';

-- ── 5. Operator Notice: Preserving backup tables ──────────────────────────────

DO $$
BEGIN
  RAISE NOTICE 'Rollback complete. Restored invitation_templates, events.invitation_template_id, and event_invitation_pages. Backup tables have NOT been dropped: public._migration_221_invitation_templates_backup, public._migration_221_events_template_backup, public._migration_221_event_invitation_pages_backup. Please inspect and drop manually after verifying.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
