-- ============================================================================
-- 007_views.sql — Both views in `public`, verbatim from production
-- (pg_get_viewdef). Requires their underlying tables (002_tables.sql) to exist.
--
-- Both views are SECURITY DEFINER in production (Postgres's default when
-- `security_invoker` is not set) — they run with the view owner's privileges
-- against the underlying tables, not the querying user's. This is current
-- production behavior and is reproduced as-is below. See RECOMMENDATIONS.md
-- (items 6) for discussion of whether to change this in a follow-up, separate
-- from this migration.
-- ============================================================================

create view public.public_donation_activity as
 select d.id,
    d.user_id,
    d.fundraiser_id,
    d.amount,
    d.created_at,
    f.title as fundraiser_title,
    f.slug as fundraiser_slug,
    f.banner as fundraiser_banner
   from donations d
     join fundraisers f on f.id = d.fundraiser_id
  where d.user_id is not null and (d.status::text = any (array['succeeded'::character varying, 'completed'::character varying]::text[]));

create view public.public_profiles as
 select id,
    display_name,
    coalesce(avatar_url, profile_photo) as avatar_url
   from profiles
  where status = 'active'::text and deleted_at is null
    and coalesce(nullif(btrim(privacy_settings ->> 'profile_visibility'::text), ''::text), 'public'::text) = 'public'::text;
