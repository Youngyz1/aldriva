-- ============================================================================
-- 005_enable_rls.sql — Enable RLS on all 28 application tables.
-- In production, ALL 28 tables have relrowsecurity = true and
-- relforcerowsecurity = false (table owner / service_role always bypasses).
-- Run this immediately after 002_tables.sql and BEFORE granting PostgREST
-- table access (008_grants.sql) — a window with RLS on-but-no-policy is safe;
-- a window with RLS off is not.
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.homepage_categories enable row level security;
alter table public.homepage_sponsors enable row level security;
alter table public.homepage_testimonials enable row level security;
alter table public.organizers enable row level security;
alter table public.businesses enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;
alter table public.events enable row level security;
alter table public.articles enable row level security;
alter table public.products enable row level security;
alter table public.eventbrite_sources enable row level security;
alter table public.organizer_follows enable row level security;
alter table public.organizer_visibility_audit enable row level security;
alter table public.fundraisers enable row level security;
alter table public.gofundme_sources enable row level security;
alter table public.venue_layouts enable row level security;
alter table public.tickets enable row level security;
alter table public.fundraiser_media enable row level security;
alter table public.fundraiser_updates enable row level security;
alter table public.donations enable row level security;
alter table public.reviews enable row level security;
alter table public.seats enable row level security;
alter table public.product_orders enable row level security;
alter table public.ticket_orders enable row level security;

-- NOTE: comment_likes, seats, ticket_orders, venue_layouts intentionally get
-- ZERO policies in 006_rls_policies.sql, matching production exactly — with
-- RLS enabled and no policy, only service_role/table owner can touch them.
-- comment_likes is read via the get_comment_like_counts RPC (003_functions.sql);
-- seats/ticket_orders/venue_layouts are presumably server-side-only per
-- CLAUDE.md's description of the checkout/seat-reservation flow. This is
-- current production behavior and is reproduced as-is.
