-- migration_197_event_ticket_scan_attempts.sql
-- Persist rejected ticket scans for scanner and organizer activity reporting.
-- Successful admissions remain exclusively in ticket_checkins.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_ticket_scan_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  staff_member_id uuid,
  scanned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  delegating_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ticket_instance_id uuid REFERENCES public.ticket_instances(id) ON DELETE SET NULL,
  entrance_id uuid,
  device_id text,
  scan_source text NOT NULL DEFAULT 'online'
    CHECK (scan_source IN ('online', 'offline_sync')),
  offline_scan_id uuid,
  outcome text NOT NULL DEFAULT 'rejected' CHECK (outcome = 'rejected'),
  reason_code text NOT NULL CHECK (reason_code IN (
    'already_checked_in',
    'ticket_not_found',
    'wrong_event',
    'ticket_cancelled',
    'ticket_refunded',
    'ticket_not_valid',
    'ticket_ineligible',
    'unauthorized_entrance',
    'verification_error',
    'unsupported_code',
    'offline_conflict',
    'invalid_scan',
    'invalid_timestamp',
    'scan_id_reused',
    'unknown_status'
  )),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_ticket_scan_attempts_staff_event_fk
    FOREIGN KEY (event_id, staff_member_id)
    REFERENCES public.event_team_members(event_id, id) ON DELETE CASCADE,
  CONSTRAINT event_ticket_scan_attempts_identity_check
    CHECK (staff_member_id IS NOT NULL OR scanned_by_user_id IS NOT NULL OR delegating_user_id IS NOT NULL),
  CONSTRAINT event_ticket_scan_attempts_device_length_check
    CHECK (device_id IS NULL OR char_length(device_id) <= 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_ticket_scan_attempts_offline_id
  ON public.event_ticket_scan_attempts(offline_scan_id)
  WHERE offline_scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_ticket_scan_attempts_event_time
  ON public.event_ticket_scan_attempts(event_id, attempted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_event_ticket_scan_attempts_staff_time
  ON public.event_ticket_scan_attempts(staff_member_id, attempted_at DESC, id DESC)
  WHERE staff_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_ticket_scan_attempts_user_time
  ON public.event_ticket_scan_attempts(scanned_by_user_id, attempted_at DESC, id DESC)
  WHERE scanned_by_user_id IS NOT NULL;

ALTER TABLE public.event_ticket_scan_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_ticket_scan_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.event_ticket_scan_attempts TO service_role;

DROP POLICY IF EXISTS "Authorized staff can view ticket scan attempts" ON public.event_ticket_scan_attempts;
CREATE POLICY "Authorized staff can view ticket scan attempts"
  ON public.event_ticket_scan_attempts FOR SELECT
  USING (
    scanned_by_user_id = auth.uid()
    OR delegating_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.event_team_members AS m
      WHERE m.id = event_ticket_scan_attempts.staff_member_id
        AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.events AS e
      LEFT JOIN public.organizers AS o ON o.id = e.organizer_id
      WHERE e.id = event_ticket_scan_attempts.event_id
        AND (
          e.user_id = auth.uid()
          OR o.user_id = auth.uid()
          OR public.is_entity_member(e.organizer_id, ARRAY['owner','admin','manager']::text[])
          OR public.is_event_team_member(e.id, ARRAY['event_manager']::text[])
          OR EXISTS (
            SELECT 1 FROM public.profiles AS p
            WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active'
          )
        )
    )
  );

-- Carry forward existing offline conflict audit rows into the canonical
-- rejected-attempt stream without retaining raw_payload or QR material.
INSERT INTO public.event_ticket_scan_attempts (
  event_id, staff_member_id, scanned_by_user_id, delegating_user_id,
  ticket_instance_id, entrance_id, device_id, scan_source, offline_scan_id,
  reason_code, attempted_at
)
SELECT
  c.event_id,
  c.scanned_by_staff_member_id,
  c.scanned_by_user_id,
  c.delegating_user_id,
  c.ticket_instance_id,
  c.entrance_id,
  left(c.device_id, 120),
  'offline_sync',
  c.offline_scan_id,
  CASE
    WHEN c.conflict_reason IN ('already_checked_in', 'duplicate_offline_scan_earlier_timestamp') THEN 'already_checked_in'
    WHEN c.conflict_reason = 'ticket_cancelled' THEN 'ticket_cancelled'
    WHEN c.conflict_reason = 'ticket_refunded' THEN 'ticket_refunded'
    WHEN c.conflict_reason = 'ticket_not_found' THEN 'ticket_not_found'
    WHEN c.conflict_reason = 'wrong_event' THEN 'wrong_event'
    WHEN c.conflict_reason = 'ticket_not_valid' THEN 'ticket_not_valid'
    ELSE 'offline_conflict'
  END,
  c.offline_scanned_at
FROM public.offline_scan_conflicts AS c
WHERE c.scanned_by_staff_member_id IS NOT NULL
   OR c.scanned_by_user_id IS NOT NULL
   OR c.delegating_user_id IS NOT NULL
ON CONFLICT (offline_scan_id) WHERE offline_scan_id IS NOT NULL DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_event_staff_scan_summary(p_event_id uuid)
RETURNS TABLE (
  staff_member_id uuid,
  scanned_by_user_id uuid,
  successful_count bigint,
  rejected_count bigint,
  last_activity_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  WITH activity AS (
    SELECT
      tc.event_id,
      COALESCE(tc.scanned_by_staff_member_id, member.id) AS staff_member_id,
      COALESCE(tc.scanned_by_user_id, tc.delegating_user_id) AS scanned_by_user_id,
      1::bigint AS successful_count,
      0::bigint AS rejected_count,
      tc.checked_in_at AS occurred_at
    FROM public.ticket_checkins AS tc
    LEFT JOIN public.event_team_members AS member
      ON member.event_id = tc.event_id
     AND member.user_id = COALESCE(tc.scanned_by_user_id, tc.delegating_user_id)
    WHERE tc.event_id = p_event_id
    UNION ALL
    SELECT
      attempt.event_id,
      COALESCE(attempt.staff_member_id, member.id),
      COALESCE(attempt.scanned_by_user_id, attempt.delegating_user_id),
      0::bigint,
      1::bigint,
      attempt.attempted_at
    FROM public.event_ticket_scan_attempts AS attempt
    LEFT JOIN public.event_team_members AS member
      ON member.event_id = attempt.event_id
     AND member.user_id = COALESCE(attempt.scanned_by_user_id, attempt.delegating_user_id)
    WHERE attempt.event_id = p_event_id
  )
  SELECT activity.staff_member_id,
         activity.scanned_by_user_id,
         sum(activity.successful_count),
         sum(activity.rejected_count),
         max(activity.occurred_at)
    FROM activity
   GROUP BY activity.staff_member_id, activity.scanned_by_user_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_staff_scan_history(
  p_event_id uuid,
  p_staff_member_id uuid,
  p_user_id uuid,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE (
  entry_id uuid,
  event_id uuid,
  staff_member_id uuid,
  scanned_by_user_id uuid,
  ticket_instance_id uuid,
  entrance_id uuid,
  scan_source text,
  result text,
  reason_code text,
  occurred_at timestamptz,
  offline_scan_id uuid
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT activity.entry_id,
         activity.event_id,
         activity.staff_member_id,
         activity.scanned_by_user_id,
         activity.ticket_instance_id,
         activity.entrance_id,
         activity.scan_source,
         activity.result,
         activity.reason_code,
         activity.occurred_at,
         activity.offline_scan_id
    FROM (
      SELECT tc.id AS entry_id,
             tc.event_id,
             COALESCE(tc.scanned_by_staff_member_id, member.id) AS staff_member_id,
             COALESCE(tc.scanned_by_user_id, tc.delegating_user_id) AS scanned_by_user_id,
             tc.ticket_instance_id,
             tc.entrance_id,
             COALESCE(tc.scan_source, 'online') AS scan_source,
             'successful'::text AS result,
             NULL::text AS reason_code,
             tc.checked_in_at AS occurred_at,
             tc.offline_scan_id
        FROM public.ticket_checkins AS tc
        LEFT JOIN public.event_team_members AS member
          ON member.event_id = tc.event_id
         AND member.user_id = COALESCE(tc.scanned_by_user_id, tc.delegating_user_id)
       WHERE tc.event_id = p_event_id
      UNION ALL
      SELECT attempt.id,
             attempt.event_id,
             COALESCE(attempt.staff_member_id, member.id),
             COALESCE(attempt.scanned_by_user_id, attempt.delegating_user_id),
             attempt.ticket_instance_id,
             attempt.entrance_id,
             attempt.scan_source,
             attempt.outcome,
             attempt.reason_code,
             attempt.attempted_at,
             attempt.offline_scan_id
        FROM public.event_ticket_scan_attempts AS attempt
        LEFT JOIN public.event_team_members AS member
          ON member.event_id = attempt.event_id
         AND member.user_id = COALESCE(attempt.scanned_by_user_id, attempt.delegating_user_id)
       WHERE attempt.event_id = p_event_id
    ) AS activity
   WHERE (p_staff_member_id IS NULL AND p_user_id IS NULL)
      OR (p_staff_member_id IS NOT NULL AND activity.staff_member_id = p_staff_member_id)
      OR (p_user_id IS NOT NULL AND activity.scanned_by_user_id = p_user_id)
   ORDER BY activity.occurred_at DESC, activity.entry_id DESC
   LIMIT greatest(1, least(COALESCE(p_limit, 25), 100))
   OFFSET greatest(0, COALESCE(p_offset, 0));
$function$;

REVOKE ALL ON FUNCTION public.get_event_staff_scan_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_staff_scan_summary(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_event_staff_scan_history(uuid, uuid, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_staff_scan_history(uuid, uuid, uuid, integer, integer)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
