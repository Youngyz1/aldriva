-- migration_68_relax_fundraising_approval_requirement_rollback.sql
-- Restores migration_64's original can_create_fundraiser_for_organizer(),
-- requiring fundraising_approved = true again alongside ownership/entity
-- access.

BEGIN;

CREATE OR REPLACE FUNCTION can_create_fundraiser_for_organizer(p_organizer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizers
    WHERE organizers.id = p_organizer_id
      AND organizers.fundraising_approved = true
      AND (
        organizers.user_id = auth.uid()
        OR is_entity_member(p_organizer_id, ARRAY['owner','admin','manager','editor'])
      )
  );
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
