-- 20260824210001_migration_76_event_team_and_invitations.sql
-- Phase 1 Part B: Schema, Security Grants, and RLS Policies for Event Team Members and Invitations.

BEGIN;

CREATE TABLE IF NOT EXISTS event_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('event_manager', 'ticket_scanner')),
  entrance_id UUID,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_team_members_event_id ON event_team_members(event_id);
CREATE INDEX IF NOT EXISTS idx_event_team_members_user_id ON event_team_members(user_id);
ALTER TABLE event_team_members ADD CONSTRAINT event_team_members_event_user_key UNIQUE (event_id, user_id);

CREATE TABLE IF NOT EXISTS event_team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('event_manager', 'ticket_scanner')),
  entrance_id UUID,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_team_invitations_event ON event_team_invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_team_invitations_email_status ON event_team_invitations(email, status);

REVOKE SELECT (token) ON event_team_invitations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION is_event_team_member(p_event_id UUID, p_roles TEXT[] DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_team_members
    WHERE event_id = p_event_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND (p_roles IS NULL OR role = ANY(p_roles))
  );
$$;

ALTER TABLE event_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_team_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view relevant event team members" ON event_team_members;
CREATE POLICY "Users can view relevant event team members" ON event_team_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_team_members.event_id
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

DROP POLICY IF EXISTS "Organizers manage event team members" ON event_team_members;
CREATE POLICY "Organizers manage event team members" ON event_team_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_team_members.event_id
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
      WHERE events.id = event_team_members.event_id
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

DROP POLICY IF EXISTS "Users can view relevant event team invitations" ON event_team_invitations;
CREATE POLICY "Users can view relevant event team invitations" ON event_team_invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_team_invitations.event_id
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
    OR (
      status = 'pending'
      AND LOWER(email) = LOWER(auth.jwt()->>'email')
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Organizers manage event team invitations" ON event_team_invitations;
CREATE POLICY "Organizers manage event team invitations" ON event_team_invitations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_team_invitations.event_id
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
      WHERE events.id = event_team_invitations.event_id
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
