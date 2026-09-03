-- migration_90_ai_content_calendar.sql
-- Dedicated planning table for AI Synthesized Trends and Content Calendar items.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_content_calendar (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic               text        NOT NULL,
  why_it_matters      text,
  aldriva_angle       text,
  suggested_platform  text        NOT NULL DEFAULT 'general',
  suggested_format    text        NOT NULL DEFAULT 'post',
  source_trend        text,
  source_url          text,
  status              text        NOT NULL DEFAULT 'proposed',
  target_date         timestamptz,
  admin_notes         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ai_content_calendar_status_check
    CHECK (status IN ('proposed', 'scheduled', 'dismissed', 'published'))
);

CREATE INDEX IF NOT EXISTS idx_ai_content_calendar_status
  ON ai_content_calendar (status);

CREATE INDEX IF NOT EXISTS idx_ai_content_calendar_created_at
  ON ai_content_calendar (created_at DESC);

ALTER TABLE ai_content_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai_content_calendar" ON ai_content_calendar
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can insert ai_content_calendar" ON ai_content_calendar
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can update ai_content_calendar" ON ai_content_calendar
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can delete ai_content_calendar" ON ai_content_calendar
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
