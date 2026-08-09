-- migration_59_entity_members.sql
-- Phase 1 of the Entity architecture: introduces entity-level membership
-- (owner/admin/manager/editor/finance/viewer roles), the foundation the
-- spec's permissions model needs later. Purely additive this phase — no
-- existing ownership check (the ~60+ call sites using
-- `organizers.user_id = auth.uid()`) is modified or replaced. This table
-- exists so a future phase has a real membership model to build
-- permission checks against, seeded correctly from day one.
--
-- Also tightens migration_58's cleanup_business_organizer() (see near the
-- end of this file) to treat a non-owner entity_members row as evidence an
-- auto-created business organizer is now shared/in use, on top of
-- migration_58's own full usage check (businesses/events/articles/
-- fundraisers/fundraiser_updates/reviews/eventbrite_sources) — apply both
-- migrations together for that to take full effect. That function stays
-- SECURITY DEFINER here too (carried over from migration_58, required
-- because live organizers RLS has no DELETE policy at all).

BEGIN;

CREATE TABLE IF NOT EXISTS entity_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'manager', 'editor', 'finance', 'viewer')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organizer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_members_organizer_id ON entity_members(organizer_id);
CREATE INDEX IF NOT EXISTS idx_entity_members_user_id ON entity_members(user_id);

ALTER TABLE entity_members ENABLE ROW LEVEL SECURITY;

-- SELECT: a user can see their own membership row, all membership rows for
-- organizers they directly own, or (as admin) everything. Not yet "any
-- member can see co-members" — that's a product decision for the entity
-- management dashboard phase, not required by this phase's only writer
-- (the seeding trigger below).
DROP POLICY IF EXISTS "Users can view relevant entity memberships" ON entity_members;
CREATE POLICY "Users can view relevant entity memberships"
  ON entity_members FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organizers
      WHERE organizers.id = entity_members.organizer_id
        AND organizers.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- INSERT/UPDATE/DELETE: restricted to the organizer's direct owner or a
-- platform admin. Real invite/role-management flows don't exist yet (a
-- later phase) — this is deliberately conservative until they do. The one
-- actual writer in this phase (trg_seed_organizer_owner_member below) is
-- SECURITY DEFINER and bypasses these policies entirely, so this doesn't
-- block organizer creation.
DROP POLICY IF EXISTS "Organizer owners manage entity memberships" ON entity_members;
CREATE POLICY "Organizer owners manage entity memberships"
  ON entity_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organizers
      WHERE organizers.id = entity_members.organizer_id
        AND organizers.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organizers
      WHERE organizers.id = entity_members.organizer_id
        AND organizers.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- Seed the 'owner' membership row for every organizer automatically,
-- regardless of insert path (the raw client-side insert in
-- app/create-organizer/page.tsx, the businesses-driven insert added by
-- migration_58, or any future path). SECURITY DEFINER + a fixed
-- search_path: this INSERT must bypass entity_members RLS above — there is
-- no existing member row yet to satisfy the "organizer owner" policy on a
-- brand-new organizer, a bootstrapping problem — and is safe to elevate
-- because its inputs are entirely derived from the trusted organizers row
-- being inserted (NEW.id, NEW.user_id), never from arbitrary caller input.
CREATE OR REPLACE FUNCTION trg_seed_organizer_owner_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO entity_members (organizer_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (organizer_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_organizers_seed_owner_member ON organizers;
CREATE TRIGGER trg_organizers_seed_owner_member
  AFTER INSERT ON organizers
  FOR EACH ROW
  EXECUTE FUNCTION trg_seed_organizer_owner_member();

-- One-time backfill for every organizer that existed before this migration.
INSERT INTO entity_members (organizer_id, user_id, role)
SELECT id, user_id, 'owner' FROM organizers
ON CONFLICT (organizer_id, user_id) DO NOTHING;

-- Tighten migration_58's cleanup_business_organizer(): once entity_members
-- exists, an auto-created business organizer that has picked up a
-- non-owner member (someone was invited to collaborate on it) is now "in
-- use by another feature" too, not just one with events/articles attached
-- (events.organizer_id has no ON DELETE action live — NO ACTION/RESTRICT,
-- not SET NULL — but the explicit check below is what actually gates the
-- delete, not that FK). CREATE OR REPLACE on the same name/signature
-- layers this on top of migration_58's version, including keeping it
-- SECURITY DEFINER with a fixed search_path — required because live
-- organizers RLS has no DELETE policy at all (see migration_58's header
-- comment for the full rationale); dropping the elevation here would
-- silently regress back to the same RLS rejection migration_58 fixed. If
-- migration_58 hasn't been applied yet, this simply creates the function
-- fresh — harmless, since the AFTER DELETE trigger that calls it is only
-- created by migration_58, so it stays inert until that migration also
-- runs. Apply both together for the full, intended behavior.
CREATE OR REPLACE FUNCTION cleanup_business_organizer()
RETURNS TRIGGER AS $$
DECLARE
  target_org_id UUID := OLD.organizer_id;
  auto_created BOOLEAN;
BEGIN
  IF target_org_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT is_business_auto_created INTO auto_created
  FROM organizers WHERE id = target_org_id;

  IF auto_created IS NOT TRUE THEN
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM businesses WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM events WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM articles WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM fundraisers WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM fundraiser_updates WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM reviews WHERE organizer_id = target_org_id)
     OR EXISTS (SELECT 1 FROM eventbrite_sources WHERE organizer_id = target_org_id)
     OR EXISTS (
       SELECT 1 FROM entity_members
       WHERE organizer_id = target_org_id AND role <> 'owner'
     )
  THEN
    RETURN OLD;
  END IF;

  DELETE FROM organizers WHERE id = target_org_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;

NOTIFY pgrst, 'reload schema';
