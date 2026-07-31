# RLS Policies, Storage, Roles & Grants, Realtime

**Audit date**: 2026-07-23, read-only (initial pass + a fresh verbatim re-query to confirm exact policy text). Full executable SQL is in `sql/006_rls_policies.sql` (RLS), `sql/009_storage_buckets.sql` + `sql/010_storage_policies.sql` (storage), `sql/008_grants.sql` (grants), `sql/011_realtime.sql` (realtime).

## Correction to initial audit pass

An initial broader pass estimated 79 RLS policies. A follow-up direct verbatim query against `pg_policies` (needed anyway to get exact `USING`/`WITH CHECK` text for the SQL files) counted **87 policies** across 24 of the 28 tables. 87 is authoritative — it's a fresh, complete, unfiltered `SELECT * FROM pg_policies WHERE schemaname='public'` result, not a summary.

## RLS policy inventory

All 87 policies are `PERMISSIVE` and apply to role `public` (meaning both `anon` and `authenticated` — `service_role` bypasses RLS entirely regardless of policy). Full verbatim `USING`/`WITH CHECK` expressions are in `sql/006_rls_policies.sql`, organized table-by-table. Tables with **zero** policies (RLS on, no policy — closed to everyone except `service_role`/table owner): `comment_likes`, `seats`, `ticket_orders`, `venue_layouts`.

### Tables with RLS enabled but no policies — implication

For these 4 tables, `anon`/`authenticated` have **no access at all** through PostgREST:
- `comment_likes` — access is via the `get_comment_like_counts()` `SECURITY DEFINER` RPC (confirmed intentional design).
- `seats`, `ticket_orders`, `venue_layouts` — no equivalent RPC found; these are presumably touched only via server-side code using the service-role client (`lib/supabase-admin.ts`), matching the checkout/seat-reservation flow described in `CLAUDE.md`. **If any planned feature needs direct anon/authenticated access to these three (e.g. a live seat map polling from the browser), that access does not currently exist and would need new policies — it is not merely "duplicate work to reproduce," it is a genuine gap to design.**

### Policies worth being aware of (reproduced as-is; see `RECOMMENDATIONS.md` for full discussion)

These are documented here for accuracy since they're part of current production behavior that the migration reproduces exactly — none are changed by this migration:

1. **`events`/`tickets` "Allow public insert"** (`WITH CHECK (true)`, role `public`) — no ownership check, no status gate. Contrast with `fundraisers`/`products`/`businesses`, which all gate INSERT on `auth.uid() = owner/user_id` plus a `pending_review`-style status. → `RECOMMENDATIONS.md` item 1.
2. **`fundraisers` "Anyone can create a fundraiser pending review"** — `WITH CHECK (status = 'pending_review')` only, no `auth.uid() = user_id` check. → `RECOMMENDATIONS.md` item 2.
3. **`organizers` "Public read organizers"** (`USING (true)`) coexists with the visibility-scoped **"Public organizers are readable"** policy; since permissive policies OR together, every organizer row is publicly readable regardless of `visibility`. → `RECOMMENDATIONS.md` item 3.
4. **`public_donation_activity` / `public_profiles` views** bypass their underlying tables' RLS (see `02-functions-triggers-views.md`). → `RECOMMENDATIONS.md` item 6.
5. **Redundant duplicate SELECT policies** on `fundraiser_media` and `organizer_follows` (harmless). → `RECOMMENDATIONS.md` item 4.
6. **`reviews` "Admins can manage all reviews"** omits the `status = 'active'` check present elsewhere. → `RECOMMENDATIONS.md` item 5.

## Storage buckets (7)

| Bucket | Public | Size limit | MIME allow-list |
|---|---|---|---|
| `event-banners` | true | none | none |
| `event-videos` | true | none | none |
| `fundraiser-media` | true | none | none |
| `organizer-banners` | true | none | none |
| `organizer-images` | true | none | none |
| `profile-images` | true | none | none |
| `videos` | true | none | none |

**All 7 buckets are public with no file-size limit and no MIME-type allow-list**, matching production exactly — reproduced as-is in `sql/009_storage_buckets.sql`. See `RECOMMENDATIONS.md` item 10 for optional, separately-applied limits.

**Correction/clarification (2026-07-23, manual Dashboard verification, both projects)**: "no file-size limit" above describes the `storage.buckets.file_size_limit` column only, which is genuinely `NULL` (unlimited) on every bucket, on both projects — that part of the table is accurate at the database layer. However, both projects are on the **Free plan**, which enforces a **platform-wide 50 MB upload cap regardless of any per-bucket column value** ("Free Plan has a fixed upload file size limit of 50 MB... Upgrade to Pro for a configurable limit of 500 GB", per Supabase's own Storage → Settings UI). Both statements are true at different layers: the schema says unlimited; the platform enforces 50 MB on top of that, identically on both projects, so this is not a migration discrepancy — just a fact worth knowing before assuming "no limit" means what it sounds like.

## Storage policies (14 total, on `storage.objects`)

- **6 of 7 buckets** (`event-videos`, `fundraiser-media`, `organizer-banners`, `organizer-images`, `profile-images`, `videos`) each have an explicit "authenticated can upload" + "public can read" policy pair (`profile-images` and `fundraiser-media` additionally scope upload/delete to the uploader's own folder via `(storage.foldername(name))[1] = auth.uid()`).
- **`event-banners` has zero storage.objects policies.** Reads still work via the public object-URL path (bucket is public), but no anon/authenticated upload path exists — only `service_role` can write there. Reproduced as-is; see `RECOMMENDATIONS.md` item 11.
- **Ownership-scoping differs by bucket**: only `fundraiser-media` and `profile-images` restrict uploads/deletes to the uploader's own folder path; the other 4 only check `auth.role() = 'authenticated'`. See `RECOMMENDATIONS.md` item 12.

Full verbatim policy SQL: `sql/010_storage_policies.sql`.

## Roles & grants

Standard Supabase role shape confirmed: `authenticator` (login role, `SET ROLE`s into `anon`/`authenticated`/`service_role` per PostgREST request), `anon`/`authenticated`/`service_role` (cannot log in directly), `supabase_admin` (sole superuser), `postgres` (schema owner, can create roles/databases but not superuser).

Every one of the 28 application tables grants `anon`, `authenticated`, and `service_role` the full privilege set (`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN`) — this is Supabase's standard `GRANT ALL ... TO anon, authenticated, service_role` bootstrap default (applied via `ALTER DEFAULT PRIVILEGES` so new tables inherit it automatically), **not** a deliberate per-table choice. **RLS policies are the only real access gate** for `anon`/`authenticated`; this blanket grant is normal Supabase architecture, not a misconfiguration, but it does mean a table created with RLS enabled and no policy is fully closed, while a table created without RLS enabled at all is fully open — always enable RLS immediately after `CREATE TABLE` (see `sql/005_enable_rls.sql`'s ordering note).

All 19 `public` functions grant `EXECUTE` to `anon`, `authenticated`, `service_role` — same "default grant on everything" pattern, not deliberate per-function tuning. Reproduced as-is in `sql/008_grants.sql`; see `RECOMMENDATIONS.md` item 9 for optional narrowing.

## Realtime publication membership

**Only `public.notifications`** is a member of the `supabase_realtime` publication. No other application table broadcasts row-level changes via `postgres_changes`. A second publication, `supabase_realtime_messages_publication`, is Realtime's own internal broadcast/presence support and isn't application data — don't touch it. Any "live" UI behavior for other tables (live seat maps, live donation tickers) must currently be polling-based or use Realtime Broadcast/Presence channels directly, not table replication.

## Auth FK dependencies (`auth.users` referenced by)

20 foreign keys from `public` tables reference `auth.users(id)` (plus 8 internal to Supabase's own `auth` schema, not reproduced here — Supabase manages those). See `01-schema-report.md` irregularity #1 for the 7 that have no `ON DELETE` action and will block user deletion until the app cleans up those rows first.

## Full security advisor findings (39 total, fresh run)

- 4× `rls_enabled_no_policy` (INFO) — the 4 no-policy tables above.
- 2× `security_definer_view` (ERROR) — `public_donation_activity`, `public_profiles`.
- 16× `function_search_path_mutable` (WARN) — all 19 functions minus the 3 that already pin `search_path` (`get_total_raised`, `get_comment_like_counts`, `handle_new_user`).
- 2× `rls_policy_always_true` (WARN) — `events` and `tickets` "Allow public insert".
- 6× `public_bucket_allows_listing` (WARN) — every bucket that has a broad `SELECT` policy (all except `event-banners`, which has none).
- 4× `anon_security_definer_function_executable` + 4× `authenticated_security_definer_function_executable` (WARN) — the 4 SECURITY DEFINER functions, each flagged twice (once per role).
- 1× `auth_leaked_password_protection` (WARN) — HaveIBeenPwned check disabled project-wide; this is an Auth *setting*, fix in the new project's Dashboard, not via SQL.
