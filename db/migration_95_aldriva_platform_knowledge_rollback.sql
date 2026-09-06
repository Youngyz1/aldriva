-- migration_95_aldriva_platform_knowledge_rollback.sql
-- Removes the seeded permanent knowledge base rows.

BEGIN;

DELETE FROM ai_knowledge_docs
WHERE (category, title) IN (
  ('mission', 'Aldriva Mission'),
  ('vision', 'Aldriva Vision'),
  ('feature_status', 'Aldriva Feature Status (verified Sep 2026)'),
  ('content_levels', 'Aldriva Content Levels'),
  ('content_rules', 'Aldriva Core Content Rules')
);

COMMIT;

NOTIFY pgrst, 'reload schema';
