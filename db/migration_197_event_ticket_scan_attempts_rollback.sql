-- Rollback for migration_197_event_ticket_scan_attempts.sql.
-- Refuses to destroy persisted rejection history; export/archive it before retrying.

BEGIN;

LOCK TABLE public.event_ticket_scan_attempts IN ACCESS EXCLUSIVE MODE;

DO $rollback$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_ticket_scan_attempts) THEN
    RAISE EXCEPTION 'event_ticket_scan_attempts contains audit records; archive them before rollback';
  END IF;
END
$rollback$;

DROP FUNCTION IF EXISTS public.get_event_staff_scan_history(uuid, uuid, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_event_staff_scan_summary(uuid);
DROP POLICY IF EXISTS "Authorized staff can view ticket scan attempts" ON public.event_ticket_scan_attempts;
DROP TABLE IF EXISTS public.event_ticket_scan_attempts;

COMMIT;

NOTIFY pgrst, 'reload schema';
