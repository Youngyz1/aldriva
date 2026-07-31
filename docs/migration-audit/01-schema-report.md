# Production Database Schema Report

**Audit date**: 2026-07-23. **Method**: read-only `SELECT` queries against `information_schema` / `pg_catalog` via the Supabase MCP server, connected to the production project (`jnobheduodpvojwzbpra`) in read-only mode. No DDL was executed against production at any point. This report — and the executable SQL in `sql/` — is the migration blueprint for standing up a new, standalone Supabase project.

The live database, not the repository's `db/migration_NN_*.sql` files, was treated as the source of truth throughout, per the audit brief.

## Scope

- **Schemas inspected**: `public` (all 28 application tables + 2 views), `auth`, `storage`, `realtime` (all Supabase-managed, confirmed standard shape), `extensions`, `vault`.
- **Out of scope for recreation**: `auth.*`, `storage.migrations`, `realtime.*` internal tables — Supabase provisions these automatically for every new project. Only the *configuration* layered on top (buckets, storage policies, the `on_auth_user_created` trigger, realtime publication membership) needs to be reproduced, and this report + `sql/` covers all of it.

## Table dependency order (creation order)

FKs to `auth.users` are omitted from the ordering since `auth.users` already exists in any new Supabase project.

| # | Table | Notes |
|---|---|---|
| 1 | `profiles` | 1:1 with `auth.users`, populated by the `handle_new_user` trigger |
| 2 | `platform_settings` | |
| 3 | `homepage_categories` | |
| 4 | `homepage_sponsors` | |
| 5 | `homepage_testimonials` | |
| 6 | `organizers` | |
| 7 | `businesses` | |
| 8 | `comments` | |
| 9 | `comment_likes` | |
| 10 | `follows` | user-to-user |
| 11 | `notifications` | only table in the Realtime publication |
| 12 | `events` | |
| 13 | `articles` | |
| 14 | `products` | |
| 15 | `eventbrite_sources` | |
| 16 | `organizer_follows` | user-to-organizer, distinct from `follows` |
| 17 | `organizer_visibility_audit` | |
| 18 | `fundraisers` | **circular FK — see below** |
| 19 | `gofundme_sources` | **circular FK — see below** |
| 20 | `venue_layouts` | |
| 21 | `tickets` | simplest/least-constrained table in the schema |
| 22 | `fundraiser_media` | |
| 23 | `fundraiser_updates` | |
| 24 | `donations` | |
| 25 | `reviews` | |
| 26 | `seats` | |
| 27 | `product_orders` | |
| 28 | `ticket_orders` | |

**Circular FK**: `fundraisers.gofundme_source_id → gofundme_sources(id)` (`ON DELETE SET NULL`) and `gofundme_sources.fundraiser_id → fundraisers(id)` (`ON DELETE SET NULL`) reference each other. Both columns are nullable and neither is `DEFERRABLE` in production. Resolved in `sql/002_tables.sql` by creating `fundraisers` without the `gofundme_source_id` FK, then `gofundme_sources`, then adding the FK via `ALTER TABLE` (step 19b).

Full column-by-column, constraint-by-constraint DDL for all 28 tables is in **`sql/002_tables.sql`** — that file is the authoritative, executable version of this inventory.

## Enums

**None.** Every "enum-like" column (`status`, `role`, `visibility`, `org_type`, `category`, `review_type`, `price_type`, `payment_method`, `field_name`, etc.) is a plain `text`/`varchar` column with a `CHECK (col = ANY (ARRAY[...]))` constraint — not a Postgres `CREATE TYPE ... AS ENUM`. This means adding a new allowed value is an `ALTER TABLE ... DROP CONSTRAINT` / `ADD CONSTRAINT` in the new project too, not an `ALTER TYPE ... ADD VALUE`; no enum-specific migration tooling is needed.

## Sequences

**None.** No `serial`/`bigserial`/`GENERATED ... AS IDENTITY` columns exist anywhere. Every primary key is `uuid DEFAULT gen_random_uuid()` (via the `pgcrypto` extension). There is nothing to reset/reseed after a data import — no sequence `setval()` step is needed in the data migration.

## Extensions relevant to schema recreation

| Extension | Schema | Used for |
|---|---|---|
| `pgcrypto` | `extensions` | `gen_random_uuid()` — the default on every table's `id`/PK column |
| `uuid-ossp` | `extensions` | Installed in production but **not referenced** by any column default (all defaults use `gen_random_uuid()`). Included in `sql/001_extensions.sql` for parity only. |
| `pg_stat_statements` | `extensions` | Observability only, no schema dependency |
| `supabase_vault` | `vault` | Supabase-managed, provisioned automatically |
| `plpgsql` | `pg_catalog` | Always present |

Dozens of other extensions are *available* in the production project (postgis, pgvector, pg_cron, pg_net, etc.) but **not installed** — none of the schema, functions, or triggers depend on them.

## Row Level Security status

All 28 tables have `relrowsecurity = true` and `relforcerowsecurity = false` (table owner / `service_role` always bypasses RLS — normal and required). Full policy detail is in `03-rls-storage-roles-realtime.md` and `sql/006_rls_policies.sql`.

## Table/column comments

Only 6 comments exist in the entire schema (all preserved verbatim in `sql/002_tables.sql`):
- Table comment on `articles`.
- Column comments on `articles.owner_id`, `articles.organizer_id`, `articles.scheduled_for`, `articles.reading_time`, `articles.business_id` (this last one is **stale** in production — it says "No FK until Phase 2" even though `articles_business_id_fkey` already exists; corrected wording used in the SQL file).
- Column comments on `products.owner_id`, `products.business_id`, `products.stock_quantity`.
- Column comments on `product_orders.product_name`, `product_orders.unit_price`, `product_orders.buyer_id`, `product_orders.status`.

## Notable irregularities — reproduced as-is, documented for awareness

1. **Inconsistent `ON DELETE` behavior.** Most FKs to `auth.users`/`organizers` specify `CASCADE` or `SET NULL`, but these default to `NO ACTION` (i.e. deleting the referenced row is blocked until the referencing rows are cleaned up):
   - `events.organizer_id`, `events.user_id`
   - `fundraisers.user_id`
   - `organizers.user_id`
   - `donations.fundraiser_id`
   - `tickets.event_id`
   - `ticket_orders.seat_id`
   - `platform_settings.updated_by`
   This matters most for user deletion (GDPR/account-deletion flows — the existence of `check_email_pending_deletion()` implies one exists): deleting a user who owns events/fundraisers/an organizer profile, or who last touched `platform_settings`, will fail with a FK violation unless the app cleans up or reassigns those rows first. This is current production behavior and `sql/002_tables.sql` reproduces it exactly (no `ON DELETE` action added).

2. **Unenforced "loose" references.** `seats.ticket_id` and `ticket_orders.ticket_id` have no FK constraint despite the name — resolved only in application code. `sql/002_tables.sql` reproduces this exactly (no FK added).

3. **Two "candidate duplicate" columns on `fundraisers`**: `raised` and `raised_amount` both exist, and the `update_fundraiser_raised()` trigger function defensively probes `information_schema.columns` at runtime to decide which to write. Same pattern for `banner` vs `image_url`. Both are created in `sql/002_tables.sql` for exact parity with production. See `RECOMMENDATIONS.md` item 16 for optional follow-up on consolidating these — out of scope for this migration.

4. **`platform_settings`'s primary key is `key` (text)**, not a `uuid id` like all 27 other tables — a deliberate, different pattern (settings-as-rows-keyed-by-name) worth knowing about if any tooling assumes a uniform `id uuid` PK shape.

5. **Two views exist in `public` alongside the 28 tables** (`public_donation_activity`, `public_profiles`) — see `sql/007_views.sql` and `02-functions-triggers-views.md`. Both are reproduced as-is; see `RECOMMENDATIONS.md` item 6 for optional follow-up discussion.
