-- migration_221_remove_old_invitation_templates.sql
-- Removes legacy invitation template data (v1 catalog) matching by slug/text identifier.
--
-- PRE-FLIGHT VERIFICATION QUERIES:
-- Run these queries prior to applying the migration to preview affected rows:
--
-- 1. Count invitation_templates rows to be backed up and deleted (expect <= 8):
--    SELECT count(*), array_agg(slug)
--    FROM public.invitation_templates
--    WHERE slug IN (
--      'botanical-reverie',
--      'royal-elegance',
--      'grand-gala-noir',
--      'festive-gold-noir',
--      'community-warmth',
--      'modern-executive',
--      'neon-horizon',
--      'luxe-editorial'
--    );
--
-- 2. Count events with invitation_template_id to be backed up and nulled:
--    SELECT count(*)
--    FROM public.events e
--    WHERE e.invitation_template_id IN (
--      SELECT t.id
--      FROM public.invitation_templates t
--      WHERE t.slug IN (
--        'botanical-reverie',
--        'royal-elegance',
--        'grand-gala-noir',
--        'festive-gold-noir',
--        'community-warmth',
--        'modern-executive',
--        'neon-horizon',
--        'luxe-editorial'
--      )
--    );
--
-- 3. Count event_invitation_pages rows to be backed up and deleted (all drafts and published):
--    SELECT page_status, count(*)
--    FROM public.event_invitation_pages
--    WHERE template_id IN (
--      'gala-editorial',
--      'wedding-romantic',
--      'evergreen-envelope',
--      'boho-floral-brown',
--      'botanical-reverie',
--      'birthday-bold',
--      'cover',
--      'black-tie',
--      'romantic-envelope',
--      'luxe-editorial'
--    )
--    OR template_id IS NULL
--    OR template_id = ''
--    GROUP BY page_status;
--
-- Rollback twin: db/migration_221_remove_old_invitation_templates_rollback.sql

BEGIN;

-- ── 1. Backup tables using CREATE TABLE ... AS SELECT * ──────────────────────

-- 1a. Backup invitation_templates
DO $$
BEGIN
  IF to_regclass('public._migration_221_invitation_templates_backup') IS NULL THEN
    CREATE TABLE public._migration_221_invitation_templates_backup AS
    SELECT *
    FROM public.invitation_templates
    WHERE slug IN (
      'botanical-reverie',
      'royal-elegance',
      'grand-gala-noir',
      'festive-gold-noir',
      'community-warmth',
      'modern-executive',
      'neon-horizon',
      'luxe-editorial'
    );

    REVOKE ALL ON TABLE public._migration_221_invitation_templates_backup FROM PUBLIC, anon, authenticated, service_role;
    ALTER TABLE public._migration_221_invitation_templates_backup ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 1b. Backup events.invitation_template_id
DO $$
BEGIN
  IF to_regclass('public._migration_221_events_template_backup') IS NULL THEN
    CREATE TABLE public._migration_221_events_template_backup AS
    SELECT e.id AS event_id, e.invitation_template_id
    FROM public.events e
    WHERE e.invitation_template_id IN (
      SELECT t.id
      FROM public.invitation_templates t
      WHERE t.slug IN (
        'botanical-reverie',
        'royal-elegance',
        'grand-gala-noir',
        'festive-gold-noir',
        'community-warmth',
        'modern-executive',
        'neon-horizon',
        'luxe-editorial'
      )
    );

    REVOKE ALL ON TABLE public._migration_221_events_template_backup FROM PUBLIC, anon, authenticated, service_role;
    ALTER TABLE public._migration_221_events_template_backup ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 1c. Backup ALL legacy event_invitation_pages rows (drafts and published)
DO $$
BEGIN
  IF to_regclass('public._migration_221_event_invitation_pages_backup') IS NULL THEN
    CREATE TABLE public._migration_221_event_invitation_pages_backup AS
    SELECT *
    FROM public.event_invitation_pages
    WHERE template_id IN (
      'gala-editorial',
      'wedding-romantic',
      'evergreen-envelope',
      'boho-floral-brown',
      'botanical-reverie',
      'birthday-bold',
      'cover',
      'black-tie',
      'romantic-envelope',
      'luxe-editorial'
    )
    OR template_id IS NULL
    OR template_id = '';

    REVOKE ALL ON TABLE public._migration_221_event_invitation_pages_backup FROM PUBLIC, anon, authenticated, service_role;
    ALTER TABLE public._migration_221_event_invitation_pages_backup ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ── 2. Null events.invitation_template_id ────────────────────────────────────

UPDATE public.events
SET invitation_template_id = NULL
WHERE invitation_template_id IN (
  SELECT id
  FROM public.invitation_templates
  WHERE slug IN (
    'botanical-reverie',
    'royal-elegance',
    'grand-gala-noir',
    'festive-gold-noir',
    'community-warmth',
    'modern-executive',
    'neon-horizon',
    'luxe-editorial'
  )
);

-- ── 3. Delete matching rows from invitation_templates ────────────────────────

DELETE FROM public.invitation_templates
WHERE slug IN (
  'botanical-reverie',
  'royal-elegance',
  'grand-gala-noir',
  'festive-gold-noir',
  'community-warmth',
  'modern-executive',
  'neon-horizon',
  'luxe-editorial'
);

-- ── 4. Drop DEFAULT on event_invitation_pages.template_id (preserve NOT NULL) ──

ALTER TABLE public.event_invitation_pages
  ALTER COLUMN template_id DROP DEFAULT;

-- ── 5. Delete ALL legacy event_invitation_pages rows ─────────────────────────

DELETE FROM public.event_invitation_pages
WHERE template_id IN (
  'gala-editorial',
  'wedding-romantic',
  'evergreen-envelope',
  'boho-floral-brown',
  'botanical-reverie',
  'birthday-bold',
  'cover',
  'black-tie',
  'romantic-envelope',
  'luxe-editorial'
)
OR template_id IS NULL
OR template_id = '';

COMMIT;

NOTIFY pgrst, 'reload schema';
