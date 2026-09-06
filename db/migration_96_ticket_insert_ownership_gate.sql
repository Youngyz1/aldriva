-- migration_96_ticket_insert_ownership_gate.sql
--
-- Security remediation (HIGH-6):
-- Restrict INSERT on tickets to event owners and admins.
--
-- Idempotent version.

BEGIN;

-- Remove the old public-write policy if it exists.
DROP POLICY IF EXISTS "Allow public insert" ON public.tickets;

-- Recreate the intended restricted policy safely.
DROP POLICY IF EXISTS "Event owners and admins can create tickets"
  ON public.tickets;

CREATE POLICY "Event owners and admins can create tickets"
  ON public.tickets
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND event_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
      )
      OR EXISTS (
        SELECT 1
        FROM public.events
        WHERE events.id = tickets.event_id
          AND events.user_id = auth.uid()
      )
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';