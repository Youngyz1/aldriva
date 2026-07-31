# Fund4Good Database Migration — Master Plan

**Status**: documentation and verification only. Nothing in this document, or in any artifact it references, has been executed against production. This is the single execution-order guide that ties together the audit already performed in `01-schema-report.md` through `07-stripe-and-payment-fields.md`, `sql/001`–`sql/011`, and `RECOMMENDATIONS.md`.

**Source of truth**: the completed audit (all documents in this directory). Where a count needed independent confirmation for the Golden Reference (§7) below, it was re-verified directly against production via the Supabase MCP server in read-only mode on 2026-07-23 — no new broad audit was performed, only targeted count checks.

**This plan does not change production, does not change application code, does not introduce new migration SQL, and does not recommend architectural changes.** Where the completed audit identified optional improvements, they remain exclusively in `RECOMMENDATIONS.md` and are out of scope for every phase below.

---

## 1. Executive Summary

### Current production architecture

Fund4Good runs on a single Supabase project (`jnobheduodpvojwzbpra`) providing Postgres, Auth, Storage, and Realtime, fronted by a Next.js 16 App Router application (see root `CLAUDE.md`). The database layer consists of:

- **28 application tables** in the `public` schema (events, fundraisers, tickets, donations, organizers, businesses, products, articles, reviews, notifications, and 18 others), with no custom enum types and no sequences — every primary key is `uuid default gen_random_uuid()`.
- **19 PL/pgSQL/SQL functions**, **12 triggers** (11 on `public` tables, 1 on `auth.users`), and **2 views**, all self-contained with no external/cross-platform dependencies.
- **87 Row Level Security policies** across 24 of the 28 tables (4 tables are intentionally policy-free, accessible only via `service_role`).
- **7 public Storage buckets** with **14 `storage.objects` policies**.
- **1 table** (`notifications`) enabled for Realtime (`postgres_changes`).
- Payment state carried as plain columns (no dedicated payments table) across `donations`, `ticket_orders`, `product_orders`, `businesses`, and `products`, supporting both Stripe and a crypto payment path.
- Standard Supabase-managed `auth` and `storage` schemas, unmodified beyond the one `on_auth_user_created` trigger.

### New standalone fundraising architecture

The target is a **brand-new, independent Supabase project** hosting only the fundraising application — same schema, same functions/triggers/views, same RLS/storage/grants configuration, same Realtime setup, populated with production's actual data (users, application rows, storage objects). The new project is not a branch or clone of the old one; it is built from the ground up using the artifacts in `sql/001`–`sql/011`, then loaded with migrated data.

### Migration objective

Stand up the new project so it is **behaviorally indistinguishable from current production** for every user-facing and payment-facing flow, then cut the application over to it with a bounded, well-understood rollback window.

### Scope

- Full `public` schema (all 28 tables, 19 functions, 12 triggers, 2 views, 87 RLS policies).
- Storage (7 buckets, 14 policies, and the underlying file objects).
- Realtime publication membership.
- `auth.users` and related identity data.
- Stripe and crypto payment-related columns and their reconciliation.
- Environment/secrets/configuration required for the application to run against the new project.

### Out of scope

- Any architectural change, RLS tightening, security hardening, or schema redesign — all such items live exclusively in `RECOMMENDATIONS.md` and are not part of this migration.
- Application code changes (the app's Supabase client usage, routes, and components are assumed unchanged; only configuration/env vars pointing at a different backend change).
- Anything outside the fundraising application's own Supabase project (no other platform, tenant, or shared schema was found during the audit — see `02-functions-triggers-views.md` §"Cross-schema / external dependencies: none found").
- Historical data cleanup, deduplication, or backfill beyond what's needed for a faithful copy.

---

## 2. Migration Phases

| Phase | Name | Summary | Primary reference(s) |
|---|---|---|---|
| 1 | Audit | **Complete.** Read-only schema, security, storage, and payment-field audit of production. | All files in this directory |
| 2 | Build new Supabase project | **Complete** (2026-07-23). See "Phase 2 status" below. | — |
| 3 | Deploy schema | **Complete and closed** (2026-07-23). All 11 files (`sql/001_extensions.sql` → `sql/011_realtime.sql`) applied against `hkvjdtbhiycqqhgelymr` via `supabase-new`, each confirmed error-free before proceeding to the next. Structural verification (§8) passes on every row, including **Functions** (20 — 19 from the audited schema plus one known, accepted platform addition; see note below §8). No open items. | `sql/`, §3 below |
| 4 | Configure authentication | Recreate Auth settings (redirect URLs, email templates, OAuth providers if any) to match production intent; the `on_auth_user_created` trigger is deployed as part of Phase 3, not here. | §4 |
| 5 | Configure storage | **Fully complete (2026-07-23).** All 7 buckets and all 14 `storage.objects` policies confirmed applied correctly on `supabase-new` via read-only SQL, matching production and `03-rls-storage-roles-realtime.md`'s bucket table exactly, by name and by value. The three Dashboard/Management-API-only items not queryable via MCP were manually checked in the Dashboard on **both** projects (2026-07-23): **global file size limit** — 50 MB on both, a Free-plan platform-enforced cap ("Free Plan has a fixed upload file size limit of 50 MB... Upgrade to Pro for a configurable limit of 500 GB" per Supabase's own UI), not a per-project setting difference; **image transformations** — disabled (toggle off) on both, also Pro-only; **custom storage domain** — none configured on production (no custom domain section populated), so nothing to replicate. All three match. **No file/object data was copied** — that remains Phase 8. | §4 |
| 6 | Import users | **Complete and verified (2026-07-24).** Executed manually, local terminal, Docker Desktop running. **One correction to the originally planned procedure**: the schema-file load step (`auth_schema.sql`) was dropped — attempting it failed with `permission denied for schema auth`, because `supabase-new` already provisions its own correct `auth` schema at project creation, independent of `sql/001`–`011` (which covers only `public`). Only the **data-only** restore was needed and it succeeded cleanly: `psql --single-transaction --variable ON_ERROR_STOP=1 --command "SET session_replication_role = 'replica';" --file auth_data.sql --dbname "[supabase-new connection string]"` — no errors, transaction committed. **Verified**: `auth.users` row count matches exactly (13/13, production vs. `supabase-new`); a real account's real password was tested end-to-end against `supabase-new`'s `/auth/v1/token?grant_type=password` and succeeded (full token response), confirming the bcrypt hash carried over and is genuinely functional. The six `auth.*` tables that received rows in the restore were all checked: `auth.users` (13/13) and `auth.identities` (18/18) match exactly. The remaining four discrepancies were root-caused row-by-row (timestamps/user_agent/ip), correcting an earlier, wrong write-up: `auth.flow_state` (+3, 36 vs. 33) is **unrelated to Phase 6** — all 3 extra rows are dated 2026-07-23 (a day before the restore ran), `provider_type='google'`, matching the already-logged Phase 4 OAuth-test incident (whose `flow_state` rows were never purged, unlike its `auth.users`/`profiles` rows); the password-grant test used for Phase 6 verification cannot write to `flow_state` at all (PKCE/OAuth-only table). `auth.sessions` (+2), `auth.refresh_tokens` (+3), and `auth.mfa_amr_claims` (+2) correspond to two distinct, confirmed-successful logins on 2026-07-24 for the same test account, same IP: the documented curl password-grant test at 18:26:52 (`user_agent=curl/8.17.0`), and a second, manual browser-based login at 18:42:20 (Chrome/Windows user agent, later token-refreshed at 21:19:42) — confirmed by the operator as an intentional UI spot-check performed ~16 minutes after the curl test, not an artifact. (A failed password attempt cannot produce these rows — GoTrue only issues `sessions`/`refresh_tokens`/`mfa_amr_claims` after successful authentication.) All other `auth.*` tables (`mfa_factors`, `mfa_challenges`, `sso_providers`, `sso_domains`, `saml_providers`, `saml_relay_states`, `one_time_tokens`, `audit_log_entries`) loaded 0 rows on both sides, confirmed matching. All three working files (`auth_schema.sql`, `auth_data.sql`, `auth_schema_test.sql`) deleted from disk after verification. | `04-data-migration-strategy.md` §1 |
| 7 | Import application data | **Complete and verified (2026-07-25).** Executed per the drafted plan: one whole-`public`-schema, data-only `supabase db dump`, restored via a single `psql --single-transaction --variable ON_ERROR_STOP=1` run with `session_replication_role = 'replica'`. **Row counts**: all 28 `public` tables match production exactly (`profiles` 13/13, `donations` 1,250/1,250 — the largest table — down to `follows`/`homepage_sponsors`/`homepage_testimonials`/`products`/`venue_layouts`/`fundraiser_updates`/`seats`/`product_orders` at 0/0; no discrepancies anywhere). **Mandatory orphan/referential-integrity sweep** (required since FK checks were suppressed during load) checked, against `supabase-new`: `comments.target_id` vs. `events`/`fundraisers`, `notifications.related_id` vs. `fundraisers`/`comments`/`events`/`profiles`, both directions of the `fundraisers`↔`gofundme_sources` circular FK, `seats.ticket_id`/`ticket_orders.ticket_id` vs. `tickets` — **all six return zero rows**, no orphans found. Full per-table counts and orphan-sweep query results are recorded in `04-data-migration-strategy.md` §2 "Phase 7 execution & verification." **Outstanding**: `public_data.sql` (the dump file, ~526 KB, real donor/payment PII) has **not yet been deleted** from the repo root — flagged for manual deletion now that verification is complete, same standard as the Phase 6 working files. | `04-data-migration-strategy.md` §2, §3 below |
| 8 | Import storage objects | **Complete and verified (2026-07-25).** Executed in-sandbox (production/`supabase-new` Storage APIs both directly reachable via HTTPS, unlike the raw Postgres port Phases 6–7 needed). Ran `scratch/migrate-storage.js` (uncommitted) using production's service-role key **read-only** (`.list()`/`.download()` only, never `.upload()` or any bucket-management call against production) and `supabase-new`'s service-role key for uploads only, into the 7 already-existing buckets from Phase 5. **Result: 79/79 objects transferred, zero failures**, across all 7 buckets. **Post-transfer verification**: `select bucket_id, count(*), sum((metadata->>'size')::bigint) from storage.objects group by bucket_id` matches exactly between production and `supabase-new` on every bucket — 79 objects / 50,959,715 bytes on both sides, no discrepancies. **Spot-check**: 4 migrated public URLs (one each from `profile-images`, `event-banners`, `videos`, `organizer-banners`) fetched directly against `supabase-new` — all `200 OK`, byte sizes matching production's stored metadata exactly. Full per-bucket results live in `04-data-migration-strategy.md` §3 "Phase 8 execution & verification." **Outstanding**: `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (added solely for this transfer) has no further purpose and should be removed. | `04-data-migration-strategy.md` §3 |
| 9 | Configure Stripe (+ NOWPayments, folded in here — no dedicated phase existed for it) | **Prep complete — inventory and approach drafted (2026-07-25), not yet executed.** Full codebase touchpoint inventory re-checked (10 files instantiate `new Stripe(STRIPE_SECRET_KEY)`; webhook handler `app/api/webhooks/stripe/route.ts` handles `payment_intent.succeeded`/`checkout.session.completed`/`customer.subscription.deleted`/`invoice.payment_failed`; client-side `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` via `StripeProvider.tsx`). **Confirmed no Stripe Connect anywhere** (single platform merchant-of-record per `docs/adr/0001-…`; the Dashboard's "Connect Stripe Account" button is a UI mock, not a real API call) — the account-relationship decision is a single platform-level choice, not per-organizer. **Account relationship — explicitly confirmed by the user (2026-07-25), not assumed** (earlier docs only hedged toward this): **both Stripe and NOWPayments use the same account** as production. This narrows Phase 9's actual scope to: (a) a new Stripe webhook endpoint pointed at `supabase-new`'s post-cutover app URL — timed with Phase 12 cutover, not done in isolation early — and (b) a new `STRIPE_WEBHOOK_SECRET` for that endpoint; `STRIPE_SECRET_KEY`/`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`/`STRIPE_PRICE_BUSINESS_ONETIME`/`STRIPE_PRICE_BUSINESS_SUB` all stay unchanged. **Test-mode-first proposed** (matches `.env.local`'s current test-mode keys; production's actual key mode isn't discoverable from this repo) — full payment-flow verification via Stripe CLI against `supabase-new` before any live-mode webhook change. **NOWPayments**: confirmed same account; confirmed in code that its IPN callback URL is passed dynamically per-request from `NEXT_PUBLIC_BASE_URL`, so — unlike Stripe — **no Dashboard-side webhook registration step exists at all**, same-account or not. Flagged: NOWPayments has no sandbox/test-mode code path (all 4 call sites hit the live `api.nowpayments.io` host always), so pre-cutover crypto-path testing would hit NOWPayments' real API. Full detail in `07-stripe-and-payment-fields.md`, new "Phase 9 execution plan" section. **Do not create/modify/delete any Stripe webhook, API key, or NOWPayments config without explicit go-ahead.** | `07-stripe-and-payment-fields.md` |
| 10 | Configure Resend | **Prep complete — inventory and approach drafted (2026-07-25), not yet executed.** Full codebase touchpoint inventory: 5 files send email via `new Resend(RESEND_API_KEY)` (`lib/notifications.ts`, `lib/receipt.ts` donation receipts, `lib/certificate.ts` donation certificates, `app/api/account/route.ts` account-deletion confirmation, `app/api/send-ticket/route.ts` ticket confirmations) — all inline HTML, no templating system, no Resend-specific webhook/callback URL anywhere in the codebase (confirmed by inspecting every `app/api` route matching "webhook" — all are Stripe/crypto/content-sync, none Resend's). **Account relationship — explicitly confirmed by the user (2026-07-25), not assumed**: **same Resend account** as production, so `RESEND_API_KEY`/`RESEND_FROM_EMAIL` stay unchanged. **Domain verification checked directly via public DNS** (not assumed): `fund4agoodcause.com`'s DKIM record (`resend._domainkey`) is live and valid — genuinely verified with Resend today, not just configured; SPF only covers Cloudflare mail routing (pre-existing, not a migration concern) and DMARC is monitor-only (`p=none`). Since domain verification is tied to the domain/account rather than to any Supabase project, **no DNS record needs to change and no new verification is required.** **Unlike Stripe's webhook secret, Resend has no per-deployment value that must change at cutover** — no callback URL to re-point, so this needs zero Phase-12-specific action; `RESEND_API_KEY`/`RESEND_FROM_EMAIL` just carry forward unchanged as part of Phase 11's env var copy. **Cross-reference, not part of this phase's scope**: whether production's separate Supabase Auth SMTP setting (§4 below, "Auth: SMTP / email sending") happens to also use Resend is still open and not retrievable via any API — that's a distinct system from the app's own direct Resend SDK usage covered here. Full detail in `04-data-migration-strategy.md` §7. **Do not create/modify/delete any Resend config, API key, or DNS record without explicit go-ahead.** | `04-data-migration-strategy.md` §7 |
| 11 | Update environment variables | **Prep complete — full env var diff drafted (2026-07-25), not yet executed.** Complete inventory of every `process.env.*` reference in the codebase (28 distinct vars), split into: **Category A — changes at cutover** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`); **Category B — new value needed** (`STRIPE_WEBHOOK_SECRET` per Phase 9; `NEXT_PUBLIC_BASE_URL`/`NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_APP_URL` — see below); **Category C — unchanged, carries forward** (Stripe/NOWPayments/Resend per Phases 9–10, plus `TICKETMASTER_API_KEY`/`SEATGEEK_CLIENT_ID`/`GEMINI_API_KEY`/`FB_PAGE_ID`/`FB_PAGE_ACCESS_TOKEN`/`EVENTBRITE_PRIVATE_TOKEN` — newly surfaced by this phase's scan, **explicitly confirmed by the user as same-account/same-value**, none of these were previously set at all in `supabase-new`'s `.env.local` — a gap now flagged; plus `CRON_SECRET`/`SITE_WEBHOOK_SECRET`/`NEXT_PUBLIC_GA_MEASUREMENT_ID`/company-video vars/platform-injected `NODE_ENV`/`VERCEL_ENV`). **Found a genuine pre-existing inconsistency**: the codebase has **three separate** "own URL" env vars (`NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`), read independently by different code paths (`lib/site-url.ts`'s `getSiteUrl()` vs. the Stripe webhook/checkout routes directly) rather than unified — confirmed production domain is `https://www.fund4agoodcause.com` (matches Phase 10's Resend DNS domain); recommend setting all three explicitly to that value rather than relying on `getSiteUrl()`'s hardcoded fallback. **Vercel structure — explicitly confirmed by the user, not assumed**: single existing Vercel project repointed in place, same domain, not a move to a new project. **Two further gaps found**: (1) a third Vercel cron (`/api/cron/purge-accounts`, 03:00 UTC) exists in `vercel.json` but was never previously inventoried in `CLAUDE.md` or this plan; (2) `app/api/webhooks/new-content/route.js` (Facebook auto-posting via Gemini captions) strongly implies a **Supabase Database Webhook** configured on production's Dashboard that isn't captured by `sql/001`–`011` and was never flagged in the schema audit — needs manual recreation on `supabase-new`, same category as Auth email templates. **Proposed sequencing** (detailed in `04-data-migration-strategy.md` §8): update Category A+B URL vars together → redeploy → **verify the app can actually reach `supabase-new` (real sign-in + real read) before touching Stripe's webhook** → only then create the new Stripe webhook endpoint and test via Stripe CLI → recreate the Database Webhook → smoke-test all 3 crons (especially the newly-found `purge-accounts`) → proceed with §5's existing checklist. Full detail in `04-data-migration-strategy.md` §8. **Do not change any environment variable, redeploy, or touch Vercel settings without explicit go-ahead.** **Update (2026-07-25) — all three gaps below directly re-investigated against production; two of the three findings above are corrected, not just confirmed.** (1) The three URL vars: full call-site inventory confirmed complete, but their actual configured values in Vercel Production could not be confirmed by any available tool (no MCP env-var listing exists) — recommend setting all three explicitly rather than consolidating, but this remains unverified against the live dashboard. (2) `purge-accounts`: **correction** — this cron/route was never deployed at all (sits on an unmerged local branch, commit `142e935`); nothing needs reproducing on `supabase-new` unless/until it ships to production. (3) The `new-content` Database Webhook: **correction** — directly queried production, confirmed no such object exists anywhere in the schema, and no application code calls the route either; it's orphaned dead code, not a dormant Facebook-App-Review-blocked integration, and there is nothing to recreate on `supabase-new`. Full detail, evidence, and updated recommendations for all three in `04-data-migration-strategy.md` §2–3. | `04-data-migration-strategy.md` §8 |
| 12 | Cutover | Freeze writes on old project, final data sync, flip environment variables, redeploy, verify. | §5 below, `04-data-migration-strategy.md` §5 |
| 13 | Monitoring | Bake period with active monitoring of error rates, webhook delivery, auth success, and Realtime delivery. | §5, §6 |
| 14 | Rollback window | Old project kept paused (not deleted) for a defined period in case rollback is needed. | §6, `06-rollback-considerations.md` |

Phases 3–11 can be executed and independently verified before touching a single row of production data; nothing in Phases 2–11 requires freezing production. Only Phase 12 (Cutover) requires a write-freeze.

### Phase 2 status — complete (2026-07-23)

| Field | Value |
|---|---|
| Label | `fund4good-standalone` |
| Project reference ID | `hkvjdtbhiycqqhgelymr` |
| Project URL | `https://hkvjdtbhiycqqhgelymr.supabase.co` |
| Keys | Stored in `.env.local` (confirmed covered by `.gitignore`'s `.env*` pattern) — not recorded here, not committed anywhere |
| Created | 2026-07-23 |

**Decision: this is the final target project, not a rehearsal/staging environment.** There is no separate throwaway project in this migration — `hkvjdtbhiycqqhgelymr` is the project that goes live at cutover (Phase 12). This has two direct consequences carried through the rest of this plan:

1. **No `create_branch`-style ephemeral environment was used or should be substituted for it.** A Supabase development branch is tied to the parent project's lifecycle and billing and was explicitly rejected as insufficient for this purpose (see Phase 2 provisioning discussion) — `hkvjdtbhiycqqhgelymr` is a standalone project in its own right.
2. **Any data loaded into this project during Phases 6–8 for verification/rehearsal purposes must be truncated/reset before Phase 12 (Cutover) begins**, so real production data is never imported on top of leftover test rows. This is now an explicit required pre-cutover step — see §5's new first checklist item.

**Blocking item for Phase 3**: the current Supabase MCP connection remains pointed at production (`jnobheduodpvojwzbpra`) in read-only mode, as required for continued verification work. Deploying schema to `hkvjdtbhiycqqhgelymr` (Phase 3) requires a **new** MCP server entry (e.g. `supabase-new`) configured against this project before any `sql/001`–`011` file can be applied. Per instruction, `.mcp.json` was **not** touched in this session — that MCP entry will be added outside this session. Phase 3 does not begin until that connection exists and is confirmed.

---

## 3. Dependency Order

### Schema object creation order (confirmed against `sql/001`–`sql/011`)

```
Extensions (pgcrypto, uuid-ossp)
        │
        ▼
Tables (28, FK dependency order — see 01-schema-report.md;
        circular FK between fundraisers ↔ gofundme_sources
        resolved via a deferred ALTER TABLE, step 19b)
        │
        ▼
Foreign Keys (45 total — 44 created inline with their table,
        1 added via ALTER TABLE after gofundme_sources exists)
        │
        ▼
Functions (19, dependency-ordered — recalculate_*_rating before
        update_rating_aggregates before the 11 trigger-target functions
        before the 4 RPC-style functions before handle_new_user)
        │
        ▼
Triggers (12 — 11 on public tables, 1 on auth.users; each requires
        both its target table and its function to already exist)
        │
        ▼
RLS enable (ALTER TABLE ... ENABLE ROW LEVEL SECURITY on all 28 tables —
        done before granting table access, so there is never a moment
        where a table is grant-open with RLS off)
        │
        ▼
RLS Policies (87, applied per-table after RLS is enabled)
        │
        ▼
Views (2 — public_profiles, public_donation_activity — created after
        their underlying tables: profiles; donations + fundraisers)
        │
        ▼
Grants (table/function grants to anon/authenticated/service_role —
        applied after RLS so no table is ever open without RLS active)
        │
        ▼
Storage (7 buckets, then 14 storage.objects policies)
        │
        ▼
Realtime (add public.notifications to the supabase_realtime publication)
```

This matches `sql/001_extensions.sql` through `sql/011_realtime.sql` exactly — the numbered filenames are this graph in linear form.

### Data import order

Data import follows the same table dependency order as schema creation, with `auth.users` first (since every FK ultimately roots there) and storage objects last (since they don't block any table's row-level referential integrity):

```
auth.users (+ auth.identities, etc.)
        │
        ▼
profiles  (populated either by replaying handle_new_user's insert per
           auth.users row, or by direct data load with triggers disabled —
           see 04-data-migration-strategy.md §1)
        │
        ▼
platform_settings, homepage_categories, homepage_sponsors,
homepage_testimonials  (no dependencies beyond auth.users)
        │
        ▼
organizers
        │
        ▼
businesses
        │
        ▼
comments, follows, notifications
        (`comments.target_id` and `notifications.related_id` are both
         unenforced, polymorphic references — confirmed 2026-07-23 via a
         read-only `pg_constraint` audit against production: neither column
         has an enforced FK. Their position relative to `events`/
         `fundraisers`/`profiles` below is therefore a non-issue at the
         database level — full FK-audit detail lives in
         `04-data-migration-strategy.md` §2, not duplicated here.)
        │
        ▼
comment_likes
        (`comment_likes.comment_id` IS an enforced FK —
         `comment_likes_comment_id_fkey → comments(id)`, confirmed
         2026-07-23 — so this table must load strictly after the `comments`
         tier above, not within the same batch. Given its own step for
         that reason; this corrects an earlier draft that bundled it
         together with `comments`/`follows`/`notifications`.)
        │
        ▼
events
        │
        ▼
articles, products, eventbrite_sources, organizer_follows,
organizer_visibility_audit
        (`follows` above and `organizer_follows` here are confirmed
         distinct, genuine production tables — verified 2026-07-23 via
         `information_schema.tables`/`pg_class`. Resolved: not a typo or
         duplicate reference; no further action needed.)
        │
        ▼
fundraisers  (circular FK to gofundme_sources — load fundraisers with
              gofundme_source_id left NULL first if importing in strict
              FK order, then backfill after gofundme_sources is loaded)
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
storage objects (all 7 buckets — copied independently of table data,
                  since object bytes live outside Postgres; can happen
                  in parallel with table data import, but bucket
                  creation, per the schema order above, must precede it)
```

This is the same 28-table order documented in `01-schema-report.md`'s dependency list. It matches `04-data-migration-strategy.md` §2's "Corrected `public`-schema table load order" exactly (both updated together, 2026-07-23, following the `comment_likes`/`target_id`/`related_id` FK audit) — see that section for the full FK-audit detail; this diagram is restated here as the authoritative sequence for this plan, not a separate source of truth.

---

## 4. Configuration Checklist

| Configuration item | Automatically recreated by `sql/001`–`011`? | Must be recreated manually |
|---|---|---|
| Tables, columns, constraints, indexes | ✅ Yes (`002_tables.sql`) | — |
| Functions, triggers | ✅ Yes (`003`, `004`) | — |
| RLS policies | ✅ Yes (`005`, `006`) | — |
| Views | ✅ Yes (`007`) | — |
| Table/function grants | ✅ Yes (`008`) | — |
| Storage buckets + policies | ✅ Yes (`009`, `010`) | — |
| Realtime publication membership | ✅ Yes (`011`) | — |
| Extensions (`pgcrypto`, `uuid-ossp`) | ✅ Yes (`001`) | — |
| **Auth: redirect URLs / site URL** | No | 🔧 **Manual — Dashboard** (Authentication → URL Configuration). Set to match the application's deployment domain. |
| **Auth: email templates** — **6 total** (corrected 2026-07-23; originally undercounted as 4): Confirm signup, Invite user, Magic link/OTP, Change email address, Reset password, Reauthentication | No | ✅ **Done** — 🔧 **Manual — Dashboard** (Authentication → Email Templates). All 6 recreated/pasted on `supabase-new`, confirmed by user. Content itself has no read-back path via any available tool — verification relies on manual side-by-side comparison against production, per `08-auth-inventory.md` §3. |
| **Auth: OAuth providers — Google** (confirmed active in production: 7 identities, per `08-auth-inventory.md` §2 — not hypothetical) | No | 🔧 **Manual — Dashboard + Google Cloud Console**. Re-enter Google client ID/secret in the new project's Authentication → Providers; client secret is never retrievable from the old project via any API and must come from the Google Cloud Console credential (or be reissued). |
| **Auth: SMTP / email sending** | No | 🔧 **Manual — Dashboard**. Configure custom SMTP or confirm Supabase's default sender is acceptable; SMTP credentials are never retrievable back out once saved, per `08-auth-inventory.md` §5, and must be re-obtained from the mail provider directly. |
| **Leaked-password protection toggle** | No | 🔴 **Still open (corrected 2026-07-23)** — decision made to actively **enable** this (not just match production's old disabled state) as a deliberate security improvement; tracked in `RECOMMENDATIONS.md` item 14 (now updated). An earlier pass called `supabase-new` "confirmed enabled" based on `get_advisors` lint-absence alone — **that claim is now retracted.** Both projects are confirmed **Free plan**, and per Supabase's own docs this feature is Pro-plan-and-above only; a Supabase community discussion (`orgs/supabase/discussions/35605`) describes Free-plan projects normally showing a *persistent* lint precisely because the feature can't be enabled — which matches production (lint present, 3 checks) but not `supabase-new` (lint absent, 2 checks), making the absence look like a stored-config-flag artifact rather than proof of real enforcement. A live signup test with a known-leaked password was attempted against `supabase-new` but both it and a strong-password control timed out identically — inconclusive, blocked by this session's outbound-network restriction, not a signal either way. 🔧 **Manual — requires a genuine functional test from an unrestricted environment** (actual app, or a developer's own machine) confirming whether a leaked password is actually rejected on signup, on both projects, before this is treated as resolved anywhere. |
| **JWT / session lifetime settings** (access + refresh token TTL, rotation/reuse interval) | No | 🔧 **Manual — Dashboard** (Authentication → Sessions / Settings → API). Not previously audited; no queryable source for production's current values — read them off production's Dashboard directly, per `08-auth-inventory.md` §4. |
| **Password policy** (minimum length, character-class requirements) | No | 🔧 **Manual — Dashboard** (Authentication → Policies). Not previously audited beyond the leaked-password toggle above; per `08-auth-inventory.md` §6. |
| **MFA enablement/enforcement policy** | No | 🔧 **Manual — Dashboard** (Authentication → MFA). Production shows 0 enrolled factors (`auth.mfa_factors`), but that's adoption data, not project-level policy — zero enrollments does not prove MFA is disabled at the project level. Per `08-auth-inventory.md` §7. |
| **Anonymous sign-in toggle** | No | 🔧 **Manual — Dashboard**, low priority. Production shows 0 rows with `auth.users.is_anonymous = true`, but this doesn't confirm the toggle state either way. Per `08-auth-inventory.md` §8. |
| **Rate limiting / CAPTCHA** (hCaptcha or Turnstile on auth endpoints) | No | 🔧 **Manual — Dashboard**. Not queryable by any available tool and not previously audited at all — genuinely unknown until checked, per `08-auth-inventory.md` §11 gap #5. |
| **Stripe webhook endpoint URL** | No | ✅ Point at new project's/app's deployment URL; provision new signing secret |
| **Stripe API keys** (secret + publishable) | No | ✅ New project needs its own env vars; Stripe account itself may be unchanged |
| **Resend API key / domain verification** | No | ✅ Re-provision for the new deployment |
| **`NEXT_PUBLIC_SUPABASE_URL` / anon key / service-role key** | No | ✅ New project issues its own; update in Vercel project settings |
| **Vercel cron jobs** (`vercel.json`: `/api/cron/daily-post`, `/api/cron/promotion-engine`) | N/A — these hit the app, not the DB directly | ✅ Confirm they run against the new project once redeployed; no DB-side change needed |
| **`release_expired_seat_reservations()` scheduling** | No — this function is **not** trigger-fired and no `pg_cron` job calls it in production either | ✅ Confirm and reproduce whatever external mechanism (Vercel cron / manual) currently invokes it, if any — `02-functions-triggers-views.md` flags that this was not conclusively identified during the audit |
| **Edge Functions** | N/A | None exist in production (`list_edge_functions` returned zero functions during the audit) — nothing to migrate here |
| **Eventbrite/GoFundMe sync credentials** | No (data migrates with `eventbrite_sources`/`gofundme_sources` rows) | ✅ Confirm stored OAuth tokens remain valid post-migration (they're tied to the external platform, not the Supabase project, so should not need re-authorization, but verify) |

### 4a. Post-configuration verification (read-only, after manual Dashboard setup on `supabase-new`)

Once the manual Dashboard/Management-API/Google-Cloud-Console steps above are done on `supabase-new`, run a read-only pass against it (same tools used to build `08-auth-inventory.md`) to confirm configuration took effect. Not every item has a read-back path through the currently available tools — split accordingly:

**Confirmable via read-only tools:**

| Item | How to verify |
|---|---|
| Google OAuth actually working | After a manual test sign-in, `select provider, count(*) from auth.identities group by provider;` should show a `google` row appear on `supabase-new` (mirroring production's pattern of `email` + `google`, per `08-auth-inventory.md` §2). |
| No unintended SSO/SAML/custom-OIDC providers | `select count(*) from auth.sso_providers;`, `auth.saml_providers;`, `auth.custom_oauth_providers;` should all still read 0, matching production, unless intentionally added. |
| Leaked-password protection toggle | Re-run `get_advisors` (`type=security`) against `supabase-new` — the `auth_leaked_password_protection` lint should match whatever state was intentionally set (production is currently disabled; confirm the new project matches that decision, not a default that silently differs). |
| MFA / WebAuthn adoption baseline | `select count(*) from auth.mfa_factors;` / `auth.webauthn_credentials;` — expect 0 immediately after setup (no users have enrolled yet), useful as a pre-cutover baseline rather than proof the *policy* is correct. |
| Anonymous sign-in usage | `select count(*) from auth.users where is_anonymous;` — expect 0 pre-cutover; same caveat as MFA above (usage, not policy, confirmation). |

**NOT confirmable via any read-only tool available in this session — rely on manual double-checking against production's actual Dashboard values, side by side:**

| Item | Why it can't be read back |
|---|---|
| Redirect URLs / Site URL | No table or MCP call exposes the URL allow-list; must visually compare production's and `supabase-new`'s Dashboard pages. |
| Email template content | No table or MCP call exposes template bodies; must visually compare each of the 4 templates side by side. |
| JWT/session lifetime values | No table or MCP call exposes token TTL/rotation settings. |
| Password policy (min length/complexity) | No table or MCP call exposes this beyond the leaked-password toggle (which IS confirmable, above). |
| MFA enablement/enforcement *policy* (as opposed to adoption count) | Factor/credential counts only show usage; the underlying policy toggle isn't queryable. |
| Anonymous sign-in *toggle* (as opposed to usage) | Same distinction as MFA above. |
| Rate limiting / CAPTCHA settings | No table or MCP call exposes this at all. |
| SMTP host/from-address/credentials | No table or MCP call exposes SMTP configuration. |
| Google OAuth client ID/secret values themselves | Identity counts confirm the provider *works end-to-end*, not that the specific client ID matches production's — cross-check the client ID string manually against the Google Cloud Console. |

---

## 5. Production Cutover Checklist

Run in this order. Steps before "Freeze writes" can be prepared/rehearsed against the new project without touching production.

1. **Truncate/reset all verification-loaded data on the new project (`hkvjdtbhiycqqhgelymr`).** Because this is the final target project and not a throwaway/staging environment (see §2's Phase 2 status), any rows written during Phases 6–8 rehearsals or during the verification steps in `05-verification-checklist.md` (test signups, test uploads, test donations, etc.) must be truncated or the project reset to an empty-but-schema-complete state before proceeding to step 2. **This is a required gate, not optional cleanup** — importing real production data on top of leftover test rows risks duplicate/conflicting primary keys, phantom Stripe payment records, and test user accounts mixed into the real user base. Confirm this is done and re-run the structural half of `05-verification-checklist.md` (schema counts only, not the functional tests that require live test data) to confirm the project is still structurally complete and empty of row data before continuing.
2. **Freeze writes on the old (production) project** — maintenance-mode banner or block at the proxy/load-balancer level. Record the exact freeze timestamp.
3. **Final backup** of the old project (full `pg_dump`, plus a Storage bucket listing snapshot) taken immediately after the freeze, as a point-in-time safety net independent of the migration copy itself.
4. **Export auth** — dump `auth.users` (and related identity tables) data as of the freeze point.
5. **Export storage** — enumerate all objects across the 7 buckets as of the freeze point.
6. **Export data** — dump all 28 `public` tables' row data as of the freeze point, in the dependency order from §3.
7. **Deploy schema** to the new project — `sql/001` through `sql/011`, if not already applied and verified in Phases 3–11.
8. **Import data** — load `auth.users` first, then the 28 tables in dependency order, with triggers disabled during bulk load, then re-enabled.
9. **Import storage** — copy all object bytes into the new project's matching buckets.
10. **Update environment variables** — Supabase URL/keys, Stripe keys + webhook secret, Resend key, on the application's deployment (Vercel).
11. **Redeploy the application** against the new environment variables.
12. **Verify payments** — confirm `donations`/`ticket_orders`/`product_orders`/`businesses` payment-intent and subscription state resolves against Stripe with the new project's keys (see `07-stripe-and-payment-fields.md`).
13. **Verify donations** — confirm a test donation end-to-end (checkout → webhook → `donations` row → `fundraisers.raised`/`raised_amount` update via `trg_update_fundraiser_raised`).
14. **Verify authentication** — sign in as a migrated user (password hash carried over) and sign up as a brand-new user (confirms `handle_new_user` → `profiles` row creation).
15. **Verify uploads** — confirm file upload works against each of the 7 buckets via the app's actual upload components, and that a migrated file's public URL still resolves.
16. **Verify notifications** — confirm a `notifications` row insert is delivered to a subscribed client over Realtime (the one table in the `supabase_realtime` publication).
17. **Smoke tests** — walk the golden paths: browse events/fundraisers, create a fundraiser, purchase a ticket, post a comment, submit a review, follow an organizer.
18. **Monitor logs** — watch application error rates, Supabase logs, and Stripe webhook delivery status for an initial bake window (recommend at least 24–48 hours of close monitoring within the larger bake period from Phase 14).
19. **Keep the old project online (paused, not deleted)** for the rollback window defined in `06-rollback-considerations.md`.

Full structural and functional verification detail (exact SQL checks, expected counts) lives in `05-verification-checklist.md` — run that in full before step 10 above (updating environment variables), not just the summary items 12–17 here.

---

## 6. Rollback Plan

If cutover needs to be reversed before the old project is decommissioned:

1. **Restore environment variables** — revert the application's deployment (Vercel) environment variables (`NEXT_PUBLIC_SUPABASE_URL`, Supabase anon/service-role keys, Stripe keys) back to the old project's values.
2. **Restore the Stripe webhook** — point Stripe's webhook endpoint configuration back at the old project's endpoint (or the app's original webhook URL, if the endpoint path didn't change but the backend behind it did).
3. **Point the application back to the original Supabase project** — this is accomplished entirely by step 1; no code change is required if the migration didn't alter application code (per scope, it did not).
4. **Redeploy** the application with the restored environment variables.
5. **Resume the old project** — unpause it if it had been paused during the bake period.
6. **Validate after rollback**:
   - Confirm authentication works against the old project again.
   - Confirm a test read (e.g. homepage load) and a test write (e.g. a throwaway comment, deleted after) succeed.
   - Confirm the Stripe webhook is delivering to the restored endpoint (check Stripe Dashboard's webhook delivery log for successful 200s).
   - Reconcile any writes that landed on the **new** project during the failed cutover window against the old project — per `06-rollback-considerations.md`, this is a manual replay step if any real user data was written post-cutover; there is no automatic forward-sync.

This procedure assumes rollback happens within the bake window before old-project data has meaningfully diverged from new-project data (see `06-rollback-considerations.md` for the full discussion of when rollback stops being "free").

---

## 7. Golden Reference

All counts below were re-verified directly against production via read-only Supabase MCP queries (`pg_constraint`, `pg_indexes`, `pg_class`, `pg_proc`, `pg_trigger`, `pg_policies`, `storage.buckets`, `pg_publication_tables`) on 2026-07-23, immediately before writing this document, to ensure this table is exact rather than carried forward from an earlier summary.

| Object type | Count | Source |
|---|---|---|
| Application tables (`public`, base tables) | **28** | `pg_class` where `relkind='r'` |
| Views | **2** | `pg_class` where `relkind='v'` |
| Functions | **19** | `pg_proc` in `public` |
| RPC functions (directly callable via `/rest/v1/rpc/...`) | **19** | Same 19 — all have `EXECUTE` granted to `anon`/`authenticated`/`service_role` per production's default-privilege grants (see `03-rls-storage-roles-realtime.md`) |
| Triggers on `public` tables | **11** | `pg_trigger` joined to `public` tables, excluding internal triggers |
| Triggers on `auth.users` | **1** | `pg_trigger` on `auth.users`, excluding internal triggers |
| **Total triggers** | **12** | Sum of the two above |
| RLS policies (`public` schema) | **87** | `pg_policies` where `schemaname='public'` |
| Storage buckets | **7** | `storage.buckets` |
| Storage policies (`storage.objects`) | **14** | `pg_policies` where `schemaname='storage' and tablename='objects'` |
| Realtime publication tables (`supabase_realtime`) | **1** (`public.notifications`) | `pg_publication_tables` |
| Foreign keys (`public` schema) | **45** | `pg_constraint` where `contype='f'` |
| Primary keys | **28** | `pg_constraint` where `contype='p'` (one per table) |
| Unique constraints (named, `contype='u'`) | **13** | `pg_constraint` where `contype='u'` |
| Check constraints | **54** | `pg_constraint` where `contype='c'` |
| Total indexes (`public` schema) | **104** | `pg_indexes` where `schemaname='public'` (includes indexes backing PKs/unique constraints plus standalone indexes, e.g. partial and unique-via-index cases documented in `01-schema-report.md`) |
| Enums | **0** | Confirmed — no `pg_type` rows with `typtype='e'` in `public` |
| Sequences | **0** | Confirmed — no identity/serial columns anywhere |
| Edge Functions | **0** | `list_edge_functions` returned an empty list |

**Note on unique constraints vs. unique indexes**: 13 is the count of named `UNIQUE` table constraints. Several additional columns are unique-enforced via a plain `CREATE UNIQUE INDEX` instead of a table constraint (e.g. `comments_payment_intent_id_key`, `idx_organizers_slug`, `idx_ticket_orders_payment_intent`, `fundraisers_gofundme_source_id_key`, `events_eventbrite_event_id_key`, and 4 partial unique indexes on `reviews`) — these are captured in the **104 total indexes** figure, not the 13-constraint figure. `sql/002_tables.sql` reproduces each one using the same object type (constraint vs. index) as production, corrected during this verification pass where an earlier draft had miscategorized `comments_payment_intent_id_key` as a constraint instead of a plain index.

---

## 8. Verification Matrix

Run this against the new project **after** Phase 3 (schema deployment) and **before** Phase 6 (data import) — it confirms the empty schema is structurally complete before any production data is loaded into it. Re-run relevant rows after data import per `05-verification-checklist.md`'s data-integrity section.

| Object Type | Expected Count | How to Verify | Status |
|---|---|---|---|
| Application tables | 28 | `select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';` | ✅ 28 |
| Views | 2 | `select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='v';` | ✅ 2 |
| Functions | 19 | `select count(*) from pg_proc where pronamespace='public'::regnamespace;` | ✅ 20 (expected-with-known-platform-addition — see note below) |
| Triggers on `public` tables | 11 | `select count(*) from pg_trigger t join pg_class c on t.tgrelid=c.oid where c.relnamespace='public'::regnamespace and not t.tgisinternal;` | ✅ 11 |
| Trigger on `auth.users` | 1 | `select count(*) from pg_trigger t join pg_class c on t.tgrelid=c.oid join pg_namespace n on c.relnamespace=n.oid where n.nspname='auth' and c.relname='users' and not t.tgisinternal;` | ✅ 1 |
| RLS policies (`public`) | 87 | `select count(*) from pg_policies where schemaname='public';` | ✅ 87 |
| Storage buckets | 7 | `select count(*) from storage.buckets;` | ✅ 7 |
| Storage policies (`storage.objects`) | 14 | `select count(*) from pg_policies where schemaname='storage' and tablename='objects';` | ✅ 14 |
| Realtime publication tables | 1 | `select count(*) from pg_publication_tables where pubname='supabase_realtime';` | ✅ 1 |
| Foreign keys | 45 | `select count(*) from pg_constraint where connamespace='public'::regnamespace and contype='f';` | ✅ 45 |
| Primary keys | 28 | `select count(*) from pg_constraint where connamespace='public'::regnamespace and contype='p';` | ✅ 28 |
| Unique constraints | 13 | `select count(*) from pg_constraint where connamespace='public'::regnamespace and contype='u';` | ✅ 13 |
| Check constraints | 54 | `select count(*) from pg_constraint where connamespace='public'::regnamespace and contype='c';` | ✅ 54 |
| Total indexes | 104 | `select count(*) from pg_indexes where schemaname='public';` | ✅ 104 |
| Enums | 0 | `select count(*) from pg_type where typtype='e' and typnamespace='public'::regnamespace;` | ✅ 0 |
| Sequences | 0 | `select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='S';` | ✅ 0 |
| Row Security enabled on all 28 tables | 28 | `select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity=true;` | ✅ 28 |
| Extensions installed | ≥2 (`pgcrypto`, `uuid-ossp`) | `select extname from pg_extension where extname in ('pgcrypto','uuid-ossp');` → 2 rows | ✅ 2 |
| Circular FK closed | 1 | `select count(*) from pg_constraint where conname='fundraisers_gofundme_source_id_fkey';` → 1 | ✅ 1 |
| Edge Functions | 0 | `list_edge_functions` MCP call → empty list | ☐ not yet checked |

**Status** column: mark ☐ → ✅ as each check is run against the new project; leave ✅ counts unchanged from this table (they are the fixed reference) and only mark divergences as failures requiring investigation before proceeding to data import.

**Functions count — resolved and directly confirmed (2026-07-23, corrected from an earlier inferred explanation)**: `pg_proc` in `public` shows 20 functions, not 19. Querying `pg_proc` by name (`select proname from pg_proc where pronamespace = 'public'::regnamespace order by proname;`) confirms all 19 audited names from `sql/003_functions.sql` are present verbatim, plus exactly one extra: `rls_auto_enable`. This is not a rename or duplicate of any expected function — it's a genuinely separate 20th object.

Directly queried `pg_event_trigger` on `supabase-new` (not inferred from the Dashboard):
```
evtname            | evtenabled | evtevent         | function
--------------------+------------+------------------+------------------
issue_graphql_placeholder | O    | sql_drop         | set_graphql_placeholder
pgrst_ddl_watch     | O          | ddl_command_end  | pgrst_ddl_watch
pgrst_drop_watch    | O          | sql_drop         | pgrst_drop_watch
issue_pg_cron_access| O          | ddl_command_end  | grant_pg_cron_access
issue_pg_net_access | O          | ddl_command_end  | grant_pg_net_access
issue_pg_graphql_access | O      | ddl_command_end  | grant_pg_graphql_access
ensure_rls          | O          | ddl_command_end  | rls_auto_enable
```
This confirms: the event trigger is named **`ensure_rls`** (the 20th *function*, `rls_auto_enable`, is what it calls — the trigger and the function are two different named objects), it fires on `ddl_command_end`, and `evtenabled = 'O'` means it is **enabled** (origin-session mode, Postgres's normal enabled state) — not merely present-but-disabled.

**Production comparison (read-only, `jnobheduodpvojwzbpra`)**: the same query against production returns only 6 event triggers — `issue_graphql_placeholder`, `pgrst_ddl_watch`, `pgrst_drop_watch`, `issue_pg_cron_access`, `issue_pg_net_access`, `issue_pg_graphql_access` — all standard Supabase platform scaffolding, all also present on `supabase-new`. **`ensure_rls`/`rls_auto_enable` does not exist on production at all.** This corrects the earlier wording ("a newer Supabase project-provisioning default") from an assumption into a confirmed fact: it is present only on the newer `supabase-new` project, not retroactively on production — consistent with Supabase having started including this auto-RLS-enable trigger on new project creation sometime after production (`jnobheduodpvojwzbpra`) was originally provisioned.

**Dashboard banner discrepancy (noted, not acted on)**: `supabase-new`'s Policies page reportedly still shows a banner — "Automatically enable Row Level Security (RLS) on new tables — Set up trigger" — which reads as an offer to set up a trigger that, per the query above, already exists and is already enabled. This is a genuine inconsistency between the Dashboard's own detection and the database catalog; it isn't clear whether the Dashboard checks for a different/differently-named object or is just a generic prompt not tied to actual detection. Left as-is per instruction — no action taken.

**Decision: KEEP `rls_auto_enable`/`ensure_rls`.** Rationale unchanged and now on firmer evidence: it is additive safety only — all 28 tables already have RLS enabled via `005_enable_rls.sql`, so it has not altered anything this migration deployed, and it only affects tables created after this point. Dropping platform-owned objects would mean fighting Supabase's own project scaffolding purely to match production's function count exactly, with zero functional upside — doubly so now that it's confirmed to be a newer per-project default rather than something the migration itself introduced. The Functions row above is marked ✅ 20 (expected-with-known-platform-addition) rather than a failure. No SQL was written to remove it.
