-- Restricted public view: what any visitor can see about someone's donation activity.
-- Only exposes safe fields, only for donations tied to a real account, only successful ones.
create or replace view public.public_donation_activity as
select
  d.id,
  d.user_id,
  d.fundraiser_id,
  d.amount,
  d.created_at,
  f.title as fundraiser_title,
  f.slug as fundraiser_slug,
  f.banner as fundraiser_banner
from public.donations d
join public.fundraisers f on f.id = d.fundraiser_id
where d.user_id is not null
  and d.status in ('succeeded', 'completed');

grant select on public.public_donation_activity to anon, authenticated;

-- Let a logged-in user see their OWN full donation rows (including receipt/certificate paths),
-- separate from the public view above which only exposes safe fields to everyone.
create policy "Users can view their own donations"
  on public.donations
  for select
  using (auth.uid() = user_id);