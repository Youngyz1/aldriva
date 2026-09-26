# Stage 7 — Staging Provisioning Runbook
## HUMAN-EXECUTED checklist. No agent provisioning. Secrets are named, never printed.

> Scope: turn the Stage 7 implementation (committed) into a live nightly
> QA signal. Every name below was cross-checked against committed code on
> 2026-09-26. Steps marked [VERIFY] have a concrete check — do not skip
> them; the pipeline fails silent (not loud) when they are wrong.

---

## PART A — Payment safety claim: VERDICT (checked first, per prompt)

**Spec under review**: `e2e/fundraiser-donate.spec.ts` donates $5 with Stripe
test card `4242424242424242` (expiry 12/30, any CVC).

**What Stripe's own docs actually say** (`https://docs.stripe.com/testing`,
"How to use test cards"): *"When you work with a test card, use test API
keys in all API calls."* The docs do **not** state a hard guarantee of the
form "test PANs are declined under live keys with error X." What they do
establish: (a) test cards are documented only for use with test keys;
(b) the Services Agreement prohibits live-mode testing with *real* payment
details (ours aren't real); (c) `4242…` authenticates successfully only in
test mode (it is the "Visa / successful payment" row, not a decline-
simulation row).

**Honest engineering reading**: a charge under live keys is not a
credible outcome — `4242424242424242` is not a real routable PAN, there is
no issuer to authorize against, and Stripe API-side validation rejects
test PANs presented on live keys (the PaymentMethod create fails; no
PaymentIntent can confirm). Direction of failure is safe (error, no
charge). **But**: because Stripe documents the *requirement* (test keys
with test cards) rather than the *live-mode failure mode*, this is a
two-layer safety argument (non-routable PAN + API validation), not a
single cited hard-decline guarantee.

**Recommendation (adopted for the runbook): reinstate a verifiable
pre-flight check instead of relying on the card alone.** The worker CAN
verify test mode from the browser, because the publishable key is inlined
into the client bundle at build time
(`components/payments/StripeProvider.tsx:21-22` —
`loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)`) and the
PaymentElement posts card data to `https://api.stripe.com` carrying
`key=pk_…`. Pre-flight (add to the donate spec before submit): listen for
the Stripe collect request and assert the key starts with `pk_test`,
aborting the run otherwise:

```ts
// Pre-flight: prove the target is in Stripe test mode before paying.
const keyPromise = page.waitForRequest(
  (req) => req.url().startsWith('https://api.stripe.com/v1/payment_methods'),
  { timeout: 20_000 }
);
// ... fill amount + donor fields (this triggers Elements setup) ...
const keyReq = await keyPromise;
const key = new URL(keyReq.url()).searchParams.get('key') ?? '';
expect(key.startsWith('pk_test')).toBe(true); // hard fail otherwise — never pay on live keys
```

Status: **implemented** (`e2e/fundraiser-donate.spec.ts` — pre-flight captures
the first `https://api.stripe.com/v1/*` request from Stripe.js v9 Elements
setup, extracts `key` from query or form body, hard-asserts `^pk_test`
before the Donate button is ever clicked; timeout and mismatch both fail
loudly). Verified: compiles, lints, collects (3 tests); negative semantics
proven (pk_live/null/empty all reject).
Until then, staging isolation (separate project, §below) is the primary
control and the test-card property is defense-in-depth. Do NOT soften
this: if anyone proposes pointing the suite at an environment whose
Stripe mode cannot be proven test, stop — the pre-flight must land first.

---

## PART B — Provisioning runbook

### B.0 Env-name cross-check (read this before setting anything)

Exact names the committed code reads (nothing approximate):

| Name | Read by (committed file) | Kind |
|---|---|---|
| `ALDRIVA_BASE_URL` | `.github/workflows/qa-sweep.yml`, `scripts/qa-ingest.mjs` (control-plane origin for poll + ingest) | URL, no secret |
| `QA_INGEST_TOKEN` | `app/api/qa/poll/route.ts`, `app/api/qa/ingest/route.ts` (via `isAuthorizedPollRequest`), workflow (Bearer) | **secret**, mint fresh |
| `QA_INGEST_TOKEN_PREV` | same routes (rotation overlap) | secret, optional until first rotation |
| `QA_STAGING_URL` | `playwright.config.ts` (throws if unset), workflow (target origin) | URL |
| `QA_TEST_EMAIL` / `QA_TEST_PASSWORD` | `e2e/auth-login.spec.ts`, workflow env | staging-only creds |
| `QA_SEED_FUNDRAISER_SLUG` | `e2e/fundraiser-donate.spec.ts`, workflow env | staging data ref |
| `QA_SHADOW_MODE` | `app/api/qa/ingest/route.ts` (`isShadowMode`: anything but `'false'` = shadow ON) | flag, default ON |
| `QA_RUN_ID` / `QA_CLAIM_TOKEN` | `scripts/qa-ingest.mjs` (set by the workflow at runtime from the claim response, never human-set) | ephemeral |

**Flagged mismatch**: your `.env.local` holds `STAGING_SUPABASE_URL`,
`STAGING_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`,
`STAGING_DATABASE_URL`. **None of these four names appears anywhere in
committed code** (verified by grep over workflows, scripts, routes,
`lib/qa`). They are inert as written — the worker never reads them, and
the app never reads `STAGING_*` either (it reads production-named vars:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, …). What those
four values *are* good for: copy-pasting into the **staging Vercel
deployment's environment** under the standard production names (B.3).
Do not rename code to match them; do not add code that reads them.

### B.1 Where each secret lives (grouped by location)

**GitHub repo → Settings → Secrets and variables → Actions** (worker side):
`ALDRIVA_BASE_URL`, `QA_INGEST_TOKEN`, `QA_STAGING_URL`, `QA_TEST_EMAIL`,
`QA_TEST_PASSWORD`, `QA_SEED_FUNDRAISER_SLUG`. Never commit these; the
workflow references `${{ secrets.… }}` only.

**Vercel → staging deployment → Environment Variables** (control plane):
`QA_INGEST_TOKEN` (same value as GitHub), `QA_SHADOW_MODE=true`
(initially), plus the full standard app env pointed at staging
(`NEXT_PUBLIC_SUPABASE_URL` = staging URL, anon/service-role = staging
keys, `STRIPE_SECRET_KEY` = `sk_test_…`, publishable = `pk_test_…`,
`CRON_SECRET`, etc.). `QA_INGEST_TOKEN_PREV` only during rotations.

**Supabase staging project** (data plane): no QA-specific settings; the
migration + seed below are the setup. Stripe stays in **test mode** —
if the dashboard toggle ever shows live mode, stop (see Part A).

**Hygiene (non-negotiable)**: mint `QA_INGEST_TOKEN` with
`openssl rand -hex 32`; never reuse `CRON_SECRET`; never print values
into issues/logs; rotate via PREV overlap (set PREV=old, TOKEN=new,
redeploy both sides, wait 24h, clear PREV).

### B.2 Create the staging Supabase project

#### B.2 step 1 — Create the project

New project `aldriva-staging` (any region close to prod). Record URL,
anon key, service-role key, DB URL into a password manager (these
become the values mapped in B.1/B.3 — not into `.env.local`).

---

### B.2-preamble — Full migration replay on a blank database

> **Why this section exists**: migration 145 failed with
> _"relation organizers does not exist"_ because the original B.2 wording
> assumed an existing database. A brand-new Supabase project has **zero
> tables**. All migrations from 01 through 145 must be applied in order.

#### B.2-preamble.1 — Required PostgreSQL extensions (enable before migration 01)

All Supabase projects ship with `gen_random_uuid()` available as a
built-in Postgres 13+ function — **no extension needed for UUID
generation**. However, verify the following before running the first
migration:

| Extension | Required by | Status on fresh Supabase project |
|---|---|---|
| `pg_trgm` | `migration_141_knowledge_foundation.sql` (line 8: `CREATE EXTENSION IF NOT EXISTS pg_trgm`) | **Must be enabled**. The migration includes the `CREATE EXTENSION IF NOT EXISTS` guard, so it is safe, but Supabase projects require the extension to already be available in the system. It is pre-installed on all Supabase Postgres instances but disabled by default — enable it in the Supabase Dashboard → Database → Extensions before running migration 141, **or** rely on the `IF NOT EXISTS` guard in migration 141 itself (safe on current Supabase versions). |
| `pgcrypto` | Not explicitly required by any migration (no `gen_random_bytes` / `crypt` calls found in the migration chain). | No action needed. |
| `uuid-ossp` | Not required — all UUIDs use `gen_random_uuid()` (built-in since Postgres 13). | No action needed. |

**Confirmed**: only `pg_trgm` is a potential blocker; all other UUID and
crypto primitives are available by default on Supabase.

#### B.2-preamble.2 — What schema.sql represents vs. numbered migrations

`db/schema.sql` is a snapshot taken after `migration_28_articles_phase1.sql`. It establishes
the baseline table definitions (`profiles`, `organizers`, `events`, `fundraisers`, `tickets`,
`venue_layouts`, `seats`, `articles`, `comments`, `donations`, `reviews`, `homepage_categories`,
`homepage_sponsors`, `homepage_testimonials`, `organizer_follows`, `organizer_visibility_audit`,
`platform_settings`, `eventbrite_sources`, `gofundme_sources`), and incorporates all changes
introduced by migrations 01 through 28 (including the post-refactor shape of `fundraiser_media`
with `position` and `url`).

> **Schema Hygiene Note**: `db/schema.sql` previously contained a manually-appended
> `homepage_promotions` definition (added 2026-09-24) lacking primary and foreign keys. This block
> was removed to restore `schema.sql` to its clean baseline through migration 28, allowing
> `migration_134_homepage_promotions.sql` to be the sole, authoritative creator of `homepage_promotions`
> with complete PK/FK/trigger/RLS integrity.

> **Crucial Rule**: Do **NOT** run migrations 01 through 28 on top of `schema.sql`.
> Doing so will fail (e.g. migration 09 references the legacy `sort_order` column that
> migration 26 superseded and that `schema.sql` does not have).

**Apply order for a blank database**:
1. `db/schema.sql` ← bootstraps base schema & captures migrations 01 through 28
2. `db/migration_29_donations_comments_rls.sql` through `db/migration_145_qa_execution.sql` in numerical order (121 migration files)

#### B.2-preamble.3 — Supabase CLI status

The repo has a `supabase/` directory with a linked project (`supabase/.temp/linked-project.json` pointing to `fund4good-production`). **The `supabase/migrations/` directory is a partial mirror only** — it covers migrations 75 through 145 but is **missing migrations 01–74 and several others** (01–74, 88–99, 100, 108–115, 125–126, 128–129, and others). It is therefore **not safe to use `supabase db push` for a blank staging database** — this command would attempt to apply only the migrations tracked in `supabase/migrations/` and would fail immediately because the base schema and migrations 29–74 are absent.

**Safe options**:

| Option | Command | Prerequisite |
|---|---|---|
| **psql one-shot (recommended)** | Concatenate via `staging-migration-order.txt` → single `psql` run (see B.2-preamble.4a) | `psql` client installed; `STAGING_DATABASE_URL` set |
| **SQL editor (fallback)** | Paste each file manually in order (see B.2-preamble.4) | None; works with any Supabase project |
| **Supabase CLI against staging** | Would require first copying all `db/migration_*.sql` files into `supabase/migrations/` with correct timestamps, then `supabase db push --db-url <staging-url>`. This is a significant rework of the migration tracking setup and is **not currently supported as-is**. | Requires migration registry rebuild — out of scope for this runbook |

Use the psql one-shot path (B.2-preamble.4a) if `psql` is available; fall back to the SQL editor otherwise.

#### B.2-preamble.4 — Complete ordered migration file list (blank DB → migration 145)

Apply in this exact order. All files are in `db/`. All forward-migration
files use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, and
`DROP POLICY IF EXISTS` / `DROP TRIGGER IF EXISTS` patterns — they are
**idempotent and safe to re-run** if a paste partially fails, with the
exceptions noted below.

**Step 0 — Base schema (run first, captures baseline through migration 28):**

```
db/schema.sql
```

**Step 1 — Incremental migrations (run in this exact order, 29 → 145):**

```
db/migration_29_donations_comments_rls.sql
db/migration_30_public_profiles_and_donor_user_ids.sql
db/migration_31_backfill_profile_visibility_default.sql
db/migration_32_donation_activity.sql
db/migration_33_backfill_donation_comment_user_ids.sql
db/migration_34_follows_table.sql
db/migration_35_articles_fixes.sql
db/migration_36_business_listings.sql
db/migration_37_products.sql
db/migration_38_content_approval_workflow.sql
db/migration_39_add_profile_deleted_at.sql
db/migration_40_total_raised_fn.sql
db/migration_41_fundraiser_approval.sql
db/migration_42_import_markers.sql
db/migration_43_comment_likes.sql
db/migration_44_notifications.sql
db/migration_45_fix_comments_payment_intent_index.sql
db/migration_46_eventbrite_source_columns.sql
db/migration_47_gofundme_source_columns.sql
db/migration_48_organization_system.sql
db/migration_49_fix_slugs.sql
db/migration_50_beneficiary.sql
db/migration_51_beneficiary_accounts.sql
db/migration_52_beneficiary_column_grants.sql
db/migration_53_security_hardening.sql
db/migration_54_rate_limits.sql
db/migration_55_beneficiary_claim_token_grants.sql
db/migration_56_beneficiary_public_profile.sql
db/migration_57_pending_deletion_status.sql
db/migration_58_business_entity_link.sql
db/migration_59_entity_members.sql
db/migration_60_identity_verification.sql
db/migration_61_organizer_capability_tiers.sql
db/migration_62_entity_permissions.sql
db/migration_63_articles_entity_permissions.sql
db/migration_64_fundraising_approval_gate.sql
db/migration_65_events_insert_ownership_gate.sql
⚠️  NOTE: migration_66 does NOT exist — skip from 65 directly to 67.
db/migration_67_backfill_orphaned_organizer_ids.sql
db/migration_68_relax_fundraising_approval_requirement.sql
db/migration_69_payment_reconciliation_failures.sql
db/migration_70_recipients.sql
db/migration_71_recipient_ledger_entries.sql
db/migration_72_ledger_credit_rpcs.sql
db/migration_73_payouts_and_balance_rpcs.sql
db/migration_74_article_audio.sql
db/migration_75_check_in_ticket_rpc.sql
db/migration_76_event_team_and_invitations.sql
db/migration_77_ticket_checkins_audit.sql
db/migration_78_fix_check_in_ticket_overload.sql
db/migration_79_ticket_instances.sql
db/migration_79b_ticket_checkins_unique_idx.sql
db/migration_79c_fix_checkins_constraint.sql
db/migration_79d_fix_check_in_ticket_rpc.sql
db/migration_80_multi_ticket_instances.sql
db/migration_80b_multi_ticket_instances.sql
db/migration_80c_multi_tier_instances.sql
db/migration_80d_drop_overloaded_rpc.sql
db/migration_80e_checkins_order_id_index.sql
⚠️  NOTE: migration_81 does NOT exist — skip from 80e directly to 82.
db/migration_82_organizer_verification_storage.sql
db/migration_83_organizer_verification_submissions.sql
db/migration_84_organizer_status_audit.sql
db/migration_85_fix_organizer_verification_storage_rls.sql
db/migration_86_storage_bucket_limits.sql
db/migration_87_user_identity_verifications.sql
db/migration_88_aldriva_ai.sql
db/migration_89_ai_guard_rejections.sql
db/migration_90_ai_content_calendar.sql
db/migration_91_alter_ai_conversations_provider_default.sql
db/migration_92_event_invitations_and_ticket_instances.sql
db/migration_93_extended_seating.sql
db/migration_94_platform_content_type.sql
db/migration_95_aldriva_platform_knowledge.sql
db/migration_96_ticket_insert_ownership_gate.sql
db/migration_97_follows_read_restriction.sql
db/migration_98_svg_seating_engine.sql
db/migration_99_guest_import_and_lifecycle.sql
db/migration_100_event_operations_and_audit.sql
db/migration_101_p0_rls_enforcement.sql
db/migration_102_event_banner_uploads.sql
db/migration_103_organizer_grant_least_privilege.sql
db/migration_104_signup_guard_function_hardening.sql
db/migration_105_trigger_service_role_gate.sql
db/migration_106_storage_bucket_upload_posture.sql
db/migration_107_handle_new_user_revoke_public_execute.sql
db/migration_108_connected_accounts.sql
db/migration_109_channel_assets.sql
db/migration_110_customer_identities.sql
db/migration_111_conversations_messages.sql
db/migration_112_ai_provider_configs.sql
db/migration_113_ai_tool_invocations.sql
db/migration_114_notification_preferences.sql
db/migration_115_conversation_link_integrity.sql
db/migration_116_shop_digital_products.sql
db/migration_117_cms_media_storage.sql
db/migration_118_multi_seat_instances.sql
db/migration_119_event_ticket_template.sql
db/migration_120_invitation_templates.sql
db/migration_121_update_invitation_artwork.sql
db/migration_122_offline_scanner_support.sql
⚠️  NOTE: migration_123 does NOT exist — skip from 122 directly to 124.
db/migration_124_offline_sync_and_conflicts.sql
db/migration_125_tenant_websites.sql
db/migration_126_website_delete_rls_fix.sql
db/migration_127_ensure_business_organizer_security_definer.sql
db/migration_128_website_draft_blocks_and_dec0016_status.sql
db/migration_129_website_page_drafts_and_publishing_guard.sql
db/migration_130_website_category_and_metadata.sql
db/migration_131_website_atomic_creation.sql
db/migration_132_business_type_and_branches.sql
db/migration_133_add_event_subcategory.sql
db/migration_134_homepage_promotions.sql
db/migration_135_profile_locale.sql
db/migration_136_services_and_menus.sql
db/migration_137_business_moderation_guard_and_screening.sql
db/migration_138_business_moderation_resubmit_and_organizer_guard.sql
db/migration_139_tool_registry.sql
db/migration_140_agent_registry.sql
db/migration_141_knowledge_foundation.sql
db/migration_142_agent_runtime.sql
db/migration_143_sentinel_events.sql
db/migration_144_sentinel_events_fixes.sql
db/migration_145_qa_execution.sql
```

**Total**: 1 base schema file (`schema.sql`) + 121 incremental migration files (migrations 29 through 145) = **122 files total**.
(Gaps at 66, 81, 123 — these numbers were intentionally skipped in the repository history).

#### B.2-preamble.4a — psql one-shot: generate and apply the full schema in a single transaction

Rather than pasting files one by one in the SQL editor, you can concatenate the
entire chain into a single SQL file and apply it atomically with `psql`. The file
`db/staging-migration-order.txt` contains the exact ordered list of 122 files (verified on disk —
all 122 files present as of 2026-09-26).

**Step 1 — Concatenate all files into one SQL script (run from repo root):**

> **Transaction Stripping Requirement**: Many individual migration files contain explicit `BEGIN;` and
> `COMMIT;` statements. When running `psql --single-transaction`, an internal `COMMIT;` prematurely
> commits the outer transaction, breaking the atomic rollback guarantee if a later migration fails.
> The concatenation commands below automatically neutralize standalone `BEGIN;`, `COMMIT;`, and
> `ROLLBACK;` lines (`-- [stripped-for-single-tx]`) so `psql --single-transaction` controls atomicity
> across the entire 122-file chain.

```powershell
# On Windows (PowerShell) — run from repo root
$out = [System.IO.StreamWriter]::new("$env:TEMP\full-staging-schema.sql", $false, [System.Text.Encoding]::UTF8)
Get-Content "db\staging-migration-order.txt" | ForEach-Object {
    $file = $_.Trim()
    if (-not $file) { return }
    $out.WriteLine("-- >>> $file <<<")
    $content = [System.IO.File]::ReadAllText("db\$file")
    # Neutralize standalone transaction control lines so --single-transaction stays strictly atomic
    $cleaned = [regex]::Replace($content, '(?mi)^[ \t]*(BEGIN|COMMIT|ROLLBACK)([ \t]+TRANSACTION)?[ \t]*;[ \t]*\r?$', '-- [stripped-for-single-tx] $&')
    $out.Write($cleaned)
    $out.WriteLine()
}
$out.Close()
```

```bash
# On Linux/macOS
cd db && while IFS= read -r f; do
  [ -z "$f" ] && continue
  echo "-- >>> $f <<<"
  sed -E 's/^[[:space:]]*(BEGIN|COMMIT|ROLLBACK)([[:space:]]+TRANSACTION)?[[:space:]]*;[[:space:]]*$/-- [stripped-for-single-tx] \0/I' "$f"
  echo
done < staging-migration-order.txt > /tmp/full-staging-schema.sql && cd ..
```

**Step 2 — Apply to staging in a single atomic transaction:**

```bash
psql "$STAGING_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  --single-transaction \
  -f /tmp/full-staging-schema.sql
```

> **Why `ON_ERROR_STOP=1` + `--single-transaction` matters**: any SQL error in any
> of the 122 files causes `psql` to abort immediately and roll back the entire
> transaction. Staging is left exactly as empty as it started — zero partial state,
> safe to retry from scratch. With standalone transaction commands stripped, mid-chain
> commits cannot occur.

> **`STAGING_DATABASE_URL` format**: `postgresql://postgres:<password>@<host>:5432/postgres`
> — copy the "Connection string" from the Supabase Dashboard → Project Settings →
> Database, using the **direct connection** (not the pooler URL) for DDL operations.

> **`pg_trgm` note**: if migration_141 fails with `ERROR: could not open extension control file`,
> enable `pg_trgm` in Supabase Dashboard → Database → Extensions first, then re-run
> from scratch (the transaction rollback means no partial state to clean up).

**Step 3 — Verify (same SQL editor checks as B.2-preamble.7):**

After a successful `psql` exit (code 0), run the B.2-preamble.7 verification queries
in the Supabase SQL editor to confirm row counts and table existence before proceeding
to B.4 seeding.

#### B.2-preamble.5 — Known non-idempotent / special-case migrations

The following migrations contain logic that is **not a pure no-op on re-run** or
require awareness before pasting:

| Migration | Concern |
|---|---|
| `migration_07_fix_profiles_signup_trigger.sql` | Contains `INSERT INTO profiles` — inserts a single row; the `ON CONFLICT DO NOTHING` guard makes it safe on re-run. |
| `migration_08_homepage_hero_settings.sql` | Contains `INSERT INTO platform_settings` — guarded with `ON CONFLICT DO NOTHING`. Safe. |
| `migration_31_backfill_profile_visibility_default.sql` | Runs `UPDATE profiles SET ...` — safe on blank DB (no rows to update; still a no-op). |
| `migration_33_backfill_donation_comment_user_ids.sql` | Runs a backfill `UPDATE` — safe on blank DB. |
| `migration_45_fix_comments_payment_intent_index.sql` | Contains `ALTER TABLE comments ADD COLUMN IF NOT EXISTS payment_intent_id text` (patched to repair a historical migration gap where the column was created out-of-band in prod). Safe on blank DB and production. |
| `migration_48_organization_system.sql` | Runs a `DO $$ ... FOR rec IN SELECT ... FROM organizers $$` backfill loop — safe on blank DB (zero rows). |
| `migration_67_backfill_orphaned_organizer_ids.sql` | Production data backfill: guarded with `IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '...') RETURN;` so it safely no-ops on fresh/staging databases while executing normally on production. |
| `migration_73_payouts_and_balance_rpcs.sql` | No rollback twin exists in `db/` — take note if you ever need to undo. |
| `migration_74_article_audio.sql` | No rollback twin exists — same caveat. |
| `migration_88_aldriva_ai.sql` | Large migration; no rollback twin. |
| `migration_116_shop_digital_products.sql` | Contains `INSERT INTO storage.buckets` for the `product-assets` bucket — guarded by the migration logic; verify the bucket appears in Supabase Storage after this step. |
| `migration_117_cms_media_storage.sql` | Creates the `cms-media` storage bucket — same note. |
| `migration_134_homepage_promotions.sql` | Sole creator of `homepage_promotions` table, indexes, triggers, and RLS — fully idempotent. |
| `migration_141_knowledge_foundation.sql` | Issues `CREATE EXTENSION IF NOT EXISTS pg_trgm` — see B.2-preamble.1. |
| `migration_145_qa_execution.sql` | Has rollback twin with two caveats — read `db/migration_145_qa_execution_rollback.sql` before ever rolling back. References `organizers`, `agents`, `tool_definitions`, and `system_events` (created by migrations 48, 140, 139, and 143 respectively) — these are the tables that must exist before 145 will succeed. |

#### B.2-preamble.6 — Seed data requirements after full migration replay

The following migrations **insert seed rows** during apply — no separate seed script is required for these:

| Migration | What it seeds |
|---|---|
| `migration_05_platform_settings.sql` | One `platform_settings` row (global defaults) |
| `migration_07_fix_profiles_signup_trigger.sql` | Minor trigger fix insert |
| `migration_08_homepage_hero_settings.sql` | One `platform_settings` row (hero config) |
| `migration_12_profile_account_info.sql` | Minor profile meta defaults |
| `migration_16_homepage_cms.sql` | 4 seed rows (homepage categories) |
| `migration_17_marketplace_arch.sql` | 1 seed row |
| `migration_19_landing_pages_cms.sql` | 1 seed row |
| `migration_106_storage_bucket_upload_posture.sql` | Storage bucket policy seed |
| `migration_116_shop_digital_products.sql` | `product-assets` storage bucket |
| `migration_117_cms_media_storage.sql` | `cms-media` storage bucket |
| `migration_120_invitation_templates.sql` | Default invitation template rows |
| `migration_139_tool_registry.sql` | 27 `tool_definitions` rows (platform AI tools) |
| `migration_140_agent_registry.sql` | 3 `agents` rows (built-in platform agents) |
| `migration_141_knowledge_foundation.sql` | 2 knowledge doc seed rows |
| `migration_143_sentinel_events.sql` | 2 seed rows (sentinel config) |
| `migration_145_qa_execution.sql` | 2 seed rows (QA tool definitions + agent tool links) |

**Seed data NOT provided by migrations — must be created manually (B.4)**:

- **QA test user account** (`QA_TEST_EMAIL` / `QA_TEST_PASSWORD`): Must be created via Supabase Auth Admin UI or `supabase auth create-user`. Not in any migration.
- **QA reserved organizer** (the staging harness organizer): Must be inserted manually via B.4 step 1.
- **Seed fundraiser** (`QA_SEED_FUNDRAISER_SLUG`): Must be created manually via the app UI or direct SQL insert per B.4 step 3.
- **No bootstrap admin user is required in SQL** — Supabase Auth handles user creation; `profiles.role` can be elevated to `admin` via a direct `UPDATE profiles SET role='admin' WHERE id='...'` after creating the user through Auth.

There is **no** mandatory admin user, default organizer, or system credential that must exist before the migration chain itself succeeds. The seed data in B.4 is required only for the QA harness to function, not for migrations to apply cleanly.

#### B.2-preamble.7 — [VERIFY] checklist: full schema applied to blank database

Run these checks **in the Supabase SQL editor** after applying `schema.sql` + all
131 migrations, and **before running any QA workflow**:

**Phase 1 — Core tables exist (pre-145 sanity)**

```sql
-- Must all return rows; any error = a migration was skipped
SELECT 'profiles'          , count(*) FROM profiles LIMIT 1;
SELECT 'organizers'        , count(*) FROM organizers LIMIT 1;
SELECT 'events'            , count(*) FROM events LIMIT 1;
SELECT 'fundraisers'       , count(*) FROM fundraisers LIMIT 1;
SELECT 'entity_members'    , count(*) FROM entity_members LIMIT 1;
SELECT 'businesses'        , count(*) FROM businesses LIMIT 1;
SELECT 'agents'            , count(*) FROM agents LIMIT 1;
SELECT 'tool_definitions'  , count(*) FROM tool_definitions LIMIT 1;
SELECT 'system_events'     , count(*) FROM system_events LIMIT 1;
SELECT 'incidents'         , count(*) FROM incidents LIMIT 1;
```

**Phase 2 — Seed row counts**

```sql
SELECT count(*) FROM tool_definitions;   -- expect 27
SELECT count(*) FROM agents;             -- expect 3
```

**Phase 3 — Migration 145 prerequisites (run before pasting 145)**

```sql
-- All four must return TRUE; any FALSE = the prerequisite migration was not applied
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizers')     AS organizers_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agents')         AS agents_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tool_definitions') AS tool_defs_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_events')  AS system_events_exists;
```

**Phase 4 — Post-145 verification (original B.2 checks)**

```sql
SELECT count(*) FROM tool_definitions;   -- still 27 (145 adds agent_tool links, not new tool_definitions)
SELECT count(*) FROM agents;             -- still 3
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'qa_runs')         AS qa_runs_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'qa_test_results') AS qa_test_results_exists;
-- Confirm qa_failure is in the system_events kind CHECK:
SELECT pg_get_constraintdef(c.oid)
  FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
 WHERE t.relname = 'system_events' AND c.contype = 'c'
   AND c.conname LIKE '%kind%';
-- Output must include 'qa_failure'
```

**Phase 5 — Storage buckets**

In the Supabase Dashboard → Storage, confirm these buckets exist:
- `product-assets` (private, created by migration_116)
- `cms-media` (public, created by migration_117)
- `event-banners` (public)
- `profile-images` (public)
- `videos` (public)

If any are missing, re-run the relevant migration file in the SQL editor.

### B.3 Point a staging app deployment at it
1. Vercel: separate staging project (or protected preview branch),
   production-named env vars set to staging values per B.1, including
   `QA_SHADOW_MODE=true` and the fresh `QA_INGEST_TOKEN`.
2. Stripe on staging: test keys only. [VERIFY]: dashboard shows test
   mode; donate spec's pre-flight (Part A) passes on first run.
3. Record the deployment URL → this becomes `QA_STAGING_URL` (GitHub
   secret) and the Playwright target. Never the production domain.

### B.4 Seed the harness (in staging Supabase, via SQL editor)
1. Reserved organizer, e.g. name `QA Staging Harness` → record its UUID
   (future `target_tenant_id`; also useful for excluding harness data
   from analytics).
2. Test users (auth admin create): the `QA_TEST_EMAIL` account (+ a
   second donor account if the donate flow needs a distinct donor);
   record credentials into GitHub secrets only.
3. One published fundraiser compatible with card donate → record its
   slug as `QA_SEED_FUNDRAISER_SLUG`. Keep it published and donatable
   (the suite donates $5 test-mode per run — trivial test-ledger noise
   confined to staging by construction).
4. [VERIFY]: log in manually once as the harness user; donate $5 test
   card manually once — proves seed + Stripe test mode end-to-end
   before automation ever runs.

### B.5 Enable the worker
1. Set the six GitHub secrets (B.1). The workflow file is already
   committed (`.github/workflows/qa-sweep.yml`); schedules run on the
   default branch only.
2. First run: Actions → qa-sweep → **Run workflow** (manual dispatch),
   then watch: poll claims (standing run on first ever run) →
   Playwright executes → ingest 200s → `qa_runs` row `passed`.
3. [VERIFY] in staging Supabase: `qa_runs` has the run with counters;
   `qa_test_results` has 3 rows; run `metadata` contains a
   `shadow_suppressed` entry **only if** a smoke failure occurred
   (green runs emit nothing — correct); **zero** `system_events` rows
   with `kind='qa_failure'` while shadow is on (any such row means the
   flag is off — stop and check `QA_SHADOW_MODE`).

### B.6 Go-live review (manual, after one full green week)
1. Review: shadow-suppressed log volume, flake rate per test, any
   `failed` runs and their causes.
2. If green: set `QA_SHADOW_MODE=false` in Vercel staging env, redeploy,
   and confirm the next failing run (or a deliberate-failure drill)
   creates exactly one `qa_failure` event → incident via the existing
   pipeline. If red/noisy: clock restarts, fix specs first.
3. Rotate `QA_INGEST_TOKEN` (PREV procedure, B.1) at least once to prove
   the rotation path before it is ever needed under pressure.

### B.7 If something breaks (triage order)
1. Workflow red before poll → secrets/URLs wrong (B.1/B.5), or schedule
   disabled (repo inactive 60 days — check Actions tab).
2. Poll 401 → token mismatch between GitHub secret and Vercel env.
3. Claim 200 `claimed:false` every night with no runs → approvals empty
   (expected) AND standing window logic — check `qa_runs` recency.
4. Ingest 401 → claim TTL expired (run >2h — investigate the hang) or
   token mismatch; ingest 422 → read the message (transition/validation).
5. Spec failures on staging → fix app or spec (shadow absorbs the blast
   until go-live); repeated identical failures → quarantine the test
   (mark `test.skip` with a tracking note) rather than letting noise
   train everyone to ignore red.

---

*End of runbook. Open items for implementation stage: Part A pre-flight
assertion in the donate spec; 60-day schedule-disable monitor (Stage 9
Sentinel watch). Nothing was provisioned, no secret was set or printed,
no code was changed to produce this document.*
