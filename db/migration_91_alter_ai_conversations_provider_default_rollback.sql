-- migration_91_alter_ai_conversations_provider_default_rollback.sql

BEGIN;

ALTER TABLE ai_conversations
  ALTER COLUMN ai_provider SET DEFAULT 'ollama';

COMMIT;

NOTIFY pgrst, 'reload schema';
