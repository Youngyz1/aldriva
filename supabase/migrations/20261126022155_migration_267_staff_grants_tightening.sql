-- 267: tighten grants on staff_* tables that Supabase default privileges left wide open.
-- anon loses everything; authenticated keeps DML only (RLS still gates rows).
-- service_role is not touched. Safe to re-run.

REVOKE ALL ON TABLE
  public.staff_availability,
  public.staff_member_branch_scopes,
  public.staff_member_roles,
  public.staff_members,
  public.staff_permissions,
  public.staff_role_permissions,
  public.staff_roles,
  public.staff_skills,
  public.staff_time_off
FROM anon;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  public.staff_availability,
  public.staff_member_branch_scopes,
  public.staff_member_roles,
  public.staff_members,
  public.staff_permissions,
  public.staff_role_permissions,
  public.staff_roles,
  public.staff_skills,
  public.staff_time_off
FROM authenticated;
