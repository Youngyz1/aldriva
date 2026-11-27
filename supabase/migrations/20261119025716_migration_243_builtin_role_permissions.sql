-- ============================================================
-- Migration 243: built-in role permissions (the 4 seeded platform roles)
--
-- ADDITIVE ONLY: no existing grant is removed or changed.
--   owner   : all 62 keys   (was 12: workforce.* + reports.view)
--   admin   : all 62 keys   (was 12)
--   manager : 50 keys       (was 9)   -- everything operational
--   viewer  : 12 keys       (was 2)   -- read-only
--
-- manager does NOT get (12): finance.* (6), reports.export, business.update,
--   business.settings.manage, business.branches.manage,
--   workforce.roles.manage, workforce.permissions.assign.
-- Invariant kept: viewer is a subset of manager, manager of admin, admin = owner.
-- (Entity owners/admins pass every check without keys; these lists matter for
--  entity managers/viewers and for staff-layer members holding these roles.)
-- The 14 UI "templates" are NOT built here: they live in app code.
--
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT.
-- Every statement is idempotent (ON CONFLICT DO NOTHING).
-- Each new grant writes one audit row (migration 242) with no actor and no
-- business (platform roles): expect 151 rows.
-- ============================================================

-- 0. PREFLIGHT: the 4 roles exist, the catalogue is exactly the 62 keys this
--    migration was written against, and every key named below exists and is active.
DO $$
DECLARE
  v_missing text;
BEGIN
  IF (SELECT count(*) FROM public.staff_roles
      WHERE role_scope = 'platform' AND is_active
        AND platform_role IN ('owner','admin','manager','viewer')) <> 4 THEN
    RAISE EXCEPTION 'the 4 seeded platform roles are not all present and active -- aborting 243';
  END IF;

  IF (SELECT count(*) FROM public.staff_permissions WHERE is_active) <> 62 THEN
    RAISE EXCEPTION 'expected exactly 62 active permission keys -- the catalogue changed, re-review 243';
  END IF;

  SELECT string_agg(k, ', ') INTO v_missing
  FROM unnest(ARRAY[
    'workforce.view','workforce.update','workforce.invite','workforce.deactivate','workforce.roles.view',
    'workforce.schedules.manage','workforce.assignments.manage','workforce.attendance.view','workforce.attendance.manage',
    'reports.view','analytics.view','business.view','business.branches.view','customers.view','customers.update',
    'reservations.view','reservations.create','reservations.update','reservations.cancel','reservations.check_in','reservations.manage',
    'products.view','products.manage','inventory.view','inventory.manage',
    'orders.view','orders.create','orders.update','orders.cancel','orders.fulfill',
    'communications.view','communications.send','communications.manage',
    'rental.bookings.manage','rental.vehicles.manage','rental.inspections.manage','rental.equipment.manage','rental.maintenance.manage',
    'delivery.view','delivery.assign','delivery.update_status',
    'services.manage','services.appointments.manage',
    'events.manage','events.tickets.scan','events.check_in.manage',
    'hospitality.rooms.manage','hospitality.guest_check_in',
    'restaurant.menu.manage','restaurant.kitchen.manage'
  ]) AS k
  WHERE NOT EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.key = k AND sp.is_active);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'manager key list names keys that do not exist or are inactive: % -- aborting 243', v_missing;
  END IF;

  SELECT string_agg(k, ', ') INTO v_missing
  FROM unnest(ARRAY[
    'workforce.view','reports.view','business.view','business.branches.view','customers.view','reservations.view',
    'products.view','inventory.view','orders.view','communications.view','delivery.view','analytics.view'
  ]) AS k
  WHERE NOT EXISTS (SELECT 1 FROM public.staff_permissions sp WHERE sp.key = k AND sp.is_active);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'viewer key list names keys that do not exist or are inactive: % -- aborting 243', v_missing;
  END IF;
END;
$$;

-- 1. owner and admin: every active key.
INSERT INTO public.staff_role_permissions (role_id, permission_id)
SELECT sr.id, sp.id
FROM public.staff_roles sr
CROSS JOIN public.staff_permissions sp
WHERE sr.role_scope = 'platform'
  AND sr.platform_role IN ('owner','admin')
  AND sp.is_active
ON CONFLICT DO NOTHING;

-- 2. manager: the 50 operational keys.
INSERT INTO public.staff_role_permissions (role_id, permission_id)
SELECT sr.id, sp.id
FROM public.staff_roles sr
JOIN public.staff_permissions sp ON sp.is_active AND sp.key = ANY (ARRAY[
    'workforce.view','workforce.update','workforce.invite','workforce.deactivate','workforce.roles.view',
    'workforce.schedules.manage','workforce.assignments.manage','workforce.attendance.view','workforce.attendance.manage',
    'reports.view','analytics.view','business.view','business.branches.view','customers.view','customers.update',
    'reservations.view','reservations.create','reservations.update','reservations.cancel','reservations.check_in','reservations.manage',
    'products.view','products.manage','inventory.view','inventory.manage',
    'orders.view','orders.create','orders.update','orders.cancel','orders.fulfill',
    'communications.view','communications.send','communications.manage',
    'rental.bookings.manage','rental.vehicles.manage','rental.inspections.manage','rental.equipment.manage','rental.maintenance.manage',
    'delivery.view','delivery.assign','delivery.update_status',
    'services.manage','services.appointments.manage',
    'events.manage','events.tickets.scan','events.check_in.manage',
    'hospitality.rooms.manage','hospitality.guest_check_in',
    'restaurant.menu.manage','restaurant.kitchen.manage'
  ])
WHERE sr.role_scope = 'platform' AND sr.platform_role = 'manager'
ON CONFLICT DO NOTHING;

-- 3. viewer: the 12 read-only keys.
INSERT INTO public.staff_role_permissions (role_id, permission_id)
SELECT sr.id, sp.id
FROM public.staff_roles sr
JOIN public.staff_permissions sp ON sp.is_active AND sp.key = ANY (ARRAY[
    'workforce.view','reports.view','business.view','business.branches.view','customers.view','reservations.view',
    'products.view','inventory.view','orders.view','communications.view','delivery.view','analytics.view'
  ])
WHERE sr.role_scope = 'platform' AND sr.platform_role = 'viewer'
ON CONFLICT DO NOTHING;

-- 4. HARD CHECK: counts and the subset chain viewer <= manager <= admin = owner.
DO $$
DECLARE
  v_owner int; v_admin int; v_manager int; v_viewer int; v_bad int;
BEGIN
  SELECT count(*) INTO v_owner FROM public.staff_role_permissions srp
    JOIN public.staff_roles sr ON sr.id = srp.role_id WHERE sr.role_scope='platform' AND sr.platform_role='owner';
  SELECT count(*) INTO v_admin FROM public.staff_role_permissions srp
    JOIN public.staff_roles sr ON sr.id = srp.role_id WHERE sr.role_scope='platform' AND sr.platform_role='admin';
  SELECT count(*) INTO v_manager FROM public.staff_role_permissions srp
    JOIN public.staff_roles sr ON sr.id = srp.role_id WHERE sr.role_scope='platform' AND sr.platform_role='manager';
  SELECT count(*) INTO v_viewer FROM public.staff_role_permissions srp
    JOIN public.staff_roles sr ON sr.id = srp.role_id WHERE sr.role_scope='platform' AND sr.platform_role='viewer';

  IF v_owner <> 62 OR v_admin <> 62 OR v_manager <> 50 OR v_viewer <> 12 THEN
    RAISE EXCEPTION 'unexpected counts: owner %, admin %, manager %, viewer % (expected 62/62/50/12)',
      v_owner, v_admin, v_manager, v_viewer;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.staff_role_permissions v
  JOIN public.staff_roles vr ON vr.id = v.role_id AND vr.role_scope='platform' AND vr.platform_role='viewer'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.staff_role_permissions m
    JOIN public.staff_roles mr ON mr.id = m.role_id AND mr.role_scope='platform' AND mr.platform_role='manager'
    WHERE m.permission_id = v.permission_id);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'viewer holds % key(s) that manager does not -- subset chain broken', v_bad;
  END IF;
END;
$$;