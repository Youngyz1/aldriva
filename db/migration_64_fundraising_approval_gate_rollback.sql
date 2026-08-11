-- migration_64_fundraising_approval_gate_rollback.sql
-- Reverts the fundraisers INSERT policy to its exact pre-migration_64
-- state (captured live before writing migration_64), and drops the
-- helper function this migration introduced.

BEGIN;

DROP POLICY IF EXISTS "Anyone can create a fundraiser pending review" ON fundraisers;
CREATE POLICY "Anyone can create a fundraiser pending review" ON fundraisers
  FOR INSERT
  WITH CHECK (status = 'pending_review');

DROP FUNCTION IF EXISTS can_create_fundraiser_for_organizer(uuid);

COMMIT;

NOTIFY pgrst, 'reload schema';
