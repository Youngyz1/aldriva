-- 267 ROLLBACK: restores the wide default grants. Re-opens anon access at the
-- privilege level (RLS still applies). Use only if 267 breaks something.
GRANT ALL ON TABLE
  public.staff_availability,
  public.staff_member_branch_scopes,
  public.staff_member_roles,
  public.staff_members,
  public.staff_permissions,
  public.staff_role_permissions,
  public.staff_roles,
  public.staff_skills,
  public.staff_time_off
TO anon, authenticated;
