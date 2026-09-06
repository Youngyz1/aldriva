-- migration_99_guest_import_and_lifecycle.sql
-- Phase 6 Extension: Bulk Guest Import Batch Tracking, Guest Image/Lifecycle, and Retention

BEGIN;

-- 1. Extend event_invitations

ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS personal_message TEXT;
ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMPTZ;
ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS lifecycle_state TEXT
  NOT NULL DEFAULT 'ACTIVE'
  CHECK (lifecycle_state IN ('DRAFT', 'ACTIVE', 'EVENT_ENDED', 'RETENTION', 'PURGED'));
ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS import_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_event_invitations_lifecycle
  ON event_invitations(lifecycle_state, event_id);
CREATE INDEX IF NOT EXISTS idx_event_invitations_import_batch
  ON event_invitations(import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- 2. guest_import_batches

CREATE TABLE IF NOT EXISTS guest_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'preview'
    CHECK (status IN ('preview', 'importing', 'complete', 'failed', 'cancelled')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  raw_csv_key TEXT,
  raw_csv_size_bytes INTEGER,
  error_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  purged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_guest_import_batches_event_id ON guest_import_batches(event_id);
CREATE INDEX IF NOT EXISTS idx_guest_import_batches_status ON guest_import_batches(status, event_id);

ALTER TABLE guest_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizers manage their import batches" ON guest_import_batches;
CREATE POLICY "Organizers manage their import batches" ON guest_import_batches
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = guest_import_batches.event_id
        AND (events.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM organizers WHERE organizers.id = events.organizer_id
            AND (organizers.user_id = auth.uid()
              OR is_entity_member(events.organizer_id, ARRAY['owner','admin','manager']))))
    )
    OR is_event_team_member(guest_import_batches.event_id, ARRAY['event_manager'])
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = guest_import_batches.event_id
        AND (events.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM organizers WHERE organizers.id = events.organizer_id
            AND (organizers.user_id = auth.uid()
              OR is_entity_member(events.organizer_id, ARRAY['owner','admin','manager']))))
    )
    OR is_event_team_member(guest_import_batches.event_id, ARRAY['event_manager'])
  );

-- 3. guest_import_rows

CREATE TABLE IF NOT EXISTS guest_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES guest_import_batches(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_name TEXT,
  raw_email TEXT,
  raw_phone TEXT,
  raw_section TEXT,
  raw_row TEXT,
  raw_seat TEXT,
  raw_table TEXT,
  raw_ticket_type TEXT,
  raw_image_url TEXT,
  raw_image_file TEXT,
  raw_message TEXT,
  raw_rsvp_deadline TEXT,
  resolved_seat_id UUID REFERENCES seats(id) ON DELETE SET NULL,
  resolved_ticket_type_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'valid', 'warning', 'error', 'imported', 'skipped')),
  errors JSONB NOT NULL DEFAULT '[]',
  warnings JSONB NOT NULL DEFAULT '[]',
  created_invitation_id UUID REFERENCES event_invitations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_import_rows_batch_id ON guest_import_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_guest_import_rows_status ON guest_import_rows(batch_id, status);

ALTER TABLE guest_import_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizers access their import rows" ON guest_import_rows;
CREATE POLICY "Organizers access their import rows" ON guest_import_rows
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM guest_import_batches b
      JOIN events e ON e.id = b.event_id
      WHERE b.id = guest_import_rows.batch_id
        AND (e.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM organizers WHERE organizers.id = e.organizer_id
            AND (organizers.user_id = auth.uid()
              OR is_entity_member(e.organizer_id, ARRAY['owner','admin','manager'])))
          OR is_event_team_member(b.event_id, ARRAY['event_manager'])
          OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guest_import_batches b
      JOIN events e ON e.id = b.event_id
      WHERE b.id = guest_import_rows.batch_id
        AND (e.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM organizers WHERE organizers.id = e.organizer_id
            AND (organizers.user_id = auth.uid()
              OR is_entity_member(e.organizer_id, ARRAY['owner','admin','manager'])))
          OR is_event_team_member(b.event_id, ARRAY['event_manager']))
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
