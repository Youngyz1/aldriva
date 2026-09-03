-- migration_91_alter_ai_conversations_provider_default.sql
-- Alters default ai_provider in ai_conversations from 'ollama' to 'gemini'

BEGIN;

ALTER TABLE ai_conversations
  ALTER COLUMN ai_provider SET DEFAULT 'gemini';

COMMIT;

NOTIFY pgrst, 'reload schema';
