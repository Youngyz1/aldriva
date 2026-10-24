-- Migration 187: read-only cook performance report.
-- Owner applies this SQL manually. This file does not connect to a database.
-- Date ranges and event timestamps are UTC. The business schema has no
-- business-timezone column; use [range_start, range_end) in UTC.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_business_cook_performance(
  p_business_id uuid,
  p_organizer_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz
)
RETURNS TABLE (
  cook_worker_id uuid,
  cook_name text,
  cook_is_active boolean,
  orders_handled bigint,
  accepted_to_preparing_n bigint,
  accepted_to_preparing_median_minutes double precision,
  preparing_to_ready_n bigint,
  preparing_to_ready_median_minutes double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH requested_scope AS (
    -- Do not trust the caller's pair of ids independently. The business must
    -- still belong to the organizer passed to this function.
    SELECT business_row.id AS scoped_business_id,
           business_row.organizer_id AS scoped_organizer_id
      FROM public.businesses AS business_row
      JOIN public.organizers AS organizer_row
        ON organizer_row.id = business_row.organizer_id
     WHERE business_row.id = p_business_id
       AND business_row.organizer_id = p_organizer_id
       AND p_range_start IS NOT NULL
       AND p_range_end IS NOT NULL
       AND p_range_start < p_range_end
  ),
  scoped_orders AS (
    SELECT order_row.id AS order_id,
           order_row.business_id,
           order_row.status AS current_order_status,
           order_row.status_history
      FROM public.orders AS order_row
      JOIN requested_scope AS scope_row
        ON scope_row.scoped_business_id = order_row.business_id
       AND scope_row.scoped_organizer_id = order_row.organizer_id
  ),
  event_source AS (
    SELECT order_row.order_id,
           order_row.business_id,
           order_row.current_order_status,
           history_row.ordinality::bigint AS event_ordinal,
           history_row.event_json,
           history_row.event_json ->> 'status' AS event_status,
           history_row.event_json ->> 'at' AS event_at_text,
           history_row.event_json ->> 'worker_id' AS worker_id_text
      FROM scoped_orders AS order_row
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(order_row.status_history) = 'array'
            THEN order_row.status_history
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS history_row(event_json, ordinality)
     WHERE jsonb_typeof(history_row.event_json) = 'object'
  ),
  parsed_events AS (
    SELECT event_row.order_id,
           event_row.business_id,
           event_row.current_order_status,
           event_row.event_ordinal,
           event_row.event_status,
           CASE
             WHEN event_row.worker_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               THEN event_row.worker_id_text::uuid
             ELSE NULL::uuid
           END AS worker_id,
           CASE
             WHEN event_row.event_at_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
               THEN event_row.event_at_text::timestamptz
             ELSE NULL::timestamptz
           END AS event_at
      FROM event_source AS event_row
  ),
  cooks AS (
    -- business_workers rows remain available after deactivation, so historic
    -- cooks keep their name and appear with cook_is_active = false.
    SELECT worker_row.id AS cook_worker_id,
           worker_row.full_name AS cook_name,
           (worker_row.is_active AND worker_row.deactivated_at IS NULL) AS cook_is_active
      FROM public.business_workers AS worker_row
      JOIN requested_scope AS scope_row
        ON scope_row.scoped_business_id = worker_row.business_id
     WHERE worker_row.role = 'cook'
  ),
  handled_counts AS (
    -- A cook handled an order when that cook has at least one attributed
    -- preparing/ready transition in the requested UTC range. A cancelled
    -- order still counts here if a cook transitioned it.
    SELECT event_row.worker_id AS cook_worker_id,
           count(DISTINCT event_row.order_id)::bigint AS orders_handled
      FROM parsed_events AS event_row
      JOIN public.business_workers AS worker_row
        ON worker_row.id = event_row.worker_id
       AND worker_row.business_id = event_row.business_id
       AND worker_row.role = 'cook'
     WHERE event_row.worker_id IS NOT NULL
       AND event_row.event_status IN ('preparing', 'ready')
       AND event_row.event_at >= p_range_start
       AND event_row.event_at < p_range_end
     GROUP BY event_row.worker_id
  ),
  accepted_to_preparing_intervals AS (
    -- Credit each interval to the cook on the event that ENDS it. The start
    -- event may belong to a manager or another non-cook actor.
    SELECT ending_event.worker_id AS cook_worker_id,
           extract(epoch FROM (ending_event.event_at - start_event.event_at))::double precision
             / 60.0::double precision AS duration_minutes
      FROM parsed_events AS ending_event
      JOIN public.business_workers AS worker_row
        ON worker_row.id = ending_event.worker_id
       AND worker_row.business_id = ending_event.business_id
       AND worker_row.role = 'cook'
      CROSS JOIN LATERAL (
        SELECT preceding_event.event_at
          FROM parsed_events AS preceding_event
         WHERE preceding_event.order_id = ending_event.order_id
           AND preceding_event.event_ordinal < ending_event.event_ordinal
           AND preceding_event.event_status = 'accepted'
           AND preceding_event.event_at IS NOT NULL
         ORDER BY preceding_event.event_ordinal DESC
         LIMIT 1
      ) AS start_event
     WHERE ending_event.event_status = 'preparing'
       AND ending_event.worker_id IS NOT NULL
       AND ending_event.current_order_status <> 'cancelled'
       AND ending_event.event_at >= p_range_start
       AND ending_event.event_at < p_range_end
       AND start_event.event_at <= ending_event.event_at
  ),
  preparing_to_ready_intervals AS (
    -- Credit each interval to the cook on the event that ENDS it. The start
    -- event may belong to a manager or another non-cook actor.
    SELECT ending_event.worker_id AS cook_worker_id,
           extract(epoch FROM (ending_event.event_at - start_event.event_at))::double precision
             / 60.0::double precision AS duration_minutes
      FROM parsed_events AS ending_event
      JOIN public.business_workers AS worker_row
        ON worker_row.id = ending_event.worker_id
       AND worker_row.business_id = ending_event.business_id
       AND worker_row.role = 'cook'
      CROSS JOIN LATERAL (
        SELECT preceding_event.event_at
          FROM parsed_events AS preceding_event
         WHERE preceding_event.order_id = ending_event.order_id
           AND preceding_event.event_ordinal < ending_event.event_ordinal
           AND preceding_event.event_status = 'preparing'
           AND preceding_event.event_at IS NOT NULL
         ORDER BY preceding_event.event_ordinal DESC
         LIMIT 1
      ) AS start_event
     WHERE ending_event.event_status = 'ready'
       AND ending_event.worker_id IS NOT NULL
       AND ending_event.current_order_status <> 'cancelled'
       AND ending_event.event_at >= p_range_start
       AND ending_event.event_at < p_range_end
       AND start_event.event_at <= ending_event.event_at
  ),
  accepted_to_preparing_stats AS (
    SELECT interval_row.cook_worker_id,
           count(*)::bigint AS sample_n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY interval_row.duration_minutes)
             AS median_minutes
      FROM accepted_to_preparing_intervals AS interval_row
     GROUP BY interval_row.cook_worker_id
  ),
  preparing_to_ready_stats AS (
    SELECT interval_row.cook_worker_id,
           count(*)::bigint AS sample_n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY interval_row.duration_minutes)
             AS median_minutes
      FROM preparing_to_ready_intervals AS interval_row
     GROUP BY interval_row.cook_worker_id
  )
  SELECT cook_row.cook_worker_id,
         cook_row.cook_name,
         cook_row.cook_is_active,
         COALESCE(handled_row.orders_handled, 0::bigint) AS orders_handled,
         COALESCE(accepted_stats.sample_n, 0::bigint) AS accepted_to_preparing_n,
         accepted_stats.median_minutes AS accepted_to_preparing_median_minutes,
         COALESCE(ready_stats.sample_n, 0::bigint) AS preparing_to_ready_n,
         ready_stats.median_minutes AS preparing_to_ready_median_minutes
    FROM cooks AS cook_row
    LEFT JOIN handled_counts AS handled_row
      ON handled_row.cook_worker_id = cook_row.cook_worker_id
    LEFT JOIN accepted_to_preparing_stats AS accepted_stats
      ON accepted_stats.cook_worker_id = cook_row.cook_worker_id
    LEFT JOIN preparing_to_ready_stats AS ready_stats
      ON ready_stats.cook_worker_id = cook_row.cook_worker_id
   ORDER BY cook_row.cook_name, cook_row.cook_worker_id;
$function$;

COMMENT ON FUNCTION public.get_business_cook_performance(uuid, uuid, timestamptz, timestamptz) IS
  'Read-only cook performance report. Range endpoints and status_history event timestamps are UTC; range is start-inclusive/end-exclusive. Each accepted-to-preparing or preparing-to-ready interval is credited to the cook on the event that ends it, even when its start event was written by a manager. Orders handled are distinct per cook and may overlap across cooks. Cancelled orders count as handled when a cook transitioned them, but are excluded from both median samples. Each median is returned with its sample count; a median is NULL when its count is zero. Returns no customer fields. The caller must separately enforce owner/admin/manager tenant access.';

REVOKE ALL ON FUNCTION public.get_business_cook_performance(uuid, uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_business_cook_performance(uuid, uuid, timestamptz, timestamptz)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
