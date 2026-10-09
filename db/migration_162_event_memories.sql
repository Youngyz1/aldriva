-- migration_162_event_memories.sql
-- Round 4: guest photo Memories (event-level upload QR + moderation + retention).
--
-- Table names are pinned by lib/invitation-cleanup.ts (stale-draft eligibility
-- already counts event_memory_settings.event_id + event_memories.event_id):
-- 1. Table: event_memory_settings (1:1 with events via UNIQUE constraint)
--    - Holds the event-level photo-upload credential (token 'mem_' + base62,
--      generated in code, never the admission QR format) + require_approval
--      toggle (default true: approval required) + revocation.
-- 2. Table: event_memories (guest photos, private objects, never public URLs)
--    - status pending/approved/rejected; delete_token_hash lets the anonymous
--      uploader delete their own photo; report_count for guest reports.
-- 3. Table: event_memory_reports (guest reports against a photo).
-- 4. Table: event_memory_retention_notices (30d/7d notice audit log so the
--    retention job never double-sends).
-- 5. Storage bucket: event-memories (PRIVATE, 15MB). image/heic + image/heif
--    are allowed because iPhone uploads land as pending objects and are
--    converted server-side before final storage; pending keys are never
--    served. Delivery is exclusively via short-lived signed URLs minted
--    server-side after organizer/guest authorization.
--
-- Guest reads/writes go through service-role server code only; anon has no
-- grants. Authenticated organizers/event managers manage via RLS (same shape
-- as the event_invitation_pages policy, migration_154).
--
-- Safe to re-run (IF NOT EXISTS guards throughout).
-- Rollback: db/migration_162_event_memories_rollback.sql

BEGIN;

-- ── 1. Table: event_memory_settings ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_memory_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  UNIQUE (event_id),

  upload_token        TEXT UNIQUE NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  require_approval    BOOLEAN NOT NULL DEFAULT true,

  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_memory_settings_event_id ON public.event_memory_settings(event_id);
CREATE INDEX IF NOT EXISTS idx_memory_settings_token ON public.event_memory_settings(upload_token);

-- ── 2. Table: event_memories ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_memories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  settings_id         UUID REFERENCES public.event_memory_settings(id) ON DELETE SET NULL,

  storage_provider    TEXT NOT NULL CHECK (storage_provider IN ('supabase', 'r2')),
  object_key          TEXT NOT NULL,
  content_type        TEXT NOT NULL,
  size_bytes          BIGINT NOT NULL CHECK (size_bytes > 0),
  width               INTEGER CHECK (width IS NULL OR width BETWEEN 1 AND 8000),
  height              INTEGER CHECK (height IS NULL OR height BETWEEN 1 AND 8000),

  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  guest_label         TEXT CHECK (guest_label IS NULL OR char_length(guest_label) <= 80),
  delete_token_hash   TEXT,
  report_count        INTEGER NOT NULL DEFAULT 0 CHECK (report_count >= 0),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  moderated_at        TIMESTAMPTZ,
  moderated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_event_status ON public.event_memories(event_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_delete_token ON public.event_memories(delete_token_hash)
  WHERE delete_token_hash IS NOT NULL;

-- ── 3. Table: event_memory_reports ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_memory_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id           UUID NOT NULL REFERENCES public.event_memories(id) ON DELETE CASCADE,
  reason              TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  reporter_ip         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_reports_memory_id ON public.event_memory_reports(memory_id);

-- ── 4. Table: event_memory_retention_notices ────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_memory_retention_notices (
  event_id            UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  notice_kind         TEXT NOT NULL CHECK (notice_kind IN ('30d', '7d')),
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, notice_kind)
);

-- ── 5. RLS (organizer/event-manager manage shape, mirrors migration_154) ─

REVOKE ALL ON TABLE public.event_memory_settings FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.event_memory_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_memory_settings TO authenticated;
GRANT ALL ON TABLE public.event_memory_settings TO service_role;

REVOKE ALL ON TABLE public.event_memories FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.event_memories FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_memories TO authenticated;
GRANT ALL ON TABLE public.event_memories TO service_role;

REVOKE ALL ON TABLE public.event_memory_reports FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.event_memory_reports FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_memory_reports TO authenticated;
GRANT ALL ON TABLE public.event_memory_reports TO service_role;

REVOKE ALL ON TABLE public.event_memory_retention_notices FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.event_memory_retention_notices FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_memory_retention_notices TO authenticated;
GRANT ALL ON TABLE public.event_memory_retention_notices TO service_role;

ALTER TABLE public.event_memory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_memory_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_memory_retention_notices ENABLE ROW LEVEL SECURITY;

-- One manage policy per table, scoped by the row's event_id (reports join
-- through their photo). Same authorization shape as migration_154:
-- event owner, organizer owner/admin/manager, event_manager team role,
-- active platform admin.
DROP POLICY IF EXISTS "Organizers and event managers can manage memory settings" ON public.event_memory_settings;
CREATE POLICY "Organizers and event managers can manage memory settings" ON public.event_memory_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_memory_settings.event_id
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.organizers o
            WHERE o.id = e.organizer_id
              AND (
                o.user_id = auth.uid()
                OR is_entity_member(e.organizer_id, ARRAY['owner', 'admin', 'manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager'])
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_memory_settings.event_id
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.organizers o
            WHERE o.id = e.organizer_id
              AND (
                o.user_id = auth.uid()
                OR is_entity_member(e.organizer_id, ARRAY['owner', 'admin', 'manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager'])
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Organizers and event managers can manage memories" ON public.event_memories;
CREATE POLICY "Organizers and event managers can manage memories" ON public.event_memories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_memories.event_id
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.organizers o
            WHERE o.id = e.organizer_id
              AND (
                o.user_id = auth.uid()
                OR is_entity_member(e.organizer_id, ARRAY['owner', 'admin', 'manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager'])
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_memories.event_id
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.organizers o
            WHERE o.id = e.organizer_id
              AND (
                o.user_id = auth.uid()
                OR is_entity_member(e.organizer_id, ARRAY['owner', 'admin', 'manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager'])
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Organizers and event managers can manage memory reports" ON public.event_memory_reports;
CREATE POLICY "Organizers and event managers can manage memory reports" ON public.event_memory_reports
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_memories m
      JOIN public.events e ON e.id = m.event_id
      WHERE m.id = event_memory_reports.memory_id
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.organizers o
            WHERE o.id = e.organizer_id
              AND (
                o.user_id = auth.uid()
                OR is_entity_member(e.organizer_id, ARRAY['owner', 'admin', 'manager'])
              )
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.event_memories m
      WHERE m.id = event_memory_reports.memory_id
        AND is_event_team_member(m.event_id, ARRAY['event_manager'])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_memories m
      JOIN public.events e ON e.id = m.event_id
      WHERE m.id = event_memory_reports.memory_id
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.organizers o
            WHERE o.id = e.organizer_id
              AND (
                o.user_id = auth.uid()
                OR is_entity_member(e.organizer_id, ARRAY['owner', 'admin', 'manager'])
              )
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.event_memories m
      WHERE m.id = event_memory_reports.memory_id
        AND is_event_team_member(m.event_id, ARRAY['event_manager'])
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Organizers and event managers can manage retention notices" ON public.event_memory_retention_notices;
CREATE POLICY "Organizers and event managers can manage retention notices" ON public.event_memory_retention_notices
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_memory_retention_notices.event_id
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.organizers o
            WHERE o.id = e.organizer_id
              AND (
                o.user_id = auth.uid()
                OR is_entity_member(e.organizer_id, ARRAY['owner', 'admin', 'manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager'])
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_memory_retention_notices.event_id
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.organizers o
            WHERE o.id = e.organizer_id
              AND (
                o.user_id = auth.uid()
                OR is_entity_member(e.organizer_id, ARRAY['owner', 'admin', 'manager'])
              )
          )
        )
    )
    OR is_event_team_member(event_id, ARRAY['event_manager'])
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.status = 'active'
    )
  );

-- ── 6. Storage bucket: event-memories (PRIVATE) ─────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-memories',
  'event-memories',
  false,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No storage.objects policies for this bucket: all guest and organizer
-- access goes through service-role signed URLs minted server-side
-- (upload-url / download routes). Service role bypasses RLS.

COMMIT;

NOTIFY pgrst, 'reload schema';
