-- Rollback for migration 193: drop the active-user unique index on event_team_members.
DROP INDEX IF EXISTS public.idx_event_team_members_active_user;
