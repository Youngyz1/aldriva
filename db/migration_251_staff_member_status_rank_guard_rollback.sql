-- ============================================================
-- Migration 251 rollback
-- ============================================================

DROP TRIGGER IF EXISTS
  trg_staff_members_guard_status_rank
ON public.staff_members;

DROP FUNCTION IF EXISTS
  public.staff_guard_status_change_rank();

-- HARD CHECK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'staff_members'
      AND t.tgname = 'trg_staff_members_guard_status_rank'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION '251 ROLLBACK FAILED: trigger remains';
  END IF;

  IF to_regprocedure(
    'public.staff_guard_status_change_rank()'
  ) IS NOT NULL THEN
    RAISE EXCEPTION '251 ROLLBACK FAILED: function remains';
  END IF;
END;
$$;