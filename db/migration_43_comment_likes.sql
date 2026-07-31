-- migration_43_comment_likes.sql
-- "Like a comment" for Words of Support. Anyone can like (no login); duplicate
-- likes are blocked by BOTH a per-visitor cookie UUID and the client IP — a like
-- is refused if EITHER already exists for that comment.
--
-- The existing comments.likes column stays as the admin-imported/GoFundMe
-- baseline and is never modified here. Real likes live in this table and ADD ON
-- TOP: displayed count = comments.likes + count(*) from comment_likes.

create table if not exists comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id) on delete cascade,
  cookie_id uuid not null,            -- random per-visitor id, not tied to identity
  ip_address text,                    -- best-effort; null in local dev (no client IP)
  created_at timestamptz not null default now()
);

-- One like per visitor-cookie per comment. Also the lookup index for the cookie
-- dedup check and the per-visitor "already liked?" query.
create unique index if not exists comment_likes_comment_cookie_uq
  on comment_likes(comment_id, cookie_id);

-- One like per IP per comment (partial: unknown/null IPs never collide). Doubles
-- as the lookup index for the IP dedup check. Both unique indexes also act as a
-- race backstop if two likes land concurrently.
create unique index if not exists comment_likes_comment_ip_uq
  on comment_likes(comment_id, ip_address) where ip_address is not null;

-- Writes/reads happen only through the service-role like/unlike API route, so RLS
-- is on with no public policies (regular users can't touch this table directly).
alter table comment_likes enable row level security;

-- Grouped real-like counts for a page of comments in one round trip (PostgREST
-- inline aggregates are disabled on this project, so this is exposed as an RPC).
create or replace function public.get_comment_like_counts(ids uuid[])
returns table(comment_id uuid, cnt bigint)
language sql
stable
security definer
set search_path = public
as $$
  select comment_id, count(*)::bigint
  from comment_likes
  where comment_id = any(ids)
  group by comment_id;
$$;

grant execute on function public.get_comment_like_counts(uuid[]) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
