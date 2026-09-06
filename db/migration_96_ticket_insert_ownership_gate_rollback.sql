-- migration_96_ticket_insert_ownership_gate_rollback.sql
--
-- Restores the pre-96 permissive ticket INSERT policy. Only use to back out
-- migration_96; re-opens HIGH-6 (anonymous ticket-type creation).

BEGIN;

DROP POLICY IF EXISTS "Event owners and admins can create tickets" ON public.tickets;

CREATE POLICY "Allow public insert"
  ON public.tickets FOR INSERT
  WITH CHECK (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
