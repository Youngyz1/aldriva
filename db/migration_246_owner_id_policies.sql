-- Migration 246: additive RLS for businesses.owner_id (no existing policy is changed).
-- Postgres ORs permissive policies, so this can only widen access, and only to the
-- user who is businesses.owner_id. Triggers from 238/239/240/241 still fire.
-- Applied by hand, one numbered statement at a time. No BEGIN/COMMIT. Idempotent.

-- 0. PREFLIGHT
DO $$
BEGIN
  IF to_regclass('public.businesses') IS NULL
     OR to_regclass('public.staff_members') IS NULL
     OR to_regclass('public.staff_member_roles') IS NULL
     OR to_regclass('public.staff_invitations') IS NULL
     OR to_regclass('public.staff_member_branch_scopes') IS NULL
     OR to_regclass('public.staff_roles') IS NULL
     OR to_regclass('public.staff_role_permissions') IS NULL
     OR to_regclass('public.staff_audit_logs') IS NULL
     OR to_regclass('public.staff_permission_check_logs') IS NULL THEN
    RAISE EXCEPTION 'a required table is missing -- aborting 246';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='businesses' AND column_name='owner_id') THEN
    RAISE EXCEPTION 'businesses.owner_id missing -- aborting 246';
  END IF;
END;
$$;

-- 1. staff_members
DROP POLICY IF EXISTS "Business owner can read staff members" ON public.staff_members;
CREATE POLICY "Business owner can read staff members" ON public.staff_members
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_members.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can create staff members" ON public.staff_members;
CREATE POLICY "Business owner can create staff members" ON public.staff_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_members.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can update staff members" ON public.staff_members;
CREATE POLICY "Business owner can update staff members" ON public.staff_members
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_members.business_id AND b.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_members.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can delete staff members" ON public.staff_members;
CREATE POLICY "Business owner can delete staff members" ON public.staff_members
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_members.business_id AND b.owner_id = (SELECT auth.uid())));

-- 2. staff_member_roles
DROP POLICY IF EXISTS "Business owner can read staff member roles" ON public.staff_member_roles;
CREATE POLICY "Business owner can read staff member roles" ON public.staff_member_roles
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_member_roles.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can assign staff member roles" ON public.staff_member_roles;
CREATE POLICY "Business owner can assign staff member roles" ON public.staff_member_roles
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_member_roles.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can update staff member roles" ON public.staff_member_roles;
CREATE POLICY "Business owner can update staff member roles" ON public.staff_member_roles
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_member_roles.business_id AND b.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_member_roles.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can remove staff member roles" ON public.staff_member_roles;
CREATE POLICY "Business owner can remove staff member roles" ON public.staff_member_roles
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_member_roles.business_id AND b.owner_id = (SELECT auth.uid())));

-- 3. staff_invitations (INSERT keeps the pending/unaccepted check)
DROP POLICY IF EXISTS "Business owner can read staff invitations" ON public.staff_invitations;
CREATE POLICY "Business owner can read staff invitations" ON public.staff_invitations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_invitations.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can create staff invitations" ON public.staff_invitations;
CREATE POLICY "Business owner can create staff invitations" ON public.staff_invitations
  FOR INSERT TO authenticated
  WITH CHECK (status = 'pending' AND accepted_by IS NULL AND accepted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_invitations.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can update staff invitations" ON public.staff_invitations;
CREATE POLICY "Business owner can update staff invitations" ON public.staff_invitations
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_invitations.business_id AND b.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_invitations.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can revoke staff invitations" ON public.staff_invitations;
CREATE POLICY "Business owner can revoke staff invitations" ON public.staff_invitations
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_invitations.business_id AND b.owner_id = (SELECT auth.uid())));

-- 4. staff_member_branch_scopes
DROP POLICY IF EXISTS "Business owner can read staff branch scopes" ON public.staff_member_branch_scopes;
CREATE POLICY "Business owner can read staff branch scopes" ON public.staff_member_branch_scopes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_member_branch_scopes.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can grant staff branch scopes" ON public.staff_member_branch_scopes;
CREATE POLICY "Business owner can grant staff branch scopes" ON public.staff_member_branch_scopes
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_member_branch_scopes.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can move staff branch scopes" ON public.staff_member_branch_scopes;
CREATE POLICY "Business owner can move staff branch scopes" ON public.staff_member_branch_scopes
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_member_branch_scopes.business_id AND b.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_member_branch_scopes.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can revoke staff branch scopes" ON public.staff_member_branch_scopes;
CREATE POLICY "Business owner can revoke staff branch scopes" ON public.staff_member_branch_scopes
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_member_branch_scopes.business_id AND b.owner_id = (SELECT auth.uid())));

-- 5. staff_roles (business-scope only: never the seeded platform roles)
DROP POLICY IF EXISTS "Business owner can read custom staff roles" ON public.staff_roles;
CREATE POLICY "Business owner can read custom staff roles" ON public.staff_roles
  FOR SELECT TO authenticated
  USING (role_scope = 'business' AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_roles.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can create custom staff roles" ON public.staff_roles;
CREATE POLICY "Business owner can create custom staff roles" ON public.staff_roles
  FOR INSERT TO authenticated
  WITH CHECK (role_scope = 'business' AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_roles.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can update custom staff roles" ON public.staff_roles;
CREATE POLICY "Business owner can update custom staff roles" ON public.staff_roles
  FOR UPDATE TO authenticated
  USING (role_scope = 'business' AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_roles.business_id AND b.owner_id = (SELECT auth.uid())))
  WITH CHECK (role_scope = 'business' AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_roles.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can delete custom staff roles" ON public.staff_roles;
CREATE POLICY "Business owner can delete custom staff roles" ON public.staff_roles
  FOR DELETE TO authenticated
  USING (role_scope = 'business' AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_roles.business_id AND b.owner_id = (SELECT auth.uid())));

-- 6. staff_role_permissions (custom roles of businesses they own)
DROP POLICY IF EXISTS "Business owner can map permissions to custom roles" ON public.staff_role_permissions;
CREATE POLICY "Business owner can map permissions to custom roles" ON public.staff_role_permissions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff_roles sr JOIN public.businesses b ON b.id = sr.business_id
                 WHERE sr.id = staff_role_permissions.role_id AND sr.role_scope = 'business' AND b.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff_roles sr JOIN public.businesses b ON b.id = sr.business_id
                 WHERE sr.id = staff_role_permissions.role_id AND sr.role_scope = 'business' AND b.owner_id = (SELECT auth.uid())));

-- 7. Log read parity (242 and 244 already admit entity owner/admin/manager and platform admin)
DROP POLICY IF EXISTS "Business owner can read staff audit logs" ON public.staff_audit_logs;
CREATE POLICY "Business owner can read staff audit logs" ON public.staff_audit_logs
  FOR SELECT TO authenticated
  USING (business_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_audit_logs.business_id AND b.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Business owner can read staff permission check logs" ON public.staff_permission_check_logs;
CREATE POLICY "Business owner can read staff permission check logs" ON public.staff_permission_check_logs
  FOR SELECT TO authenticated
  USING (business_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = staff_permission_check_logs.business_id AND b.owner_id = (SELECT auth.uid())));

-- 8. HARD CHECK: exactly 23 new policies, all names under 63 bytes
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'Business owner can %') <> 23 THEN
    RAISE EXCEPTION 'expected 23 owner policies';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'Business owner can %'
             AND octet_length(policyname) > 62) THEN
    RAISE EXCEPTION 'a policy name is too long';
  END IF;
END;
$$;