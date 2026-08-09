-- migration_59_entity_members_rollback.sql
--
-- WARNING: this drops the entity_members table entirely, including every
-- membership row (the 'owner' rows seeded from organizers, and any manual
-- entries added since). No other table has a foreign key pointing to
-- entity_members, so dropping it is safe in that sense — but any
-- membership data recorded since this migration was applied is
-- permanently lost.
--
-- IMPORTANT: this does NOT drop cleanup_business_organizer() — migration_59
-- only CREATE OR REPLACEs that function (originally created by
-- migration_58) to add an entity_members check on top of migration_58's
-- version. If migration_58 is still applied, its AFTER DELETE trigger on
-- businesses still calls this function; dropping it here would break that
-- trigger. Instead, this restores the function to migration_58's original
-- body (no entity_members check) — including keeping it SECURITY DEFINER
-- with a fixed search_path, since live organizers RLS has no DELETE
-- policy at all (see migration_58's header comment) and dropping the
-- elevation would break the owner-initiated deleteBusiness() path exactly
-- like before migration_58 was fixed — so migration_58 keeps working
-- exactly as it did before migration_59 was ever applied. If migration_58
-- has ALSO been rolled back already, this CREATE OR REPLACE is harmless —
-- the function just sits unused with no trigger calling it.

BEGIN;

DROP TRIGGER IF EXISTS trg_organizers_seed_owner_member ON organizers;
DROP FUNCTION IF EXISTS trg_seed_organizer_owner_member();

DROP TABLE IF EXISTS entity_members;

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
  THEN
    RETURN OLD;
  END IF;

  DELETE FROM organizers WHERE id = target_org_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;

NOTIFY pgrst, 'reload schema';
