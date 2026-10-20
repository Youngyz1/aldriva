-- NEVER run on production.
-- STAGING TEST-DATA CLEANUP ONLY.
-- Deletes rows only from the five new migration_185 tables below.
-- Never touches public.orders or any pre-existing table.
-- This removes all rows from these new tables, not just one test worker.

BEGIN;

DELETE FROM public.business_worker_sessions;
DELETE FROM public.business_kitchen_display_links;
DELETE FROM public.business_worker_invitations;
DELETE FROM public.business_workers;
DELETE FROM public.business_kitchens;

COMMIT;
