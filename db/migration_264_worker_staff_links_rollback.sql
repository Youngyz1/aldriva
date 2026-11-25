-- Rollback of migration 264. Restores the exact pre-state: no link table, no trigger function, no triggers.
-- Any rows in business_worker_staff_links are lost (the table is dropped). Workers already switched off by the trigger stay switched off.
-- Apply statement by statement. Idempotent.

-- STATEMENT 1: triggers
DO $trg$
BEGIN
  DROP TRIGGER IF EXISTS trg_staff_members_worker_links_deactivate_upd ON public.staff_members;
  DROP TRIGGER IF EXISTS trg_staff_members_worker_links_deactivate_del ON public.staff_members;
END
$trg$;

-- STATEMENT 2: function
DROP FUNCTION IF EXISTS public.staff_deactivate_linked_workers();

-- STATEMENT 3: table (its index, policy and constraints go with it)
DROP TABLE IF EXISTS public.business_worker_staff_links;