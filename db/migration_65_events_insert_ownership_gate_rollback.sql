-- migration_65_events_insert_ownership_gate_rollback.sql
-- Reverts events' INSERT policy to its exact pre-migration_65 state.
-- Note: this restores the fully-open WITH CHECK (true) -- rolling back
-- reopens the gap this migration closed. Only use if this fix is found
-- to have broken something and needs to come out while a corrected
-- version is prepared, not as a routine revert.

BEGIN;

DROP POLICY IF EXISTS "Allow public insert" ON events;
CREATE POLICY "Allow public insert" ON events
  FOR INSERT
  WITH CHECK (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
