-- ============================================================
-- Companion verification for migration_280_function_grant_hardening.sql.
-- Read-only. Run AFTER the forward migration.
-- ============================================================

-- 1. check_email_pending_deletion(text): anon/authenticated false, service_role true.
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_exec
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'check_email_pending_deletion';
-- Expect 1 row: false / false / true.

-- 2. reserve_seats_atomic(uuid[], int): anon/authenticated false, service_role true.
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_exec
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'reserve_seats_atomic';
-- Expect 1 row: false / false / true.

-- 3. assign_seat_to_invitation_atomic(uuid, uuid, uuid): anon/authenticated false, service_role true.
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_exec
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'assign_seat_to_invitation_atomic';
-- Expect 1 row: false / false / true.

-- 4. ensure_business_organizer(businesses): anon false, authenticated true (trigger path), service_role true.
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_exec
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'ensure_business_organizer';
-- Expect 1 row: false / true / true.

-- 5. Full proacl dump for all four, for a human-readable spot check alongside 1-4.
SELECT p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid) AS args, p.proacl
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'check_email_pending_deletion',
    'reserve_seats_atomic',
    'assign_seat_to_invitation_atomic',
    'ensure_business_organizer'
  )
ORDER BY p.proname;
-- Expect no PUBLIC entry (=*) on any row; ensure_business_organizer is the
-- only row with an authenticated=X entry; service_role=X on every row.

-- 6. ensure_business_organizer guard is present in the function body (static check).
SELECT p.prosrc LIKE '%auth.role() <> ''service_role''%'
       AND p.prosrc LIKE '%business_row.owner_id IS DISTINCT FROM auth.uid()%' AS has_owner_guard
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'ensure_business_organizer';
-- Expect true.

-- 7. reserve_seats_atomic bounds are present in the function body (static check).
SELECT p.prosrc LIKE '%TOO_MANY_SEATS%' AS rejects_over_20_seats,
       p.prosrc LIKE '%LEAST(GREATEST(p_hold_duration_minutes, 1), 15)%' AS clamps_hold_duration
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'reserve_seats_atomic';
-- Expect true / true.
