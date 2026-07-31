-- ============================================================================
-- 004_triggers.sql — All 12 triggers (11 on public tables + 1 on auth.users),
-- verbatim from production. Requires 002_tables.sql and 003_functions.sql to
-- have run first (each trigger's function must exist before CREATE TRIGGER).
-- ============================================================================

-- On auth.users — CRITICAL, must exist before any signup on the new project --
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- On public.articles ----------------------------------------------------------
create trigger trg_articles_updated_at
  before insert or update on public.articles
  for each row
  execute function public.update_articles_updated_at();

create trigger trg_enforce_article_status_transition
  before update on public.articles
  for each row
  execute function public.enforce_article_status_transition();

-- On public.businesses ---------------------------------------------------------
create trigger trg_businesses_updated_at
  before insert or update on public.businesses
  for each row
  execute function public.update_businesses_updated_at();

create trigger trg_enforce_business_status_transition
  before update on public.businesses
  for each row
  execute function public.enforce_business_status_transition();

-- On public.donations -----------------------------------------------------------
create trigger trg_update_fundraiser_raised
  after insert or update on public.donations
  for each row
  execute function public.update_fundraiser_raised();

-- On public.fundraisers ----------------------------------------------------------
create trigger trg_enforce_fundraiser_status_transition
  before update on public.fundraisers
  for each row
  execute function public.enforce_fundraiser_status_transition();

-- On public.product_orders -------------------------------------------------------
create trigger trg_product_orders_updated_at
  before insert or update on public.product_orders
  for each row
  execute function public.update_product_orders_updated_at();

-- On public.products -------------------------------------------------------------
create trigger trg_products_updated_at
  before insert or update on public.products
  for each row
  execute function public.update_products_updated_at();

create trigger trg_enforce_product_status_transition
  before update on public.products
  for each row
  execute function public.enforce_product_status_transition();

-- On public.profiles ---------------------------------------------------------------
create trigger prevent_profile_role_status_self_update
  before update on public.profiles
  for each row
  execute function public.prevent_profile_role_status_self_update();

-- On public.reviews (fires only on the columns that feed the aggregates) -----------
create trigger trg_update_rating_aggregates
  after insert or delete or update of rating, is_approved, event_id, fundraiser_id, organizer_id
  on public.reviews
  for each row
  execute function public.update_rating_aggregates();

-- ============================================================================
-- No triggers exist (in production) on: events, tickets, organizers,
-- eventbrite_sources, gofundme_sources, venue_layouts, seats, ticket_orders,
-- comments, platform_settings, fundraiser_media, organizer_follows,
-- homepage_categories, homepage_testimonials, homepage_sponsors,
-- organizer_visibility_audit, follows, comment_likes, notifications.
--
-- release_expired_seat_reservations() is NOT trigger-fired — no pg_cron job
-- exists in production either. Confirm what actually calls it (a Vercel cron,
-- an API route) and reproduce that scheduling mechanism in the new project;
-- it will not run on its own.
-- ============================================================================
