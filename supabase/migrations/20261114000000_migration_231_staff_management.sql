-- Migration 231: Staff Management
-- Generic workforce layer owned by business_id, bridged to organizer-level
-- authorization (entity_members) via businesses.organizer_id.
--
-- Scope: identity, roles/permissions, availability, time off, skills,
-- invitations, and generic polymorphic subject assignments.
--
-- Explicitly OUT OF SCOPE (owner decision):
--   - public.business_workers (kitchen/courier workers), its is_active
--     column, and the migration_185 trigger on it. Not touched, not
--     referenced. Migrating kitchen/courier onto this model is a later,
--     separate slice.
--   - Platform-seeded role names: only 'owner','admin','manager','viewer'.
--     No cook/courier/chef/driver/scanner seeds here.
--   - Beneficiaries (fundraiser donors/recipients) are not staff and are
--     not referenced by any table in this migration.
--
-- Authorization model:
--   - staff_resolve_business_organizer(business_id) bridges a business to
--     its owning organizer_id. Every policy below resolves through it and
--     combines with the existing is_entity_member() primitive
--     (migration_62) for organizer-level (owner/admin/manager/...) access.
--   - is_staff_branch_manager(business_id, branch_id) grants a narrower,
--     branch-scoped management capability to a staff member who: has an
--     active staff_members row in the same business, holds the seeded
--     'manager' platform role, and has their own branch_id set to exactly
--     the target branch_id. A manager with no branch_id of their own
--     (business-wide manager) does NOT qualify, and a NULL p_branch_id
--     never matches -- both must name the same specific branch.
--   - A linked staff member (auth_user_id = auth.uid()) can always read
--     and self-service their own row where noted.
--   - Platform admins (profiles.role = 'admin' AND profiles.status =
--     'active') bypass tenant scoping everywhere, matching the existing
--     convention used throughout this codebase (e.g. migration_62/224).
--
-- DO NOT apply manually -- the owner applies migrations.

BEGIN;
SET LOCAL check_function_bodies = off;

-- ============================================================
-- 0. PREREQUISITES
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.businesses') IS NULL THEN
    RAISE EXCEPTION 'Prerequisite missing: public.businesses';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'organizer_id'
  ) THEN
    RAISE EXCEPTION 'Prerequisite missing: public.businesses.organizer_id';
  END IF;

  IF to_regclass('public.business_branches') IS NULL THEN
    RAISE EXCEPTION 'Prerequisite missing: public.business_branches';
  END IF;

  IF to_regprocedure('public.is_entity_member(uuid, text[])') IS NULL THEN
    RAISE EXCEPTION 'Prerequisite missing: public.is_entity_member(uuid, text[]) (migration_62)';
  END IF;

  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Prerequisite missing: public.profiles';
  END IF;

  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Prerequisite missing: auth.users';
  END IF;
END;
$$;

-- business_branches needs a composite (id, business_id) key so staff
-- tables can FK (branch_id, business_id) and reject cross-business branch
-- assignment at the database level. Purely additive -- id is already a
-- unique primary key, so this constraint never rejects existing rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.business_branches'::regclass
      AND conname = 'business_branches_id_business_id_key'
  ) THEN
    ALTER TABLE public.business_branches
      ADD CONSTRAINT business_branches_id_business_id_key
      UNIQUE (id, business_id);
  END IF;
END;
$$;

-- ============================================================
-- 1. AUTHORIZATION HELPERS
-- ============================================================

-- Bridges a business to its owning organizer so staff policies can reuse
-- the existing organizer-level is_entity_member() primitive without every
-- staff table needing its own denormalized organizer_id column.
CREATE OR REPLACE FUNCTION public.staff_resolve_business_organizer(p_business_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT organizer_id FROM public.businesses WHERE id = p_business_id;
$$;

REVOKE ALL ON FUNCTION public.staff_resolve_business_organizer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_resolve_business_organizer(uuid) TO anon, authenticated;

-- Branch-scoped management capability: a staff member holding the seeded
-- 'manager' platform role qualifies only when their own branch_id is set
-- and equals p_branch_id. A business-wide manager (branch_id IS NULL) does
-- NOT qualify, and p_branch_id = NULL never matches -- both must name the
-- same specific branch. Defined here (ahead of the policies below that
-- call it) so CREATE POLICY can resolve it; later CREATE OR REPLACE calls
-- on this same function patch its body in place without needing to recreate
-- any policy, since they all reference it by a stable OID.
CREATE OR REPLACE FUNCTION public.is_staff_branch_manager(p_business_id uuid, p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p_branch_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.staff_members sm
    JOIN public.staff_member_roles smr
      ON smr.staff_member_id = sm.id AND smr.is_active
    JOIN public.staff_roles sr
      ON sr.id = smr.role_id AND sr.platform_role = 'manager'
    WHERE sm.business_id = p_business_id
      AND sm.auth_user_id = auth.uid()
      AND sm.status = 'active'
      AND sm.branch_id IS NOT NULL
      AND sm.branch_id = p_branch_id
  );
$$;
REVOKE ALL ON FUNCTION public.is_staff_branch_manager(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_branch_manager(uuid, uuid) TO authenticated;

-- Any active staff member of the business, regardless of role or branch.
-- Used where a reader only needs to prove business membership (e.g. seeing
-- that business's own custom staff_roles), not any specific capability.
CREATE OR REPLACE FUNCTION public.staff_is_active_member(p_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.business_id = p_business_id
      AND sm.auth_user_id = auth.uid()
      AND sm.status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.staff_is_active_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_is_active_member(uuid) TO authenticated;

-- Shared updated_at trigger for every staff_* table below.
CREATE OR REPLACE FUNCTION public.staff_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_touch_updated_at() FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 2. STAFF ROLES (business-defined + tiny platform set)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  business_id uuid NULL
    REFERENCES public.businesses(id) ON DELETE CASCADE,

  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 60),
  description text NULL,

  role_scope text NOT NULL DEFAULT 'business'
    CHECK (role_scope IN ('platform', 'business')),

  platform_role text NULL
    CHECK (platform_role IN ('owner', 'admin', 'manager', 'viewer')),

  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_staff_roles_scope_shape CHECK (
    (role_scope = 'platform' AND business_id IS NULL AND platform_role IS NOT NULL)
    OR
    (role_scope = 'business' AND business_id IS NOT NULL AND platform_role IS NULL)
  ),

  CONSTRAINT uq_staff_roles_business_name UNIQUE (business_id, name)
);

COMMENT ON TABLE public.staff_roles IS
  'Business-defined staff roles plus a tiny seeded platform set (owner, admin, manager, viewer). No occupation-specific seeds (cook/courier/chef/driver/scanner) are created here.';

-- NULLs are distinct in the ordinary unique constraint above; this index
-- guarantees one global platform role per name.
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_roles_platform_name_unique
  ON public.staff_roles (name)
  WHERE role_scope = 'platform';

CREATE INDEX IF NOT EXISTS idx_staff_roles_business_id
  ON public.staff_roles (business_id)
  WHERE business_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_staff_roles_updated_at ON public.staff_roles;
CREATE TRIGGER trg_staff_roles_updated_at
  BEFORE UPDATE ON public.staff_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.staff_touch_updated_at();

-- Seed the tiny platform role set only. Re-run safe.
INSERT INTO public.staff_roles (name, description, role_scope, platform_role, business_id)
SELECT v.name, v.description, 'platform', v.name, NULL
FROM (VALUES
  ('owner',   'Full control over business staff, roles, and assignments'),
  ('admin',   'Administrative access to staff management, excluding ownership transfer'),
  ('manager', 'Manages staff and assignments within an assigned branch'),
  ('viewer',  'Read-only access to staff records')
) AS v(name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff_roles existing
  WHERE existing.role_scope = 'platform' AND existing.name = v.name
);


-- ============================================================
-- 3. STAFF MEMBERS (identity)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  business_id uuid NOT NULL
    REFERENCES public.businesses(id) ON DELETE CASCADE,

  branch_id uuid NULL,

  auth_user_id uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL,

  full_name text NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 2 AND 120),
  photo_url text NULL,
  phone text NULL,
  email text NULL CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  employment_type text NOT NULL DEFAULT 'full_time'
    CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'seasonal', 'volunteer')),

  department text NULL,

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deactivated')),

  extra jsonb NOT NULL DEFAULT '{}'::jsonb,

  deactivated_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT staff_members_id_business_id_key UNIQUE (id, business_id),

  CONSTRAINT staff_members_branch_business_fk
    FOREIGN KEY (branch_id, business_id)
    REFERENCES public.business_branches (id, business_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.staff_members IS
  'Staff identity, owned by business_id. Distinct from public.business_workers (kitchen/courier), which this migration does not touch.';

COMMENT ON COLUMN public.staff_members.branch_id IS
  'Optional branch assignment. Composite FK (branch_id, business_id) rejects cross-business branch assignment at the database level.';

COMMENT ON COLUMN public.staff_members.auth_user_id IS
  'Optional linked auth.users account. A login may link to at most one staff member per business (see uq_staff_members_business_auth_user below).';

CREATE INDEX IF NOT EXISTS idx_staff_members_business_id ON public.staff_members (business_id);
CREATE INDEX IF NOT EXISTS idx_staff_members_branch_id ON public.staff_members (branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_members_auth_user_id ON public.staff_members (auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_members_status ON public.staff_members (business_id, status);

-- A login account may be linked to at most one staff member per business.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_members_business_auth_user
  ON public.staff_members (business_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_staff_members_updated_at ON public.staff_members;
CREATE TRIGGER trg_staff_members_updated_at
  BEFORE UPDATE ON public.staff_members
  FOR EACH ROW
  EXECUTE FUNCTION public.staff_touch_updated_at();


-- ============================================================
-- 4. STAFF MEMBER ROLES (many-to-many)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_member_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  staff_member_id uuid NOT NULL,
  business_id uuid NOT NULL,

  role_id uuid NOT NULL
    REFERENCES public.staff_roles(id) ON DELETE CASCADE,

  details jsonb NOT NULL DEFAULT '{}'::jsonb,

  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL,

  is_active boolean NOT NULL DEFAULT true,

  CONSTRAINT staff_member_roles_member_business_fk
    FOREIGN KEY (staff_member_id, business_id)
    REFERENCES public.staff_members (id, business_id)
    ON DELETE CASCADE,

  CONSTRAINT uq_staff_member_roles_member_role UNIQUE (staff_member_id, role_id)
);

COMMENT ON TABLE public.staff_member_roles IS
  'Role assignments for a staff member. Role tenant ownership (platform roles assignable anywhere; business roles must belong to the same business) is enforced by trigger.';

CREATE INDEX IF NOT EXISTS idx_staff_member_roles_member ON public.staff_member_roles (staff_member_id, is_active);
CREATE INDEX IF NOT EXISTS idx_staff_member_roles_role ON public.staff_member_roles (role_id);

-- Tenant ownership guard: a platform role is assignable in any business; a
-- business-owned custom role must belong to the assignment's own business.
CREATE OR REPLACE FUNCTION public.validate_staff_member_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role_scope text;
  v_role_business_id uuid;
BEGIN
  SELECT role_scope, business_id
    INTO v_role_scope, v_role_business_id
  FROM public.staff_roles
  WHERE id = NEW.role_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff role % does not exist', NEW.role_id
      USING ERRCODE = '23503';
  END IF;

  IF v_role_scope = 'platform' THEN
    IF v_role_business_id IS NOT NULL THEN
      RAISE EXCEPTION 'Platform roles must be global'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_role_scope = 'business' THEN
    IF v_role_business_id IS NULL OR v_role_business_id IS DISTINCT FROM NEW.business_id THEN
      RAISE EXCEPTION 'Business role % does not belong to assignment business %',
        NEW.role_id, NEW.business_id
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported role scope'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_staff_member_role_assignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_staff_member_role_assignment ON public.staff_member_roles;
CREATE TRIGGER trg_validate_staff_member_role_assignment
  BEFORE INSERT OR UPDATE OF role_id, business_id
  ON public.staff_member_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_staff_member_role_assignment();


-- ============================================================
-- 5. STAFF PERMISSIONS REGISTRY + ROLE-PERMISSION JOIN
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  description text NULL,

  domain text NOT NULL
    CHECK (domain IN (
      'staff_management',
      'role_management',
      'scheduling',
      'assignment_management',
      'reporting'
    )),

  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff_permissions IS
  'Controlled permission registry. Holding a permission key here grants nothing by itself -- a staff_role_permissions mapping is required.';

INSERT INTO public.staff_permissions (key, description, domain)
SELECT v.key, v.description, v.domain
FROM (VALUES
  ('view_staff',         'View staff directory and profiles',          'staff_management'),
  ('manage_staff',       'Create, edit, suspend, or deactivate staff', 'staff_management'),
  ('manage_roles',       'Create and edit business-defined roles',     'role_management'),
  ('manage_schedule',    'Manage availability and time-off records',   'scheduling'),
  ('manage_assignments', 'Assign staff to bookings, orders, events',   'assignment_management'),
  ('view_reports',       'View staff and assignment reporting',        'reporting')
) AS v(key, description, domain)
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff_permissions existing WHERE existing.key = v.key
);

CREATE TABLE IF NOT EXISTS public.staff_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  role_id uuid NOT NULL
    REFERENCES public.staff_roles(id) ON DELETE CASCADE,

  permission_id uuid NOT NULL
    REFERENCES public.staff_permissions(id) ON DELETE CASCADE,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_staff_role_permissions UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_role_permissions_role ON public.staff_role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_staff_role_permissions_permission ON public.staff_role_permissions (permission_id);

-- Seed platform role -> permission mappings. Re-run safe.
INSERT INTO public.staff_role_permissions (role_id, permission_id)
SELECT sr.id, sp.id
FROM public.staff_roles sr
JOIN (VALUES
  ('owner',   'view_staff'),         ('owner',   'manage_staff'),
  ('owner',   'manage_roles'),       ('owner',   'manage_schedule'),
  ('owner',   'manage_assignments'), ('owner',   'view_reports'),
  ('admin',   'view_staff'),         ('admin',   'manage_staff'),
  ('admin',   'manage_roles'),       ('admin',   'manage_schedule'),
  ('admin',   'manage_assignments'), ('admin',   'view_reports'),
  ('manager', 'view_staff'),         ('manager', 'manage_staff'),
  ('manager', 'manage_schedule'),    ('manager', 'manage_assignments'),
  ('manager', 'view_reports'),
  ('viewer',  'view_staff'),         ('viewer',  'view_reports')
) AS seed(role_name, permission_key)
  ON sr.role_scope = 'platform' AND sr.name = seed.role_name
JOIN public.staff_permissions sp ON sp.key = seed.permission_key
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff_role_permissions existing
  WHERE existing.role_id = sr.id AND existing.permission_id = sp.id
);


-- ============================================================
-- 6. STAFF AVAILABILITY
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  staff_member_id uuid NOT NULL,
  business_id uuid NOT NULL,

  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  ends_at time NOT NULL,

  is_recurring boolean NOT NULL DEFAULT true,
  effective_from date NULL,
  effective_until date NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT staff_availability_member_business_fk
    FOREIGN KEY (staff_member_id, business_id)
    REFERENCES public.staff_members (id, business_id)
    ON DELETE CASCADE,

  CONSTRAINT chk_staff_availability_time CHECK (ends_at > starts_at),
  CONSTRAINT chk_staff_availability_dates CHECK (
    effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from
  )
);

CREATE INDEX IF NOT EXISTS idx_staff_availability_member ON public.staff_availability (staff_member_id);
CREATE INDEX IF NOT EXISTS idx_staff_availability_business ON public.staff_availability (business_id);

DROP TRIGGER IF EXISTS trg_staff_availability_updated_at ON public.staff_availability;
CREATE TRIGGER trg_staff_availability_updated_at
  BEFORE UPDATE ON public.staff_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.staff_touch_updated_at();


-- ============================================================
-- 7. STAFF TIME OFF
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  staff_member_id uuid NOT NULL,
  business_id uuid NOT NULL,

  starts_on date NOT NULL,
  ends_on date NOT NULL,

  reason text NOT NULL DEFAULT 'other'
    CHECK (reason IN ('vacation', 'sick', 'personal', 'unpaid', 'other')),

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),

  notes text NULL,

  approved_by uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT staff_time_off_member_business_fk
    FOREIGN KEY (staff_member_id, business_id)
    REFERENCES public.staff_members (id, business_id)
    ON DELETE CASCADE,

  CONSTRAINT chk_staff_time_off_dates CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_staff_time_off_member ON public.staff_time_off (staff_member_id);
CREATE INDEX IF NOT EXISTS idx_staff_time_off_business_status ON public.staff_time_off (business_id, status);

DROP TRIGGER IF EXISTS trg_staff_time_off_updated_at ON public.staff_time_off;
CREATE TRIGGER trg_staff_time_off_updated_at
  BEFORE UPDATE ON public.staff_time_off
  FOR EACH ROW
  EXECUTE FUNCTION public.staff_touch_updated_at();


-- ============================================================
-- 8. STAFF SKILLS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  staff_member_id uuid NOT NULL,
  business_id uuid NOT NULL,

  skill text NOT NULL CHECK (char_length(trim(skill)) BETWEEN 1 AND 80),
  proficiency text NOT NULL DEFAULT 'intermediate'
    CHECK (proficiency IN ('beginner', 'intermediate', 'advanced', 'expert')),
  certified boolean NOT NULL DEFAULT false,
  notes text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT staff_skills_member_business_fk
    FOREIGN KEY (staff_member_id, business_id)
    REFERENCES public.staff_members (id, business_id)
    ON DELETE CASCADE,

  CONSTRAINT uq_staff_skills_member_skill UNIQUE (staff_member_id, skill)
);

CREATE INDEX IF NOT EXISTS idx_staff_skills_member ON public.staff_skills (staff_member_id);
CREATE INDEX IF NOT EXISTS idx_staff_skills_business ON public.staff_skills (business_id);


-- ============================================================
-- 9. STAFF INVITATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  business_id uuid NOT NULL
    REFERENCES public.businesses(id) ON DELETE CASCADE,

  branch_id uuid NULL
    REFERENCES public.business_branches(id) ON DELETE SET NULL,

  -- Optional backlink once a staff_members row exists for the invitee.
  -- Not a composite FK (business_id is NOT NULL on staff_members, so a
  -- composite ON DELETE SET NULL would try to null business_id too) --
  -- the application enforces business_id agreement at write time.
  staff_member_id uuid NULL
    REFERENCES public.staff_members(id) ON DELETE SET NULL,

  email text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  role_id uuid NULL
    REFERENCES public.staff_roles(id) ON DELETE SET NULL,

  token uuid NOT NULL DEFAULT gen_random_uuid(),

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),

  invited_by uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL,

  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz NULL,
  accepted_by uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_staff_invitations_token UNIQUE (token)
);

COMMENT ON TABLE public.staff_invitations IS
  'Pending staff invitations by email. staff_member_id is populated once the invite is accepted and a staff_members row exists.';

CREATE INDEX IF NOT EXISTS idx_staff_invitations_business ON public.staff_invitations (business_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_email ON public.staff_invitations (email);


-- ============================================================
-- 10. STAFF ASSIGNMENTS (generic polymorphic subject)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  business_id uuid NOT NULL
    REFERENCES public.businesses(id) ON DELETE CASCADE,

  staff_member_id uuid NOT NULL,

  role_id uuid NULL
    REFERENCES public.staff_roles(id) ON DELETE SET NULL,

  subject_type text NOT NULL
    CHECK (subject_type IN ('rental_booking', 'order', 'service_appointment', 'event')),
  subject_id uuid NOT NULL,

  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'accepted', 'declined', 'completed', 'cancelled')),

  assigned_by uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz NULL,
  completed_at timestamptz NULL,

  notes text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT staff_assignments_member_business_fk
    FOREIGN KEY (staff_member_id, business_id)
    REFERENCES public.staff_members (id, business_id)
    ON DELETE CASCADE,

  CONSTRAINT uq_staff_assignments_member_subject UNIQUE (staff_member_id, subject_type, subject_id)
);

COMMENT ON TABLE public.staff_assignments IS
  'Generic staff-to-subject assignment. subject_id is not database-FK-enforced against the heterogeneous subject tables (rental_bookings, orders, reservation/service bookings, events) -- the application is responsible for subject existence.';

CREATE INDEX IF NOT EXISTS idx_staff_assignments_business_status ON public.staff_assignments (business_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_subject ON public.staff_assignments (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_member ON public.staff_assignments (staff_member_id);

DROP TRIGGER IF EXISTS trg_staff_assignments_updated_at ON public.staff_assignments;
CREATE TRIGGER trg_staff_assignments_updated_at
  BEFORE UPDATE ON public.staff_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.staff_touch_updated_at();


-- ============================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.staff_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_member_roles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_permissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_role_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_availability      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_time_off          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_skills            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invitations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_assignments       ENABLE ROW LEVEL SECURITY;

-- ---- staff_roles ----

DROP POLICY IF EXISTS "Staff roles are readable by business members or platform-wide" ON public.staff_roles;
CREATE POLICY "Staff roles are readable by business members or platform-wide"
  ON public.staff_roles FOR SELECT
  USING (
    role_scope = 'platform'
    OR is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR public.staff_is_active_member(business_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business managers can create custom staff roles" ON public.staff_roles;
CREATE POLICY "Business managers can create custom staff roles"
  ON public.staff_roles FOR INSERT
  WITH CHECK (
    (role_scope = 'business' AND is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager']))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business managers can update custom staff roles" ON public.staff_roles;
CREATE POLICY "Business managers can update custom staff roles"
  ON public.staff_roles FOR UPDATE
  USING (
    (role_scope = 'business' AND is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager']))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    (role_scope = 'business' AND is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager']))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business managers can delete custom staff roles" ON public.staff_roles;
CREATE POLICY "Business managers can delete custom staff roles"
  ON public.staff_roles FOR DELETE
  USING (
    (role_scope = 'business' AND is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager']))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- ---- staff_members ----

DROP POLICY IF EXISTS "Staff members are readable by business, branch manager, or self" ON public.staff_members;
CREATE POLICY "Staff members are readable by business, branch manager, or self"
  ON public.staff_members FOR SELECT
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR auth_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business managers can create staff members" ON public.staff_members;
CREATE POLICY "Business managers can create staff members"
  ON public.staff_members FOR INSERT
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business managers, branch managers, or self can update staff members" ON public.staff_members;
CREATE POLICY "Business managers, branch managers, or self can update staff members"
  ON public.staff_members FOR UPDATE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR auth_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR auth_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business managers can delete staff members" ON public.staff_members;
CREATE POLICY "Business managers can delete staff members"
  ON public.staff_members FOR DELETE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- ---- staff_member_roles ----

DROP POLICY IF EXISTS "Staff member roles are readable by business, branch manager, or self" ON public.staff_member_roles;
CREATE POLICY "Staff member roles are readable by business, branch manager, or self"
  ON public.staff_member_roles FOR SELECT
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business or branch managers can assign staff member roles" ON public.staff_member_roles;
CREATE POLICY "Business or branch managers can assign staff member roles"
  ON public.staff_member_roles FOR INSERT
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business or branch managers can update staff member roles" ON public.staff_member_roles;
CREATE POLICY "Business or branch managers can update staff member roles"
  ON public.staff_member_roles FOR UPDATE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business or branch managers can remove staff member roles" ON public.staff_member_roles;
CREATE POLICY "Business or branch managers can remove staff member roles"
  ON public.staff_member_roles FOR DELETE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- ---- staff_permissions (global registry) ----

DROP POLICY IF EXISTS "Active staff permissions are publicly readable" ON public.staff_permissions;
CREATE POLICY "Active staff permissions are publicly readable"
  ON public.staff_permissions FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Only platform admins manage the staff permission registry" ON public.staff_permissions;
CREATE POLICY "Only platform admins manage the staff permission registry"
  ON public.staff_permissions FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active'));

-- ---- staff_role_permissions ----

DROP POLICY IF EXISTS "Staff role permissions are readable by role scope" ON public.staff_role_permissions;
CREATE POLICY "Staff role permissions are readable by role scope"
  ON public.staff_role_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_roles sr
      WHERE sr.id = role_id
        AND (
          sr.role_scope = 'platform'
          OR is_entity_member(staff_resolve_business_organizer(sr.business_id), ARRAY['owner','admin','manager','editor','finance','viewer'])
        )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business managers can map permissions to their custom roles" ON public.staff_role_permissions;
CREATE POLICY "Business managers can map permissions to their custom roles"
  ON public.staff_role_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_roles sr
      WHERE sr.id = role_id
        AND sr.role_scope = 'business'
        AND is_entity_member(staff_resolve_business_organizer(sr.business_id), ARRAY['owner','admin','manager'])
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_roles sr
      WHERE sr.id = role_id
        AND sr.role_scope = 'business'
        AND is_entity_member(staff_resolve_business_organizer(sr.business_id), ARRAY['owner','admin','manager'])
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- ---- staff_availability ----

DROP POLICY IF EXISTS "Staff availability is readable by business, branch manager, or self" ON public.staff_availability;
CREATE POLICY "Staff availability is readable by business, branch manager, or self"
  ON public.staff_availability FOR SELECT
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business, branch manager, or self can write staff availability" ON public.staff_availability;
CREATE POLICY "Business, branch manager, or self can write staff availability"
  ON public.staff_availability FOR ALL
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- ---- staff_time_off ----

DROP POLICY IF EXISTS "Staff time off is readable by business, branch manager, or self" ON public.staff_time_off;
CREATE POLICY "Staff time off is readable by business, branch manager, or self"
  ON public.staff_time_off FOR SELECT
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Self can request time off" ON public.staff_time_off;
CREATE POLICY "Self can request time off"
  ON public.staff_time_off FOR INSERT
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business or branch managers can decide time off; self can cancel" ON public.staff_time_off;
CREATE POLICY "Business or branch managers can decide time off; self can cancel"
  ON public.staff_time_off FOR UPDATE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR (
      EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
      AND status IN ('pending', 'cancelled')
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business or branch managers can delete time off records" ON public.staff_time_off;
CREATE POLICY "Business or branch managers can delete time off records"
  ON public.staff_time_off FOR DELETE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- ---- staff_skills ----

DROP POLICY IF EXISTS "Staff skills are readable by business, branch manager, or self" ON public.staff_skills;
CREATE POLICY "Staff skills are readable by business, branch manager, or self"
  ON public.staff_skills FOR SELECT
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business, branch manager, or self can write staff skills" ON public.staff_skills;
CREATE POLICY "Business, branch manager, or self can write staff skills"
  ON public.staff_skills FOR ALL
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- ---- staff_invitations ----

DROP POLICY IF EXISTS "Staff invitations are readable by business, branch manager, or invitee" ON public.staff_invitations;
CREATE POLICY "Staff invitations are readable by business, branch manager, or invitee"
  ON public.staff_invitations FOR SELECT
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR email = (auth.jwt() ->> 'email')
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business or branch managers can create staff invitations" ON public.staff_invitations;
CREATE POLICY "Business or branch managers can create staff invitations"
  ON public.staff_invitations FOR INSERT
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business, branch manager, or invitee can update a staff invitation" ON public.staff_invitations;
CREATE POLICY "Business, branch manager, or invitee can update a staff invitation"
  ON public.staff_invitations FOR UPDATE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR (email = (auth.jwt() ->> 'email') AND status = 'pending')
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR (email = (auth.jwt() ->> 'email') AND status IN ('accepted', 'pending'))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business or branch managers can revoke staff invitations" ON public.staff_invitations;
CREATE POLICY "Business or branch managers can revoke staff invitations"
  ON public.staff_invitations FOR DELETE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- ---- staff_assignments ----

DROP POLICY IF EXISTS "Staff assignments are readable by business, branch manager, or assignee" ON public.staff_assignments;
CREATE POLICY "Staff assignments are readable by business, branch manager, or assignee"
  ON public.staff_assignments FOR SELECT
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business or branch managers can create staff assignments" ON public.staff_assignments;
CREATE POLICY "Business or branch managers can create staff assignments"
  ON public.staff_assignments FOR INSERT
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business, branch manager, or assignee can update staff assignments" ON public.staff_assignments;
CREATE POLICY "Business, branch manager, or assignee can update staff assignments"
  ON public.staff_assignments FOR UPDATE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = staff_member_id))
    OR (
      EXISTS (SELECT 1 FROM public.staff_members sm WHERE sm.id = staff_member_id AND sm.auth_user_id = auth.uid())
      AND status IN ('accepted', 'declined', 'completed')
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business managers can delete staff assignments" ON public.staff_assignments;
CREATE POLICY "Business managers can delete staff assignments"
  ON public.staff_assignments FOR DELETE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );


NOTIFY pgrst, 'reload schema';

-- HARDENING (found by role testing)

-- ---- hardening: fix231.sql ----
CREATE OR REPLACE FUNCTION public.staff_resolve_business_organizer(p_business_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT organizer_id FROM public.businesses WHERE id = p_business_id;
$$;
REVOKE ALL ON FUNCTION public.staff_resolve_business_organizer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_resolve_business_organizer(uuid) TO authenticated;

DROP POLICY IF EXISTS "Self can request time off" ON public.staff_time_off;
CREATE POLICY "Self can request time off" ON public.staff_time_off
FOR INSERT WITH CHECK (
  public.is_entity_member(
    public.staff_resolve_business_organizer(business_id),
    ARRAY['owner','admin','manager'])
  OR public.is_staff_branch_manager(business_id,
    (SELECT sm.branch_id FROM public.staff_members sm
     WHERE sm.id = staff_time_off.staff_member_id))
  OR (status = 'pending' AND approved_by IS NULL AND approved_at IS NULL
    AND EXISTS (SELECT 1 FROM public.staff_members sm
      WHERE sm.id = staff_time_off.staff_member_id
        AND sm.auth_user_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
);

CREATE OR REPLACE FUNCTION public.staff_members_guard_self_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR public.is_entity_member(
          public.staff_resolve_business_organizer(OLD.business_id),
          ARRAY['owner','admin','manager'])
     OR (public.is_staff_branch_manager(OLD.business_id, OLD.branch_id)
          AND OLD.auth_user_id IS DISTINCT FROM auth.uid())
     OR EXISTS (SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'admin'
            AND p.status = 'active')
  THEN
    RETURN NEW;
  END IF;
  IF NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.extra IS DISTINCT FROM OLD.extra
     OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Staff can only update their own phone, email and photo'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_members_guard_self_edit()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_staff_members_guard_self_edit ON public.staff_members;
CREATE TRIGGER trg_staff_members_guard_self_edit
  BEFORE UPDATE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.staff_members_guard_self_edit();

-- ---- hardening: fix231c.sql ----
CREATE OR REPLACE FUNCTION public.staff_invitee_email_matches(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
      AND lower(u.email) = lower(p_email)
  );
$$;
REVOKE ALL ON FUNCTION public.staff_invitee_email_matches(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_invitee_email_matches(text) TO authenticated;

DROP POLICY IF EXISTS "Staff invitations are readable by business, branch manager, or invitee" ON public.staff_invitations;
CREATE POLICY "Staff invitations are readable by business, branch manager, or invitee"
  ON public.staff_invitations FOR SELECT
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR public.staff_invitee_email_matches(email)
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

DROP POLICY IF EXISTS "Business, branch manager, or invitee can update a staff invitation" ON public.staff_invitations;
CREATE POLICY "Business, branch manager, or invitee can update a staff invitation"
  ON public.staff_invitations FOR UPDATE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR (public.staff_invitee_email_matches(email) AND status = 'pending')
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR (public.staff_invitee_email_matches(email) AND status IN ('accepted','pending'))
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

-- ---- hardening: fix231d.sql ----
DROP POLICY IF EXISTS "Business, branch manager, or invitee can update a staff invitation" ON public.staff_invitations;
CREATE POLICY "Managers can update staff invitations" ON public.staff_invitations
  FOR UPDATE
  USING (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    is_entity_member(staff_resolve_business_organizer(business_id), ARRAY['owner','admin','manager'])
    OR is_staff_branch_manager(business_id, branch_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

CREATE OR REPLACE FUNCTION public.staff_invitations_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.business_branches b
    WHERE b.id = NEW.branch_id AND b.business_id = NEW.business_id) THEN
    RAISE EXCEPTION 'Branch does not belong to this business' USING ERRCODE = '23514';
  END IF;
  IF NEW.staff_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staff_members m
    WHERE m.id = NEW.staff_member_id AND m.business_id = NEW.business_id) THEN
    RAISE EXCEPTION 'Staff member does not belong to this business' USING ERRCODE = '23514';
  END IF;
  IF NEW.role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staff_roles r
    WHERE r.id = NEW.role_id
      AND (r.role_scope = 'platform' OR r.business_id = NEW.business_id)) THEN
    RAISE EXCEPTION 'Role does not belong to this business' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_invitations_validate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_staff_invitations_validate ON public.staff_invitations;
CREATE TRIGGER trg_staff_invitations_validate
  BEFORE INSERT OR UPDATE OF business_id, branch_id, staff_member_id, role_id
  ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.staff_invitations_validate();

CREATE OR REPLACE FUNCTION public.staff_assignments_guard_assignee_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR public.is_entity_member(
          public.staff_resolve_business_organizer(OLD.business_id),
          ARRAY['owner','admin','manager'])
     OR public.is_staff_branch_manager(OLD.business_id,
          (SELECT sm.branch_id FROM public.staff_members sm WHERE sm.id = OLD.staff_member_id))
     OR EXISTS (SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  THEN
    RETURN NEW;
  END IF;
  IF NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.staff_member_id IS DISTINCT FROM OLD.staff_member_id
     OR NEW.role_id IS DISTINCT FROM OLD.role_id
     OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
     OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
  THEN
    RAISE EXCEPTION 'Assignees can only update status, notes and response times'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.status IN ('cancelled','completed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Assignment is closed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_assignments_guard_assignee_edit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_staff_assignments_guard_assignee_edit ON public.staff_assignments;
CREATE TRIGGER trg_staff_assignments_guard_assignee_edit
  BEFORE UPDATE ON public.staff_assignments
  FOR EACH ROW EXECUTE FUNCTION public.staff_assignments_guard_assignee_edit();

-- ---- hardening: fix231e.sql ----
-- is_staff_branch_manager's tightened body now lives at its single
-- definition in section 1 (AUTHORIZATION HELPERS) above.

CREATE OR REPLACE FUNCTION public.staff_guard_privileged_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_platform text;
BEGIN
  IF NEW.role_id IS NULL OR auth.uid() IS NULL
     OR public.is_entity_member(
          public.staff_resolve_business_organizer(NEW.business_id),
          ARRAY['owner','admin','manager'])
     OR EXISTS (SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  THEN
    RETURN NEW;
  END IF;
  SELECT platform_role INTO v_platform FROM public.staff_roles WHERE id = NEW.role_id;
  IF v_platform IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Only head office can assign the % role', v_platform
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_guard_privileged_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_staff_member_roles_guard_privileged ON public.staff_member_roles;
CREATE TRIGGER trg_staff_member_roles_guard_privileged
  BEFORE INSERT OR UPDATE OF role_id ON public.staff_member_roles
  FOR EACH ROW EXECUTE FUNCTION public.staff_guard_privileged_role();

DROP TRIGGER IF EXISTS trg_staff_invitations_guard_privileged ON public.staff_invitations;
CREATE TRIGGER trg_staff_invitations_guard_privileged
  BEFORE INSERT OR UPDATE OF role_id ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.staff_guard_privileged_role();

COMMIT;
