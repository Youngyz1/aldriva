-- migration_76_event_team_and_invitations_rollback.sql
--
-- Drops all database objects created by
-- migration_76_event_team_and_invitations.sql:
--   - RLS policies on event_team_invitations and event_team_members
--   - is_event_team_member() SQL helper function
--   - event_team_invitations table
--   - event_team_members table
--   - Associated indexes and constraints (dropped implicitly via DROP TABLE)
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- WARNING — PERMANENT DATA LOSS
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- Running this rollback will CASCADE-delete every row in:
--
--   event_team_invitations  — all pending, accepted, and revoked invitations
--   event_team_members      — all active and removed staff memberships
--
-- This is NOT a soft delete. Once run, all event team membership
-- history is permanently destroyed and cannot be recovered without a
-- database backup. Do NOT run this against production if any events
-- have active door staff or accepted invitations unless you have
-- confirmed a backup exists and data loss is acceptable.
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
--
-- NOTE — application code revert:
-- This file covers database objects only. The following files were
-- created or modified as part of migration_76 and must be reverted
-- separately via git:
--
--   lib/event-auth.ts                              (new file — delete)
--   lib/dashboard-api.ts                           (bindPendingEventInvitations call — revert)
--   app/api/events/[id]/team/invite/route.ts       (new file — delete)
--   app/api/events/team/accept/route.ts            (new file — delete)
--   app/api/verify-ticket/route.ts                 (hasEventOrOrganizerAccess import — revert)
--
-- This matches the schema-only convention used by all prior rollbacks
-- in this codebase.
--
-- DEPENDENCY ORDER: invitations must be dropped before members because
-- the accepted invitation UX creates members — though neither table
-- has a foreign key to the other, we drop invitations first (it has
-- no dependents), then members.

BEGIN;

-- 1. Drop RLS policies (must precede table drops; policies are dropped
--    automatically with the table but we make the intent explicit here
--    to match the convention in migration_59_entity_members_rollback.sql)
DROP POLICY IF EXISTS "Users can view relevant event team invitations" ON event_team_invitations;
DROP POLICY IF EXISTS "Organizers manage event team invitations"       ON event_team_invitations;

DROP POLICY IF EXISTS "Users can view relevant event team members"     ON event_team_members;
DROP POLICY IF EXISTS "Organizers manage event team members"           ON event_team_members;

-- 2. Drop helper function (depends on event_team_members; must be
--    dropped before the table so nothing is left referencing it)
DROP FUNCTION IF EXISTS is_event_team_member(UUID, TEXT[]);

-- 3. Drop tables (CASCADE ensures any remaining dependent objects
--    such as indexes and constraints are removed cleanly)
DROP TABLE IF EXISTS event_team_invitations CASCADE;
DROP TABLE IF EXISTS event_team_members CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';
