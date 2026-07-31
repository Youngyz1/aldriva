# Production Database Migration Blueprint

Read-only production database audit for migrating the fundraising platform into a brand-new standalone Supabase project. Performed 2026-07-23 via the Supabase MCP server in read-only mode against the live production database (project `jnobheduodpvojwzbpra`) — **no DDL was executed against production at any point**, and this audit treated the live database, not the repository's `db/migration_NN_*.sql` files, as the source of truth throughout.

**Scope: reproduce production accurately.** The migration artifacts here (`sql/001`–`sql/011`) preserve current production behavior exactly, including RLS policies, function/view security modes, storage configuration, and grants — no behavior changes are baked into the deployment scripts. Every observation made during the audit that amounts to a *suggested change* (a tighter RLS policy, a search_path fix, a storage limit, etc.) is instead recorded in **[RECOMMENDATIONS.md](RECOMMENDATIONS.md)**, kept deliberately separate from the migration path. Adopt any of those later, as its own change, after the migration is verified — not as part of cutover.

## Start here

**[MIGRATION_MASTER_PLAN.md](MIGRATION_MASTER_PLAN.md)** is the single execution-order runbook tying together every document below: executive summary, numbered migration phases, the full dependency graph (schema + data), a configuration checklist (automatic vs. manual), a chronological cutover checklist, the rollback procedure, a verified Golden Reference count table, and a verification matrix to run against the new project before data import. Read that first; the documents below are its supporting detail.

## Contents

| Document | Covers |
|---|---|
| [MIGRATION_MASTER_PLAN.md](MIGRATION_MASTER_PLAN.md) | The master runbook — phases, dependency order, configuration checklist, cutover checklist, rollback plan, Golden Reference, verification matrix |
| [01-schema-report.md](01-schema-report.md) | All 28 tables, dependency order, enums (none), sequences (none), extensions, RLS status, notable irregularities (documented for awareness, reproduced as-is) |
| [02-functions-triggers-views.md](02-functions-triggers-views.md) | 19 functions, 12 triggers (incl. the critical `auth.users` → `profiles` trigger), 2 views, deployment order |
| [03-rls-storage-roles-realtime.md](03-rls-storage-roles-realtime.md) | 87 RLS policies, 7 storage buckets + 14 storage policies, roles/grants, Realtime publication, full security-advisor findings |
| [04-data-migration-strategy.md](04-data-migration-strategy.md) | `auth.users` migration, table data load order, storage object transfer, webhook re-pointing, cutover sequencing |
| [05-verification-checklist.md](05-verification-checklist.md) | Structural + functional checks to run against the new project, before and after data load |
| [06-rollback-considerations.md](06-rollback-considerations.md) | Rollback strategy and sequencing |
| [07-stripe-and-payment-fields.md](07-stripe-and-payment-fields.md) | Stripe/crypto payment columns across `donations`, `ticket_orders`, `product_orders`, `businesses`, `products` — there is no dedicated payments table, only columns |
| [RECOMMENDATIONS.md](RECOMMENDATIONS.md) | **Not part of the migration.** RLS/storage/function observations and optional, separately-applied follow-ups |
| [sql/](sql/) | Executable migration scripts, numbered in deployment order (see below) — reproduce production exactly, no hardening included |

## SQL deployment order

```
001_extensions.sql       -- pgcrypto, uuid-ossp
002_tables.sql            -- all 28 tables, in FK dependency order (circular FK resolved via step 19b)
003_functions.sql         -- all 19 functions, dependency-ordered, verbatim from production
004_triggers.sql          -- all 12 triggers, including on_auth_user_created on auth.users
005_enable_rls.sql        -- ALTER TABLE ... ENABLE ROW LEVEL SECURITY, all 28 tables
006_rls_policies.sql      -- all 87 policies, verbatim from production
007_views.sql             -- public_donation_activity, public_profiles, verbatim from production
008_grants.sql            -- table/function grants (mostly automatic in a real Supabase project)
009_storage_buckets.sql   -- 7 buckets, verbatim from production (no size/MIME limits, matching prod)
010_storage_policies.sql  -- 14 storage.objects policies, verbatim from production
011_realtime.sql          -- adds notifications to supabase_realtime publication
```

Then proceed to data migration per `04-data-migration-strategy.md` (including the Stripe/crypto-specific steps in `07-stripe-and-payment-fields.md`), and verify per `05-verification-checklist.md`.

## Headline numbers

- **28** application tables, **0** enums, **0** sequences (every PK is `uuid default gen_random_uuid()`)
- **19** functions, **12** triggers, **2** views
- **87** RLS policies across 24 tables (4 tables — `comment_likes`, `seats`, `ticket_orders`, `venue_layouts` — intentionally have none, matching production)
- **7** storage buckets, **14** storage policies
- **1** table (`notifications`) in the Realtime publication
- **1** circular FK pair (`fundraisers` ↔ `gofundme_sources`), resolved via deferred `ALTER TABLE`
- **No dedicated Stripe/payment table** — payment state lives in columns on 5 tables (`donations`, `ticket_orders`, `product_orders`, `businesses`, `products`), fully inventoried in `07-stripe-and-payment-fields.md`
- **39** security-advisor findings on the live project, all reproduced by design (they reflect current production behavior); see `RECOMMENDATIONS.md` if any are ever worth changing, separately from this migration
