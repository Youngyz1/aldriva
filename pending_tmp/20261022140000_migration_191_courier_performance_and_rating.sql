-- Migration 191: Courier delivery performance RPC + customer delivery rating.
-- Supabase mirror of db/migration_191_courier_performance_and_rating.sql
-- Owner applies this SQL manually via Supabase SQL Editor.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- § 1. Customer delivery rating columns on orders
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_rating smallint
    CONSTRAINT orders_delivery_rating_range CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
  ADD COLUMN IF NOT EXISTS delivery_rating_comment text
    CONSTRAINT orders_delivery_rating_comment_length CHECK (char_length(delivery_rating_comment) <= 500);

COMMENT ON COLUMN public.orders.delivery_rating IS
  '1–5 star rating of the delivery experience, set by the customer after delivery.';
COMMENT ON COLUMN public.orders.delivery_rating_comment IS
  'Optional free-text comment accompanying the delivery rating (max 500 chars).';

-- ═══════════════════════════════════════════════════════════════════════════
-- § 2. Courier delivery performance RPC
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_business_courier_performance(
  p_business_id uuid,
  p_organizer_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz
)
RETURNS TABLE (
  courier_worker_id uuid,
  courier_name text,
  courier_is_active boolean,
  deliveries_completed bigint,
  ready_to_delivered_n bigint,
  ready_to_delivered_median_minutes double precision,
  picked_up_to_delivered_n bigint,
  picked_up_to_delivered_median_minutes double precision,
  average_delivery_rating double precision,
  rating_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH requested_scope AS (
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
  couriers AS (
    SELECT worker_row.id AS courier_worker_id,
           worker_row.full_name AS courier_name,
           (worker_row.is_active AND worker_row.deactivated_at IS NULL) AS courier_is_active
      FROM public.business_workers AS worker_row
      JOIN requested_scope AS scope_row
        ON scope_row.scoped_business_id = worker_row.business_id
     WHERE worker_row.role = 'courier'
  ),
  scoped_orders AS (
    SELECT order_row.id AS order_id,
           order_row.business_id,
           order_row.status AS current_order_status,
           order_row.status_history,
           order_row.courier_worker_id,
           order_row.delivery_rating
      FROM public.orders AS order_row
      JOIN requested_scope AS scope_row
        ON scope_row.scoped_business_id = order_row.business_id
       AND scope_row.scoped_organizer_id = order_row.organizer_id
     WHERE order_row.courier_worker_id IS NOT NULL
  ),
  event_source AS (
    SELECT order_row.order_id,
           order_row.business_id,
           order_row.current_order_status,
           order_row.courier_worker_id,
           order_row.delivery_rating,
           history_row.ordinality::bigint AS event_ordinal,
           history_row.event_json,
           history_row.event_json ->> 'status' AS event_status,
           history_row.event_json ->> 'at' AS event_at_text
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
           event_row.courier_worker_id,
           event_row.delivery_rating,
           event_row.event_ordinal,
           event_row.event_status,
           CASE
             WHEN event_row.event_at_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
               THEN event_row.event_at_text::timestamptz
             ELSE NULL::timestamptz
           END AS event_at
      FROM event_source AS event_row
  ),
  delivery_counts AS (
    SELECT event_row.courier_worker_id,
           count(DISTINCT event_row.order_id)::bigint AS deliveries_completed
      FROM parsed_events AS event_row
     WHERE event_row.event_status = 'delivered'
       AND event_row.event_at >= p_range_start
       AND event_row.event_at < p_range_end
     GROUP BY event_row.courier_worker_id
  ),
  ready_to_delivered_intervals AS (
    SELECT ending_event.courier_worker_id,
           extract(epoch FROM (ending_event.event_at - start_event.event_at))::double precision
             / 60.0::double precision AS duration_minutes
      FROM parsed_events AS ending_event
      CROSS JOIN LATERAL (
        SELECT preceding_event.event_at
          FROM parsed_events AS preceding_event
         WHERE preceding_event.order_id = ending_event.order_id
           AND preceding_event.event_ordinal < ending_event.event_ordinal
           AND preceding_event.event_status = 'ready'
           AND preceding_event.event_at IS NOT NULL
         ORDER BY preceding_event.event_ordinal DESC
         LIMIT 1
      ) AS start_event
     WHERE ending_event.event_status = 'delivered'
       AND ending_event.event_at IS NOT NULL
       AND ending_event.event_at >= p_range_start
       AND ending_event.event_at < p_range_end
       AND start_event.event_at <= ending_event.event_at
  ),
  picked_up_to_delivered_intervals AS (
    SELECT ending_event.courier_worker_id,
           extract(epoch FROM (ending_event.event_at - start_event.event_at))::double precision
             / 60.0::double precision AS duration_minutes
      FROM parsed_events AS ending_event
      CROSS JOIN LATERAL (
        SELECT preceding_event.event_at
          FROM parsed_events AS preceding_event
         WHERE preceding_event.order_id = ending_event.order_id
           AND preceding_event.event_ordinal < ending_event.event_ordinal
           AND preceding_event.event_status = 'picked_up'
           AND preceding_event.event_at IS NOT NULL
         ORDER BY preceding_event.event_ordinal DESC
         LIMIT 1
      ) AS start_event
     WHERE ending_event.event_status = 'delivered'
       AND ending_event.event_at IS NOT NULL
       AND ending_event.event_at >= p_range_start
       AND ending_event.event_at < p_range_end
       AND start_event.event_at <= ending_event.event_at
  ),
  ready_to_delivered_stats AS (
    SELECT interval_row.courier_worker_id,
           count(*)::bigint AS sample_n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY interval_row.duration_minutes)
             AS median_minutes
      FROM ready_to_delivered_intervals AS interval_row
     GROUP BY interval_row.courier_worker_id
  ),
  picked_up_to_delivered_stats AS (
    SELECT interval_row.courier_worker_id,
           count(*)::bigint AS sample_n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY interval_row.duration_minutes)
             AS median_minutes
      FROM picked_up_to_delivered_intervals AS interval_row
     GROUP BY interval_row.courier_worker_id
  ),
  rating_stats AS (
    SELECT order_row.courier_worker_id,
           round(avg(order_row.delivery_rating)::numeric, 2)::double precision AS average_rating,
           count(order_row.delivery_rating)::bigint AS rating_count
      FROM scoped_orders AS order_row
     WHERE order_row.delivery_rating IS NOT NULL
     GROUP BY order_row.courier_worker_id
  )
  SELECT courier_row.courier_worker_id,
         courier_row.courier_name,
         courier_row.courier_is_active,
         COALESCE(delivery_row.deliveries_completed, 0::bigint) AS deliveries_completed,
         COALESCE(ready_stats.sample_n, 0::bigint) AS ready_to_delivered_n,
         ready_stats.median_minutes AS ready_to_delivered_median_minutes,
         COALESCE(transit_stats.sample_n, 0::bigint) AS picked_up_to_delivered_n,
         transit_stats.median_minutes AS picked_up_to_delivered_median_minutes,
         rating_stats_row.average_rating AS average_delivery_rating,
         COALESCE(rating_stats_row.rating_count, 0::bigint) AS rating_count
    FROM couriers AS courier_row
    LEFT JOIN delivery_counts AS delivery_row
      ON delivery_row.courier_worker_id = courier_row.courier_worker_id
    LEFT JOIN ready_to_delivered_stats AS ready_stats
      ON ready_stats.courier_worker_id = courier_row.courier_worker_id
    LEFT JOIN picked_up_to_delivered_stats AS transit_stats
      ON transit_stats.courier_worker_id = courier_row.courier_worker_id
    LEFT JOIN rating_stats AS rating_stats_row
      ON rating_stats_row.courier_worker_id = courier_row.courier_worker_id
   ORDER BY courier_row.courier_name, courier_row.courier_worker_id;
$function$;

COMMENT ON FUNCTION public.get_business_courier_performance(uuid, uuid, timestamptz, timestamptz) IS
  'Read-only courier delivery performance report. Range is start-inclusive/end-exclusive UTC. Computes deliveries completed, median ready-to-delivered and picked_up-to-delivered intervals, plus all-time average delivery rating per courier. Each median is returned with its sample count. Returns no customer fields. Caller must separately enforce owner/admin/manager tenant access.';

REVOKE ALL ON FUNCTION public.get_business_courier_performance(uuid, uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_business_courier_performance(uuid, uuid, timestamptz, timestamptz)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
