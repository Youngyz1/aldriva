-- migration_115_conversation_link_integrity_rollback.sql
--
-- Rollback for migration_115: drops the two hardening triggers/functions.
-- Leaves all tables, data, and RLS policies untouched.

BEGIN;

DROP TRIGGER IF EXISTS trg_conversations_link_tenant ON conversations;
DROP FUNCTION IF EXISTS enforce_conversation_link_tenant();

DROP TRIGGER IF EXISTS trg_connected_accounts_lock_tenant ON connected_accounts;
DROP FUNCTION IF EXISTS prevent_connected_account_tenant_change();

NOTIFY pgrst, 'reload schema';

COMMIT;
