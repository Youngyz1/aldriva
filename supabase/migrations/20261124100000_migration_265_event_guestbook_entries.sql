-- Migration 265: Event Guestbook Entries
-- Decouples guestbook wishes from event_invitations.rsvp_message.
-- Stores guestbook entries with moderation (is_visible), per-invitation attribution, and RLS.

CREATE TABLE IF NOT EXISTS event_guestbook_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invitation_id uuid REFERENCES event_invitations(id) ON DELETE SET NULL,
  guest_name text NOT NULL,
  message text NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT check_guest_name_length CHECK (length(trim(guest_name)) > 0 AND length(guest_name) <= 100),
  CONSTRAINT check_message_length CHECK (length(trim(message)) > 0 AND length(message) <= 500)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_guestbook_entries_event_visible_created
  ON event_guestbook_entries (event_id, is_visible, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_guestbook_entries_invitation
  ON event_guestbook_entries (invitation_id);

-- Enable RLS
ALTER TABLE event_guestbook_entries ENABLE ROW LEVEL SECURITY;

-- 1. Public can view visible guestbook entries
DROP POLICY IF EXISTS "Public can view visible guestbook entries" ON event_guestbook_entries;
CREATE POLICY "Public can view visible guestbook entries"
  ON event_guestbook_entries
  FOR SELECT
  USING (is_visible = true);

-- 2. Guests can insert guestbook entry for valid invitation
DROP POLICY IF EXISTS "Guests can insert guestbook entry for valid invitation" ON event_guestbook_entries;
CREATE POLICY "Guests can insert guestbook entry for valid invitation"
  ON event_guestbook_entries
  FOR INSERT
  WITH CHECK (
    invitation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM event_invitations
      WHERE event_invitations.id = event_guestbook_entries.invitation_id
        AND event_invitations.event_id = event_guestbook_entries.event_id
    )
  );

-- 3. Hosts and managers can view all entries (visible or hidden) and moderate (update/delete)
DROP POLICY IF EXISTS "Hosts and managers can moderate guestbook entries" ON event_guestbook_entries;
CREATE POLICY "Hosts and managers can moderate guestbook entries"
  ON event_guestbook_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_guestbook_entries.event_id
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
      WHERE events.id = event_guestbook_entries.event_id
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
