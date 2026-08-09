-- migration_69_payment_reconciliation_failures_rollback.sql
-- Drops the table this migration created. Only run if no rows exist yet
-- (or the loss of existing reconciliation records is acceptable) — this
-- table exists specifically to preserve a record of charges that need
-- manual follow-up, so dropping it with unresolved rows destroys the
-- only trail back to them.

BEGIN;

DROP TABLE IF EXISTS payment_reconciliation_failures;

COMMIT;

NOTIFY pgrst, 'reload schema';
