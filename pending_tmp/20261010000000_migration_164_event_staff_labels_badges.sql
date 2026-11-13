-- migration_164_event_staff_labels_badges.sql
-- STAFF ROUND Phase A, step A1: schema only (no app code, no RPC changes).
--
-- Owner decisions pinned here:
-- - Organizer writes free-text role names (e.g. "VIP door") and positions
--   (e.g. "Main entrance"). Both are display labels shown in the dashboard
--   and scan records; they limit nothing. The fixed permission level behind
--   each invite stays the existing event_team CHECK
--   ('event_manager','ticket_scanner') — labels are NEVER read for authz.
-- - Each accepted staff member gets a staff badge QR with a distinct token
--   prefix (`stf_`, mirroring the /m/ `mem_` memories pattern). Scanning it
--   records a STAFF check-in, separate from guest attendance.
-- - Pending invitations never yield a badge: badge columns live ONLY on
--   event_team_members (minted at accept time). event_team_invitations gets
--   labels + staff_name only, and this file asserts that (see tests).
-- - Every staff scan creates a row (decision 3): event_staff_checkins has NO
--   unique constraint besides its PK. The dashboard derives first/latest per
--   person with MAX/MIN over scanned_at — no dedupe at write time.
-- - Staff badges are online-only (decision 4): scan_source is pinned to
--   'online' by CHECK. Offline dataset/sync code is untouched by design.
-- - Self-scan blocking (decision 2) and per-scanner/device rate limiting
--   (decision 7) are enforced in the app (A4); this schema stores the
--   attribution columns they need (scanned_by_user_id, device_id,
--   scanned_at) plus indexes for counting recent attempts.
-- - Badge tokens are stored plaintext in A1, matching the existing
--   event_team_invitations.token precedent (migration_76). Hashing + short
--   display code is a recommendation only (decision 8, reported separately).
--
-- Isolation (decision 1): this migration touches ONLY event_team_members,
-- event_team_invitations, and the new event_staff_checkins table. It does
-- NOT touch check_in_ticket, ticket_instances, ticket_checkins,
-- offline_scan_conflicts, or any offline scanner object. Pinned by tests.
--
-- Safe to re-run (IF NOT EXISTS / DROP IF EXISTS guards throughout).
-- Rollback: db/migration_164_event_staff_labels_badges_rollback.sql

BEGIN;

-- 1. Invitation labels: organizer-entered, copied to the member row on accept.
ALTER TABLE event_team_invitations ADD COLUMN IF NOT EXISTS role_label TEXT;
ALTER TABLE event_team_invitations ADD COLUMN IF NOT EXISTS position_label TEXT;
ALTER TABLE event_team_invitations ADD COLUMN IF NOT EXISTS staff_name TEXT;

ALTER TABLE event_team_invitations DROP CONSTRAINT IF EXISTS event_team_invitations_role_label_len;
ALTER TABLE event_team_invitations ADD CONSTRAINT event_team_invitations_role_label_len
  CHECK (role_label IS NULL OR char_length(role_label) <= 80);
ALTER TABLE event_team_invitations DROP CONSTRAINT IF EXISTS event_team_invitations_position_label_len;
ALTER TABLE event_team_invitations ADD CONSTRAINT event_team_invitations_position_label_len
  CHECK (position_label IS NULL OR char_length(position_label) <= 80);
ALTER TABLE event_team_invitations DROP CONSTRAINT IF EXISTS event_team_invitations_staff_name_len;
ALTER TABLE event_team_invitations ADD CONSTRAINT event_team_invitations_staff_name_len
  CHECK (staff_name IS NULL OR char_length(staff_name) <= 120);

-- 2. Member labels + badge: minted at accept time, never for pending invites.
ALTER TABLE event_team_members ADD COLUMN IF NOT EXISTS role_label TEXT;
ALTER TABLE event_team_members ADD COLUMN IF NOT EXISTS position_label TEXT;
ALTER TABLE event_team_members ADD COLUMN IF NOT EXISTS staff_name TEXT;
ALTER TABLE event_team_members ADD COLUMN IF NOT EXISTS badge_token TEXT;
ALTER TABLE event_team_members ADD COLUMN IF NOT EXISTS badge_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE event_team_members ADD COLUMN IF NOT EXISTS badge_issued_at TIMESTAMPTZ;
ALTER TABLE event_team_members ADD COLUMN IF NOT EXISTS badge_revoked_at TIMESTAMPTZ;

ALTER TABLE event_team_members DROP CONSTRAINT IF EXISTS event_team_members_role_label_len;
ALTER TABLE event_team_members ADD CONSTRAINT event_team_members_role_label_len
  CHECK (role_label IS NULL OR char_length(role_label) <= 80);
ALTER TABLE event_team_members DROP CONSTRAINT IF EXISTS event_team_members_position_label_len;
ALTER TABLE event_team_members ADD CONSTRAINT event_team_members_position_label_len
  CHECK (position_label IS NULL OR char_length(position_label) <= 80);
ALTER TABLE event_team_members DROP CONSTRAINT IF EXISTS event_team_members_staff_name_len;
ALTER TABLE event_team_members ADD CONSTRAINT event_team_members_staff_name_len
  CHECK (staff_name IS NULL OR char_length(staff_name) <= 120);
ALTER TABLE event_team_members DROP CONSTRAINT IF EXISTS event_team_members_badge_status_check;
ALTER TABLE event_team_members ADD CONSTRAINT event_team_members_badge_status_check
  CHECK (badge_status IN ('active', 'revoked'));

-- Badge tokens are unique across members. A UNIQUE INDEX (not a table
-- constraint) keeps this re-runnable; multiple NULLs (members without a
-- badge yet) never conflict in Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_members_badge_token
  ON event_team_members(badge_token);
CREATE INDEX IF NOT EXISTS idx_event_team_members_badge_status
  ON event_team_members(badge_status) WHERE badge_status = 'revoked';

-- Badge token values are service-role secrets: hide the column from
-- PostgREST roles, matching the migration_76 token precedent.
REVOKE SELECT (badge_token) ON event_team_members FROM anon, authenticated;

-- 3. Staff check-ins: append-only audit, one row per scan (no uniqueness).
CREATE TABLE IF NOT EXISTS event_staff_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  staff_member_id UUID NOT NULL REFERENCES event_team_members(id) ON DELETE CASCADE,
  badge_token TEXT NOT NULL,
  scanned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entrance_id UUID,
  device_id TEXT,
  scan_source TEXT NOT NULL DEFAULT 'online',
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Online-only pin: staff badges are never recorded from the offline queue.
ALTER TABLE event_staff_checkins DROP CONSTRAINT IF EXISTS event_staff_checkins_source_online_check;
ALTER TABLE event_staff_checkins ADD CONSTRAINT event_staff_checkins_source_online_check
  CHECK (scan_source = 'online');

-- First/latest-per-person reads + rate-limit counting windows.
CREATE INDEX IF NOT EXISTS idx_event_staff_checkins_event_id ON event_staff_checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_event_staff_checkins_event_time
  ON event_staff_checkins(event_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_staff_checkins_member_time
  ON event_staff_checkins(staff_member_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_staff_checkins_scanner
  ON event_staff_checkins(scanned_by_user_id, scanned_at DESC)
  WHERE scanned_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_staff_checkins_device_time
  ON event_staff_checkins(device_id, scanned_at DESC)
  WHERE device_id IS NOT NULL;

-- Badge snapshot is a secret like the member badge token.
REVOKE SELECT (badge_token) ON event_staff_checkins FROM anon, authenticated;

-- 4. RLS: mirror the migration_76/migration_77 gate set (event owner,
-- organizer owner / entity owner+admin+manager, event_manager, admin),
-- plus a self branch so accepted staff can read their own scan history
-- (decision 5: reopen badge + see own record from their own dashboard).
ALTER TABLE event_staff_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant staff checkins" ON event_staff_checkins;
CREATE POLICY "Users can view relevant staff checkins" ON event_staff_checkins
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_staff_checkins.event_id
        AND (
          events.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM organizers
            WHERE organizers.id = events.organizer_id
              AND (
                organizers.user_id = auth.uid()
                OR is_entity_member(events.organizer_id, ARRAY['owner','admin','manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager'])
    OR EXISTS (
      SELECT 1 FROM event_team_members m
      WHERE m.id = event_staff_checkins.staff_member_id
        AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- Writes go through service-role routes only (same posture as
-- event_team_invitations FOR ALL: managers, never self-serve).
DROP POLICY IF EXISTS "Organizers manage staff checkins" ON event_staff_checkins;
CREATE POLICY "Organizers manage staff checkins" ON event_staff_checkins
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_staff_checkins.event_id
        AND (
          events.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM organizers
            WHERE organizers.id = events.organizer_id
              AND (
                organizers.user_id = auth.uid()
                OR is_entity_member(events.organizer_id, ARRAY['owner','admin','manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_staff_checkins.event_id
        AND (
          events.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM organizers
            WHERE organizers.id = events.organizer_id
              AND (
                organizers.user_id = auth.uid()
                OR is_entity_member(events.organizer_id, ARRAY['owner','admin','manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
