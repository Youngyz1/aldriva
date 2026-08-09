-- migration_58_business_entity_link_rollback.sql
--
-- WARNING (data implications, mirrors the caution in
-- migration_57_pending_deletion_status_rollback.sql):
--   - This does NOT delete the organizer rows that were auto-created by
--     ensure_business_organizer(). They become ordinary standalone
--     organizer rows with no back-reference from businesses, and lose the
--     is_business_auto_created marker entirely (the column is dropped). If
--     you want the auto-created ones gone too, identify them BEFORE
--     running this rollback — WHERE is_business_auto_created = true — and
--     delete deliberately; this rollback does not guess which ones are
--     safe to remove.
--   - This does NOT revert the one-time articles.organizer_id backfill
--     (step 6 of the forward migration). There is no recorded distinction
--     between an organizer_id that was already set before this migration
--     and one that was backfilled by it, so reverting it automatically
--     would risk clearing organizer_id values that were set some other
--     way. Leaving backfilled values in place is the safe direction.
--   - Once this rollback runs, deleting a business no longer cleans up
--     anything (cleanup_business_organizer() is dropped along with the
--     rest) — deleteBusiness() and the admin hard-delete both revert to
--     their pre-migration_58 behavior of only touching the businesses row.
--   - Also drops the two immutability guards (trg_businesses_lock_organizer_id,
--     trg_organizers_lock_auto_created) — harmless, since the columns they
--     protect are dropped in this same rollback anyway.

BEGIN;

DROP TRIGGER IF EXISTS trg_organizers_lock_auto_created ON organizers;
DROP FUNCTION IF EXISTS prevent_is_business_auto_created_change();

DROP TRIGGER IF EXISTS trg_businesses_lock_organizer_id ON businesses;
DROP FUNCTION IF EXISTS prevent_business_organizer_id_change();

DROP TRIGGER IF EXISTS trg_businesses_cleanup_organizer ON businesses;
DROP FUNCTION IF EXISTS cleanup_business_organizer();

DROP TRIGGER IF EXISTS trg_businesses_link_organizer ON businesses;
DROP FUNCTION IF EXISTS trg_link_business_organizer();
DROP FUNCTION IF EXISTS ensure_business_organizer(businesses);

DROP INDEX IF EXISTS idx_businesses_organizer_id;

ALTER TABLE businesses DROP COLUMN IF EXISTS organizer_id;
ALTER TABLE organizers DROP COLUMN IF EXISTS is_business_auto_created;

COMMIT;

NOTIFY pgrst, 'reload schema';
