-- migration_111_conversations_messages_rollback.sql
--
-- Rollback for migration_111: removes messages then conversations.

BEGIN;

DROP TRIGGER IF EXISTS trg_messages_touch_conversation ON messages;
DROP FUNCTION IF EXISTS touch_conversation_last_message();
DROP TRIGGER IF EXISTS trg_messages_tenant_match ON messages;
DROP FUNCTION IF EXISTS enforce_message_tenant_match();
DROP TABLE IF EXISTS messages CASCADE;

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
DROP FUNCTION IF EXISTS update_conversations_updated_at();
DROP TABLE IF EXISTS conversations CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
