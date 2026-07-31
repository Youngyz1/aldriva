-- ============================================================================
-- 006_rls_policies.sql — All 87 RLS policies on public-schema tables, pulled
-- VERBATIM from pg_policies.qual / pg_policies.with_check (fresh direct query,
-- 2026-07-23) across 24 of the 28 tables. Zero policies exist (intentionally,
-- in production) on: comment_likes, seats, ticket_orders, venue_layouts.
--
-- All policies are PERMISSIVE and apply to role `public` (i.e. both `anon`
-- and `authenticated` — `service_role` bypasses RLS entirely regardless).
--
-- This file reproduces production's RLS policies exactly, including a few
-- that are worth being aware of (events/tickets unconditional public insert,
-- organizers' redundant visibility policy, some duplicate SELECT policies —
-- see the inline notes below and RECOMMENDATIONS.md for full discussion).
-- These are NOT changed here; the migration's goal is behavioral parity with
-- production, not a security review outcome.
-- ============================================================================

-- ---------- articles (7) ----------
create policy "Active users can create their own articles" on public.articles
  for insert to public
  with check (
    (auth.uid() = owner_id)
    and (status = any (array['draft'::text, 'pending_review'::text, 'scheduled'::text]))
    and (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.status = 'active'::text))
    and (organizer_id is null or exists (select 1 from organizers where organizers.id = articles.organizer_id and organizers.user_id = auth.uid()))
  );

create policy "Admins can manage all articles" on public.articles
  for all to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Admins can read all articles" on public.articles
  for select to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Article owners can delete draft articles" on public.articles
  for delete to public
  using (
    (auth.uid() = owner_id) and (status = 'draft'::text)
    and (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.status = 'active'::text))
  );

create policy "Article owners can read their articles" on public.articles
  for select to public
  using (auth.uid() = owner_id);

create policy "Article owners can update their articles" on public.articles
  for update to public
  using (auth.uid() = owner_id)
  with check (
    (auth.uid() = owner_id)
    and (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.status = 'active'::text))
    and (organizer_id is null or exists (select 1 from organizers where organizers.id = articles.organizer_id and organizers.user_id = auth.uid()))
  );

create policy "Published public articles are readable" on public.articles
  for select to public
  using ((status = 'published'::text) and (visibility = 'public'::text));

-- ---------- businesses (8) ----------
create policy "Active authenticated users can create businesses" on public.businesses
  for insert to public
  with check (
    (auth.uid() = owner_id) and (status = 'pending_review'::text)
    and (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.status = 'active'::text))
  );

create policy "Admins can delete any business" on public.businesses
  for delete to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Admins can update any business" on public.businesses
  for update to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Admins can view all businesses" on public.businesses
  for select to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Owners can delete inactive businesses" on public.businesses
  for delete to public
  using ((auth.uid() = owner_id) and (status <> 'active'::text));

create policy "Owners can update their own businesses" on public.businesses
  for update to public
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners can view their own businesses" on public.businesses
  for select to public
  using (auth.uid() = owner_id);

create policy "Public can view active non-flagged businesses" on public.businesses
  for select to public
  using ((status = 'active'::text) and (is_flagged = false));

-- ---------- comments (2) ----------
create policy "Admins can manage comments" on public.comments
  for all to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Approved comments are publicly readable" on public.comments
  for select to public
  using ((status)::text = 'approved'::text);

-- ---------- donations (2) — no INSERT policy: written server-side via service role ----------
create policy "Admins can read donations" on public.donations
  for select to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Users can view their own donations" on public.donations
  for select to public
  using (auth.uid() = user_id);

-- ---------- eventbrite_sources (4) ----------
create policy "Users can create their Eventbrite sources" on public.eventbrite_sources
  for insert to public
  with check (
    (auth.uid() = user_id)
    and (organizer_id is null or exists (select 1 from organizers where organizers.id = eventbrite_sources.organizer_id and organizers.user_id = auth.uid()))
  );

create policy "Users can delete their Eventbrite sources" on public.eventbrite_sources
  for delete to public
  using (auth.uid() = user_id);

create policy "Users can read their Eventbrite sources" on public.eventbrite_sources
  for select to public
  using (auth.uid() = user_id);

create policy "Users can update their Eventbrite sources" on public.eventbrite_sources
  for update to public
  using (auth.uid() = user_id)
  with check (
    (auth.uid() = user_id)
    and (organizer_id is null or exists (select 1 from organizers where organizers.id = eventbrite_sources.organizer_id and organizers.user_id = auth.uid()))
  );

-- ---------- events (4) — "Allow public insert" has no ownership/status gate; see RECOMMENDATIONS.md item 1 ----------
create policy "Allow public insert" on public.events
  for insert to public
  with check (true);

create policy "Allow public select" on public.events
  for select to public
  using (true);

create policy "Users can delete own events" on public.events
  for delete to public
  using (auth.uid() = user_id);

create policy "Users can update own events" on public.events
  for update to public
  using (auth.uid() = user_id);

-- ---------- follows (3) ----------
create policy "Follows are publicly readable" on public.follows
  for select to public
  using (true);

create policy "Users can create follows" on public.follows
  for insert to public
  with check (auth.uid() = follower_id);

create policy "Users can delete follows" on public.follows
  for delete to public
  using (auth.uid() = follower_id);

-- ---------- fundraiser_media (6) — note two duplicate public-SELECT policies ----------
create policy "Fundraiser media is publicly readable" on public.fundraiser_media
  for select to public
  using (true);

create policy "Organizer can manage their fundraiser media" on public.fundraiser_media
  for all to public
  using (
    fundraiser_id in (
      select fundraisers.id from fundraisers
      where fundraisers.organizer_id in (select organizers.id from organizers where organizers.user_id = auth.uid())
    )
  );

create policy "Public can view fundraiser media" on public.fundraiser_media
  for select to public
  using (true);

create policy "Users can create media for their fundraisers" on public.fundraiser_media
  for insert to public
  with check (
    exists (
      select 1 from fundraisers left join organizers on organizers.id = fundraisers.organizer_id
      where fundraisers.id = fundraiser_media.fundraiser_id
        and (fundraisers.user_id = auth.uid() or organizers.user_id = auth.uid())
    )
  );

create policy "Users can delete media for their fundraisers" on public.fundraiser_media
  for delete to public
  using (
    exists (
      select 1 from fundraisers left join organizers on organizers.id = fundraisers.organizer_id
      where fundraisers.id = fundraiser_media.fundraiser_id
        and (fundraisers.user_id = auth.uid() or organizers.user_id = auth.uid())
    )
  );

create policy "Users can update media for their fundraisers" on public.fundraiser_media
  for update to public
  using (
    exists (
      select 1 from fundraisers left join organizers on organizers.id = fundraisers.organizer_id
      where fundraisers.id = fundraiser_media.fundraiser_id
        and (fundraisers.user_id = auth.uid() or organizers.user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from fundraisers left join organizers on organizers.id = fundraisers.organizer_id
      where fundraisers.id = fundraiser_media.fundraiser_id
        and (fundraisers.user_id = auth.uid() or organizers.user_id = auth.uid())
    )
  );

-- ---------- fundraiser_updates (2) ----------
create policy "Organizer can manage their updates" on public.fundraiser_updates
  for all to public
  using (organizer_id in (select organizers.id from organizers where organizers.user_id = auth.uid()));

create policy "Public can view fundraiser updates" on public.fundraiser_updates
  for select to public
  using (true);

-- ---------- fundraisers (8) — "Anyone can create..." allows impersonating user_id; see RECOMMENDATIONS.md item 2 ----------
create policy "Admins can read all fundraisers" on public.fundraisers
  for select to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Anyone can create a fundraiser pending review" on public.fundraisers
  for insert to public
  with check (status = 'pending_review'::text);

create policy "Owners can read their own fundraisers" on public.fundraisers
  for select to public
  using (
    (auth.uid() = user_id)
    or exists (select 1 from organizers where organizers.id = fundraisers.organizer_id and organizers.user_id = auth.uid())
  );

create policy "Published fundraisers are public" on public.fundraisers
  for select to public
  using (status = 'published'::text);

create policy "Users can delete own fundraisers" on public.fundraisers
  for delete to public
  using (auth.uid() = user_id);

create policy "Users can delete their organizer fundraisers" on public.fundraisers
  for delete to public
  using (
    (auth.uid() = user_id)
    or exists (select 1 from organizers where organizers.id = fundraisers.organizer_id and organizers.user_id = auth.uid())
  );

create policy "Users can update fundraisers for their organizer profiles" on public.fundraisers
  for update to public
  using (
    (auth.uid() = user_id)
    or exists (select 1 from organizers where organizers.id = fundraisers.organizer_id and organizers.user_id = auth.uid())
  )
  with check (
    (auth.uid() = user_id)
    and (organizer_id is null or exists (select 1 from organizers where organizers.id = fundraisers.organizer_id and organizers.user_id = auth.uid()))
  );

create policy "Users can update own fundraisers" on public.fundraisers
  for update to public
  using (auth.uid() = user_id);

-- ---------- gofundme_sources (4) ----------
create policy "Users can create their GoFundMe sources" on public.gofundme_sources
  for insert to public
  with check (auth.uid() = user_id);

create policy "Users can delete their GoFundMe sources" on public.gofundme_sources
  for delete to public
  using (auth.uid() = user_id);

create policy "Users can read their GoFundMe sources" on public.gofundme_sources
  for select to public
  using (auth.uid() = user_id);

create policy "Users can update their GoFundMe sources" on public.gofundme_sources
  for update to public
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- homepage_categories / homepage_sponsors / homepage_testimonials (1 each) ----------
-- No INSERT/UPDATE/DELETE policy on any of these three — content management is
-- admin/service-role only.
create policy "Allow public read access to homepage_categories" on public.homepage_categories
  for select to public
  using (true);

create policy "Public read homepage_sponsors" on public.homepage_sponsors
  for select to public
  using (true);

create policy "Public read homepage_testimonials" on public.homepage_testimonials
  for select to public
  using (true);

-- ---------- notifications (2) — no INSERT policy: created server-side ----------
create policy "Users can mark their own notifications read" on public.notifications
  for update to public
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read their own notifications" on public.notifications
  for select to public
  using (auth.uid() = user_id);

-- ---------- organizer_follows (4) — note two duplicate public-SELECT policies ----------
create policy "Anyone can view follows" on public.organizer_follows
  for select to public
  using (true);

create policy "Organizer follows are publicly readable" on public.organizer_follows
  for select to public
  using (true);

create policy "Users can follow organizers" on public.organizer_follows
  for insert to public
  with check (auth.uid() = user_id);

create policy "Users can unfollow organizers" on public.organizer_follows
  for delete to public
  using (auth.uid() = user_id);

-- ---------- organizer_visibility_audit (1) — no INSERT policy: audit-log, service-role only ----------
create policy "Admins can view audit logs" on public.organizer_visibility_audit
  for select to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

-- ---------- organizers (4) — "Public read organizers" makes the visibility-scoped policy dead code; see RECOMMENDATIONS.md item 3 ----------
create policy "Public organizers are readable" on public.organizers
  for select to public
  using ((visibility = 'public'::text) or (auth.uid() = user_id));

create policy "Public read organizers" on public.organizers
  for select to public
  using (true);

create policy "Users can insert own organizer" on public.organizers
  for insert to public
  with check (auth.uid() = user_id);

create policy "Users can update own organizer" on public.organizers
  for update to public
  using (auth.uid() = user_id);

-- ---------- platform_settings (1) — no anon/public read, no write policy ----------
create policy "Authenticated users can read settings" on public.platform_settings
  for select to public
  using (auth.role() = 'authenticated'::text);

-- ---------- product_orders (5) ----------
create policy "Admins can update any product order" on public.product_orders
  for update to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Admins can view all product orders" on public.product_orders
  for select to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Authenticated users can create their own pending order" on public.product_orders
  for insert to public
  with check ((auth.uid() = buyer_id) and (status = 'pending'::text));

create policy "Buyers can view their own product orders" on public.product_orders
  for select to public
  using (auth.uid() = buyer_id);

create policy "Product owners can view orders on their products" on public.product_orders
  for select to public
  using (exists (select 1 from products where products.id = product_orders.product_id and products.owner_id = auth.uid()));

-- ---------- products (8) ----------
create policy "Active authenticated users can create products" on public.products
  for insert to public
  with check (
    (auth.uid() = owner_id) and (status = 'pending_review'::text)
    and (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.status = 'active'::text))
    and (business_id is null or exists (select 1 from businesses where businesses.id = products.business_id and businesses.owner_id = auth.uid()))
  );

create policy "Admins can delete any product" on public.products
  for delete to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Admins can update any product" on public.products
  for update to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Admins can view all products" on public.products
  for select to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text and profiles.status = 'active'::text));

create policy "Owners can delete archived products" on public.products
  for delete to public
  using ((auth.uid() = owner_id) and (status = 'archived'::text));

create policy "Owners can update their own products" on public.products
  for update to public
  using (auth.uid() = owner_id)
  with check (
    (auth.uid() = owner_id)
    and (business_id is null or exists (select 1 from businesses where businesses.id = products.business_id and businesses.owner_id = auth.uid()))
  );

create policy "Owners can view their own products" on public.products
  for select to public
  using (auth.uid() = owner_id);

create policy "Public can view active products" on public.products
  for select to public
  using ((status = 'active'::text) or (status = 'out_of_stock'::text));

-- ---------- profiles (2) — no public SELECT; public viewing is via public_profiles view ----------
create policy "Users can read their own profile" on public.profiles
  for select to public
  using (auth.uid() = id);

create policy "Users can update their own account settings" on public.profiles
  for update to public
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------- reviews (5) ----------
create policy "Admins can manage all reviews" on public.reviews
  for all to public
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text));
  -- NOTE: unlike every other admin-check policy in this schema, this one omits
  -- "AND profiles.status = 'active'" in production — reproduced as-is here.
  -- See RECOMMENDATIONS.md item 5.

create policy "Authenticated users can create reviews" on public.reviews
  for insert to public
  with check (auth.uid() = user_id);

create policy "Reviews are publicly readable" on public.reviews
  for select to public
  using (
    (is_approved = true) or (auth.uid() = user_id)
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'::text)
  );

create policy "Users can delete their own reviews" on public.reviews
  for delete to public
  using (auth.uid() = user_id);

create policy "Users can update their own reviews" on public.reviews
  for update to public
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- tickets (2) — same "Allow public insert" pattern as events; no UPDATE/DELETE policy at all; see RECOMMENDATIONS.md item 1 ----------
create policy "Allow public insert" on public.tickets
  for insert to public
  with check (true);

create policy "Allow public select" on public.tickets
  for select to public
  using (true);

-- ============================================================================
-- Intentionally NO policies on: comment_likes, seats, ticket_orders, venue_layouts
-- (RLS is enabled on all four via 005_enable_rls.sql — this closes all
-- anon/authenticated access; only service_role/table owner can read or write).
-- ============================================================================
