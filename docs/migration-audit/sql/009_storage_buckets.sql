-- ============================================================================
-- 009_storage_buckets.sql — All 7 storage buckets, matching production
-- configuration exactly, including that none currently have a
-- file_size_limit or allowed_mime_types set (see RECOMMENDATIONS.md item 10
-- for optional, separately-evaluated limits — not applied here).
--
-- Can be run as plain SQL (service_role/postgres connection) or recreated via
-- the Supabase Dashboard / `supabase storage` CLI — either is equivalent.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types, avif_autodetection)
values
  ('event-banners',     'event-banners',     true, null, null, false),
  ('event-videos',      'event-videos',      true, null, null, false),
  ('fundraiser-media',  'fundraiser-media',  true, null, null, false),
  ('organizer-banners', 'organizer-banners', true, null, null, false),
  ('organizer-images',  'organizer-images',  true, null, null, false),
  ('profile-images',    'profile-images',    true, null, null, false),
  ('videos',            'videos',            true, null, null, false)
on conflict (id) do nothing;
