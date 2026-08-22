# Data Migration Strategy

This covers moving from "new project has the right empty schema" (Parts 1–3) to "new project has production's actual data and is safe to cut traffic over to." This document is a strategy and checklist — no data migration was performed or attempted during this audit; production was accessed read-only throughout.

## 0. Prerequisites before starting data migration

- [ ] `sql/001_extensions.sql` through `sql/011_realtime.sql` applied successfully to the new project and independently verified (see `05-verification-checklist.md`). This reproduces production's schema, functions, triggers, RLS, views, storage, and Realtime configuration exactly — no behavior changes from `RECOMMENDATIONS.md` are applied at this stage (or at any stage of this migration, unless separately decided later).
- [ ] New Supabase project's Auth settings configured to match production intent (email templates, redirect URLs, OAuth provider credentials if any).
- [ ] All secrets re-provisioned for the new project: Stripe keys/webhook signing secret, Resend API key, Supabase service-role key, publishable/anon key, `NEXT_PUBLIC_SUPABASE_URL`. None of these can be copied from the old project — they are project-specific.

## 1. `auth.users` migration

**Status: executed and verified (2026-07-24).** See "Execution & verification" at the end of this section for the actual outcome, including one correction to the procedure originally documented below (the schema-file load step was dropped — `supabase-new` already provisions a correct `auth` schema at project creation, independent of `sql/001`–`011`, which only covers `public`). The rest of this section is preserved as-planned for reference; the correction and results are called out explicitly at the end.

This is the highest-risk, highest-value step — every `public` table's ownership chain roots in `auth.users.id`, and IDs must match exactly across old and new projects for FKs to remain valid.

**Pre-copy verification (required, before any `auth` data moves):** Verify `supabase-new`'s `auth.users` is empty of any pre-existing rows (e.g. leftover OAuth test sign-ins from Phase 4 config testing). Run `SELECT count(*) FROM auth.users;` on `supabase-new` — expect `0`. If non-zero, investigate and clean up each row before proceeding, checking for email collisions against production's `auth.users` first — a stray test row sharing an email with a real production user will break the import or corrupt that user's identity. See the incident log entry below for a concrete example of exactly this happening.

> **Incident log — 2026-07-23**: A Google OAuth test sign-in performed during Phase 4 Auth configuration testing created a real row in `supabase-new`'s `auth.users` (id `d65cd066-abf7-4306-9f52-6f86502a2952`, email `ofiliyoungyz@gmail.com`), with a cascaded `public.profiles` row created by `handle_new_user()`. This email collided exactly with production's earliest user (id `21b8bbfc-95c6-4ea9-aa2e-51b3460a0865`, same email, `auth.users.email` unique) — the same person's real production account. Caught during Phase 6 prep review (before any data copy ran) and cleaned up: the `auth.users` row was deleted (confirmed `ON DELETE CASCADE` on `profiles_id_fkey` first, which removed the `profiles` row automatically), then both tables were confirmed empty of that id. Root cause: this document's original §1 had no step requiring verification that the target's `auth.users` was empty before the copy — this pre-copy verification step and this log entry close that gap.

**Confirmed approach: `supabase db dump` (the Supabase CLI wrapper) against the `auth` schema, restored via `psql`** — not raw `pg_dump`/`pg_restore`, not the Admin API. Mechanism fully confirmed, both extraction steps tested successfully; the restore side has not yet been attempted or authorized (see status note at the end of this section).

**Full procedure (mechanism confirmed; execution not yet run for real):**
1. **Dump schema**: `supabase db dump --db-url "[production connection string]" --schema auth -f auth_schema.sql`
2. **Dump data**: `supabase db dump --db-url "[production connection string]" --schema auth --data-only -f auth_data.sql`
3. **Restore into `supabase-new`**: via `psql`, not `supabase db push` (`db push` is for pushing local migration files to a remote project during ordinary development, not for loading a dump file — it's the wrong tool here). Per Supabase's own official "Backup and Restore using the CLI" guide, the correct restore invocation is:
   ```
   psql \
     --single-transaction \
     --variable ON_ERROR_STOP=1 \
     --file auth_schema.sql \
     --command 'SET session_replication_role = replica' \
     --file auth_data.sql \
     --dbname "[supabase-new connection string]"
   ```
   `session_replication_role = replica` disables triggers during the load (preventing `on_auth_user_created` from firing per-row and preventing double-processing of already-hashed columns) — re-enable normally afterward (this is the default at the end of the session/transaction unless set otherwise).
4. Then `auth.identities` (OAuth/email identity records), then any other `auth.*` tables actually populated in production (check `auth.mfa_factors`, `auth.sso_providers` row counts before assuming they're empty — the schema audit found these tables exist but did not audit their row counts).
5. **Do this BEFORE loading `public` table data** — `public.profiles` and every other FK-to-`auth.users` table depend on these rows already existing, and `handle_new_user()`'s trigger firing on each `auth.users` insert will auto-create `profiles` rows — for a bulk data copy, either temporarily disable the `on_auth_user_created` trigger and load `public.profiles` explicitly from the old project's data (safer — preserves exact `role`/`status`/`preferences` history), or let the trigger fire and then `UPDATE` the resulting `profiles` rows to match the old project's data.

**Requires Docker Desktop running locally** — the Supabase CLI shells out to a matching local Postgres container to run its dump/restore tooling. This is a **local-machine prerequisite** and cannot be run from a sandboxed CI/agent environment without Docker (confirmed: Claude Code's environment here has no Docker available). Phase 6 execution is a **manual, local-terminal operation** — not something to attempt via MCP tool calls or from an environment without Docker.

The Admin API (`supabase.auth.admin.createUser`) remains the documented fallback if CLI/Docker access isn't available, but it **cannot set a pre-hashed password** — users would need a forced password reset, a materially worse migration experience than the CLI-dump approach above.

> **Mechanism fully confirmed (2026-07-23–24), manually, outside this environment (Docker Desktop running locally)**:
> - Schema dump: `supabase db dump --db-url "[production connection string]" --schema auth -f auth_schema_test.sql` → **success**. No permission-denied error (resolves the earlier raw-`pg_dump` concern — `permission denied for sequence refresh_tokens_id_seq`, a real documented issue: `supabase/supabase#3517`, `orgs/supabase/discussions#3464` — root-caused to `auth`-schema-internal sequences being owned by `supabase_auth_admin`, which the CLI wrapper handles correctly where raw `pg_dump` does not). Output file contained valid schema definitions (`CREATE TABLE auth.users`, `CREATE TABLE auth.identities`, etc.), confirmed by manual inspection.
> - Data dump: `supabase db dump --db-url "[production connection string]" --schema auth --data-only -f auth_data_test.sql` → **success**. File generated, confirmed non-empty, then deleted immediately after verification (it would have contained real password hashes/PII — handled appropriately, not shared or retained anywhere).
>
> **Status: prep complete, ready for actual execution pending explicit go-ahead — not yet executed for real.** Both tests so far prove only the *extraction* (dump) side works cleanly against production. The *restore* into `supabase-new` (step 3 above) has not been attempted or authorized. Pre-copy cleanliness check is confirmed passing separately (`supabase-new`'s `auth.users` count = 0, per the check above). Do not run the restore step without explicit go-ahead.

### Execution & verification (2026-07-24)

Phase 6 was executed manually, on the local terminal, with Docker Desktop running (as required — see above). **This is the actual outcome, and it corrects the procedure documented above in one respect:**

**Correction — schema-file load was dropped, not run.** Step 1/3 above (`auth_schema.sql` dump + restore) was attempted first, per the originally documented procedure, and **failed**: `permission denied for schema auth`. Root cause: `supabase-new`, like every Supabase project, provisions its own standard `auth` schema (tables, functions, triggers, grants — owned by `supabase_auth_admin`) automatically at project creation. This happens independently of anything in `sql/001`–`011`, which only ever covered the `public` schema. There was therefore nothing to recreate — the schema was already correct out of the box, and attempting to load a schema dump on top of it is both unnecessary and (per this permission error) actively rejected. **Only the data-only dump needed restoring.** The corrected, actually-used procedure is: skip `auth_schema.sql` entirely; run only the `--data-only` restore, i.e. step 2 above followed directly by:

```
psql --single-transaction --variable ON_ERROR_STOP=1 --command "SET session_replication_role = 'replica';" --file auth_data.sql --dbname "[supabase-new connection string]"
```

(Same effect as the `session_replication_role = replica` step in the original combined command above, minus the now-removed `--file auth_schema.sql` step and its preceding `CREATE TABLE`/etc. statements.)

**Result: success, no errors, transaction committed.**

**Verification:**
- `auth.users` row count matches exactly: `SELECT count(*) FROM auth.users;` → **13** on both production and `supabase-new`.
- Functional login test passed: a real account's real, existing (bcrypt-hashed) password was tested against `supabase-new`'s `/auth/v1/token?grant_type=password` endpoint via `curl` and succeeded — a full token response was returned (`access_token`, `refresh_token`, user data). This confirms the password hash carried over correctly and is genuinely functional, not merely present as a row.
- **Other `auth.*` tables populated by the data-only restore** (six tables received rows; all others in the schema report — `mfa_factors`, `mfa_challenges`, `sso_providers`, `sso_domains`, `saml_providers`, `saml_relay_states`, `one_time_tokens`, `audit_log_entries` — loaded 0 rows on both sides, confirmed matching):

  | Table | Production | `supabase-new` | Match? |
  |---|---|---|---|
  | `auth.users` | 13 | 13 | ✅ exact |
  | `auth.identities` | 18 | 18 | ✅ exact |
  | `auth.sessions` | 8 | 10 | ⚠️ +2, verified below |
  | `auth.refresh_tokens` | 35 | 38 | ⚠️ +3, verified below |
  | `auth.mfa_amr_claims` | 8 | 10 | ⚠️ +2, verified below |
  | `auth.flow_state` | 33 | 36 | ⚠️ +3, verified below — **unrelated to Phase 6** |

  **Correction (2026-07-24, post-writeup review): the original explanation below this table was wrong on both counts and magnitude, and has been replaced with a row-level-verified explanation** (exact timestamps, `user_agent`, and `ip` pulled from `auth.sessions`/`auth.refresh_tokens`/`auth.mfa_amr_claims`/`auth.flow_state` on both projects, not inferred):

  - **`auth.flow_state` (+3) is not caused by anything in Phase 6 at all.** All three extra rows on `supabase-new` are dated **2026-07-23 17:58:41 / 18:09:32 / 18:22:34** — a full day *before* the Phase 6 restore ran (2026-07-24) — each with `authentication_method='oauth', provider_type='google'`. Production's own `flow_state` table independently holds 33 rows with a most-recent timestamp of 2026-07-23 09:33:10 (`email/signup`, hours earlier and a different flow type), confirming these 3 rows never originated from production's data and were never touched by the `--data-only` restore (a plain `INSERT` does not truncate pre-existing rows). Their timing matches the Phase 4 Google OAuth test incident already logged above (the `ofiliyoungyz@gmail.com` collision) — the `auth.users`/`profiles` rows from that incident were cleaned up, but these `flow_state` rows weren't, since `flow_state` has no FK/cascade relationship to `auth.users`. The password-grant login test used for Phase 6 verification **cannot** have written these rows — that grant type never touches `flow_state`, which is used only for PKCE/OAuth/magic-link flows. The originally documented "+3, same class as the session discrepancies" explanation is retracted as incorrect.
  - **`auth.sessions` (+2), `auth.refresh_tokens` (+3), `auth.mfa_amr_claims` (+2)** correspond to **two distinct, real, successful authentication events**, both on 2026-07-24, both for user `21b8bbfc-95c6-4ea9-aa2e-51b3460a0865` (production's earliest user, the account used for the functional login test), both from IP `160.155.241.91`:
    1. **18:26:52** — session `f8daefe9…`, `user_agent = curl/8.17.0` — 1 refresh token, 1 AMR claim. This is the documented curl password-grant test itself, and its presence here is direct confirmation it **succeeded** — a genuinely failed `invalid_credentials` response never reaches session issuance in Supabase Auth (GoTrue creates `sessions`/`refresh_tokens`/`mfa_amr_claims` rows only *after* successful authentication), so a failed attempt leaves no trace in any of these three tables.
    2. **18:42:20** — session `e8f9f93f…`, `user_agent` = a Chrome-on-Windows browser string, not curl — 1 refresh token at creation, plus a second refresh token at 21:19:42 from that same session rotating its token (normal behavior for an open browser tab keeping a session alive). **Confirmed by the operator**: this was a manual login through the app's actual UI, performed ~16 minutes after the curl test, to visually spot-check that login worked end-to-end and not merely via the raw API — not an artifact, not a second automated test, not a leftover from Phase 4.
  - All counts and row-level details were re-verified read-only against both projects via `execute_sql` on 2026-07-24, immediately before writing this correction.
- All three working files (`auth_schema.sql`, `auth_data.sql`, and the earlier `auth_schema_test.sql`) have been deleted from disk — none retained, per the PII/password-hash handling standard already established for the test-dump files above.

## 2. `public` schema table data

Load in the same dependency order as `sql/002_tables.sql` (schema creation order = safe data-load order, since FKs must resolve). Two practical options:

- **`pg_dump --data-only --schema=public` / `psql` or `pg_restore`** direct Postgres-to-Postgres, respecting the table order (disable triggers during load with `session_replication_role = replica` to avoid `updated_at`/rating-recalculation/status-transition triggers firing spuriously during bulk load — re-enable and let a single manual `recalculate_*_rating()` pass or `UPDATE ... SET updated_at = updated_at` sweep true up any derived columns afterward if needed).
- **Supabase CLI** (`supabase db dump --data-only` then `supabase db push` style workflows) if direct Postgres connection strings for both projects aren't convenient to obtain.

Either way:
- [ ] Disable/skip triggers during bulk load (`ALTER TABLE ... DISABLE TRIGGER ALL` per table, or the `session_replication_role` session setting) so `handle_new_user`-style side effects and rating/status triggers don't fire per-row during a bulk copy — they'd just be redundantly recomputing from already-consistent source data anyway.
- [ ] Re-enable all triggers after the load completes, before allowing any new writes.
- [ ] No sequences to reseed (confirmed zero sequences in this schema — see `01-schema-report.md`).

**Verified 2026-07-23** (re-run against production, read-only, via `pg_constraint`): `comments.target_id` has **no enforced foreign key** — the only FK on `comments` is `comments_user_id_fkey` (`user_id → auth.users(id) ON DELETE SET NULL`). No constraint references `target_id` at all. This is why `comments` (position 8 in the dependency order — see `01-schema-report.md` and `MIGRATION_MASTER_PLAN.md` §3) can load **before** `events` (position 12) and `fundraisers` (position 18): the ordering isn't "it doesn't matter which table loads first," it's specifically that Postgres has nothing to enforce here, so the position was determined purely by `comments`' one real FK (to `auth.users`). The polymorphic `target_type`/`target_id` reference is meaningful only at the *application* layer (the app resolves it against `events` or `fundraisers` depending on `target_type`, per `01-schema-report.md` table 8) — during a bulk data-import into a not-yet-live new project, a transient window where a `comments` row's `target_id` doesn't yet resolve is harmless, since nothing queries the new project until the full import completes and `05-verification-checklist.md`'s data-integrity sweep (which explicitly checks for orphaned `comments.target_id` values) passes. No change to the load order is required or made.

The same follow-up audit (2026-07-23, read-only against production) additionally confirmed:

- **`notifications.related_id` is also an unenforced polymorphic reference** — `notifications` has exactly two FKs (`actor_id → auth.users(id) ON DELETE SET NULL`, `user_id → auth.users(id) ON DELETE CASCADE`); neither covers `related_id`. Like `comments.target_id`, `related_id`'s reference to `fundraisers`/`comments`/`events`/`profiles` (per the `related_type` check constraint) is application-enforced only. Its position in the load sequence relative to those tables is therefore **not a database-level blocker either** — same reasoning as above applies, and no reordering is needed for `notifications` on this account.
- **`comment_likes.comment_id` IS an enforced foreign key** (`comment_likes_comment_id_fkey → comments(id) ON DELETE CASCADE`) — unlike the two polymorphic cases above, this is a real constraint the database will reject if violated. `comment_likes` **must load strictly after `comments`** completes, not merely "somewhere in the same general area." The corrected load order below reflects this by giving `comment_likes` its own step immediately after the `comments` tier, rather than bundling it into the same batch as `comments`/`follows`/`notifications` (which would leave load order within that batch unspecified).
- **`follows` and `organizer_follows` are both confirmed as genuine, separate production tables** (verified via `information_schema.tables`), not a typo or duplicate reference to the same table. The old open question flagging this as possibly needing correction is resolved: no change to either table's position below is required.

### Corrected `public`-schema table load order (supersedes the plain "same order as `sql/002_tables.sql`" pointer above for these specific tables)

```
auth.users (+ auth.identities, etc.)
        │
        ▼
profiles
        │
        ▼
platform_settings, homepage_categories, homepage_sponsors, homepage_testimonials
        │
        ▼
organizers
        │
        ▼
businesses
        │
        ▼
comments, follows, notifications
        │
        ▼
comment_likes   (enforced FK to comments — must load after the tier above, not with it)
        │
        ▼
events
        │
        ▼
articles, products, eventbrite_sources, organizer_follows, organizer_visibility_audit
        │
        ▼
fundraisers  (circular FK to gofundme_sources — load with gofundme_source_id NULL first)
        │
        ▼
gofundme_sources
        │
        ▼
venue_layouts, tickets
        │
        ▼
fundraiser_media, fundraiser_updates
        │
        ▼
donations
        │
        ▼
reviews
        │
        ▼
seats
        │
        ▼
product_orders, ticket_orders
        │
        ▼
storage objects (independent of table data; bucket creation must precede it)
```

### Phase 7 execution plan (drafted 2026-07-24 — commands only, not yet run)

**Status: prep complete, ready for execution pending explicit go-ahead. Not yet executed.** Following the same drafting discipline used for Phase 6 before it ran: assumptions verified below, exact commands drafted, risks flagged. Do not run any dump/restore command from this section without explicit go-ahead.

**Pre-check: does `supabase-new` already have `public` rows from the Phase 6 restore (i.e. did `handle_new_user` fire despite `session_replication_role = 'replica'`)?** Checked directly via `execute_sql` (exact `count(*)`, not the `list_tables` row-estimate) against all 28 `public` tables on `supabase-new`, 2026-07-24: **every table is 0.** `public.profiles` specifically is 0, confirming `session_replication_role = 'replica'` did suppress `on_auth_user_created`/`handle_new_user()` firing during the Phase 6 `auth.users` bulk insert, even though that insert added 13 rows. This means `profiles` genuinely needs its own explicit data load in Phase 7 — the trigger did not (and, per this confirmation, will not) create it as a side effect. The project is a clean, schema-only slate for all 28 `public` tables — safe to proceed.

**Golden reference — production row counts, re-verified read-only 2026-07-24 (also the "how do I know Phase 7 succeeded" checklist — `supabase-new` should read 0 for every row below right now, and match this column exactly after the restore):**

| Table | Production rows | `supabase-new` rows now |
|---|---|---|
| `profiles` | 13 | 0 |
| `platform_settings` | 46 | 0 |
| `homepage_categories` | 8 | 0 |
| `homepage_sponsors` | 0 | 0 |
| `homepage_testimonials` | 0 | 0 |
| `organizers` | 13 | 0 |
| `businesses` | 1 | 0 |
| `comments` | 45 | 0 |
| `follows` | 0 | 0 |
| `notifications` | 4 | 0 |
| `comment_likes` | 9 | 0 |
| `events` | 82 | 0 |
| `articles` | 5 | 0 |
| `products` | 0 | 0 |
| `eventbrite_sources` | 3 | 0 |
| `organizer_follows` | 9 | 0 |
| `organizer_visibility_audit` | 1 | 0 |
| `fundraisers` | 13 | 0 |
| `gofundme_sources` | 2 | 0 |
| `venue_layouts` | 0 | 0 |
| `tickets` | 83 | 0 |
| `fundraiser_media` | 2 | 0 |
| `fundraiser_updates` | 0 | 0 |
| `donations` | 1,250 | 0 |
| `reviews` | 1 | 0 |
| `seats` | 0 | 0 |
| `product_orders` | 0 | 0 |
| `ticket_orders` | 25 | 0 |

`donations` (1,250 rows) is by far the largest table and the one most worth watching for dump/restore time and for the FK/trigger interactions below, given its direct link to `fundraisers.raised`/`raised_amount` and to Stripe/crypto payment fields (`07-stripe-and-payment-fields.md`).

**Final data-import order (restated literally from the "Corrected `public`-schema table load order" diagram above and from `MIGRATION_MASTER_PLAN.md` §3 — both already updated together on 2026-07-23 with the `comments`/`comment_likes`/`target_id`/`related_id` FK-audit correction; not a new ordering, just restated as a flat sequence for command-drafting):**

```
1.  profiles
2.  platform_settings, homepage_categories, homepage_sponsors, homepage_testimonials
3.  organizers
4.  businesses
5.  comments, follows, notifications
6.  comment_likes
7.  events
8.  articles, products, eventbrite_sources, organizer_follows, organizer_visibility_audit
9.  fundraisers
10. gofundme_sources
11. venue_layouts, tickets
12. fundraiser_media, fundraiser_updates
13. donations
14. reviews
15. seats
16. product_orders, ticket_orders
```

**Drafted commands — same pattern that worked for `auth` in Phase 6 (whole-schema, data-only dump; single-transaction `psql` restore with triggers/FK-checks suppressed):**

```
# 1. Dump — data only, whole public schema, one file (mirrors auth_data.sql from Phase 6)
supabase db dump --db-url "[production connection string]" --schema public --data-only -f public_data.sql

# 2. Inspect the file before restoring — confirm it contains INSERT/COPY statements for all 28
#    tables above and no unexpected DDL (data-only dumps shouldn't include any, but verify).
#    Not strictly required for correctness (see FK/trigger note below) but cheap insurance
#    given this file is an order of magnitude larger than auth_data.sql (1,250 donations rows
#    alone) and contains real payment/PII data.

# 3. Restore — single transaction, ON_ERROR_STOP, triggers/FK-checks suppressed for the load
psql --single-transaction --variable ON_ERROR_STOP=1 --command "SET session_replication_role = 'replica';" --file public_data.sql --dbname "[supabase-new connection string]"
```

This is one file/one command for the whole schema, exactly matching the `auth_data.sql` pattern that worked cleanly in Phase 6 — not a per-table sequence of 28 separate dump/restore commands. Per-table dumps remain a fallback if this whole-schema dump proves too large/slow or if a table-specific failure needs isolating; the per-table form is the same command with `--schema public --data-only` replaced by `--table 'public.<name>' --data-only`, repeated per table in the order above, each restored with its own `--file` in one long `psql --single-transaction` invocation (or 16 separate invocations, batched by the numbered tiers above — either works since triggers/FK enforcement are suppressed throughout).

**Risk flags:**

- **FK checks are also suppressed under `session_replication_role = 'replica'`, not just triggers** (Postgres implements FK referential-integrity checks as internal constraint triggers, which respect the replication-role setting same as user triggers). This has two consequences worth being explicit about:
  - The circular `fundraisers.gofundme_source_id ↔ gofundme_sources.fundraiser_id` FK pair (`06-rollback-considerations.md`/`01-schema-report.md`'s "circular FK" note) is **not actually a load-order blocker for this restore** — both directions of the FK go unchecked during the single-transaction, replica-role load regardless of which of the two tables' rows land first. The original two-step plan ("load `fundraisers` with `gofundme_source_id` NULL first, backfill after `gofundme_sources` loads") was written for a hypothetical restore *without* FK suppression; it is not required for the whole-schema single-transaction approach drafted above, since both tables are in the same dump file and same transaction. Kept the documented order anyway (tier 9 then 10) for auditability, not because it's load-bearing here.
  - Precisely because FK checks are off, **the post-load orphan/integrity sweep in `05-verification-checklist.md` (the one that explicitly checks `comments.target_id`/`notifications.related_id` and now should also spot-check the `fundraisers`↔`gofundme_sources` pair) is not optional** — it's the only check standing between "the load succeeded" and "the load is actually referentially sound," since the database itself won't have enforced it during the load.
- **`fundraisers.raised` / `raised_amount` dual-column + `trg_update_fundraiser_raised` (AFTER INSERT OR UPDATE on `donations`)**: this trigger recalculates `fundraisers.raised`/`raised_amount` by summing `donations` where `status = 'completed'` (per `07-stripe-and-payment-fields.md`, note `'succeeded'` donations are deliberately excluded from that sum). Loading `donations` (tier 13, 1,250 rows) with triggers **enabled** would fire this once per row and, worse, would compute against a *partial* `fundraisers`/`donations` state mid-load rather than production's actual final values. With `session_replication_role = 'replica'` active (per the drafted restore command), this trigger does not fire at all during the load — `fundraisers.raised`/`raised_amount` come through as an exact copy of production's already-correct values from tier 9's own row data, which is what's wanted. **Do not run a manual `recalculate_*_rating()`-style true-up pass after this load** — that would be appropriate only if triggers had been left enabled or if there's a specific reason to distrust production's stored values, neither of which applies here.
- **`trg_update_rating_aggregates` (AFTER INSERT/DELETE/UPDATE on `reviews`, tier 14)**: same reasoning as above — recalculates `events.rating`/`fundraisers.rating`/`organizers.rating` aggregates. Suppressed by replica mode during load; production's stored aggregate values on `events`/`fundraisers`/`organizers` (already loaded in earlier tiers) are preserved as-is rather than being recomputed from a mid-load partial `reviews` state.
- **The four `trg_*_updated_at` triggers** (`articles`, `businesses`, `products`, `product_orders` — `BEFORE INSERT OR UPDATE`) **would silently overwrite `updated_at` with load-time timestamps if triggers are *not* suppressed** — this is the one where forgetting the `session_replication_role = 'replica'` command would be easy to miss (no error, just quietly wrong historical timestamps for 4 tables). Confirmed suppressed by the drafted restore command; flagging because it fails silently, unlike an FK violation which would at least error.
- **The four `enforce_*_status_transition` triggers** (`articles`, `businesses`, `fundraisers`, `products` — all `BEFORE UPDATE` only, never `BEFORE INSERT`) pose **no risk to this load regardless of trigger state**, since a data-only restore of currently-empty tables is a pure `INSERT`/`COPY` operation — these triggers can't fire on inserts. Noted for completeness, not because it changes anything about the drafted commands.
- **`prevent_profile_role_status_self_update` on `profiles`** (`BEFORE UPDATE` only) — same reasoning: irrelevant to an `INSERT`-only load into a currently-empty table.
- **PII / payment data handling**: `public_data.sql` will contain real donor names/emails (via `profiles`, `donations`), Stripe payment-intent/customer IDs, and crypto payment fields (`07-stripe-and-payment-fields.md`'s full column inventory) — same handling standard already applied to `auth_data.sql` in Phase 6 applies here: do not retain or share the file after the restore is verified; delete it once row counts are confirmed matching.
- **Re-enabling triggers/FK checks afterward**: no explicit `SET session_replication_role = 'default';` is needed — same as Phase 6, `--single-transaction` scopes the `SET` to the transaction, which ends (and the session setting reverts) at `COMMIT`, immediately after the last statement in `public_data.sql` runs successfully.
- **`release_expired_seat_reservations()`** (the RPC not called by any trigger or `pg_cron` job, flagged as an open item in `02-functions-triggers-views.md` item 15) is unaffected by this data load either way — `seats` has 0 rows in production, so there's nothing for that function to act on yet regardless of when/whether its external invoker is reproduced on the new project.

### Phase 7 execution & verification (2026-07-25)

**Status: complete and verified.** Restore executed manually per the drafted commands above (whole-`public`-schema, data-only, `psql --single-transaction --variable ON_ERROR_STOP=1` with `session_replication_role = 'replica'`). Verified read-only via `execute_sql` against both projects immediately after.

**Row counts — all 28 tables, exact `count(*)`, production vs. `supabase-new`:**

| Table | Production | `supabase-new` | Match? |
|---|---|---|---|
| `profiles` | 13 | 13 | ✅ |
| `platform_settings` | 46 | 46 | ✅ |
| `homepage_categories` | 8 | 8 | ✅ |
| `homepage_sponsors` | 0 | 0 | ✅ |
| `homepage_testimonials` | 0 | 0 | ✅ |
| `organizers` | 13 | 13 | ✅ |
| `businesses` | 1 | 1 | ✅ |
| `comments` | 45 | 45 | ✅ |
| `follows` | 0 | 0 | ✅ |
| `notifications` | 4 | 4 | ✅ |
| `comment_likes` | 9 | 9 | ✅ |
| `events` | 82 | 82 | ✅ |
| `articles` | 5 | 5 | ✅ |
| `products` | 0 | 0 | ✅ |
| `eventbrite_sources` | 3 | 3 | ✅ |
| `organizer_follows` | 9 | 9 | ✅ |
| `organizer_visibility_audit` | 1 | 1 | ✅ |
| `fundraisers` | 13 | 13 | ✅ |
| `gofundme_sources` | 2 | 2 | ✅ |
| `venue_layouts` | 0 | 0 | ✅ |
| `tickets` | 83 | 83 | ✅ |
| `fundraiser_media` | 2 | 2 | ✅ |
| `fundraiser_updates` | 0 | 0 | ✅ |
| `donations` | 1,250 | 1,250 | ✅ |
| `reviews` | 1 | 1 | ✅ |
| `seats` | 0 | 0 | ✅ |
| `product_orders` | 0 | 0 | ✅ |
| `ticket_orders` | 25 | 25 | ✅ |

**All 28 tables match exactly — no discrepancies.**

**Mandatory orphan/referential-integrity sweep** (required per the risk notes above, since FK checks were suppressed throughout the load — the database itself never verified these relationships). Run against `supabase-new`, all four checks return **zero rows**, actual query results shown:

| Check | Query result |
|---|---|
| `comments.target_id` vs. `events`/`fundraisers` (by `target_type`, per the `comments_target_type_check` constraint — values `'event'`/`'fundraiser'`) | `[]` — 0 rows |
| `notifications.related_id` vs. `fundraisers`/`comments`/`events`/`profiles` (by `related_type`, per the `notifications_related_type_check` constraint — values `'fundraiser'`/`'comment'`/`'event'`/`'profile'`) | `[]` — 0 rows |
| `fundraisers.gofundme_source_id` → `gofundme_sources.id` (forward direction of the circular pair) | `[]` — 0 rows |
| `gofundme_sources.fundraiser_id` → `fundraisers.id` (reverse direction of the circular pair) | `[]` — 0 rows |
| `seats.ticket_id` → `tickets.id` | `[]` — 0 rows (`seats` has 0 rows in both projects, so this check is trivially satisfied — noted, not a meaningful signal on its own, but consistent with the row-count match above) |
| `ticket_orders.ticket_id` → `tickets.id` | `[]` — 0 rows, checked against all 25 `ticket_orders` rows |

No orphans found anywhere. Combined with the exact row-count match, Phase 7's data load is confirmed both complete and referentially sound.

**Outstanding cleanup — `public_data.sql` has NOT been deleted.** Confirmed still present on disk at the repo root (`C:\Users\Youngyz\fundraising-app\public_data.sql`, ~526 KB). Per the same PII/payment-data handling standard applied to the Phase 6 files (`auth_schema.sql`, `auth_data.sql`, `auth_schema_test.sql`, all deleted after their verification), **this file should be deleted now that the row-count and orphan-sweep verification above is complete** — it contains real donor names/emails, Stripe payment-intent/customer IDs, and other payment fields for all 1,250 `donations` rows and the rest of the 28-table load. Not deleted as part of this documentation-only pass; flagging for manual deletion.

## 3. Storage objects (actual file bytes)

**A SQL-level copy of `storage.objects` metadata does NOT move file bytes** — the underlying files live in Supabase's S3-backed storage, not in Postgres. This needs an explicit object-by-object transfer:

- [ ] For each of the 7 buckets, enumerate objects in the old project (`storage.objects` rows, or the Storage API's list endpoint) and copy each object's bytes to the same bucket/path in the new project. Options:
  - A small script using `@supabase/supabase-js`'s Storage client against both projects (`download()` from old, `upload()` to new), iterating all objects.
  - If both projects' storage happens to be S3-compatible with accessible credentials, a direct `rclone`/`aws s3 sync`-style bucket-to-bucket copy is faster for large media libraries — check with Supabase support/docs for the current recommended approach, since direct S3 access to Supabase-managed storage isn't always exposed.
- [ ] After object bytes are copied, `INSERT` the corresponding `storage.objects` metadata rows (or let the upload calls create them naturally) so the buckets' listings match.
- [ ] Recreate the 7 buckets (`sql/009_storage_buckets.sql`) **before** starting object copy, obviously.
- [ ] Spot-check a sample of migrated URLs (from each bucket) render correctly in the new project before cutover.

### Phase 8 execution plan (drafted 2026-07-25 — inventory and approach only, no transfer yet)

**Status: prep complete, ready for execution pending explicit go-ahead. Not yet executed.** Same drafting discipline as Phases 6–7: facts gathered first, approach proposed with tradeoffs, nothing run. Do not transfer any files from this section without explicit go-ahead.

**Baseline confirmed**: `supabase-new`'s `storage.objects` is genuinely empty (`select count(*) from storage.objects` → 0), consistent with Phase 5's status note that bucket/policy configuration was completed but no object bytes were copied. Buckets and their 14 RLS policies are already in place and verified (Phase 5) — Phase 8 only needs to move file bytes into the existing, correctly-configured buckets, not create anything.

**1. Production storage inventory** (`storage.objects`, grouped by bucket, read-only against production, 2026-07-25):

| Bucket | Objects | Total size | Date range |
|---|---|---|---|
| `event-banners` | 29 | 12,249,780 bytes (~11.7 MiB) | 2026-07-06 → 2026-07-16 |
| `event-videos` | 1 | 7,178,070 bytes (~6.8 MiB) | 2026-05-26 |
| `fundraiser-media` | 27 | 5,757,813 bytes (~5.5 MiB) | 2026-06-30 → 2026-07-18 |
| `organizer-banners` | 7 | 1,272,124 bytes (~1.2 MiB) | 2026-05-26 → 2026-07-20 |
| `organizer-images` | 10 | 1,700,304 bytes (~1.6 MiB) | 2026-05-26 → 2026-07-20 |
| `profile-images` | 2 | 3,298,310 bytes (~3.1 MiB) | 2026-07-05 → 2026-07-09 |
| `videos` | 3 | 19,503,314 bytes (~18.6 MiB) — includes a 0-byte `.emptyFolderPlaceholder` (a Supabase Storage UI artifact, not a real file; harmless to copy or skip) | 2026-05-26 → 2026-06-30 |
| **Total** | **79** | **50,959,715 bytes (~48.6 MiB)** | — |

This is a small dataset by any standard — the largest single bucket is `videos` at ~18.6 MiB across 3 objects (one of which is empty), and `event-banners` has the most objects (29) at ~11.7 MiB total.

**2. Cross-reference against `public` table columns** (loaded in Phase 7) — checked every image/video/media column that plausibly points into these 7 buckets (`profiles.avatar_url`, `organizers.photo`/`banner`, `businesses.logo`, `fundraisers.banner`/`image_url`/`video_url`, `events.banner`/`video_url`, `fundraiser_media.url`), parsing each stored public URL's bucket+path and checking it against `storage.objects`:

| Column | Non-null rows | External/non-Supabase URL | Resolves to a real object | **Missing from storage** |
|---|---|---|---|---|
| `profiles.avatar_url` | **0 of 13** | — | — | — |
| `organizers.photo` | 8 | 0 | 8 | 0 |
| `organizers.banner` | 7 | 0 | 7 | 0 |
| `businesses.logo` | 1 | 0 | 1 | 0 |
| `fundraisers.banner` | 11 | 6 | 4 | **1** |
| `fundraisers.image_url` | 2 | 0 | 2 | 0 |
| `fundraisers.video_url` | 5 | 2 | 1 | **2** |
| `events.banner` | 82 | 3 | 79 | 0 |
| `events.video_url` | 1 | 0 | 1 | 0 |
| `fundraiser_media.url` | 2 | 0 | 2 | 0 |

Two things worth knowing going in (neither is something to fix — informational only, per the ask):

- **`profiles.avatar_url` is unset on all 13 production users**, despite `profile-images` holding 2 real objects (`21b8bbfc…/profile-1783258205114.png`, `d78362ce…/profile-1783614870671.jpg`) — both filed under folders named for real, existing `profiles.id` values. The column simply isn't populated; the app may resolve avatars by a conventional `<user_id>/…` path rather than a stored URL, or this is a feature that was wired up to upload but never wired back to the column. Either way, both objects in this bucket are real and should still be copied in Phase 8 — the "0 of 13" is about the column, not about whether the bucket's contents are worth migrating.
- **3 pre-existing broken references in production itself**, unrelated to any migration step: `fundraisers` row `867cd050-47d4-4be5-8352-f43112aa1699` has both `banner` and `video_url` pointing at `videos/help-build-a-school-…mp4` and `videos/we-can-do-it-…mp4`, and row `4827ca64-e829-4592-854d-9f927ad029d5`'s `video_url` points at `videos/where-event-organizers-grow-…mp4` — none of these three filenames exist in the `videos` bucket (which only ever held 2 real files, neither matching). These are dead links today, on production, independent of this migration; Phase 8 will faithfully carry the same broken references forward (nothing to reconcile, and not in scope to fix per the "not something to fix, just something to know" framing).

**3. Transfer mechanism options** — checked against Supabase's own docs (`search_docs`, 2026-07-25) rather than assumed:

| Option | What it is | Verdict |
|---|---|---|
| **Node.js script via `@supabase/supabase-js`** | Supabase's own first-party, officially documented script (`docs/guides/platform/migrating-within-supabase/backup-restore`, "Migrating storage objects" section) — lists every object in each source bucket (recursing into folders), downloads via the service-role client, re-uploads to the target project's matching bucket in batches of 10 in parallel, logging any per-file failures at the end. | **Recommended.** `@supabase/supabase-js@^2.106.2` is already a dependency of this repo (`package.json`) — no new install. Matches this project's existing stack exactly, requires no new tooling, and Supabase's own script already has the batching/error-collection behavior this dataset needs (see scale note below). |
| **S3-compatible client (rclone / Cyberduck / AWS CLI) via Supabase Storage's S3 protocol endpoint** | Both projects can enable "S3 Configuration" (Storage → Configuration → S3 in the Dashboard) to get an S3-compatible endpoint (`https://<project-ref>.supabase.co/storage/v1/s3`) and credentials; Supabase's own self-hosting docs show the identical `rclone copy source:bucket dest:bucket` pattern for platform→self-hosted, which adapts directly to platform→platform by pointing both `rclone` remotes at Supabase-hosted S3 endpoints instead of one platform + one self-hosted. Supabase's own "Download Objects" doc explicitly recommends an S3-compatible tool over one-by-one downloads for bulk operations. | **Viable alternative**, not chosen as primary only because it requires installing/configuring `rclone` and generating+managing a second set of credentials (S3 access keys, separate from the service-role keys already in `.env.local`) for a dataset small enough that the extra tooling doesn't pay for itself. Worth switching to if the Node.js script proves unreliable in practice. |
| **`supabase storage cp` / `supabase storage ls` (CLI-native)** | The Supabase CLI does have dedicated storage subcommands (`supabase storage ls [path]`, `supabase storage cp <src> <dst>`) — confirmed via `search_docs`, correcting any assumption that the CLI lacks storage-specific commands. Docs give only bare usage syntax (`supabase storage cp <src> <dst> [flags]`), not enough to confirm whether `cp` supports a remote-project-to-remote-project path (as opposed to local↔linked-project only) without hands-on testing. | **Not chosen as primary** — insufficiently documented to commit to without a trial run, and the Node.js script's behavior is fully known from its published source. Worth a quick `supabase storage cp --help` check at execution time as a possible simplification, but not worth blocking the plan on. |
| **Google Colab notebook** (`PLyn/supabase-storage-migrate`, community-maintained) | Explicitly linked from Supabase's own "Restore Dashboard backup" doc as the suggested path *specifically after a Dashboard-backup-style restore* (i.e., a different scenario than this migration's CLI-based approach). | **Not recommended here** — third-party/community-maintained (not a Supabase first-party tool), requires uploading through a Google-hosted notebook as an extra hop, and Supabase's own docs note it "could add significant upload time" for large objects. No advantage over the first-party Node.js script for this dataset. |

**4. Scale assessment**: **small enough for a simple, single-run script — no resumability/chunking infrastructure needed.** 79 objects, ~48.6 MiB total, largest bucket ~18.6 MiB/3 objects, largest object count 29 (`event-banners`, ~11.7 MiB) — this comfortably finishes in well under a minute on ordinary broadband, and Supabase's own reference script's batch-of-10-parallel-with-error-collection approach is already more infrastructure than this dataset strictly needs, not less. No large video files in the multi-hundred-MB range, no hundreds-of-objects buckets, nothing here that calls for queueing, retry backoff, or resumable/chunked uploads.

**Recommended approach, with the specific deviations from Supabase's reference script this run needs**:
- Use the official Node.js script as the base, run from `scratch/` (git-ignored from lint per `CLAUDE.md`, the repo's designated home for throwaway migration/debug scripts) — not committed.
- **Skip the bucket-creation/conflict-resolution logic and its interactive prompts entirely.** The reference script's `ensureBucketExists()` and its "buckets already exist, how do you want to handle it?" prompt exist for the general case of migrating into a project whose buckets may not exist yet. Here, all 7 buckets are already correctly created and policy-configured (Phase 5) — the script only needs to iterate the known 7 bucket names and copy objects into them, with no bucket-creation branch and no interactive readline prompts to answer.
- Keep `upsert: true` on the upload call (as in the reference script) — safe and useful here specifically because `supabase-new`'s `storage.objects` is confirmed empty right now, and it gives free idempotency if the script needs to be re-run after a partial failure (re-running won't fail on "object already exists").
- Service-role keys for both projects are required (the reference script's `OLD_PROJECT_SERVICE_KEY`/`NEW_PROJECT_SERVICE_KEY`) — same handling standard as every other secret touched in this migration: read from environment variables, never hardcoded in the committed script, and the script itself stays out of version control (`scratch/` is already excluded from lint; also keep it out of `git add`).
- After transfer, spot-check a handful of migrated public URLs per bucket resolve correctly on `supabase-new` (already an existing checklist item above) and re-run the row-count-style verification pattern used in Phases 6–7, adapted to storage: compare `select bucket_id, count(*), sum((metadata->>'size')::bigint) from storage.objects group by bucket_id` between production and `supabase-new` — expect an exact match to the inventory table in step 1 above (79 objects / ~48.6 MiB total, per-bucket).

### Phase 8 execution & verification (2026-07-25)

**Status: complete and verified.** Executed in-sandbox (confirmed reachable via direct HTTPS to both projects' Storage API endpoints — a genuine `403 Invalid Compact JWS` response from each, not a network block — unlike the raw Postgres port Phases 6–7 needed, so this ran here rather than being handed off to a local terminal).

**Read/write boundary, as confirmed before running**: the script (`scratch/migrate-storage.js`, not committed) used production's service-role key (`PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`, added to `.env.local` for this purpose) exclusively for `.storage.from(bucket).list()` and `.storage.from(bucket).download()` — read-only. `.upload()` was only ever called against `supabase-new`'s client. No bucket-management calls (`createBucket`/`updateBucket`/`deleteBucket`/`emptyBucket`) were made against either project — all 7 buckets already existed from Phase 5.

**Transfer results** — all 79 objects across all 7 buckets, zero failures:

| Bucket | Succeeded |
|---|---|
| `event-banners` | 29/29 |
| `event-videos` | 1/1 |
| `fundraiser-media` | 27/27 |
| `organizer-banners` | 7/7 |
| `organizer-images` | 10/10 |
| `profile-images` | 2/2 |
| `videos` | 3/3 |
| **Total** | **79/79** |

**Post-transfer verification** — `select bucket_id, count(*), sum((metadata->>'size')::bigint) from storage.objects group by bucket_id`, run read-only against both projects, 2026-07-25:

| Bucket | Production count/bytes | `supabase-new` count/bytes | Match? |
|---|---|---|---|
| `event-banners` | 29 / 12,249,780 | 29 / 12,249,780 | ✅ |
| `event-videos` | 1 / 7,178,070 | 1 / 7,178,070 | ✅ |
| `fundraiser-media` | 27 / 5,757,813 | 27 / 5,757,813 | ✅ |
| `organizer-banners` | 7 / 1,272,124 | 7 / 1,272,124 | ✅ |
| `organizer-images` | 10 / 1,700,304 | 10 / 1,700,304 | ✅ |
| `profile-images` | 2 / 3,298,310 | 2 / 3,298,310 | ✅ |
| `videos` | 3 / 19,503,314 | 3 / 19,503,314 | ✅ |

Exact match, every bucket, both object count and total bytes — 79 objects / 50,959,715 bytes on both sides.

**Spot-check** — 4 migrated public URLs fetched directly against `supabase-new`'s public Storage endpoint, all `200 OK` with byte sizes matching production's stored metadata exactly (e.g. `profile-images/21b8bbfc…/profile-1783258205114.png` → 1,795,358 bytes, matching the `storage.objects` metadata from the Phase 8 planning inventory): one each from `profile-images`, `event-banners`, `videos`, and `organizer-banners`.

**Cleanup**: `scratch/migrate-storage.js` remains in the git-ignored `scratch/` directory (not committed) — it reads credentials from `.env.local` at runtime rather than embedding them, so the file itself carries no secret. **`PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` in `.env.local` has no further purpose now that Phase 8 is verified and should be removed** — it was added solely for this transfer and, unlike `supabase-new`'s service-role key, the application will never need production's key at runtime.

## 4. Realtime & webhook re-pointing

- [ ] Apply `sql/011_realtime.sql` (adds `notifications` to the publication) — no data migration implication, just configuration.
- [ ] **Stripe webhook endpoint** must be updated to point at the new project's deployment URL, with a new webhook signing secret provisioned and set as an env var. Test with Stripe's webhook replay/test-event tooling before cutover, not just in production.
- [ ] Any Eventbrite/GoFundMe sync credentials (`eventbrite_sources`, `gofundme_sources` tables) are per-user OAuth-style tokens stored in those tables — confirm whether the tokens themselves remain valid after the underlying `auth.users`/`organizers` rows move (they should, since they're not tied to the Supabase project, only to the external platform's OAuth grant) or whether users need to re-connect.
- [ ] Vercel cron jobs (`vercel.json` — `/api/cron/daily-post`, `/api/cron/promotion-engine`) point at the deployed app, not directly at the database, so no reconfiguration needed there beyond redeploying against the new project's env vars.

## 5. Cutover sequencing (minimize write-loss window)

1. Freeze new signups / writes on the **old** project as close to cutover as practical (maintenance-mode banner, or block at the load balancer/proxy level).
2. Run a final incremental data sync for any tables that changed since the last full copy (compare `updated_at`/`created_at` high-water marks, or just re-run the full copy if downtime is acceptable — this schema has no huge tables that would make a full re-copy prohibitively slow based on the row counts seen during the audit, e.g. `auth.users` had only 13 rows at audit time, though this may have grown).
3. Verify the new project against `05-verification-checklist.md` in full.
4. Flip the app's environment variables (`NEXT_PUBLIC_SUPABASE_URL`, keys, Stripe webhook secret) to point at the new project and redeploy.
5. Update the Stripe webhook endpoint URL to the new deployment (or keep the same app domain if only the Supabase backend changed — then only the Supabase-facing env vars need updating, not necessarily the Stripe endpoint, if the webhook route itself doesn't change).
6. Monitor error rates / webhook delivery / auth login success for a defined bake period before decommissioning the old project.
7. Keep the old project paused (not deleted) for a rollback window (see `06-rollback-considerations.md`) rather than deleting it immediately.

## 6. Payment data specifics

See `07-stripe-and-payment-fields.md` for the full column-by-column inventory of Stripe/crypto payment fields across `donations`, `ticket_orders`, `product_orders`, `businesses`, and `products`, and payment-specific verification steps to run before and after cutover.

## 7. Phase 10 — Resend / outbound email (drafted 2026-07-25 — planning only, no Resend/DNS changes made)

**Status: prep complete, ready for execution pending explicit go-ahead. Not yet executed** — no Resend API key, domain, or DNS record has been created, modified, or deleted. Same drafting discipline as Phases 6–9.

### 1. Full Resend touchpoint inventory (re-checked against actual code, 2026-07-25)

**Server-side client instantiation** (`new Resend(process.env.RESEND_API_KEY)`) — 4 files, each gating the send on the key being present rather than throwing if it's missing (emails are best-effort, not blocking):
- `lib/notifications.ts` — sends an email alongside certain in-app notifications (comment reply/like/follow/etc. per `NotificationEmail` type), from a **hardcoded** `"Aldriva <contact@Aldriva.com>"` (does not read `RESEND_FROM_EMAIL`).
- `lib/receipt.ts` (`processDonationReceipt`) — donation receipt email with the generated PDF context; from-address uses `` `Aldriva <${process.env.RESEND_FROM_EMAIL || "contact@Aldriva.com"}>` `` (env-overridable, falls back to the same hardcoded address as above).
- `lib/certificate.ts` — "Certificate of Appreciation" email for donations; from is **hardcoded** the same way as `notifications.ts` (`contact@Aldriva.com`, ignores `RESEND_FROM_EMAIL`).
- `app/api/account/route.ts` — account-deletion-scheduled confirmation email; from-address uses the same env-overridable pattern as `receipt.ts`.
- `app/api/send-ticket/route.ts` — ticket purchase confirmation email (QR code + verify link); from is **hardcoded** the same way as `notifications.ts`/`certificate.ts`.

**Inconsistency worth knowing, not a migration blocker**: 3 of the 5 call sites hardcode `contact@Aldriva.com` and ignore `RESEND_FROM_EMAIL` entirely, while 2 read `RESEND_FROM_EMAIL` (currently set to `noreply@Aldriva.com` in `.env.local`) with a fallback to the same hardcoded address. Both addresses are under the same domain, so this doesn't affect the migration or domain-verification question below — it's a pre-existing inconsistency in the app, not something Phase 10 needs to fix.

**No email templating system** — every email above is inline HTML built directly in its call site (no `emails/` directory, no React Email/MJML templates, no template IDs stored anywhere). Nothing to "migrate" here beyond the code itself, which travels with the deployment, not with the Supabase project.

**No Resend-specific webhook** (delivery-status callbacks, bounces, etc.) exists in this codebase — confirmed by inspecting every `app/api` route matching "webhook": all are Stripe/crypto/content-sync webhooks, none are Resend's. This means, unlike Stripe, **there is no callback URL that has to be re-pointed at the new deployment** — Resend here is fire-and-forget (`resend.emails.send()`, no delivery-status listener wired up).

**Env vars this touches**: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.

### 2. Account relationship — confirmed by the user (2026-07-25), not assumed

Same-account confirmed for Resend, same as Stripe and NOWPayments in Phase 9: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` stay **identical** between production and `supabase-new`.

### 3. Domain verification — checked directly via public DNS, 2026-07-25 (not assumed)

The sending domain is `Aldriva.com` (Aldriva's actual domain, not a Resend-provided subdomain), hosted on Cloudflare DNS (`destiny.ns.cloudflare.com`). Checked live, via a public resolver:

| Record | Value found | Meaning |
|---|---|---|
| `resend._domainkey.Aldriva.com` (TXT) | Present — a valid DKIM public key (`p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKB…`) | **Resend's DKIM verification is live and confirmed working today** — this is Resend's standard DKIM selector, so the domain is genuinely verified with Resend, not just configured-but-unverified. |
| `Aldriva.com` (SPF, TXT) | `v=spf1 include:_spf.mx.cloudflare.net ~all` | Authorizes Cloudflare's mail routing only — does **not** include a Resend SPF mechanism (e.g. `include:_spf.resend.com`). Pre-existing production configuration, unrelated to this migration; DKIM alone can satisfy DMARC alignment, so this isn't a functional blocker, just an existing minor deliverability-hardening gap worth knowing about (not in scope to fix here). |
| `_dmarc.Aldriva.com` (TXT) | `v=DMARC1; p=none;` | Monitor-only DMARC policy (no rejection/quarantine enforcement) — consistent with SPF not being a hard requirement today. |
| `Aldriva.com` (MX) | 3 records, all `*.mx.cloudflare.net` | Inbound mail routing via Cloudflare Email Routing — unrelated to Resend (which only handles outbound sending here), included for completeness. |

**Conclusion: domain verification is tied to the domain name + Resend account, not to any Supabase project or deployment.** Since the account is confirmed same (§2), **no DNS record needs to change as part of this migration, and no new domain verification is needed** — `Aldriva.com`'s existing DKIM/SPF/DMARC records stay exactly as they are, verified against the same Resend account regardless of which Supabase project or app deployment is sending through it.

### 4. What's genuinely per-deployment vs. constant — the Stripe-webhook-secret analogy doesn't apply here

Unlike Stripe (where the webhook signing secret is inherently per-endpoint and must change even on a same-account migration), **Resend has no equivalent per-deployment value in this codebase.** There is no Resend-side webhook/callback URL to re-point (§1) and no per-environment secret beyond the API key itself, which doesn't change (§2). The only values that could vary by environment are `RESEND_API_KEY` and `RESEND_FROM_EMAIL` — and both are confirmed staying identical. **Practically, Resend needs zero changes at cutover, not "changes deferred to Phase 12" — there's nothing time-dependent about it the way the Stripe webhook is tied to the app's live URL.**

### Recommended sequencing

1. **Now**: no Resend/DNS changes — this section is planning only.
2. **At Phase 11 (environment variables)**: carry `RESEND_API_KEY`/`RESEND_FROM_EMAIL` forward unchanged into `supabase-new`'s deployment environment — this is a copy, not a re-provision.
3. **No Phase 12 (cutover)-specific action needed** for Resend, unlike Stripe's webhook — outbound email should work immediately once the env vars are set, since the account/domain/DKIM are already valid and don't depend on which backend is live.
4. **Separately tracked, not part of Phase 10's scope**: whether production's **Supabase Auth** SMTP settings (Authentication → SMTP Settings, for Supabase's own signup-confirmation/magic-link/password-reset emails) happen to also use Resend as the SMTP relay is a distinct, still-open question from `08-auth-inventory.md` §5 / `MIGRATION_MASTER_PLAN.md` §4's "Auth: SMTP / email sending" row — that setting is **not retrievable via any API** and isn't part of this Phase 10 (which covers only the app's own direct `Resend` SDK usage, confirmed above). Flagging the cross-reference here so it isn't mistakenly assumed to be covered by this phase.

## 8. Phase 11 — environment variable cutover plan (drafted 2026-07-25 — planning only, no deployment/env var changes made)

**Status: prep complete, ready for execution pending explicit go-ahead. Not yet executed** — no environment variable has been changed, no redeploy has happened, no Vercel setting has been touched. Same drafting discipline as Phases 6–10. This section consolidates Phases 6–10's decisions into one concrete diff.

**Decisions confirmed by the user (2026-07-25), not assumed**:
- **Cutover is a single Vercel project having its env vars updated in place** — same project, same domain, repointed at `supabase-new`. Not a move to a new Vercel project. This is the assumption every phase up to now has implicitly relied on, now explicitly confirmed.
- **The newly-surfaced third-party API keys below (Ticketmaster, SeatGeek, Gemini, Facebook Page, Eventbrite) all carry forward as the same values/accounts as production** — same reasoning as Resend (Phase 10): these are read-only API integrations or one-way posting credentials, not customer-money accounts with continuity implications like Stripe.

### 1. Complete environment variable inventory (every `process.env.*` reference in the codebase, 2026-07-25 — not limited to what Phases 6–10 already discussed)

**Category A — changes at cutover** (production's value → `supabase-new`'s value):

| Var | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | → `https://hkvjdtbhiycqqhgelymr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | → `supabase-new`'s anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | → `supabase-new`'s service-role key |

**Category B — new value needed at cutover** (genuinely per-deployment, can't just be copied):

| Var | Notes |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Per Phase 9: new webhook endpoint created against the live post-cutover URL, new signing secret issued for it. The one Stripe value that has to change even though the account doesn't. |
| `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` | See §2 below — not "new" in the sense of unknown, but need to be set explicitly rather than left to fall back, and none of the three is currently set to the production domain in `supabase-new`'s `.env.local` today. |

**Category C — unchanged, carries forward as-is** (per Phases 9–10's same-account confirmations, plus the newly-surfaced items just confirmed above):

| Var | Source of the "same" decision |
|---|---|
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_BUSINESS_ONETIME`, `STRIPE_PRICE_BUSINESS_SUB` | Phase 9 — same Stripe account |
| `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` | Phase 9 — same NOWPayments account |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Phase 10 — same Resend account |
| `TICKETMASTER_API_KEY` (`lib/ticketmaster-event.ts`, `lib/external-events.ts`) | Confirmed this phase — same key |
| `SEATGEEK_CLIENT_ID` (`lib/external-events.ts`) | Confirmed this phase — same key |
| `GEMINI_API_KEY` (`lib/generateCaption.js` — AI caption generation for auto-posted content) | Confirmed this phase — same key |
| `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN` (`lib/facebook.js` — auto-posting new articles to Facebook) | Confirmed this phase — same values |
| `EVENTBRITE_PRIVATE_TOKEN` (`app/api/eventbrite-sync/route.ts`) | Confirmed this phase — same token |
| `SITE_WEBHOOK_SECRET` (`app/api/webhooks/new-content/route.js` — see §3, gap flagged separately) | Internal app-defined shared secret, no external account — carries forward unchanged |
| `CRON_SECRET` (all 3 `app/api/cron/*` routes) | Internal app-defined shared secret matched against Vercel Cron's own request — no external account, carries forward unchanged |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics property, independent of Supabase project |
| `NEXT_PUBLIC_COMPANY_VIDEO_URL`, `NEXT_PUBLIC_COMPANY_VIDEO_THUMBNAIL` (`components/CompanyVideoPlayer.tsx`) | Static content config, not a secret or account |
| `NODE_ENV`, `VERCEL_ENV` | Platform-injected by Vercel automatically — never set manually, nothing to do |

**Gap found**: `TICKETMASTER_API_KEY`, `SEATGEEK_CLIENT_ID`, `GEMINI_API_KEY`, `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `EVENTBRITE_PRIVATE_TOKEN`, `NEXT_PUBLIC_APP_URL`, and `NEXT_PUBLIC_SITE_URL` are **not currently set at all** in `supabase-new`'s `.env.local` (confirmed by reading the file directly) — meaning these features (external event import, AI captioning, Facebook auto-post, Eventbrite sync, canonical/OG URL resolution) would silently no-op or misbehave in `supabase-new`'s current local dev setup. Each call site that reads these has a graceful `if (!process.env.X)` guard (they fail soft, not hard-crash), but this is worth fixing before Phase 12, not just at cutover — otherwise local testing against `supabase-new` in the meantime can't actually exercise these features.

### 2. `NEXT_PUBLIC_BASE_URL` and the other two URL-config vars — three separate env vars, not unified

Confirmed by reading `lib/site-url.ts`, `app/api/webhooks/stripe/route.ts`, and every call site: **this codebase has three different "what's my own URL" env vars, read independently by different code paths — a pre-existing inconsistency, not something this migration introduces, but one that needs all three handled correctly, not just one:**

- **`NEXT_PUBLIC_SITE_URL`** — preferred by `lib/site-url.ts`'s `getSiteUrl()`, used for OG/Twitter meta tags on `articles`/`businesses`/`products` detail pages and the sitemap. Falls back to `NEXT_PUBLIC_APP_URL`, then to a **hardcoded** `https://www.Aldriva.com` if `VERCEL_ENV` is set (i.e., any real Vercel deployment), or `http://localhost:3000` if not (local dev only). The code comment explains this deliberately never falls back to `VERCEL_URL` (the per-deployment preview alias), because that previously leaked an unreachable-behind-auth-wall preview URL into OG tags scraped by Facebook/WhatsApp.
- **`NEXT_PUBLIC_APP_URL`** — secondary fallback for `getSiteUrl()`; also read directly in `app/forgot-password/page.tsx`, `SecurityClient.tsx`, and the admin password-reset route for building reset-password links.
- **`NEXT_PUBLIC_BASE_URL`** — a **third, separate** variable, read independently (not through `getSiteUrl()`) by the Stripe webhook handler, all the Stripe/crypto checkout routes, `lib/promotionEngine.js`, and the ticket-send route — each with its own local fallback (e.g. the webhook handler falls back to `req.nextUrl.origin`, not to `getSiteUrl()`'s logic).

**Confirmed production domain**: `https://www.Aldriva.com` (the hardcoded fallback value in `lib/site-url.ts`, and the default in `app/api/crypto/create-payment/route.ts`'s own `baseUrl` fallback) — consistent with the domain confirmed already for Resend's DNS (Phase 10).

**Since the domain itself isn't moving (only the Supabase backend is, per the confirmed single-Vercel-project-repointed decision above), all three vars should resolve to the same value post-cutover: `https://www.Aldriva.com`.** Recommend setting **all three explicitly** in the Vercel project's environment (not relying on `getSiteUrl()`'s hardcoded fallback to silently do the right thing for `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_APP_URL`) — this removes the fragility the code comment itself already worries about (a wrong/missing URL silently leaking into OG tags or checkout redirect URLs), and keeps `NEXT_PUBLIC_BASE_URL` from being the one var that's actually set while the other two rely on an implicit fallback path.

**Update (2026-07-25) — attempted to confirm actual Vercel Production values, partial result only.** Re-grepped the full codebase (event-platform) for all three var names; usage above is confirmed complete — no additional call sites found. Attempted to confirm what each var is actually set to in Vercel's Production environment: **no MCP tool exposes environment-variable listing** (checked the full available Vercel MCP tool set — `get_project`, `get_deployment`, etc. return project/deployment metadata, never env var contents), and installing the Vercel CLI in-session to check `vercel env ls` (names only) failed on an unrelated npm registry integrity error (`ECOMPROMISED`), not pursued further.

Gathered indirect evidence instead, but it's **inconclusive for two of the three vars**: production's NOWPayments IPN callback logs and the live homepage's `og:url`/canonical tags both show `https://www.Aldriva.com` correctly — but every fallback in this codebase (the hardcoded literal in `getSiteUrl()`, the per-call-site hardcoded default, `req.nextUrl.origin`) independently converges on that exact same value, so correct-looking production behavior cannot distinguish "the var is explicitly set" from "the var is unset and silently correct via fallback" for `NEXT_PUBLIC_SITE_URL` or the majority of `NEXT_PUBLIC_BASE_URL` call sites. Client-bundle inspection for `NEXT_PUBLIC_APP_URL` (fetched `/forgot-password`'s compiled JS directly, since it's a public page using the var in a client component) was also inconclusive — the compiled output still shows a live `process.env.NEXT_PUBLIC_APP_URL` property access rather than an inlined literal or `undefined`, which appears to be how this repo's Turbopack build handles `NEXT_PUBLIC_*` vars rather than webpack's classic static-replace-at-build-time behavior; can't tell from this whether the var is set.

One narrower, not-yet-confirmed signal worth future attention: `app/api/admin/fundraisers/[id]/route.ts`'s two `NEXT_PUBLIC_BASE_URL` usages (fundraiser approval/rejection emails) have **no fallback at all** (`?? ''`) — if the var were unset, those emails would contain a domain-less, broken "View your fundraiser" link. Confirming this would require either triggering a real approve/reject action (a write, out of scope for this read-only pass) or finding a historical log/email sample; neither was done.

**Conclusion: cannot definitively confirm via any available tool whether all three vars are explicitly set in Vercel today, or whether one or more are silently correct only because of a fallback.** This needs a direct look at Vercel's dashboard (Project → Settings → Environment Variables → Production) for these three names — the only fully authoritative source, and not retrievable by any tool available in this session.

**Recommendation on consolidate-vs-set-explicitly (requested this pass, not implemented)**: set all three explicitly now rather than consolidate. Consolidating to one variable touches ~15 call sites across checkout/webhook/OG-meta/auth-redirect code with at least four different fallback semantics today (hardcoded literal, `req.nextUrl.origin`, `window.location.origin`, empty string) — real behavior-change risk for a purely cosmetic win, since explicitly setting all three to the same value fully resolves the inconsistency for migration purposes without touching a single line of application code. Leave consolidation as an optional `RECOMMENDATIONS.md`-scope cleanup for after the migration, not a Phase 11/12 task.

### 3. Other project-specific config found, not yet covered by any prior phase

- **A third cron job exists that wasn't previously inventoried**: `vercel.json` defines 3 crons — `/api/cron/daily-post` (14:00 UTC), `/api/cron/promotion-engine` (18:00 UTC), and `/api/cron/purge-accounts` (03:00 UTC). Only the first two were mentioned in `CLAUDE.md`'s architecture summary and `MIGRATION_MASTER_PLAN.md`'s configuration checklist ("Vercel cron jobs" row) — `purge-accounts` is a genuine gap in the earlier audit. Mechanically it needs no special handling (same as the other two: `vercel.json` ships with the app's deployment, not the Supabase project, and Vercel Cron authenticates via `CRON_SECRET`, already confirmed carrying forward unchanged above) — flagging so it isn't missed during Phase 12's smoke-testing.
- **A likely Supabase Database Webhook, not captured anywhere in the schema audit**: `app/api/webhooks/new-content/route.js` expects an inbound call carrying an `x-webhook-secret` header matching `SITE_WEBHOOK_SECRET`, and triggers Gemini-caption-generation + Facebook auto-posting for newly published content. This shape (an inbound webhook guarded by a static shared secret, apparently fired on a database event) strongly suggests a **Supabase Database Webhook** configured in production's Dashboard (Database → Webhooks) — a project-level setting, not part of `sql/001`–`011`, and not mentioned anywhere in `02-functions-triggers-views.md` or `03-rls-storage-roles-realtime.md`. **This needs to be manually recreated on `supabase-new`'s Dashboard** (same category as Auth email templates/OAuth providers — a Dashboard setting with no SQL-file equivalent), pointed at the same app URL (unchanged, per §2). `SITE_WEBHOOK_SECRET` itself doesn't need to change (Category C above), but the webhook's *existence* on the new project does need to be confirmed/recreated. Flagging as a genuine documentation gap this phase surfaced, not something previously tracked to do.

**Update (2026-07-25) — both items directly re-investigated against production; corrections to both findings above.**

**`/api/cron/purge-accounts` — correction: not a live production cron at all.** Read the route in full: it's the finalization step of a 14-day account-deletion grace period — sweeps `profiles` where `purge_at` has passed, anonymizes PII on the profile plus any owned `organizers`/`events`/`fundraisers`, then hard-deletes the Supabase Auth user via `auth.admin.deleteUser`. **The original gap finding assumed this was already running in production; it is not.** The route and its `vercel.json` cron entry were both introduced by a single commit, `142e935` ("feat: account deletion with 14-day grace period and recovery"), which sits on a local feature branch (`feat/events-landing-redesign`) **ahead of `origin/main` and never pushed/deployed** — confirmed via `git show origin/main:app/api/cron/purge-accounts/route.ts` (file absent on that ref), `git show origin/main:vercel.json` (only `daily-post`/`promotion-engine` listed), and Vercel's full deployment history (no deployment has ever built commit `142e935` or anything after it besides the crypto-signature fix). It ships alongside a larger unmerged feature: `DELETE /api/account`, `POST /api/account/recover`, `POST /api/signup-guard`, a `/recover-account` page, and a `SecurityClient` "Danger Zone" section. **There is nothing to reproduce on `supabase-new` yet** — the cron isn't live anywhere. If this feature branch merges and deploys before Phase 12 cutover, add `purge-accounts` to the cutover cron smoke-test list (§4 step 7 below, already present); if it lands after cutover, it's just a normal feature deploy against whichever backend is live then, no migration-specific handling needed. The Configuration Checklist's "Vercel cron jobs" row (`MIGRATION_MASTER_PLAN.md` §4) still only lists the two crons that are actually live today — accurate as-is, not a gap.

**Database Webhook / `new-content` — correction: does not exist, and nothing calls the route either.** Queried production (`jnobheduodpvojwzbpra`) directly and read-only: `select * from supabase_functions.hooks` — **the table doesn't exist in this project at all** (`relation "supabase_functions.hooks" does not exist`). Broadened the check to every trigger in the entire `public` schema, not just `articles`: zero triggers anywhere call anything in the `supabase_functions` or `net` schemas, or any function with "http" in its name. `articles` itself has exactly two triggers — `trg_articles_updated_at` and `trg_enforce_article_status_transition` — neither related to webhooks or Facebook. This is also consistent with the original Phase 1 audit's own finding (`MIGRATION_MASTER_PLAN.md` §1: all 12 triggers are "self-contained with no external/cross-platform dependencies"). Went further and grepped the entire codebase for `SITE_WEBHOOK_SECRET`/`x-webhook-secret`: **both appear only inside `app/api/webhooks/new-content/route.js` itself** — no other file, action, or route anywhere calls this endpoint or references its secret.

**Conclusion: there is no Supabase Database Webhook configured on production, and no application code invokes this route either.** It isn't a dormant-but-configured integration waiting on Facebook App Review — it's orphaned/dead code with no invoker of any kind. The route is genuinely deployed (`git show origin/main:app/api/webhooks/new-content/route.js` confirms it's present, shipped in commit `a26c2a9`, "Add Facebook auto-posting automation"), it's just never called by anything in production today.

Separately verified the underlying Facebook credentials, since `FB_PAGE_ID`/`FB_PAGE_ACCESS_TOKEN` are shared between this dead route and the two crons that **are** live (`daily-post`, `promotion-engine` — both import the same `postToFacebook`/`postPhotoToFacebook` from `lib/facebook.js`): a read-only Graph API call (`GET /{FB_PAGE_ID}?fields=name,id`) returned `200` with the real page identity ("Aldriva", id `1149237444932359`) — the token is valid and live right now, not expired or revoked. Did not attempt an actual post (a real, public, live Facebook post — out of scope for a read-only pass), so whether `pages_manage_posts` write-scope has cleared Facebook's App Review specifically remains unconfirmed; only read access was verified.

**Recommendation**: nothing needs to be recreated on `supabase-new` for this item — there is no Database Webhook object on production to recreate. If Facebook auto-post-on-publish is still wanted as a feature, it needs to be built for the first time, not migrated: either a genuine Supabase Database Webhook configured fresh on `supabase-new` (Dashboard-only, no read-back path, same caveat as Auth email templates), or — simpler, and avoids depending on an unauditable Dashboard setting — a direct call from `lib/actions/articles.ts` after a publish. That's a product decision, not a migration blocker; tracking it as a `RECOMMENDATIONS.md`-scope item rather than a Phase 11/12 task.
- **Vercel project settings, redirects, headers** (`next.config.ts`, `vercel.json`): the one redirect (`/organizations/:slug*` → `/org/:slug*`) and all security headers (CSP, `X-Frame-Options`, etc.) ship with the app's code/config files, not with Vercel project settings or the Supabase project — nothing to reconfigure here at cutover. Worth noting `next.config.ts`'s CSP directives already reference `supabaseOrigin`/`supabaseWssOrigin` dynamically derived from `NEXT_PUBLIC_SUPABASE_URL` at build time (`img-src`, `connect-src`, `media-src`) — so as long as `NEXT_PUBLIC_SUPABASE_URL` is updated correctly (Category A), the CSP automatically allows the new Supabase origin with no separate change needed.

### 4. Proposed sequencing for Phase 12 (cutover) — what changes, in what order, verified before the next step

This elaborates `MIGRATION_MASTER_PLAN.md` §5's existing cutover checklist (items 7–11) with the specific env-var ordering and verification gates this phase's findings call for:

1. **Confirm `supabase-new` is fully ready** — Phases 6–8 already verified (data + storage), Phase 9's test-mode Stripe verification and Phase 10's Resend checks (no action needed there, per Phase 10) should be complete first. Do not proceed to step 2 until this is true.
2. **Update Category A vars** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) in the Vercel project's environment settings.
3. **Update Category B's URL vars** (`NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` → all `https://www.Aldriva.com`) in the same batch, since the domain isn't changing — no reason to sequence this separately from step 2.
4. **Redeploy** with the above. **Verify before touching Stripe**: confirm the deployed app can actually reach `supabase-new` — a real sign-in (per `05-verification-checklist.md`'s functional tests) and a real read from a `public` table succeed. This is the "confirm the app can reach `supabase-new` before flipping Stripe's webhook" gate the user asked for explicitly — don't create the new Stripe webhook endpoint against a URL that can't yet authenticate/read against the new backend, since a broken deploy would otherwise silently accept Stripe webhook events into an app that can't process them.
5. **Only after step 4 passes**: create the new Stripe webhook endpoint (Category B's `STRIPE_WEBHOOK_SECRET`) pointed at this now-confirmed-working deployment, per Phase 9's plan, and set the new signing secret. Verify with a Stripe CLI test event before relying on real traffic.
6. **Recreate the Supabase Database Webhook** for `new-content` (§3) on `supabase-new`'s Dashboard, if confirmed to exist on production — test with a real article publish and confirm the Facebook post fires.
7. **Smoke-test the 3 Vercel crons** (§3) — the `purge-accounts` job in particular, since it wasn't in the original inventory and deserves a first-look check rather than assuming it "just works" like the other two.
8. Proceed with `MIGRATION_MASTER_PLAN.md` §5's remaining cutover checklist (payments/donations/uploads/notifications verification, smoke tests, monitoring, old-project rollback window).

**Everything in Category C needs no action during this sequence** — it's already correct in the target environment (or, for the 6 newly-confirmed-same items, needs to be added to the deployment's env vars for the first time, but doesn't require any external-service reconfiguration, verification, or account decision beyond what's already been confirmed above).
