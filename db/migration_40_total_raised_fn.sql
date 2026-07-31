-- Migration 40: DB-side aggregate for the fundraisers landing "total raised" stat.
--
-- The /fundraisers hero shows a single platform-wide "$X raised so far" figure.
-- It was computed by selecting every fundraiser's `raised` column and summing in
-- Node on every request (a full-table scan streamed to the app). PostgREST's
-- inline aggregate functions (`raised.sum()`) are disabled on this project for
-- security, so the aggregate is exposed as an explicit RPC instead — it returns
-- one number rather than every row.
--
-- Sums `raised` over currently-live fundraisers only (`deleted_at is null`) —
-- the public "raised so far" stat should not count soft-deleted campaigns.
-- (The previous inline query applied no such filter; at the time of this
-- migration there were 0 soft-deleted rows, so the figure is unchanged, but
-- the guard is correct going forward.) SECURITY DEFINER so the total is
-- consistent regardless of the caller's RLS; the function only returns an
-- aggregate scalar, never row data.

create or replace function public.get_total_raised()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(raised), 0) from public.fundraisers where deleted_at is null;
$$;

grant execute on function public.get_total_raised() to anon, authenticated, service_role;
