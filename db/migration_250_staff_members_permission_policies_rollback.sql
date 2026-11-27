DROP POLICY IF EXISTS "Staff permission can update staff members" ON public.staff_members;
DROP POLICY IF EXISTS "Staff permission can create staff members" ON public.staff_members;
DROP POLICY IF EXISTS "Staff permission can read staff members" ON public.staff_members;
DROP TRIGGER IF EXISTS trg_staff_members_guard_identity ON public.staff_members;
DROP FUNCTION IF EXISTS public.staff_members_guard_identity();