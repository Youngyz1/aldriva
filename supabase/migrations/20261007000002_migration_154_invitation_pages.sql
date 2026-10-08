-- migration_154_invitation_pages.sql
-- Phase 3.1: Invitation Pages data plane, preview tokens, and invitation-media storage bucket.
--
-- Schema additions:
-- 1. Table: event_invitation_pages (1:1 with events via UNIQUE constraint)
--    - Holds draft content columns for the host creator wizard.
--    - Holds published_snapshot JSONB (page-content only, never events.* or guest PII).
--    - Gated by page_status ('draft', 'published').
--    - Guest and preview reads go through server-side service-role code only; anon has no grants.
-- 2. Table: invitation_page_preview_tokens (1:1 with events via UNIQUE constraint)
--    - 64-char hex token for draft preview sharing, 7-day TTL.
-- 3. Storage bucket: invitation-media (public-read, authenticated write for audio).
--    - Size limit: 5MB, MIME types: audio/mpeg, audio/mp4.
--    - RLS: writes scoped to event managers matching events.id prefix in storage path.
--    - Public bucket serves files directly by URL; no listing SELECT policy is added.
--
-- Helper functions cited:
-- - is_entity_member(uuid, text[]) -> migration_62_entity_permissions.sql:58
-- - is_event_team_member(uuid, text[]) -> migration_76_event_team_and_invitations.sql:49
--
-- Rollback: db/migration_154_invitation_pages_rollback.sql

BEGIN;

-- ── 1. Table: event_invitation_pages ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_invitation_pages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  UNIQUE (event_id),

  -- Template & localization
  template_id         TEXT NOT NULL DEFAULT 'gala-editorial',
  locale              TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'fr')),

  -- Publish state & live snapshot
  page_status         TEXT NOT NULL DEFAULT 'draft' CHECK (page_status IN ('draft', 'published')),
  published_at        TIMESTAMPTZ,
  published_snapshot  JSONB,

  -- Draft: Core scalars & typography overrides
  display_title       TEXT,
  eyebrow             TEXT,
  host_names          TEXT,
  story_headline      TEXT,
  story_text          TEXT CHECK (char_length(story_text) <= 3000),
  story_image_url     TEXT,

  -- Draft: Hero image & viewport configuration
  hero_image_url      TEXT,
  hero_image_alt      TEXT,
  hero_image_focus_x  SMALLINT DEFAULT 50 CHECK (hero_image_focus_x BETWEEN 0 AND 100),
  hero_image_focus_y  SMALLINT DEFAULT 50 CHECK (hero_image_focus_y BETWEEN 0 AND 100),
  scroll_prompt       TEXT,

  -- Draft: Venue & timing overrides
  venue_name          TEXT,
  address             TEXT,
  parking_notes       TEXT,
  timezone            TEXT,

  -- Draft: Dress code & logistics
  dress_code          TEXT CHECK (char_length(dress_code) <= 80),
  dress_code_notes    TEXT CHECK (char_length(dress_code_notes) <= 500),
  additional_notes    TEXT CHECK (char_length(additional_notes) <= 1000),
  hashtag             TEXT CHECK (char_length(hashtag) <= 100),

  -- Draft: Music (invitation-media bucket)
  music_audio_url     TEXT,
  music_title         TEXT CHECK (char_length(music_title) <= 100),

  -- Draft: Wedding scalars
  partner1_name       TEXT,
  partner2_name       TEXT,
  family_note         TEXT,
  wedding_subtype     TEXT CHECK (wedding_subtype IN ('traditional', 'civil', 'church', 'engagement', 'vow_renewal')),
  registry_note       TEXT CHECK (char_length(registry_note) <= 500),

  -- Draft: Birthday scalars
  celebrant_name      TEXT,
  age_milestone       TEXT CHECK (char_length(age_milestone) <= 20),
  theme               TEXT CHECK (char_length(theme) <= 80),
  gift_note           TEXT CHECK (char_length(gift_note) <= 500),

  -- Draft: Array structures (Zod-validated JSONB)
  schedule            JSONB,
  gallery             JSONB,
  venues              JSONB,
  accommodations      JSONB,
  colors_of_the_day   JSONB,
  wedding_story       JSONB,

  -- Metadata
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitation_pages_event_id ON public.event_invitation_pages(event_id);
CREATE INDEX IF NOT EXISTS idx_invitation_pages_status ON public.event_invitation_pages(page_status);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_event_invitation_pages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_invitation_pages_updated_at ON public.event_invitation_pages;
CREATE TRIGGER trg_event_invitation_pages_updated_at
  BEFORE UPDATE ON public.event_invitation_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_event_invitation_pages_updated_at();

-- Doctrine: Revoke public/anon, grant least-privilege to authenticated and service_role.
-- Guest and preview reads execute exclusively via server-side service-role queries.
REVOKE ALL ON TABLE public.event_invitation_pages FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.event_invitation_pages FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_invitation_pages TO authenticated;
GRANT ALL ON TABLE public.event_invitation_pages TO service_role;

ALTER TABLE public.event_invitation_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizers and event managers can manage invitation pages" ON public.event_invitation_pages;
CREATE POLICY "Organizers and event managers can manage invitation pages" ON public.event_invitation_pages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_invitation_pages.event_id
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
      WHERE e.id = event_invitation_pages.event_id
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

-- ── 2. Table: invitation_page_preview_tokens ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.invitation_page_preview_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  UNIQUE (event_id),
  token       TEXT UNIQUE NOT NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitation_preview_tokens_token ON public.invitation_page_preview_tokens(token);

REVOKE ALL ON TABLE public.invitation_page_preview_tokens FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.invitation_page_preview_tokens FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invitation_page_preview_tokens TO authenticated;
GRANT ALL ON TABLE public.invitation_page_preview_tokens TO service_role;

ALTER TABLE public.invitation_page_preview_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizers and event managers can manage preview tokens" ON public.invitation_page_preview_tokens;
CREATE POLICY "Organizers and event managers can manage preview tokens" ON public.invitation_page_preview_tokens
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = invitation_page_preview_tokens.event_id
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
      WHERE e.id = invitation_page_preview_tokens.event_id
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

-- ── 3. Storage Bucket: invitation-media ────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invitation-media',
  'invitation-media',
  true,
  5242880,
  ARRAY['audio/mpeg', 'audio/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Event managers can upload invitation media" ON storage.objects;
CREATE POLICY "Event managers can upload invitation media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invitation-media'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id::text = (storage.foldername(storage.objects.name))[1]
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
          OR is_event_team_member(e.id, ARRAY['event_manager'])
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'admin'
              AND p.status = 'active'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Event managers can delete invitation media" ON storage.objects;
CREATE POLICY "Event managers can delete invitation media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invitation-media'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id::text = (storage.foldername(storage.objects.name))[1]
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
          OR is_event_team_member(e.id, ARRAY['event_manager'])
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'admin'
              AND p.status = 'active'
          )
        )
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
