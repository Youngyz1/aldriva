-- migration_223_overview_rollups.sql
-- Stage 2: Operational Overview Aggregation RPCs
-- Implements docs/design/dashboard-overview/02-module-contract.md §3.
--
-- Exposes 6 tenant-scoped SECURITY DEFINER rollup functions for dashboard overview:
--   1. overview_sales_rollup
--   2. overview_bookings_rollup
--   3. overview_events_rollup
--   4. overview_donations_rollup
--   5. overview_catalog_counts
--   6. overview_activity_feed
--
-- Security posture:
--   - SECURITY DEFINER, SET search_path = public, pg_temp
--   - Tenant id (organizer_id) enforced on every table scan
--   - REVOKE ALL from PUBLIC, anon, authenticated; GRANT EXECUTE to service_role
--
-- NOT APPLIED (draft for staging deployment).

BEGIN;

-- ── 1. overview_sales_rollup ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.overview_sales_rollup(
  p_organizer_id uuid,
  p_business_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_tz text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_from timestamptz := COALESCE(p_from, '-infinity'::timestamptz);
  v_to timestamptz := COALESCE(p_to, 'infinity'::timestamptz);
BEGIN
  IF p_business_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = p_business_id AND organizer_id = p_organizer_id
    ) THEN
      RAISE EXCEPTION 'BUSINESS_NOT_FOUND_FOR_ORGANIZER';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'total_count', COUNT(*),
    'gross_amount', COALESCE(SUM(total_amount) FILTER (WHERE payment_status <> 'refunded'), 0),
    'collected_amount', COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0),
    'outstanding_amount', COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'unpaid'), 0),
    'refunded_count', COUNT(*) FILTER (WHERE payment_status = 'refunded'),
    'currency', COALESCE(MAX(currency), 'USD')
  )
  INTO v_result
  FROM public.orders
  WHERE organizer_id = p_organizer_id
    AND (p_business_id IS NULL OR business_id = p_business_id)
    AND created_at >= v_from
    AND created_at <= v_to
    AND status <> 'cancelled';

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.overview_sales_rollup FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overview_sales_rollup TO service_role;


-- ── 2. overview_bookings_rollup ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.overview_bookings_rollup(
  p_organizer_id uuid,
  p_business_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_booking_type text[] DEFAULT ARRAY['appointment']::text[],
  p_tz text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_from timestamptz := COALESCE(p_from, '-infinity'::timestamptz);
  v_to timestamptz := COALESCE(p_to, 'infinity'::timestamptz);
BEGIN
  SELECT jsonb_build_object(
    'pending_count', COUNT(*) FILTER (WHERE status = 'pending'),
    'confirmed_count', COUNT(*) FILTER (WHERE status IN ('confirmed', 'seated')),
    'completed_count', COUNT(*) FILTER (WHERE status = 'completed'),
    'no_show_count', COUNT(*) FILTER (WHERE status = 'no_show'),
    'total_count', COUNT(*)
  )
  INTO v_result
  FROM public.reservations
  WHERE organizer_id = p_organizer_id
    AND (p_business_id IS NULL OR business_id = p_business_id)
    AND booking_type = ANY(p_booking_type)
    AND starts_at >= v_from
    AND starts_at <= v_to;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.overview_bookings_rollup FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overview_bookings_rollup TO service_role;


-- ── 3. overview_events_rollup ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.overview_events_rollup(
  p_organizer_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_tz text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'events_count', COUNT(*),
    'events_upcoming', COUNT(*) FILTER (WHERE event_date >= now()),
    'next_event_at', MIN(event_date) FILTER (WHERE event_date >= now())
  )
  INTO v_result
  FROM public.events
  WHERE organizer_id = p_organizer_id
    AND deleted_at IS NULL;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.overview_events_rollup FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overview_events_rollup TO service_role;


-- ── 4. overview_donations_rollup ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.overview_donations_rollup(
  p_organizer_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_tz text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_from timestamptz := COALESCE(p_from, '-infinity'::timestamptz);
  v_to timestamptz := COALESCE(p_to, 'infinity'::timestamptz);
BEGIN
  SELECT jsonb_build_object(
    'total_raised', COALESCE(SUM(d.amount), 0),
    'gift_count', COUNT(d.id),
    'average_gift', CASE WHEN COUNT(d.id) > 0 THEN ROUND(AVG(d.amount), 2) ELSE 0 END,
    'currency', COALESCE(MAX(d.currency), 'USD')
  )
  INTO v_result
  FROM public.donations d
  JOIN public.fundraisers f ON f.id = d.fundraiser_id
  WHERE f.organizer_id = p_organizer_id
    AND d.created_at >= v_from
    AND d.created_at <= v_to
    AND d.status IN ('completed', 'succeeded');

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.overview_donations_rollup FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overview_donations_rollup TO service_role;


-- ── 5. overview_catalog_counts ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.overview_catalog_counts(
  p_organizer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_services_active int := 0;
  v_services_unpriced int := 0;
  v_menu_sections int := 0;
  v_menu_items int := 0;
  v_products_count int := 0;
BEGIN
  IF to_regclass('public.services') IS NOT NULL THEN
    SELECT
      COUNT(*) FILTER (WHERE is_active = true),
      COUNT(*) FILTER (WHERE is_active = true AND price IS NULL)
    INTO v_services_active, v_services_unpriced
    FROM public.services
    WHERE organizer_id = p_organizer_id;
  END IF;

  IF to_regclass('public.menu_sections') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_menu_sections
    FROM public.menu_sections
    WHERE organizer_id = p_organizer_id;
  END IF;

  IF to_regclass('public.menu_items') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_menu_items
    FROM public.menu_items
    WHERE organizer_id = p_organizer_id;
  END IF;

  IF to_regclass('public.products') IS NOT NULL AND to_regclass('public.businesses') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_products_count
    FROM public.products p
    JOIN public.businesses b ON b.id = p.business_id
    WHERE b.organizer_id = p_organizer_id
      AND p.status IN ('active', 'out_of_stock');
  END IF;

  RETURN jsonb_build_object(
    'services_active', v_services_active,
    'services_unpriced', v_services_unpriced,
    'menu_sections', v_menu_sections,
    'menu_items', v_menu_items,
    'products_active', v_products_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.overview_catalog_counts FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overview_catalog_counts TO service_role;


-- ── 6. overview_activity_feed ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.overview_activity_feed(
  p_organizer_id uuid,
  p_limit int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH combined AS (
    SELECT
      'order' AS kind,
      created_at AS at,
      customer_name AS title,
      total_amount AS amount,
      currency
    FROM public.orders
    WHERE organizer_id = p_organizer_id
      AND status <> 'cancelled'

    UNION ALL

    SELECT
      'booking' AS kind,
      starts_at AS at,
      customer_name AS title,
      NULL::numeric AS amount,
      NULL::text AS currency
    FROM public.reservations
    WHERE organizer_id = p_organizer_id
      AND status <> 'cancelled'

    ORDER BY at DESC
    LIMIT p_limit
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'kind', kind,
      'at', at,
      'title', title,
      'amount', amount,
      'currency', currency
    )
  )
  INTO v_result
  FROM combined;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.overview_activity_feed FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overview_activity_feed TO service_role;

COMMIT;
