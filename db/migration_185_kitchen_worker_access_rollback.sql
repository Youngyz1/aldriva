-- Migration 185 rollback. This refuses to remove any non-empty new table.
-- It never drops or alters an existing table, column or row.

BEGIN;

DO $rollback$
DECLARE
  v_name text;
  v_table regclass;
  v_has_rows boolean;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'public.business_worker_sessions',
    'public.business_kitchen_display_links',
    'public.business_worker_invitations',
    'public.business_workers',
    'public.business_kitchens'
  ]
  LOOP
    v_table := to_regclass(v_name);
    IF v_table IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s)', v_table)
        INTO v_has_rows;
      IF v_has_rows THEN
        RAISE EXCEPTION
          'Rollback stopped: % contains data; preserve/export it and decide explicitly before rollback',
          v_name;
      END IF;
    END IF;
  END LOOP;

  IF to_regclass('public.business_workers') IS NOT NULL THEN
    EXECUTE
      'DROP TRIGGER IF EXISTS trg_revoke_business_worker_access_on_deactivation
       ON public.business_workers';
  END IF;
END;
$rollback$;

DROP FUNCTION IF EXISTS
  public.validate_and_renew_business_worker_session(text);

DROP FUNCTION IF EXISTS
  public.consume_business_worker_invitation(text, text, text);

DROP FUNCTION IF EXISTS
  public.revoke_business_worker_access_on_deactivation();

DROP TABLE IF EXISTS public.business_worker_sessions;
DROP TABLE IF EXISTS public.business_kitchen_display_links;
DROP TABLE IF EXISTS public.business_worker_invitations;
DROP TABLE IF EXISTS public.business_workers;
DROP TABLE IF EXISTS public.business_kitchens;

COMMIT;
