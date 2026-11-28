-- ============================================================
-- Rollback for migration_237_entity_role_permission_defaults.sql.
-- Statement-by-statement, idempotent, no BEGIN/COMMIT.
-- ============================================================

-- 1. Drop the policy, guarded. Checks the table exists first (via
--    pg_class) before touching pg_policy, so this is safe to run even
--    after the table has already been dropped by a prior, partial
--    rollback run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'entity_role_permission_defaults'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_policy
      WHERE polrelid = 'public.entity_role_permission_defaults'::regclass
        AND polname = 'Authenticated can view entity role permission defaults'
    ) THEN
      DROP POLICY "Authenticated can view entity role permission defaults"
        ON public.entity_role_permission_defaults;
    END IF;
  END IF;
END;
$$;

-- 2. Drop the table.
DROP TABLE IF EXISTS public.entity_role_permission_defaults;
