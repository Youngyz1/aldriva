-- migration_61_organizer_capability_tiers_rollback.sql
--
-- WARNING: narrowing organizer_visibility_audit_field_name_check back to
-- its pre-migration_61 domain will FAIL outright if any row currently
-- holds field_name IN ('payment_enabled', 'fundraising_approved') —
-- delete or migrate those rows first:
--
--   DELETE FROM organizer_visibility_audit
--   WHERE field_name IN ('payment_enabled', 'fundraising_approved');
--
-- (Destructive, but those rows are meaningless once the columns they
-- describe no longer exist — this mirrors migration_57's rollback
-- guidance for the same kind of narrowing-constraint problem.)

BEGIN;

DROP TRIGGER IF EXISTS trg_enforce_organizer_capability_columns ON organizers;
DROP FUNCTION IF EXISTS enforce_organizer_capability_columns();

ALTER TABLE organizer_visibility_audit DROP CONSTRAINT IF EXISTS organizer_visibility_audit_field_name_check;
ALTER TABLE organizer_visibility_audit ADD CONSTRAINT organizer_visibility_audit_field_name_check
  CHECK (field_name IN ('follower_offset', 'events_offset'));

ALTER TABLE organizers
  DROP COLUMN IF EXISTS payment_enabled,
  DROP COLUMN IF EXISTS payment_enabled_at,
  DROP COLUMN IF EXISTS fundraising_approved,
  DROP COLUMN IF EXISTS fundraising_approved_at;

COMMIT;

NOTIFY pgrst, 'reload schema';
