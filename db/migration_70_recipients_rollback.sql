-- migration_70_recipients_rollback.sql
-- Drops everything migration_70_recipients.sql created. Safe to run at any
-- point in Phase A since no other table/function/trigger references
-- `recipients` or resolve_recipient() yet -- nothing is wired to them.

BEGIN;

DROP FUNCTION IF EXISTS resolve_recipient(TEXT, UUID, UUID, UUID);
DROP TABLE IF EXISTS recipients;

COMMIT;

NOTIFY pgrst, 'reload schema';
