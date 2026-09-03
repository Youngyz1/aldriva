-- migration_89_ai_guard_rejections.sql
-- Dedicated audit table for AI Output Guard flags and rejections.
-- Keeps security rejection logs distinct from ai_content_items (which tracks content promotion).

BEGIN;

CREATE TABLE IF NOT EXISTS ai_guard_rejections (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  context      text        NOT NULL,
  category     text        NOT NULL,
  reason       text        NOT NULL,
  excerpt      text,
  content_type text,       -- optional: 'event', 'fundraiser', etc.
  source_id    uuid,       -- optional: UUID of offending record if applicable
  verdict      text        NOT NULL DEFAULT 'rejected',
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ai_guard_rejections_verdict_check
    CHECK (verdict IN ('flagged', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_ai_guard_rejections_created_at
  ON ai_guard_rejections (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_guard_rejections_category
  ON ai_guard_rejections (category);

ALTER TABLE ai_guard_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai_guard_rejections" ON ai_guard_rejections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can insert ai_guard_rejections" ON ai_guard_rejections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
