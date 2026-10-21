-- needs owner-run SQL
-- Run after migration 187. Every row must report actual = expected = true.
-- Missing relations/functions are checked through to_regclass() and
-- to_regprocedure(), so absence is reported as false instead of an error.

WITH target_function AS (
  SELECT to_regprocedure(
           'public.get_business_cook_performance(uuid, uuid, timestamp with time zone, timestamp with time zone)'
         ) AS function_oid
),
function_metadata AS (
  SELECT target_function.function_oid,
         procedure_row.prosecdef,
         procedure_row.provolatile,
         procedure_row.proconfig,
         procedure_row.proargnames,
         procedure_row.proowner
    FROM target_function
    LEFT JOIN pg_catalog.pg_proc AS procedure_row
      ON procedure_row.oid = target_function.function_oid
),
checks AS (
  SELECT 'relation public.businesses exists'::text AS check_name,
         to_regclass('public.businesses') IS NOT NULL AS actual,
         true AS expected
  UNION ALL
  SELECT 'relation public.organizers exists',
         to_regclass('public.organizers') IS NOT NULL,
         true
  UNION ALL
  SELECT 'relation public.business_workers exists',
         to_regclass('public.business_workers') IS NOT NULL,
         true
  UNION ALL
  SELECT 'relation public.orders exists',
         to_regclass('public.orders') IS NOT NULL,
         true
  UNION ALL
  SELECT 'function exists',
         function_oid IS NOT NULL,
         true
    FROM function_metadata
  UNION ALL
  SELECT 'function is SECURITY DEFINER',
         COALESCE(prosecdef, false),
         true
    FROM function_metadata
  UNION ALL
  SELECT 'function is STABLE/read-only',
         COALESCE(provolatile = 's', false),
         true
    FROM function_metadata
  UNION ALL
  SELECT 'function has fixed search_path pg_catalog, public',
         COALESCE(proconfig @> ARRAY['search_path=pg_catalog, public']::text[], false),
         true
    FROM function_metadata
  UNION ALL
  SELECT 'function output names contain no customer data',
         COALESCE(
           proargnames = ARRAY[
             'p_business_id', 'p_organizer_id', 'p_range_start', 'p_range_end',
             'cook_worker_id', 'cook_name', 'cook_is_active', 'orders_handled',
             'accepted_to_preparing_n', 'accepted_to_preparing_median_minutes',
             'preparing_to_ready_n', 'preparing_to_ready_median_minutes'
           ]::text[],
           false
         ),
         true
    FROM function_metadata
  UNION ALL
  SELECT 'service_role can execute',
         CASE
           WHEN function_oid IS NULL OR to_regrole('service_role') IS NULL THEN false
           ELSE has_function_privilege('service_role', function_oid, 'EXECUTE')
         END,
         true
    FROM function_metadata
  UNION ALL
  SELECT 'anon cannot execute',
         CASE
           WHEN function_oid IS NULL OR to_regrole('anon') IS NULL THEN false
           ELSE NOT has_function_privilege('anon', function_oid, 'EXECUTE')
         END,
         true
    FROM function_metadata
  UNION ALL
  SELECT 'authenticated cannot execute',
         CASE
           WHEN function_oid IS NULL OR to_regrole('authenticated') IS NULL THEN false
           ELSE NOT has_function_privilege('authenticated', function_oid, 'EXECUTE')
         END,
         true
    FROM function_metadata
  UNION ALL
  SELECT 'PUBLIC has no EXECUTE grant',
         CASE
           WHEN function_oid IS NULL THEN false
           ELSE NOT EXISTS (
             SELECT 1
               FROM pg_catalog.pg_proc AS procedure_row
               CROSS JOIN LATERAL pg_catalog.aclexplode(
                 COALESCE(procedure_row.proacl, pg_catalog.acldefault('f', procedure_row.proowner))
               ) AS privilege_row
              WHERE procedure_row.oid = function_metadata.function_oid
                AND privilege_row.grantee = 0
                AND privilege_row.privilege_type = 'EXECUTE'
           )
         END,
         true
    FROM function_metadata
)
SELECT check_name,
       actual,
       expected,
       actual = expected AS passes
  FROM checks
 ORDER BY check_name;
