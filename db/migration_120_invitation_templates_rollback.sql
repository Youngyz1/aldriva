-- migration_120_invitation_templates_rollback.sql
-- Rollback for migration 120: drop invitation_templates and column on events.

ALTER TABLE events DROP COLUMN IF EXISTS invitation_template_id;
DROP TABLE IF EXISTS invitation_templates CASCADE;

NOTIFY pgrst, 'reload schema';
