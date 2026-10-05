-- migration_152_studio_chat_persistence_rollback.sql
-- Stage 22 rollback: removes the Studio chat persistence tables, restoring
-- the pre-152 schema exactly. Messages first (child), then conversations.
-- No audit tables are touched: deletes here never reference
-- system_events / agent_steps / ai_guard_rejections / incident_events.
-- Re-applying this rollback drops all stored Studio chats with no recovery.

BEGIN;

DROP TABLE IF EXISTS studio_chat_messages;
DROP TABLE IF EXISTS studio_chat_conversations;

COMMIT;

NOTIFY pgrst, 'reload schema';
