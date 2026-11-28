-- migration_220_service_categories_rollback.sql
-- Fail-closed rollback for migration 220.
--
-- Refuses to run if any public.service_categories row exists, or if any
-- public.services row has used category_id, summary, hero_image_url, or a
-- non-empty includes array, since dropping these columns would silently
-- discard owner-entered catalog data. Operators must clear/migrate that
-- data first. Uses to_regclass so it does not error if the table or columns
-- were never created.

BEGIN;

DO $$
DECLARE
  v_category_count integer := 0;
  v_services_using_new_fields integer := 0;
BEGIN
  IF to_regclass('public.service_categories') IS NOT NULL THEN
    SELECT count(*) INTO v_category_count FROM public.service_categories;
    IF v_category_count > 0 THEN
      RAISE EXCEPTION
        'MIGRATION_220_ROLLBACK_BLOCKED: % service_categories row(s) exist. Delete or migrate them first.',
        v_category_count;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'services' AND column_name = 'category_id'
  ) THEN
    SELECT count(*) INTO v_services_using_new_fields
    FROM public.services
    WHERE category_id IS NOT NULL
       OR summary IS NOT NULL
       OR hero_image_url IS NOT NULL
       OR (includes IS NOT NULL AND jsonb_array_length(includes) > 0);

    IF v_services_using_new_fields > 0 THEN
      RAISE EXCEPTION
        'MIGRATION_220_ROLLBACK_BLOCKED: % services row(s) use category_id/summary/includes/hero_image_url. Clear these fields first.',
        v_services_using_new_fields;
    END IF;
  END IF;
END
$$;

ALTER TABLE public.services
  DROP COLUMN IF EXISTS category_id,
  DROP COLUMN IF EXISTS summary,
  DROP COLUMN IF EXISTS includes,
  DROP COLUMN IF EXISTS hero_image_url;

DROP TABLE IF EXISTS public.service_categories;

COMMIT;

NOTIFY pgrst, 'reload schema';
