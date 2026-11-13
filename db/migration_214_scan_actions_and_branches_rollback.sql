-- migration_214_scan_actions_and_branches_rollback.sql
-- Rollback for migration 214.
-- Drops only objects created by this migration:
--   - scan_events table and its triggers/functions
--   - begin_scan_event, finalize_scan_event, scan_reservation_action RPCs
--   - branch_on_insert triggers on orders/reservations
--   - business_create_main_branch trigger on businesses
-- Does NOT drop business_branches (may hold data).
-- Does NOT drop orders.branch_id or reservations.branch_id (may hold data).
-- Does NOT drop scan_codes or issue_scan_code/lookup_scan_code (Phase 2).
-- Does NOT mirror this file to supabase/migrations/.

BEGIN;

DO $g$ BEGIN IF to_regclass('public.scan_events') IS NOT NULL AND EXISTS (SELECT 1 FROM public.scan_events) THEN RAISE EXCEPTION 'scan_events has rows; export before rollback'; END IF; END $g$;

DROP TRIGGER IF EXISTS trg_businesses_create_main_branch ON public.businesses;
DROP FUNCTION IF EXISTS public.trg_business_create_main_branch();

DROP TRIGGER IF EXISTS trg_reservations_set_branch_on_insert ON public.reservations;
DROP FUNCTION IF EXISTS public.trg_reservations_branch_on_insert();

DROP TRIGGER IF EXISTS trg_orders_set_branch_on_insert ON public.orders;
DROP FUNCTION IF EXISTS public.trg_orders_branch_on_insert();

REVOKE ALL ON FUNCTION public.scan_reservation_action(uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.scan_reservation_action(uuid, uuid, text, uuid, jsonb);

REVOKE ALL ON FUNCTION public.finalize_scan_event(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.finalize_scan_event(uuid, text, text, text, text, jsonb);

REVOKE ALL ON FUNCTION public.begin_scan_event(
  uuid, uuid, uuid, text, uuid, uuid, text,
  text, uuid, uuid, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.begin_scan_event(
  uuid, uuid, uuid, text, uuid, uuid, text,
  text, uuid, uuid, text, text, text, text, timestamptz
);

DROP TABLE IF EXISTS public.scan_events CASCADE;

COMMIT;