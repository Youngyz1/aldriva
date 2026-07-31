-- migration_19_landing_pages_cms.sql
-- Seed default CMS keys for Events, Fundraisers, and Organizers landing pages.

INSERT INTO platform_settings (key, value) VALUES
  ('events_hero_image_url', 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1800&auto=format&fit=crop'),
  ('events_hero_eyebrow', 'LIVE EXPERIENCES'),
  ('events_hero_headline_line_1', 'Find Your Next Event'),
  ('events_hero_headline_line_2', ''),
  ('events_hero_description', 'Concerts, conferences, workshops, festivals, and local experiences.'),
  ('fundraisers_hero_image_url', 'https://images.unsplash.com/photo-1529390079861-591de354faf5?q=80&w=1800&auto=format&fit=crop'),
  ('fundraisers_hero_eyebrow', 'COMMUNITY FUNDRAISING'),
  ('fundraisers_hero_headline_line_1', 'Support Causes That Matter'),
  ('fundraisers_hero_headline_line_2', ''),
  ('fundraisers_hero_description', 'Help communities, charities, and individuals reach their goals.'),
  ('organizers_hero_image_url', 'https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=1800&auto=format&fit=crop'),
  ('organizers_hero_eyebrow', 'ORGANIZER DIRECTORY'),
  ('organizers_hero_headline_line_1', 'Meet Event Creators'),
  ('organizers_hero_headline_line_2', ''),
  ('organizers_hero_description', 'Discover trusted organizers building amazing experiences.')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
