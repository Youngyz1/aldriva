-- ============================================================================
-- 010_storage_policies.sql — All 14 storage.objects policies, verbatim from
-- production (fresh direct pg_policies query, 2026-07-23). Requires
-- 009_storage_buckets.sql to have run first.
--
-- Note: `event-banners` has zero policies in production (reads still work via
-- the public object-URL path since the bucket is public; only service_role
-- can write there). This is reproduced as-is. Cross-bucket differences in
-- upload ownership scoping (folder-prefix checks exist only on
-- fundraiser-media and profile-images) are also reproduced as-is. See
-- RECOMMENDATIONS.md (items 11-13) for optional discussion of either —
-- not applied here.
-- ============================================================================

-- ---------- event-videos ----------
create policy "Auth upload event-videos" on storage.objects
  for insert to public
  with check ((bucket_id = 'event-videos'::text) and (auth.role() = 'authenticated'::text));

create policy "Public read event-videos" on storage.objects
  for select to public
  using (bucket_id = 'event-videos'::text);
-- No UPDATE/DELETE policy — objects can't be replaced/removed except via service role.

-- ---------- fundraiser-media (folder-prefix ownership pattern) ----------
create policy "Authenticated users can upload fundraiser media" on storage.objects
  for insert to public
  with check ((bucket_id = 'fundraiser-media'::text) and (auth.role() = 'authenticated'::text));

create policy "Owners can delete fundraiser media" on storage.objects
  for delete to public
  using ((bucket_id = 'fundraiser-media'::text) and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "Public can view fundraiser media" on storage.objects
  for select to public
  using (bucket_id = 'fundraiser-media'::text);
-- No UPDATE policy.

-- ---------- organizer-banners ----------
create policy "Auth upload organizer-banners" on storage.objects
  for insert to public
  with check ((bucket_id = 'organizer-banners'::text) and (auth.role() = 'authenticated'::text));

create policy "Public read organizer-banners" on storage.objects
  for select to public
  using (bucket_id = 'organizer-banners'::text);
-- No UPDATE/DELETE policy.

-- ---------- organizer-images ----------
create policy "Auth upload organizer-images" on storage.objects
  for insert to public
  with check ((bucket_id = 'organizer-images'::text) and (auth.role() = 'authenticated'::text));

create policy "Public read organizer-images" on storage.objects
  for select to public
  using (bucket_id = 'organizer-images'::text);
-- No UPDATE/DELETE policy.

-- ---------- profile-images (folder-prefix ownership pattern) ----------
create policy "Users can upload profile images" on storage.objects
  for insert to public
  with check ((bucket_id = 'profile-images'::text) and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "Users can update profile images" on storage.objects
  for update to public
  using ((bucket_id = 'profile-images'::text) and ((auth.uid())::text = (storage.foldername(name))[1]))
  with check ((bucket_id = 'profile-images'::text) and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "Profile images are public" on storage.objects
  for select to public
  using (bucket_id = 'profile-images'::text);
-- No DELETE policy — users can upload/replace their own image but not delete
-- it via PostgREST/anon-authenticated path; only service role can delete.

-- ---------- videos ----------
create policy "Auth upload videos" on storage.objects
  for insert to public
  with check ((bucket_id = 'videos'::text) and (auth.role() = 'authenticated'::text));

create policy "Public read videos" on storage.objects
  for select to public
  using (bucket_id = 'videos'::text);
-- No UPDATE/DELETE policy.

-- ---------- event-banners: NO POLICIES IN PRODUCTION — reproduced as-is ----------
-- (See header note. Uploads to this bucket currently only work via service_role.)
