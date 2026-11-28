-- 254 rollback: drops the trigger and function. Idempotent. 253 policies untouched.
DROP TRIGGER IF EXISTS trg_staff_member_branch_scopes_guard_escalation ON public.staff_member_branch_scopes;
DROP FUNCTION IF EXISTS public.staff_member_branch_scopes_guard_escalation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger
             WHERE tgrelid = 'public.staff_member_branch_scopes'::regclass
               AND tgname = 'trg_staff_member_branch_scopes_guard_escalation')
     OR to_regprocedure('public.staff_member_branch_scopes_guard_escalation()') IS NOT NULL THEN
    RAISE EXCEPTION '254 ROLLBACK CHECK FAILED: guard still present';
  END IF;
END
$$;