-- migration_05_platform_settings.sql
-- Creates platform_settings key/value store for admin-configurable options.
-- Safe to re-run: uses IF NOT EXISTS and ON CONFLICT DO NOTHING for seed rows.

CREATE TABLE IF NOT EXISTS platform_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read settings (e.g. to check fee rates in API routes).
DROP POLICY IF EXISTS "Authenticated users can read settings" ON platform_settings;
CREATE POLICY "Authenticated users can read settings"
  ON platform_settings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only the service role (backend admin API) may write.
-- No INSERT/UPDATE/DELETE policies for regular users — service role bypasses RLS.

-- Seed default settings (idempotent via ON CONFLICT DO NOTHING).
INSERT INTO platform_settings (key, value) VALUES
  ('platform_fee_percent',          '2.5'),
  ('donation_fee_percent',          '3.0'),
  ('featured_event_price',          '25.00'),
  ('featured_fundraiser_price',     '15.00'),
  ('support_email',                 'support@ticketx.com'),
  ('require_event_approval',        'false'),
  ('require_fundraiser_approval',   'false'),
  ('organizer_auto_approval',       'true')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
