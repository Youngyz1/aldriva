# Verification Checklist

Run through this on the new project before and after data migration. All queries below are read-only.

## Schema structure (after applying `sql/001`–`sql/011`, before data load)

- [ ] `select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';` → **28**
- [ ] `select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='v';` → **2** (`public_donation_activity`, `public_profiles`)
- [ ] `select count(*) from pg_proc where pronamespace='public'::regnamespace;` → **19**
- [ ] `select count(*) from information_schema.triggers where event_object_schema in ('public','auth');` → **12** (11 public + 1 on `auth.users`; note `information_schema.triggers` may report `UPDATE OF <cols>` triggers as multiple rows per column — cross-check against `pg_trigger` count of **12** distinct trigger objects if the count looks off)
- [ ] `select count(*) from pg_constraint where connamespace='public'::regnamespace and contype='f';` — compare against `sql/002_tables.sql`'s FK count as a sanity check (spot-check rather than exact-match, since some FKs are added via separate `ALTER TABLE` for the circular dependency)
- [ ] `select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname;` → all 28 rows `true`
- [ ] `select count(*) from pg_policies where schemaname='public';` → **87**
- [ ] `select count(*) from pg_policies where schemaname='storage' and tablename='objects';` → **14**
- [ ] `select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;` → 7 buckets present, matching `sql/009_storage_buckets.sql` exactly (all public, no size/MIME limits, matching production)
- [ ] `select schemaname, tablename from pg_publication_tables where pubname='supabase_realtime';` → contains `public.notifications` (plus anything else deliberately added)
- [ ] `select typname from pg_type where typtype='e' and typnamespace='public'::regnamespace;` → **0 rows** (confirms no enums were accidentally introduced)
- [ ] Confirm the circular FK closed correctly: `select conname from pg_constraint where conname = 'fundraisers_gofundme_source_id_fkey';` → 1 row

## Auth integration (functional test, not just structural)

- [ ] Sign up a brand-new test user through the actual app UI (or `supabase.auth.signUp`) against the new project. Then: `select * from public.profiles where id = '<new-user-id>';` → exactly one row exists, `role='user'`, `status='active'`.
- [ ] Confirm `requireAuth`/`getCurrentUserProfile` (`lib/auth.ts`) resolve correctly for that test user against the new project.
- [ ] Attempt to log in as a **migrated** (pre-existing) user with their original password (if `auth.users` data was copied per `04-data-migration-strategy.md` §1) — confirms the bcrypt hash copy round-tripped correctly.

## RLS behavior (functional test — policies existing isn't the same as policies working)

- [ ] As an anonymous (anon-key) client: confirm `SELECT` on `events`, `tickets`, `fundraisers` (published only), `articles` (published/public only), `products` (active only), homepage_* tables succeeds; confirm `SELECT` on `comment_likes`, `seats`, `ticket_orders`, `venue_layouts`, `profiles` (other users' rows) all return **zero rows**, not an error (RLS silently filters, it doesn't reject).
- [ ] As an authenticated non-admin test user: confirm they **cannot** flip their own `profiles.role` to `'admin'` via a client-side update (tests `prevent_profile_role_status_self_update` trigger + the `profiles` UPDATE policy together).
- [ ] As an authenticated non-admin test user: confirm they **cannot** set an `articles`/`businesses`/`products`/`fundraisers` row's `status` directly to `'published'`/`'active'` (tests the `enforce_*_status_transition` triggers).
- [ ] Confirm anonymous INSERT into `events`/`tickets` still succeeds unconditionally, matching production's "Allow public insert" policy (`WITH CHECK (true)`) — this migration reproduces that behavior exactly. See `RECOMMENDATIONS.md` item 1 if this is ever revisited separately from the migration.

## Storage

- [ ] Upload a test file to each of the 7 buckets as an authenticated user via the app's actual upload components (not just the API directly) — confirms both the bucket exists and the relevant `storage.objects` policy permits it.
- [ ] For `event-banners` specifically: confirm the app's actual behavior matches production — this bucket has zero `storage.objects` policies in production (per `03-rls-storage-roles-realtime.md`), so client-side upload should fail there too unless the app only uploads banners server-side. This is reproduced as-is; it is not something this migration changes.
- [ ] Fetch a public object URL for a migrated file in each bucket and confirm it renders/downloads correctly (validates the storage object-copy step in `04-data-migration-strategy.md` §3, not just the bucket config).

## Functions / triggers (functional)

- [ ] Submit a new `reviews` row (event, fundraiser, and organizer review types) and confirm the corresponding `average_rating`/`review_count` on `events`/`fundraisers`/`organizers` updates (tests `trg_update_rating_aggregates` → `update_rating_aggregates()` → `recalculate_*_rating()` chain).
- [ ] Insert a `donations` row with `status='completed'` and confirm `fundraisers.raised` (and/or `raised_amount`, whichever the app actually reads — see schema report irregularity #3) updates accordingly (tests `trg_update_fundraiser_raised`).
- [ ] Call `get_total_raised()`, `get_comment_like_counts(ARRAY[<some-comment-id>])`, `check_email_pending_deletion('<test-email>')` via `/rest/v1/rpc/...` and confirm each returns a sane result (not just "doesn't error").
- [ ] Confirm whatever mechanism is supposed to call `release_expired_seat_reservations()` in production (a Vercel cron route, per `04-data-migration-strategy.md`) is actually configured and firing against the new project — this function does nothing on its own.

## Data integrity (post data-migration only)

- [ ] Row counts per table match between old and new project (`select count(*) from <table>` for all 28, compared pre/post migration).
- [ ] Spot-check a handful of FK relationships resolve correctly post-migration, especially the circular `fundraisers` ↔ `gofundme_sources` pair and the polymorphic (unenforced) `comments.target_id` / `notifications.related_id` / `seats.ticket_id` / `ticket_orders.ticket_id` references — these have no FK to catch a broken reference automatically, so verify with a manual `NOT EXISTS` sweep, e.g.:
  ```sql
  select c.id from comments c
  where c.target_type = 'event' and not exists (select 1 from events e where e.id = c.target_id)
  union all
  select c.id from comments c
  where c.target_type = 'fundraiser' and not exists (select 1 from fundraisers f where f.id = c.target_id);
  -- expect 0 rows
  ```
- [ ] See `07-stripe-and-payment-fields.md` for the full set of Stripe/crypto payment-data verification steps (payment intent/session ID resolution, subscription state, webhook replay test).

## Advisors

- [ ] Run `get_advisors(type="security")` and `get_advisors(type="performance")` against the new project after full setup. Compare against the 39-finding baseline in `03-rls-storage-roles-realtime.md` — this migration reproduces production exactly, so the same 39 findings are expected to still appear. New findings that weren't in production indicate something introduced during migration and should be investigated; anything from that baseline is pre-existing and tracked separately in `RECOMMENDATIONS.md`, not a migration defect.
