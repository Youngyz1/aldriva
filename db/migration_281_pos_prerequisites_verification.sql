-- migration_281_pos_prerequisites_verification.sql
-- DRAFT ONLY. Read-only verification for migration_281_pos_prerequisites.sql.
-- One result set; every row should have ok = true.

SELECT 'domain CHECK includes all 20 values and count is 20' AS check_name,
  (
    SELECT
      pg_get_constraintdef(c.oid) LIKE '%''business''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''workforce''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''customers''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''reservations''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''products''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''inventory''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''orders''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''finance''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''reports''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''analytics''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''communications''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''rental''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''delivery''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''services''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''events''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''hospitality''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''restaurant''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''supply''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''pos''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''loyalty''%'
      AND (SELECT count(*) FROM regexp_matches(pg_get_constraintdef(c.oid), '''[a-z_]+''', 'g')) = 20
    FROM pg_constraint c
    WHERE c.conrelid = 'public.staff_permissions'::regclass
      AND c.conname = 'staff_permissions_domain_check'
  ) AS ok

UNION ALL SELECT 'old 7-arg inventory_apply_movement is absent',
  to_regprocedure('public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric)') IS NULL

UNION ALL SELECT '9-arg wrapper exists',
  to_regprocedure('public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)') IS NOT NULL

UNION ALL SELECT 'core exists (9 args, no p_actor_user_id)',
  to_regprocedure('public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)') IS NOT NULL

UNION ALL SELECT 'wrapper is SECURITY DEFINER',
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure)

UNION ALL SELECT 'core is SECURITY DEFINER',
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure)

UNION ALL SELECT 'wrapper has pinned search_path',
  (SELECT proconfig::text LIKE '%search_path=pg_catalog, public, pg_temp%'
   FROM pg_proc WHERE oid='public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure)

UNION ALL SELECT 'core has pinned search_path',
  (SELECT proconfig::text LIKE '%search_path=pg_catalog, public, pg_temp%'
   FROM pg_proc WHERE oid='public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure)

UNION ALL SELECT 'wrapper executable by authenticated',
  has_function_privilege('authenticated','public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)','EXECUTE')

UNION ALL SELECT 'wrapper executable by service_role',
  has_function_privilege('service_role','public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)','EXECUTE')

UNION ALL SELECT 'wrapper not executable by anon',
  NOT has_function_privilege('anon','public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)','EXECUTE')

UNION ALL SELECT 'wrapper not executable by PUBLIC (aclexplode grantee 0)',
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = 'public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  )

UNION ALL SELECT 'core not executable by anon',
  NOT has_function_privilege('anon','public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)','EXECUTE')

UNION ALL SELECT 'core not executable by authenticated',
  NOT has_function_privilege('authenticated','public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)','EXECUTE')

UNION ALL SELECT 'core not executable by service_role',
  NOT has_function_privilege('service_role','public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)','EXECUTE')

UNION ALL SELECT 'core not executable by PUBLIC (aclexplode grantee 0)',
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = 'public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  )

UNION ALL SELECT 'core/wrapper owner is same (postgres expected)',
  (
    SELECT pg_get_userbyid(p1.proowner) = pg_get_userbyid(p2.proowner)
       AND pg_get_userbyid(p1.proowner) = 'postgres'
    FROM pg_proc p1, pg_proc p2
    WHERE p1.oid='public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure
      AND p2.oid='public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure
  )

UNION ALL SELECT 'wrapper delegates to core',
  (
    SELECT prosrc ILIKE '%inventory_apply_movement_core%'
    FROM pg_proc WHERE oid='public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure
  )

UNION ALL SELECT 'core body contains FOR SHARE on location row',
  (
    SELECT prosrc ILIKE '%FOR SHARE%'
    FROM pg_proc WHERE oid='public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure
  )

UNION ALL SELECT 'core writes reference_type/reference_id to inventory_movements',
  (
    SELECT prosrc ILIKE '%reference_type%' AND prosrc ILIKE '%reference_id%'
    FROM pg_proc WHERE oid='public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure
  )

UNION ALL SELECT 'core records actor from auth.uid() (no p_actor_user_id param)',
  (
    SELECT prosrc ILIKE '%v_actor := auth.uid()%'
       AND prosrc NOT ILIKE '%p_actor_user_id%'
    FROM pg_proc WHERE oid='public.inventory_apply_movement_core(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure
  )

UNION ALL SELECT 'wrapper enforces reference_type allow-list',
  (
    SELECT prosrc ILIKE '%inventory_reference_forbidden%' AND prosrc ILIKE '%v_allowed%'
    FROM pg_proc WHERE oid='public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)'::regprocedure
  )

UNION ALL SELECT 'inventory_transfer_stock still exists',
  to_regprocedure('public.inventory_transfer_stock(uuid,uuid,uuid,uuid,numeric,text)') IS NOT NULL

UNION ALL SELECT 'inventory_transfer_stock executable by authenticated',
  has_function_privilege('authenticated','public.inventory_transfer_stock(uuid,uuid,uuid,uuid,numeric,text)','EXECUTE')

UNION ALL SELECT 'inventory_transfer_stock executable by service_role',
  has_function_privilege('service_role','public.inventory_transfer_stock(uuid,uuid,uuid,uuid,numeric,text)','EXECUTE')

UNION ALL SELECT 'inventory_transfer_stock not executable by anon',
  NOT has_function_privilege('anon','public.inventory_transfer_stock(uuid,uuid,uuid,uuid,numeric,text)','EXECUTE')

UNION ALL SELECT 'inventory_transfer_stock not executable by PUBLIC (aclexplode grantee 0)',
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = 'public.inventory_transfer_stock(uuid,uuid,uuid,uuid,numeric,text)'::regprocedure
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  );
