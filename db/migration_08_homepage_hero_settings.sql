-- migration_08_homepage_hero_settings.sql
-- Adds admin-configurable homepage hero content to platform_settings.
-- Stores only text and image URLs, not image files.

INSERT INTO platform_settings (key, value) VALUES
  ('homepage_hero_image_url',        'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1800&auto=format&fit=crop'),
  ('homepage_hero_eyebrow',          'EVENTS • FUNDRAISING • SPONSORSHIPS'),
  ('homepage_hero_headline_line_1',  'Sell Tickets. Raise Funds.'),
  ('homepage_hero_headline_line_2',  'Find Sponsors.'),
  ('homepage_hero_button_text',      'Browse Events'),
  ('homepage_hero_button_href',      '/events')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
