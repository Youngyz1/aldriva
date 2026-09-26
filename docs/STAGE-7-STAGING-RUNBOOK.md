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
1. New project `aldriva-staging` (any region close to prod). Record URL,
   anon key, service-role key, DB URL into a password manager (these
   become the values mapped in B.1/B.3 — not into `.env.local`).
2. Apply migrations **in order** through `139`→`145` using the Supabase
   SQL editor (paste each `db/migration_NNN_*.sql` in sequence) or a
   linked Supabase CLI. [VERIFY]: `select count(*) from tool_definitions`
   → 27; `agents` → 3 rows; `qa_runs`/`qa_test_results` tables exist;
   `system_events` CHECK includes `qa_failure`.
   (Rollback twin exists at `db/migration_145_qa_execution_rollback.sql`
   with its two caveats — read them before ever rolling back.)

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
