-- migration_92_event_invitations_and_ticket_instances.sql
-- Phase 1: event_invitations table, ticket_instances polymorphism (order_id nullable, invitation_id, source),
-- and data integrity constraints.

BEGIN;

-- 1. Table: event_invitations
CREATE TABLE IF NOT EXISTS event_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  guest_title TEXT,
  organization TEXT,
  email TEXT,
  phone TEXT,
  token TEXT UNIQUE NOT NULL,
  invitation_status TEXT NOT NULL DEFAULT 'draft' CHECK (invitation_status IN ('draft', 'sent', 'cancelled', 'revoked', 'expired')),
  rsvp_status TEXT NOT NULL DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'accepted', 'declined')),
  rsvp_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_invitations_event_id ON event_invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_invitations_email ON event_invitations(email);
CREATE INDEX IF NOT EXISTS idx_event_invitations_token ON event_invitations(token);
CREATE INDEX IF NOT EXISTS idx_event_invitations_status ON event_invitations(invitation_status, rsvp_status);

-- 2. Security Grants: Revoke direct SELECT on token column from anon and authenticated PostgREST roles (mirrors migration_76)
REVOKE SELECT (token) ON event_invitations FROM anon, authenticated;

-- 3. Enable RLS on event_invitations
ALTER TABLE event_invitations ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy for event_invitations
DROP POLICY IF EXISTS "Organizers and event managers can manage event invitations" ON event_invitations;
CREATE POLICY "Organizers and event managers can manage event invitations" ON event_invitations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_invitations.event_id
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
      WHERE events.id = event_invitations.event_id
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

-- 5. Modify ticket_instances: make order_id nullable, add invitation_id and source
ALTER TABLE ticket_instances ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE ticket_instances ADD COLUMN IF NOT EXISTS invitation_id UUID REFERENCES event_invitations(id) ON DELETE CASCADE;

ALTER TABLE ticket_instances ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'purchase' CHECK (source IN ('purchase', 'invitation'));

-- Backfill any existing rows to source = 'purchase'
UPDATE ticket_instances SET source = 'purchase' WHERE source IS NULL;

-- 6. Add integrity CHECK constraint on ticket_instances
ALTER TABLE ticket_instances DROP CONSTRAINT IF EXISTS chk_ticket_instances_source_integrity;
ALTER TABLE ticket_instances ADD CONSTRAINT chk_ticket_instances_source_integrity CHECK (
  (source = 'purchase' AND order_id IS NOT NULL AND invitation_id IS NULL)
  OR
  (source = 'invitation' AND invitation_id IS NOT NULL AND order_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_ticket_instances_invitation_id ON ticket_instances(invitation_id);
CREATE INDEX IF NOT EXISTS idx_ticket_instances_source ON ticket_instances(source);

-- 7. Update ticket_instances RLS policy to include invitation guest email matches
DROP POLICY IF EXISTS "Users can view relevant ticket instances" ON ticket_instances;
CREATE POLICY "Users can view relevant ticket instances" ON ticket_instances
  FOR SELECT
  USING (
    (
      order_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM ticket_orders
        WHERE ticket_orders.id = ticket_instances.order_id
          AND (
            (auth.jwt()->>'email' IS NOT NULL AND LOWER(ticket_orders.buyer_email) = LOWER(auth.jwt()->>'email'))
            OR ticket_orders.buyer_email IS NULL
          )
      )
    )
    OR (
      invitation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM event_invitations
        WHERE event_invitations.id = ticket_instances.invitation_id
          AND auth.jwt()->>'email' IS NOT NULL
          AND LOWER(event_invitations.email) = LOWER(auth.jwt()->>'email')
      )
    )
    OR EXISTS (
      SELECT 1 FROM events
      WHERE events.id = ticket_instances.event_id
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
    OR is_event_team_member(event_id, ARRAY['event_manager', 'ticket_scanner'])
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
