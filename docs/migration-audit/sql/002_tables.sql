-- ============================================================================
-- 002_tables.sql — All 28 public-schema application tables, in FK dependency
-- order, reconstructed verbatim from production information_schema/pg_catalog
-- (read-only audit, 2026-07-23). No enums, no sequences exist in production —
-- every PK is uuid default gen_random_uuid(); every "enum-like" column is
-- text/varchar + CHECK.
--
-- Requires: 001_extensions.sql (gen_random_uuid) and the `auth` schema, which
-- Supabase provisions automatically for every new project.
--
-- CIRCULAR FK NOTE: fundraisers.gofundme_source_id <-> gofundme_sources.id and
-- gofundme_sources.fundraiser_id <-> fundraisers.id reference each other. Both
-- columns are nullable/ON DELETE SET NULL, so fundraisers is created first
-- WITHOUT the gofundme_source_id FK, then gofundme_sources is created, then
-- the FK is added via ALTER TABLE at the bottom of this file (see step 19b).
-- ============================================================================

-- 1. profiles ----------------------------------------------------------------
create table public.profiles (
  id uuid not null,
  role text not null default 'user'::text,
  status text not null default 'active'::text,
  created_at timestamptz default now(),
  preferences jsonb not null default '{}'::jsonb,
  account_info jsonb not null default '{}'::jsonb,
  profile_photo text,
  updated_at timestamptz default now(),
  privacy_settings jsonb not null default '{}'::jsonb,
  display_name text,
  avatar_url text,
  deleted_at timestamptz,
  purge_at timestamptz,
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade,
  constraint profiles_status_check check (status = any (array['active','suspended'])),
  constraint profiles_role_check check (role = any (array['admin','organizer','user']))
);

-- 2. platform_settings ---------------------------------------------------------
create table public.platform_settings (
  key text not null,
  value text not null,
  updated_at timestamptz default now(),
  updated_by uuid,
  constraint platform_settings_pkey primary key (key),
  constraint platform_settings_updated_by_fkey foreign key (updated_by) references auth.users (id)
);

-- 3. homepage_categories -------------------------------------------------------
create table public.homepage_categories (
  id uuid not null default gen_random_uuid(),
  name text not null,
  icon text not null,
  position integer default 0,
  is_visible boolean default true,
  created_at timestamptz default now(),
  constraint homepage_categories_pkey primary key (id),
  constraint homepage_categories_name_key unique (name)
);

-- 4. homepage_sponsors ----------------------------------------------------------
create table public.homepage_sponsors (
  id uuid not null default gen_random_uuid(),
  name text not null,
  logo_url text not null default ''::text,
  website_url text not null default ''::text,
  position integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  constraint homepage_sponsors_pkey primary key (id)
);

-- 5. homepage_testimonials -------------------------------------------------------
create table public.homepage_testimonials (
  id uuid not null default gen_random_uuid(),
  name text not null,
  role text not null default ''::text,
  photo_url text not null default ''::text,
  quote text not null,
  position integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  constraint homepage_testimonials_pkey primary key (id)
);

-- 6. organizers -----------------------------------------------------------------
create table public.organizers (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  name text not null,
  bio text,
  photo text,
  facebook text,
  twitter text,
  website text,
  created_at timestamp without time zone default now(),
  banner text,
  status text default 'pending'::text,
  verified_at timestamptz,
  visibility text default 'public'::text,
  follower_offset integer not null default 0,
  events_offset integer not null default 0,
  average_rating numeric(3,2) default 0,
  review_count integer default 0,
  organization_name varchar(255),
  tax_id varchar(255),
  nonprofit_registration_number varchar(255),
  deleted_at timestamptz,
  purge_at timestamptz,
  slug text not null,
  org_type text default 'other'::text,
  instagram text,
  linkedin text,
  youtube text,
  tiktok text,
  contact_email text,
  updated_at timestamptz default now(),
  constraint organizers_pkey primary key (id),
  constraint organizers_user_id_fkey foreign key (user_id) references auth.users (id), -- NOTE: no ON DELETE action (defaults to NO ACTION); reproduced as-is, see RECOMMENDATIONS.md item 15
  constraint organizers_status_check check (status = any (array['pending','verified','rejected','suspended'])),
  constraint organizers_org_type_check check (org_type = any (array['nonprofit','business','church','school','creator','community','government','restaurant','sports_club','other'])),
  constraint organizers_visibility_check check (visibility = any (array['public','private']))
);
create unique index idx_organizers_slug on public.organizers (slug) where (slug is not null);
create index idx_organizers_org_type on public.organizers (org_type);
create index idx_organizers_status on public.organizers (status);
create index idx_organizers_visibility on public.organizers (visibility);

-- 7. businesses -----------------------------------------------------------------
create table public.businesses (
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  slug text not null,
  description text not null,
  industry text not null,
  category text not null,
  logo text,
  website text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  country text,
  listing_tier text not null default 'free'::text,
  status text not null default 'pending_review'::text,
  is_flagged boolean not null default false,
  stripe_price_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  crypto_payment_id text,
  pre_approval_status_snapshot text,
  is_featured boolean not null default false,
  rejection_reason text,
  constraint businesses_pkey primary key (id),
  constraint businesses_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade,
  constraint businesses_slug_key unique (slug),
  constraint businesses_seo_title_check check (seo_title is null or char_length(seo_title) <= 70),
  constraint businesses_status_check check (status = any (array['pending_review','active','rejected','archived'])),
  constraint businesses_listing_tier_check check (listing_tier = any (array['free','one_time','subscription'])),
  constraint businesses_category_check check (char_length(trim(category)) >= 2),
  constraint businesses_industry_check check (char_length(trim(industry)) >= 2),
  constraint businesses_description_check check (char_length(trim(description)) >= 20),
  constraint businesses_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint businesses_name_check check (char_length(trim(name)) between 3 and 180),
  constraint businesses_seo_description_check check (seo_description is null or char_length(seo_description) <= 180)
);
create index idx_businesses_owner_id on public.businesses (owner_id);
create index idx_businesses_slug on public.businesses (slug);
create index idx_businesses_status_flagged on public.businesses (status, is_flagged);

-- 8. comments ---------------------------------------------------------------------
create table public.comments (
  id uuid not null default gen_random_uuid(),
  target_type varchar(30) not null,
  target_id uuid not null, -- polymorphic; no FK. Resolved in app code against events/fundraisers per target_type.
  author_name varchar(120) default 'Anonymous'::character varying,
  author_email varchar(255),
  body text not null,
  status varchar(30) default 'approved'::character varying,
  created_at timestamptz default current_timestamp,
  updated_at timestamptz default current_timestamp,
  user_id uuid,
  payment_intent_id text,
  source text not null default 'donation'::text,
  likes integer not null default 0,
  import_batch_id uuid,
  constraint comments_pkey primary key (id),
  constraint comments_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null,
  constraint comments_body_check check (char_length(body) between 2 and 1000),
  constraint comments_target_type_check check (target_type = any (array['event','fundraiser'])),
  constraint comments_status_check check (status = any (array['approved','hidden']))
);
-- NOTE: payment_intent_id uniqueness is enforced via a plain unique index in
-- production (not a named UNIQUE table constraint) — reproduced exactly as such:
create unique index comments_payment_intent_id_key on public.comments (payment_intent_id);
create index idx_comments_import_batch on public.comments (import_batch_id) where (import_batch_id is not null);
create index idx_comments_target on public.comments (target_type, target_id, status, created_at desc);
create index idx_comments_user_id on public.comments (user_id);

-- 9. comment_likes -------------------------------------------------------------------
create table public.comment_likes (
  id uuid not null default gen_random_uuid(),
  comment_id uuid not null,
  cookie_id uuid not null,
  ip_address text,
  created_at timestamptz not null default now(),
  constraint comment_likes_pkey primary key (id),
  constraint comment_likes_comment_id_fkey foreign key (comment_id) references public.comments (id) on delete cascade
);
create unique index comment_likes_comment_cookie_uq on public.comment_likes (comment_id, cookie_id);
create unique index comment_likes_comment_ip_uq on public.comment_likes (comment_id, ip_address) where (ip_address is not null);

-- 10. follows ---------------------------------------------------------------------
create table public.follows (
  id uuid not null default gen_random_uuid(),
  follower_id uuid not null,
  following_id uuid not null,
  created_at timestamptz not null default now(),
  constraint follows_pkey primary key (id),
  constraint follows_following_id_fkey foreign key (following_id) references auth.users (id) on delete cascade,
  constraint follows_follower_id_fkey foreign key (follower_id) references auth.users (id) on delete cascade,
  constraint follows_follower_id_following_id_key unique (follower_id, following_id),
  constraint chk_follower_following_not_equal check (follower_id <> following_id)
);
create index idx_follows_follower_id on public.follows (follower_id);
create index idx_follows_following_id on public.follows (following_id);

-- 11. notifications -----------------------------------------------------------------
create table public.notifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  actor_id uuid,
  type text not null,
  title text not null,
  body text,
  link text,
  related_type text,
  related_id uuid, -- polymorphic; no FK, resolved via related_type in app code
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_pkey primary key (id),
  constraint notifications_actor_id_fkey foreign key (actor_id) references auth.users (id) on delete set null,
  constraint notifications_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  constraint notifications_type_check check (type = any (array['donation','comment','like','fundraiser_approved','fundraiser_rejected','follow','ticket_purchase'])),
  constraint notifications_related_type_check check (related_type = any (array['fundraiser','comment','event','profile']))
);
create index idx_notifications_user_created on public.notifications (user_id, created_at desc);
create index idx_notifications_user_unread on public.notifications (user_id) where (read_at is null);

-- 12. events ------------------------------------------------------------------------
create table public.events (
  id uuid not null default gen_random_uuid(),
  title text not null,
  slug text not null,
  description text,
  category text,
  venue text,
  city text,
  banner text,
  event_date timestamp without time zone,
  created_at timestamp without time zone default now(),
  user_id uuid,
  video_url text,
  organizer_id uuid,
  latitude double precision,
  longitude double precision,
  visibility text default 'public'::text,
  status text default 'approved'::text,
  is_featured boolean default false,
  featured_until timestamptz,
  is_homepage_featured boolean default false,
  source_organizer_description text,
  source_organizer_name text,
  source_organizer_url text,
  homepage_position integer default 0,
  average_rating numeric(3,2) default 0,
  review_count integer default 0,
  event_type text,
  end_date timestamptz,
  street_address text,
  address_locality text,
  address_region text,
  postal_code text,
  address_country text,
  online_url text,
  performer_name text,
  deleted_at timestamptz,
  purge_at timestamptz,
  source_url text,
  eventbrite_event_id text,
  constraint events_pkey primary key (id),
  constraint events_organizer_id_fkey foreign key (organizer_id) references public.organizers (id), -- no ON DELETE action (NO ACTION); reproduced as-is, see RECOMMENDATIONS.md item 15
  constraint events_user_id_fkey foreign key (user_id) references auth.users (id), -- no ON DELETE action (NO ACTION); reproduced as-is, see RECOMMENDATIONS.md item 15
  constraint events_slug_key unique (slug),
  constraint events_visibility_check check (visibility = any (array['public','private'])),
  constraint events_status_check check (status = any (array['pending','approved','rejected']))
);
create unique index events_eventbrite_event_id_key on public.events (eventbrite_event_id) where (eventbrite_event_id is not null);
create index idx_events_is_featured on public.events (is_featured);
create index idx_events_status on public.events (status);
create index idx_events_visibility on public.events (visibility);

-- 13. articles ------------------------------------------------------------------------
create table public.articles (
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  organizer_id uuid,
  title text not null,
  slug text not null,
  excerpt text,
  body text not null,
  cover_image_url text,
  categories text[] not null default array[]::text[],
  tags text[] not null default array[]::text[],
  seo_title text,
  seo_description text,
  canonical_url text,
  visibility text not null default 'public'::text,
  status text not null default 'draft'::text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scheduled_for timestamptz,
  reading_time integer,
  business_id uuid,
  rejection_reason text,
  constraint articles_pkey primary key (id),
  constraint articles_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade,
  constraint articles_organizer_id_fkey foreign key (organizer_id) references public.organizers (id) on delete set null,
  constraint articles_business_id_fkey foreign key (business_id) references public.businesses (id) on delete set null,
  constraint articles_slug_key unique (slug),
  constraint articles_status_check check (status = any (array['draft','pending_review','published','scheduled','archived','expired','rejected'])),
  constraint articles_body_check check (char_length(trim(body)) >= 20),
  constraint articles_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint articles_title_check check (char_length(trim(title)) between 3 and 180),
  constraint articles_seo_title_check check (seo_title is null or char_length(seo_title) <= 70),
  constraint articles_seo_description_check check (seo_description is null or char_length(seo_description) <= 180),
  constraint articles_visibility_check check (visibility = any (array['public','private'])),
  constraint articles_reading_time_check check (reading_time is null or reading_time >= 1),
  constraint articles_excerpt_check check (excerpt is null or char_length(excerpt) <= 320)
);
create index idx_articles_categories on public.articles using gin (categories);
create index idx_articles_organizer_id on public.articles (organizer_id);
create index idx_articles_owner_id on public.articles (owner_id);
create index idx_articles_public_listing on public.articles (status, visibility, published_at desc);
create index idx_articles_scheduled_for on public.articles (scheduled_for) where (status = 'scheduled');
create index idx_articles_tags on public.articles using gin (tags);

comment on table public.articles is 'Editorial articles published by Fund4Good users. Optional business ownership is deferred until the businesses table exists.';
comment on column public.articles.owner_id is 'Per-table owner reference to auth.users, matching the safer ownership pattern selected in the platform ADR.';
comment on column public.articles.organizer_id is 'Optional current-platform publisher profile. Future business_id FK should be added in the businesses phase.';
comment on column public.articles.scheduled_for is 'When status=''scheduled'', the article becomes publicly visible at this UTC timestamp. Access control is enforced server-side on EVERY request. Do not rely on a cron status flip or RLS alone for this gate.';
comment on column public.articles.reading_time is 'Estimated reading time in minutes. Computed in the server action as Math.max(1, Math.round(word_count / 200)).';
comment on column public.articles.business_id is 'Optional business owner, mirroring articles.organizer_id.'; -- NOTE: production comment text is stale ("No FK until Phase 2 businesses table") even though the FK exists; corrected wording here.

-- 14. products ------------------------------------------------------------------------
create table public.products (
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null,
  business_id uuid,
  name text not null,
  slug text not null,
  description text not null,
  images text[] not null default array[]::text[],
  price_type text not null default 'one_time'::text,
  stripe_price_id text,
  stock_quantity integer,
  status text not null default 'pending_review'::text,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rejection_reason text,
  constraint products_pkey primary key (id),
  constraint products_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade,
  constraint products_business_id_fkey foreign key (business_id) references public.businesses (id) on delete set null,
  constraint products_slug_key unique (slug),
  constraint products_name_check check (char_length(trim(name)) between 3 and 180),
  constraint products_status_check check (status = any (array['pending_review','active','out_of_stock','rejected','archived'])),
  constraint products_seo_description_check check (seo_description is null or char_length(seo_description) <= 180),
  constraint products_seo_title_check check (seo_title is null or char_length(seo_title) <= 70),
  constraint products_stock_quantity_check check (stock_quantity is null or stock_quantity >= 0),
  constraint products_price_type_check check (price_type = any (array['one_time','subscription'])),
  constraint products_description_check check (char_length(trim(description)) >= 20),
  constraint products_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
create index idx_products_business_id on public.products (business_id);
create index idx_products_owner_id on public.products (owner_id);
create index idx_products_public_listing on public.products (status, created_at desc);
create index idx_products_slug on public.products (slug);

comment on column public.products.owner_id is 'Per-table owner reference to auth.users, matching the platform-wide ownership convention (see articles.owner_id, businesses.owner_id, and ADR 0001).';
comment on column public.products.business_id is 'Optional business affiliation, mirroring articles.business_id. A product is always owned by a user (owner_id); this only tags it for business-page display/attribution.';
comment on column public.products.stock_quantity is 'NULL = unlimited/digital good. Decremented by the payment webhook on confirmed purchase, never client-side. Guard decrements with WHERE stock_quantity >= <qty> for idempotency under webhook retries.';

-- 15. eventbrite_sources ------------------------------------------------------------------
create table public.eventbrite_sources (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  organizer_id uuid,
  organizer_name text not null,
  organizer_url text not null,
  organizer_eventbrite_id text not null,
  enabled boolean not null default true,
  last_synced_at timestamptz,
  last_sync_message text,
  created_at timestamptz default current_timestamp,
  updated_at timestamptz default current_timestamp,
  constraint eventbrite_sources_pkey primary key (id),
  constraint eventbrite_sources_organizer_id_fkey foreign key (organizer_id) references public.organizers (id) on delete set null,
  constraint eventbrite_sources_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  constraint eventbrite_sources_user_id_organizer_eventbrite_id_organize_key unique (user_id, organizer_eventbrite_id, organizer_id)
);
create index idx_eventbrite_sources_enabled on public.eventbrite_sources (enabled);
create index idx_eventbrite_sources_user_id on public.eventbrite_sources (user_id);

-- 16. organizer_follows --------------------------------------------------------------------
create table public.organizer_follows (
  id uuid not null default gen_random_uuid(),
  organizer_id uuid not null,
  user_id uuid not null,
  created_at timestamptz default now(),
  constraint organizer_follows_pkey primary key (id),
  constraint organizer_follows_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  constraint organizer_follows_organizer_id_fkey foreign key (organizer_id) references public.organizers (id) on delete cascade,
  constraint organizer_follows_organizer_id_user_id_key unique (organizer_id, user_id)
);
create index idx_organizer_follows_organizer_id on public.organizer_follows (organizer_id);
create index idx_organizer_follows_user_id on public.organizer_follows (user_id);

-- 17. organizer_visibility_audit ------------------------------------------------------------
create table public.organizer_visibility_audit (
  id uuid not null default gen_random_uuid(),
  organizer_id uuid not null,
  admin_user_id uuid not null,
  field_name varchar(50) not null,
  old_value integer not null,
  new_value integer not null,
  created_at timestamptz default current_timestamp,
  constraint organizer_visibility_audit_pkey primary key (id),
  constraint organizer_visibility_audit_organizer_id_fkey foreign key (organizer_id) references public.organizers (id) on delete cascade,
  constraint organizer_visibility_audit_admin_user_id_fkey foreign key (admin_user_id) references auth.users (id) on delete cascade,
  constraint organizer_visibility_audit_field_name_check check (field_name = any (array['follower_offset','events_offset']))
);

-- 18. fundraisers (circular FK: gofundme_source_id FK added in step 19b below) --------------
create table public.fundraisers (
  id uuid not null default gen_random_uuid(),
  title text not null,
  slug text not null,
  story text,
  banner text,
  goal numeric,
  raised numeric default 0,
  organizer text, -- legacy free-text organizer name, predates organizer_id
  created_at timestamp without time zone default now(),
  user_id uuid,
  video_url text,
  is_featured boolean default false,
  featured_until timestamptz,
  is_homepage_featured boolean default false,
  organizer_id uuid,
  image_url text,
  raised_amount numeric default 0, -- NOTE: both raised and raised_amount exist in production; reproduced as-is, see RECOMMENDATIONS.md item 16
  homepage_position integer default 0,
  average_rating numeric(3,2) default 0,
  review_count integer default 0,
  category text not null default 'Other'::text,
  deleted_at timestamptz,
  purge_at timestamptz,
  status text not null default 'pending_review'::text,
  rejection_reason text,
  source_url text,
  gofundme_source_id uuid,
  constraint fundraisers_pkey primary key (id),
  constraint fundraisers_user_id_fkey foreign key (user_id) references auth.users (id), -- no ON DELETE action (NO ACTION)
  constraint fundraisers_organizer_id_fkey foreign key (organizer_id) references public.organizers (id) on delete set null,
  constraint fundraisers_slug_key unique (slug),
  constraint fundraisers_status_check check (status = any (array['pending_review','published','rejected'])),
  constraint check_fundraiser_category check (category = any (array['Medical','Memorial','Emergency','Charity','Education','Animal','Environment','Business','Community','Competition','Creative','Event','Faith','Family','Sports','Travel','Volunteer','Wishes','Other']))
);
create index idx_fundraisers_category on public.fundraisers (category);
create index idx_fundraisers_is_featured on public.fundraisers (is_featured);
create index idx_fundraisers_organizer_id on public.fundraisers (organizer_id);

-- 19. gofundme_sources ----------------------------------------------------------------------
create table public.gofundme_sources (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  fundraiser_id uuid,
  title text,
  organizer text,
  source_url text not null,
  enabled boolean not null default true,
  last_synced_at timestamptz,
  last_sync_message text,
  created_at timestamptz default current_timestamp,
  updated_at timestamptz default current_timestamp,
  constraint gofundme_sources_pkey primary key (id),
  constraint gofundme_sources_fundraiser_id_fkey foreign key (fundraiser_id) references public.fundraisers (id) on delete set null,
  constraint gofundme_sources_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  constraint gofundme_sources_user_id_source_url_key unique (user_id, source_url)
);
create index idx_gofundme_sources_enabled on public.gofundme_sources (enabled);
create index idx_gofundme_sources_user_id on public.gofundme_sources (user_id);

-- 19b. Close the circular dependency now that both tables exist ------------------------------
alter table public.fundraisers
  add constraint fundraisers_gofundme_source_id_fkey
  foreign key (gofundme_source_id) references public.gofundme_sources (id) on delete set null;
create unique index fundraisers_gofundme_source_id_key on public.fundraisers (gofundme_source_id) where (gofundme_source_id is not null);

-- 20. venue_layouts -------------------------------------------------------------------------
create table public.venue_layouts (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,
  name text not null default 'Main Hall'::text,
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  constraint venue_layouts_pkey primary key (id),
  constraint venue_layouts_event_id_fkey foreign key (event_id) references public.events (id) on delete cascade
);
create index idx_venue_layouts_event_id on public.venue_layouts (event_id);

-- 21. tickets -------------------------------------------------------------------------------
create table public.tickets (
  id uuid not null default gen_random_uuid(),
  event_id uuid,
  name text,
  price numeric,
  quantity integer,
  constraint tickets_pkey primary key (id),
  constraint tickets_event_id_fkey foreign key (event_id) references public.events (id) -- no ON DELETE action (NO ACTION)
);

-- 22. fundraiser_media ----------------------------------------------------------------------
create table public.fundraiser_media (
  id uuid not null default gen_random_uuid(),
  fundraiser_id uuid not null,
  caption text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  url text not null,
  type text default 'image'::text,
  position integer default 0,
  constraint fundraiser_media_pkey primary key (id),
  constraint fundraiser_media_fundraiser_id_fkey foreign key (fundraiser_id) references public.fundraisers (id) on delete cascade,
  constraint fundraiser_media_type_check check (type = any (array['image','video']))
);
create index idx_fundraiser_media_fundraiser_id on public.fundraiser_media (fundraiser_id);
create index idx_fundraiser_media_position on public.fundraiser_media (fundraiser_id, position);

-- 23. fundraiser_updates --------------------------------------------------------------------
create table public.fundraiser_updates (
  id uuid not null default gen_random_uuid(),
  fundraiser_id uuid,
  organizer_id uuid,
  title text,
  content text not null,
  created_at timestamptz default now(),
  constraint fundraiser_updates_pkey primary key (id),
  constraint fundraiser_updates_organizer_id_fkey foreign key (organizer_id) references public.organizers (id) on delete cascade,
  constraint fundraiser_updates_fundraiser_id_fkey foreign key (fundraiser_id) references public.fundraisers (id) on delete cascade
);
create index idx_fundraiser_updates_fundraiser_created on public.fundraiser_updates (fundraiser_id, created_at desc);

-- 24. donations -----------------------------------------------------------------------------
create table public.donations (
  id uuid not null default gen_random_uuid(),
  fundraiser_id uuid,
  donor_name text,
  amount numeric,
  created_at timestamp without time zone default now(),
  status varchar(50) default 'succeeded'::character varying,
  currency text default 'usd'::text,
  donor_email text,
  stripe_session_id text,
  message text,
  payment_intent_id text,
  receipt_path varchar(512),
  certificate_path varchar(512),
  payment_method varchar(50) default 'stripe'::character varying,
  user_id uuid,
  source text not null default 'stripe'::text,
  import_batch_id uuid,
  constraint donations_pkey primary key (id),
  constraint donations_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null,
  constraint donations_fundraiser_id_fkey foreign key (fundraiser_id) references public.fundraisers (id), -- no ON DELETE action (NO ACTION)
  constraint donations_payment_intent_id_key unique (payment_intent_id),
  constraint donations_status_check check (status = any (array['pending','succeeded','completed','failed','refunded']))
);
create index idx_donations_import_batch on public.donations (import_batch_id) where (import_batch_id is not null);
create index idx_donations_user_id on public.donations (user_id);

-- 25. reviews -------------------------------------------------------------------------------
create table public.reviews (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  event_id uuid,
  fundraiser_id uuid,
  organizer_id uuid,
  rating integer not null,
  title text,
  review text,
  is_verified boolean default false,
  is_approved boolean default true,
  created_at timestamptz default current_timestamp,
  updated_at timestamptz default current_timestamp,
  review_type text default 'platform'::text,
  constraint reviews_pkey primary key (id),
  constraint reviews_organizer_id_fkey foreign key (organizer_id) references public.organizers (id) on delete cascade,
  constraint reviews_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  constraint reviews_event_id_fkey foreign key (event_id) references public.events (id) on delete cascade,
  constraint reviews_fundraiser_id_fkey foreign key (fundraiser_id) references public.fundraisers (id) on delete cascade,
  constraint reviews_rating_check check (rating between 1 and 5),
  constraint reviews_review_type_check check (review_type = any (array['event','fundraiser','organizer','platform'])),
  constraint reviews_target_or_platform check (
    (review_type = 'platform' and event_id is null and fundraiser_id is null and organizer_id is null)
    or (review_type <> 'platform' and ((event_id is not null)::int + (fundraiser_id is not null)::int + (organizer_id is not null)::int) >= 1)
  )
);
create unique index idx_unique_user_event_review on public.reviews (user_id, event_id) where (event_id is not null);
create unique index idx_unique_user_fundraiser_review on public.reviews (user_id, fundraiser_id) where (fundraiser_id is not null);
create unique index idx_unique_user_organizer_review on public.reviews (user_id, organizer_id) where (organizer_id is not null);
create unique index idx_unique_user_platform_review on public.reviews (user_id) where (review_type = 'platform');

-- 26. seats ---------------------------------------------------------------------------------
create table public.seats (
  id uuid not null default gen_random_uuid(),
  layout_id uuid not null,
  event_id uuid not null,
  section text not null,
  row_label text not null,
  seat_number integer not null,
  status text not null default 'available'::text,
  reserved_until timestamptz,
  ticket_id uuid, -- no FK: unenforced loose reference despite the name; verify against app code
  price_override numeric(12,2),
  constraint seats_pkey primary key (id),
  constraint seats_event_id_fkey foreign key (event_id) references public.events (id) on delete cascade,
  constraint seats_layout_id_fkey foreign key (layout_id) references public.venue_layouts (id) on delete cascade,
  constraint seats_layout_id_section_row_label_seat_number_key unique (layout_id, section, row_label, seat_number),
  constraint seats_status_check check (status = any (array['available','reserved','sold']))
);
create index idx_seats_event_id on public.seats (event_id);
create index idx_seats_layout_id on public.seats (layout_id);
create index idx_seats_status on public.seats (status);

-- 27. product_orders ------------------------------------------------------------------------
create table public.product_orders (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  product_name text not null,
  unit_price numeric(12,2) not null,
  buyer_id uuid,
  buyer_email text,
  buyer_name text,
  quantity integer not null default 1,
  total_amount numeric(12,2) not null,
  currency text not null default 'usd'::text,
  status text not null default 'pending'::text,
  payment_method text not null default 'stripe'::text,
  stripe_session_id text,
  stripe_payment_intent_id text,
  crypto_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_orders_pkey primary key (id),
  constraint product_orders_buyer_id_fkey foreign key (buyer_id) references auth.users (id) on delete set null,
  constraint product_orders_product_id_fkey foreign key (product_id) references public.products (id) on delete restrict,
  constraint product_orders_total_amount_check check (total_amount >= 0),
  constraint product_orders_unit_price_check check (unit_price >= 0),
  constraint product_orders_payment_method_check check (payment_method = any (array['stripe','crypto'])),
  constraint product_orders_status_check check (status = any (array['pending','paid','cancelled','refunded'])),
  constraint product_orders_quantity_check check (quantity >= 1)
);
create index idx_product_orders_buyer_id on public.product_orders (buyer_id);
create index idx_product_orders_crypto_payment_id on public.product_orders (crypto_payment_id);
create index idx_product_orders_product_id on public.product_orders (product_id);
create index idx_product_orders_stripe_payment_intent_id on public.product_orders (stripe_payment_intent_id);
create index idx_product_orders_stripe_session_id on public.product_orders (stripe_session_id);

comment on column public.product_orders.product_name is 'Snapshot of products.name at order-creation time, written explicitly by the checkout route. Never re-derived from products at display time.';
comment on column public.product_orders.unit_price is 'Snapshot of the price actually charged per unit at order-creation time, written explicitly by the checkout route.';
comment on column public.product_orders.buyer_id is 'Nullable — guest checkout is allowed platform-wide, same as donations.user_id and ticket_orders.buyer_email being the only guest identifier.';
comment on column public.product_orders.status is 'Flipped pending -> paid exclusively by the payment webhook. Stock decrement happens in the same webhook transaction, guarded so retries cannot double-decrement.';

-- 28. ticket_orders -------------------------------------------------------------------------
create table public.ticket_orders (
  id uuid not null default gen_random_uuid(),
  event_id uuid not null,
  ticket_id uuid, -- no FK: unenforced loose reference, mirrors seats.ticket_id
  seat_id uuid,
  seat_label text,
  buyer_email text,
  buyer_name text,
  quantity integer not null default 1,
  total_amount numeric(12,2) not null,
  qr_code text not null,
  status text not null default 'valid'::text,
  stripe_session_id text,
  checked_in_at timestamptz,
  created_at timestamptz default now(),
  stripe_payment_intent_id text,
  currency text default 'usd'::text,
  payment_method varchar(50) default 'stripe'::character varying,
  constraint ticket_orders_pkey primary key (id),
  constraint ticket_orders_seat_id_fkey foreign key (seat_id) references public.seats (id), -- no ON DELETE action (NO ACTION)
  constraint ticket_orders_event_id_fkey foreign key (event_id) references public.events (id) on delete cascade,
  constraint ticket_orders_qr_code_key unique (qr_code),
  constraint ticket_orders_status_check check (status = any (array['pending','valid','used','cancelled','refunded']))
);
create index idx_ticket_orders_event_id on public.ticket_orders (event_id);
create unique index idx_ticket_orders_payment_intent on public.ticket_orders (stripe_payment_intent_id);
create index idx_ticket_orders_qr_code on public.ticket_orders (qr_code);
create index idx_ticket_orders_stripe_session on public.ticket_orders (stripe_session_id);
