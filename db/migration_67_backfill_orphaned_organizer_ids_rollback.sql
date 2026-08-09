-- migration_67_backfill_orphaned_organizer_ids_rollback.sql
-- Reverts the two specific rows to their pre-backfill state and removes
-- the two organizers this migration created. Destructive by nature (this
-- migration's whole purpose was assigning real ownership) — only run if
-- the backfill is found to be wrong and needs to come out before a
-- corrected version is prepared, not as a routine revert.

BEGIN;

UPDATE fundraisers
SET organizer_id = NULL
WHERE id = '800e3fd5-ad0d-4e24-83fa-3e2ef145ce34';

DELETE FROM organizers
WHERE user_id = 'b6413fac-8b28-4ec3-ac67-6dd521fac0e9'
  AND slug LIKE 'isaiah-garza%';

UPDATE events
SET organizer_id = NULL
WHERE id = '90fb0c4f-8673-4a1d-b87d-9a7406cfb3e6';

DELETE FROM organizers
WHERE user_id = '21b8bbfc-95c6-4ea9-aa2e-51b3460a0865'
  AND slug LIKE 'prevent-in-education%';

COMMIT;

NOTIFY pgrst, 'reload schema';
