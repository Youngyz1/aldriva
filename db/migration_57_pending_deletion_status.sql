-- migration_57_pending_deletion_status.sql
--
-- Allow `pending_deletion` in profiles_status_check.
--
-- Account deletion has been failing outright with
--   new row for relation "profiles" violates check constraint "profiles_status_check"
-- because app/api/account/route.ts writes 'pending_deletion' and the constraint
-- only permitted ('active','suspended','purged'). That is the single mismatch —
-- every other status-writing path already writes a permitted value.
--
-- `purged` is kept as the terminal state rather than introducing a synonym like
-- `deactivated`; it already exists, is already permitted, and is already what
-- the cron writes.
--
-- Status lifecycle after this migration:
--   active            normal
--   suspended         admin action
--   pending_deletion  user requested deletion; 14-day grace period running
--   purged            grace period elapsed; permanently inaccessible, data retained
--
-- Additive only. No existing row uses 'pending_deletion' and no existing query
-- is affected by widening the allowed set.
--
-- Rollback: db/migration_57_pending_deletion_status_rollback.sql

BEGIN;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_status_check
  CHECK (status = ANY (ARRAY[
    'active'::text,
    'suspended'::text,
    'pending_deletion'::text,
    'purged'::text
  ]));

COMMIT;

NOTIFY pgrst, 'reload schema';
