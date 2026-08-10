-- migration_71_recipient_ledger_entries_rollback.sql
-- Drops everything migration_71_recipient_ledger_entries.sql created, and
-- nothing else. Safe at any point before Phase B.2 exists -- nothing else
-- references recipient_ledger_entries or prevent_ledger_entry_mutation().

BEGIN;

DROP TRIGGER IF EXISTS trg_recipient_ledger_entries_no_delete
  ON recipient_ledger_entries;

DROP TRIGGER IF EXISTS trg_recipient_ledger_entries_no_update
  ON recipient_ledger_entries;

DROP FUNCTION IF EXISTS prevent_ledger_entry_mutation();

DROP TABLE IF EXISTS recipient_ledger_entries;

COMMIT;

NOTIFY pgrst, 'reload schema';
