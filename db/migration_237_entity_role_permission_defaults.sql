-- ============================================================
-- Migration 237: entity-role bridge (entity_role_permission_defaults)
--
-- Seeds a small, read-only reference table mapping two entity_members
-- roles ('editor', 'finance') to the staff_permissions keys they
-- default to. Nothing in this migration grants anything directly --
-- it only seeds the lookup table itself.
--
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT.
-- Every statement is idempotent and safe to re-run after a partial
-- application.
-- ============================================================

-- 0. PREFLIGHT (read-only). Fails if public.staff_permissions does not
--    exist -- this table's whole purpose is to reference keys that
--    live there, so there is nothing meaningful to seed without it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'staff_permissions'
  ) THEN
    RAISE EXCEPTION 'public.staff_permissions does not exist -- aborting migration 237';
  END IF;
END;
$$;

-- 1. Create the table if it does not already exist.
CREATE TABLE IF NOT EXISTS public.entity_role_permission_defaults (
  entity_role text PRIMARY KEY CHECK (entity_role IN ('editor', 'finance')),
  permission_keys text[] NOT NULL
);

-- 2. Enable row level security. Idempotent: re-enabling an already
--    enabled table is a no-op, not an error.
ALTER TABLE public.entity_role_permission_defaults ENABLE ROW LEVEL SECURITY;

-- 3. SELECT policy for authenticated, guarded by name so a re-run does
--    not try to create a duplicate policy. No write policies: this
--    table is seeded only by this migration file, never by the app.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.entity_role_permission_defaults'::regclass
      AND polname = 'Authenticated can view entity role permission defaults'
  ) THEN
    CREATE POLICY "Authenticated can view entity role permission defaults"
      ON public.entity_role_permission_defaults
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END;
$$;

-- 4. Seed the editor row. Idempotent: ON CONFLICT DO NOTHING.
INSERT INTO public.entity_role_permission_defaults (entity_role, permission_keys)
VALUES (
  'editor',
  ARRAY[
    'business.view',
    'business.branches.view',
    'customers.view',
    'customers.update',
    'reservations.view',
    'reservations.create',
    'reservations.update',
    'reservations.cancel',
    'reservations.check_in',
    'products.view',
    'products.manage',
    'inventory.view',
    'orders.view',
    'orders.create',
    'orders.update',
    'communications.view',
    'communications.send'
  ]::text[]
)
ON CONFLICT (entity_role) DO NOTHING;

-- 5. Seed the finance row. Idempotent: ON CONFLICT DO NOTHING.
INSERT INTO public.entity_role_permission_defaults (entity_role, permission_keys)
VALUES (
  'finance',
  ARRAY[
    'business.view',
    'finance.view',
    'finance.transactions.view',
    'finance.refunds.manage',
    'finance.expenses.manage',
    'finance.reports.view',
    'finance.reports.export',
    'reports.view',
    'reports.export',
    'analytics.view'
  ]::text[]
)
ON CONFLICT (entity_role) DO NOTHING;
