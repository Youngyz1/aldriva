-- migration_16_homepage_cms.sql
-- Add homepage_position columns to allow manual sorting of featured items
ALTER TABLE events ADD COLUMN IF NOT EXISTS homepage_position INTEGER DEFAULT 0;
ALTER TABLE fundraisers ADD COLUMN IF NOT EXISTS homepage_position INTEGER DEFAULT 0;

-- Create homepage categories table for CRUD management
CREATE TABLE IF NOT EXISTS homepage_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE homepage_categories ENABLE ROW LEVEL SECURITY;

-- Allow public read access to homepage_categories
DROP POLICY IF EXISTS "Allow public read access to homepage_categories" ON homepage_categories;
CREATE POLICY "Allow public read access to homepage_categories"
  ON homepage_categories FOR SELECT
  USING (true);

-- Seed homepage categories with current landing page list
INSERT INTO homepage_categories (name, icon, position, is_visible) VALUES
  ('Music', 'Mic', 1, true),
  ('Business', 'Briefcase', 2, true),
  ('Education', 'GraduationCap', 3, true),
  ('Charity', 'HandHeart', 4, true),
  ('Medical', 'Stethoscope', 5, true),
  ('Church', 'HeartHandshake', 6, true),
  ('Community', 'Users', 7, true),
  ('Technology', 'Laptop', 8, true)
ON CONFLICT (name) DO NOTHING;

-- Seed default settings for Hero Section & SEO
INSERT INTO platform_settings (key, value) VALUES
  ('homepage_hero_title', 'Sell Tickets. Raise Funds.'),
  ('homepage_hero_subtitle', 'EVENTS • FUNDRAISING • SPONSORSHIPS'),
  ('homepage_hero_button_text', 'Browse Events'),
  ('homepage_hero_button_href', '/events'),
  ('homepage_hero_secondary_button_text', 'Create Event'),
  ('homepage_hero_secondary_button_href', '/create-event'),
  ('homepage_hero_image_url', 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1800&auto=format&fit=crop'),
  ('homepage_seo_title', 'Aldriva — Buy Tickets, Run Events & Fundraise'),
  ('homepage_seo_description', 'Discover events, buy tickets, support causes.'),
  ('homepage_seo_og_image_url', 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1800&auto=format&fit=crop')
ON CONFLICT (key) DO NOTHING;

-- Migrate existing hero settings if already configured
INSERT INTO platform_settings (key, value)
SELECT 'homepage_hero_title', value FROM platform_settings WHERE key = 'homepage_hero_headline_line_1'
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_settings (key, value)
SELECT 'homepage_hero_subtitle', value FROM platform_settings WHERE key = 'homepage_hero_eyebrow'
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
