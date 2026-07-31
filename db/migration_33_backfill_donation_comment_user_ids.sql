-- One-time backfill: link historical donations/comments to accounts by
-- exact, case-insensitive email match against a CONFIRMED auth.users email.
-- Only fills rows where user_id is currently null — never overwrites an
-- existing attribution.

update public.donations d
set user_id = u.id
from auth.users u
where d.user_id is null
  and d.donor_email is not null
  and lower(trim(d.donor_email)) = lower(u.email)
  and u.email_confirmed_at is not null;

update public.comments c
set user_id = u.id
from auth.users u
where c.user_id is null
  and c.author_email is not null
  and lower(trim(c.author_email)) = lower(u.email)
  and u.email_confirmed_at is not null;