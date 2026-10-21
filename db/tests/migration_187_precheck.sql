-- needs owner-run SQL
-- Run before migration 187. Expected: every required relation and column is
-- present, and the migration 187 function is absent on a first application.
-- to_regclass() and to_regprocedure() return NULL for missing objects.

WITH checks AS (
  SELECT 'relation public.businesses'::text AS check_name,
         to_regclass('public.businesses') IS NOT NULL AS actual,
         true AS expected
  UNION ALL
  SELECT 'relation public.organizers',
         to_regclass('public.organizers') IS NOT NULL,
         true
  UNION ALL
  SELECT 'relation public.business_workers',
         to_regclass('public.business_workers') IS NOT NULL,
         true
  UNION ALL
  SELECT 'relation public.orders',
         to_regclass('public.orders') IS NOT NULL,
         true
  UNION ALL
  SELECT 'column businesses.organizer_id',
         to_regclass('public.businesses') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM pg_catalog.pg_attribute
              WHERE attrelid = to_regclass('public.businesses')
                AND attname = 'organizer_id'
                AND attnum > 0
                AND NOT attisdropped
           ),
         true
  UNION ALL
  SELECT 'column orders.business_id',
         to_regclass('public.orders') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM pg_catalog.pg_attribute
              WHERE attrelid = to_regclass('public.orders')
                AND attname = 'business_id'
                AND attnum > 0
                AND NOT attisdropped
           ),
         true
  UNION ALL
  SELECT 'column orders.organizer_id',
         to_regclass('public.orders') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM pg_catalog.pg_attribute
              WHERE attrelid = to_regclass('public.orders')
                AND attname = 'organizer_id'
                AND attnum > 0
                AND NOT attisdropped
           ),
         true
  UNION ALL
  SELECT 'column orders.status',
         to_regclass('public.orders') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM pg_catalog.pg_attribute
              WHERE attrelid = to_regclass('public.orders')
                AND attname = 'status'
                AND attnum > 0
                AND NOT attisdropped
           ),
         true
  UNION ALL
  SELECT 'column orders.status_history',
         to_regclass('public.orders') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM pg_catalog.pg_attribute
              WHERE attrelid = to_regclass('public.orders')
                AND attname = 'status_history'
                AND attnum > 0
                AND NOT attisdropped
           ),
         true
  UNION ALL
  SELECT 'columns business_workers.id/business_id/role/full_name/is_active/deactivated_at',
         to_regclass('public.business_workers') IS NOT NULL
           AND NOT EXISTS (
             SELECT required.attname
               FROM (VALUES ('id'), ('business_id'), ('role'), ('full_name'), ('is_active'), ('deactivated_at')) AS required(attname)
              WHERE NOT EXISTS (
                SELECT 1 FROM pg_catalog.pg_attribute AS actual_column
                 WHERE actual_column.attrelid = to_regclass('public.business_workers')
                   AND actual_column.attname = required.attname
                   AND actual_column.attnum > 0
                   AND NOT actual_column.attisdropped
              )
           ),
         true
  UNION ALL
  SELECT 'function public.get_business_cook_performance(uuid,uuid,timestamptz,timestamptz) absent before first apply',
         to_regprocedure('public.get_business_cook_performance(uuid, uuid, timestamp with time zone, timestamp with time zone)') IS NOT NULL,
         false
)
SELECT check_name,
       actual,
       expected,
       actual = expected AS passes
  FROM checks
 ORDER BY check_name;
