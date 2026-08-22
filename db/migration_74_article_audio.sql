-- migration_74_article_audio.sql
-- Table and policies for Aldriva Article Text-to-Speech (TTS) audio reader & timing metadata.

CREATE TABLE IF NOT EXISTS article_audios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  duration_seconds NUMERIC(10, 2) NOT NULL,
  voice TEXT NOT NULL DEFAULT 'Magpie-Multilingual.EN-US.Aria',
  language TEXT NOT NULL DEFAULT 'en-US',
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('not_generated', 'generating', 'ready', 'failed', 'stale')),
  timing_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT article_audios_article_hash_unique UNIQUE (article_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_article_audios_article_id ON article_audios(article_id);
CREATE INDEX IF NOT EXISTS idx_article_audios_lookup ON article_audios(article_id, content_hash, status);

ALTER TABLE article_audios ENABLE ROW LEVEL SECURITY;

-- Public/visitor read policy for published public articles
DROP POLICY IF EXISTS "Public article audios are readable" ON article_audios;
CREATE POLICY "Public article audios are readable"
  ON article_audios FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM articles
      WHERE articles.id = article_audios.article_id
        AND articles.status = 'published'
        AND articles.visibility = 'public'
    )
  );

-- Owner/Admin read policy for draft/private preview articles
DROP POLICY IF EXISTS "Owners and admins can read article audios" ON article_audios;
CREATE POLICY "Owners and admins can read article audios"
  ON article_audios FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM articles
      WHERE articles.id = article_audios.article_id
        AND (
          articles.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
              AND profiles.status = 'active'
          )
        )
    )
  );

-- Ensure article-audio bucket exists in Supabase Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('article-audio', 'article-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Narrow SELECT policy for article-audio storage objects
DROP POLICY IF EXISTS "Article audio objects are public for SELECT" ON storage.objects;
CREATE POLICY "Article audio objects are public for SELECT"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'article-audio');

NOTIFY pgrst, 'reload schema';
