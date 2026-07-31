-- migration_17_marketplace_arch.sql
-- Adds homepage_testimonials, homepage_sponsors tables and new platform_settings keys.
-- Safe to re-run: uses IF NOT EXISTS and ON CONFLICT DO NOTHING.

-- ── Testimonials ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homepage_testimonials (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  role       TEXT        NOT NULL DEFAULT '',
  photo_url  TEXT        NOT NULL DEFAULT '',
  quote      TEXT        NOT NULL,
  position   INTEGER     NOT NULL DEFAULT 0,
  is_visible BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE homepage_testimonials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read homepage_testimonials" ON homepage_testimonials;
CREATE POLICY "Public read homepage_testimonials"
  ON homepage_testimonials FOR SELECT USING (true);

-- ── Sponsors ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homepage_sponsors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  logo_url    TEXT        NOT NULL DEFAULT '',
  website_url TEXT        NOT NULL DEFAULT '',
  position    INTEGER     NOT NULL DEFAULT 0,
  is_visible  BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE homepage_sponsors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read homepage_sponsors" ON homepage_sponsors;
CREATE POLICY "Public read homepage_sponsors"
  ON homepage_sponsors FOR SELECT USING (true);

-- ── New platform_settings keys (Branding + Security groups) ─────────────────
INSERT INTO platform_settings (key, value) VALUES
  ('platform_name',              'Aldriva'),
  ('platform_logo_url',          ''),
  ('platform_favicon_url',       ''),
  ('platform_primary_color',     '#7c3aed'),
  ('support_reply_to_email',     ''),
  ('support_noreply_email',      ''),
  ('allow_guest_checkout',       'true'),
  ('require_email_verification', 'false'),
  ('enable_admin_2fa',           'false')
ON CONFLICT (key) DO NOTHING;

-- ── Cleanup note ─────────────────────────────────────────────────────────────
-- Homepage settings still live in platform_settings for backwards compatibility.
-- Once the Homepage CMS is confirmed working in production, run:
--   DELETE FROM platform_settings WHERE key LIKE 'homepage_%';
-- This is intentionally left commented out for safety.

NOTIFY pgrst, 'reload schema';
