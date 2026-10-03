# Phase 144 — QA Agent Observability & Testing Foundation
## Investigation Report (NO IMPLEMENTATION — plan only)

> **Authorization**: investigation only. No migrations, no application code,
> no Playwright specs, no package installs, no autonomy changes, no Sentinel/
> Dylan ACL changes, no QA dashboard, no remediation design. 144b pending
> separate authorization — same 143/143b pattern.
> **Date**: 2026-09-26. **Method**: direct codebase inspection, same standard
> as the Phase 143 investigation. Every claim below cites a real file.

---

## PART 1 — Current state of testing infrastructure

### 1.1 Playwright: installed, never configured — still true

| Check | Evidence | Verdict |
|---|---|---|
| In package.json? | `package.json:80` — `"playwright": "^1.60.0"` under **devDependencies** | Installed as a dev dep |
| Config? | No `playwright.config.*` anywhere in repo (glob-checked) | **Not configured** |
| Ever run? | No `test-results/`, no `playwright-report/`, no `e2e/` dir, zero `*.spec.ts` files repo-wide | **Never run** |
| Imported anywhere? | Zero `require/playwright` hits in `lib/` or `app/` (excluding node_modules) | Unused |
| Module present? | `node_modules/playwright` + `playwright-core` exist; **no `node_modules/@playwright`** | CLI only, no runner browsers in-repo |

One new observation vs. the discovery report: **browser binaries exist on
this dev machine** (`%LOCALAPPDATA%/ms-playwright`: `chromium-1223`,
`chromium_headless_shell-1223`, `firefox-1522`, `webkit-2287`,
`ffmpeg-1011`) — i.e. someone ran `npx playwright install` locally at some
point. That is machine-local state, not repo state: it makes this machine
suitable for *authoring* the first specs in 144b, but it is not a
deployment story and changes nothing about "not configured."

### 1.2 What actually exists: the hermetic pattern (proven, keep it)

- `npm test` = `node --test` over an explicit file list in `package.json`
  (~70 `.test.cjs` suites). Style: **static/hermetic assertions** — read
  migration SQL and source files from disk, transpile TS on the fly, assert
  invariants (RLS policies, CHECK constraints, ACL seeds, no-INSERT rules)
  **without a live DB**. Example: `lib/security/__tests__/test-e2e-guard.test.cjs`
  (TypeScript transpile shim + mocked `next/server`).
- This pattern carried 139→143b verification and must be **extended, not
  replaced** (discovery report §6.4 says the same): hermetic stays for
  unit/RLS/contract assertions; Playwright adds only what hermetic cannot —
  real browser journeys against a live target.
- No Cypress, no Puppeteer, no Selenium, no Vitest/Jest/Mocha in
  `package.json`. Playwright is the right choice by elimination **and** by
  prior intent (discovery §17, roadmap Phase 7 both name it; binaries
  already on the dev machine).

### 1.3 Existing test-seam precedent: `/api/test-e2e`

`app/api/test-e2e/route.ts` is a working template for 144b's isolation
thinking: hard-404s when `NODE_ENV === "production"` (route.ts:9-11, even
for admins), requires login + `isAdmin()` otherwise, runs a full
create→publish→public-fetch→**cleanup** cycle (deletes its own article,
route.ts:87). Precedent established: *test traffic carries an environment
gate and cleans up after itself.* 144b should copy both properties.

### 1.4 What environment can tests run against? (constraints, stated plainly)

- **Local dev only, verified**: `NEXT_PUBLIC_BASE_URL=http://localhost:300…`
  in `.env.local`; no staging/preview URL anywhere in env or docs.
- **No staging deployment known**: no Vercel preview URL recorded in-repo;
  cannot confirm a staging project exists — 144b must establish one
  (see §7: new infrastructure).
- **Production is NOT a safe target** for browser tests: journeys create
  real rows (signups, donations, orders) and negative tests emit
  `auth_failure`/`api_error` events that would page Sentinel as production
  incidents (see Part 5). Read-only smoke against production is not
  proposed either — there is no read-only browser mode, and the value is
  marginal next to Sentinel's existing backend signals.
- **Constraint**: Playwright runs against **local dev (authoring) and a
  dedicated staging deployment + staging Supabase project (scheduled)**.
  Staging does not exist yet — it is the single biggest 144b prerequisite.

---

## PART 2 — What QA should test first

### 2.1 Flow existence re-verified (routes moved since discovery)

> Note: the working tree has an in-progress i18n restructure — pages now
> live under `app/[locale]/` (untracked) with the old paths deleted. All
> flows below verified at their **current** paths:

| # | Flow | Current path(s) | Exists? |
|---|---|---|---|
| 1 | Login | `app/[locale]/login/page.tsx` (+ `signup/`, `forgot-password/`, `recover-account/`) | ✅ |
| 2 | Create organization | `app/[locale]/create-organizer/page.tsx` | ✅ |
| 3 | Create event | `app/[locale]/create-event/page.tsx` | ✅ |
| 4 | Create fundraiser | `app/[locale]/create-fundraiser/page.tsx` | ✅ |
| 5 | Donation | `app/[locale]/fundraisers/[slug]/donate/` (`DonatePage.tsx`) | ✅ |
| 6 | Ticket purchase | `app/[locale]/events/[slug]/` → `ticket-confirmation/`, `my-tickets/` | ✅ |
| 7 | Checkout | `app/api/checkout/{route.ts,business/,product/,…}` (Stripe + NOWPayments crypto) | ✅ |
| 8 | Dashboard | `app/[locale]/dashboard/` (aggregate + org/entity scopes) | ✅ |
| 9 | Messaging | `app/[locale]/dashboard/messages/page.tsx` **UI only** — channel OAuth/webhooks dormant (`migration_108`–`115` schema only, per CURRENT-STATE) | ⚠️ UI shell, no deliverable path |

### 2.2 Ranking (criticality × silent-regression risk × existing-signal overlap)

- **Login (#1)**: the gate for every authenticated flow. Backend already
  emits `auth_failure` system events, but those fire on *real* failures —
  a broken login form (button dead, redirect loop, i18n `[locale]` routing
  regression from the ongoing restructure!) produces **no backend signal at
  all**; users just bounce. The `[locale]` move makes this the single most
  likely near-term regression. Fast, session-only writes.
- **Fundraiser create→donate (#2)**: money path. Overlap question answered:
  `payment_reconciliation_failures` + `get_recent_webhook_failures`
  (sentinel-webhooks.ts) observe the **backend RPC/webhook leg**; they say
  nothing about the **UI leg** (DonatePage render, Stripe Checkout redirect,
  return-url handling, receipt display). A QA test is **complementary, not
  redundant**. Local `STRIPE_SECRET_KEY` is `sk_test_*` — test-mode replay
  charges nothing.
- **Event create→ticket checkout (#3, second wave)**: second money path,
  heavier (seat locking, ticket_instances, QR, offline scanner). Proves
  more, costs more (flakier, longer). Goes second once the pattern works.
- **Create organization (#4, second wave)**: tenant root of everything,
  but low-frequency and already covered hermetically at the schema/RBAC
  level. UI test adds little until #1–#3 are green.
- **Dashboard (#8, free smoke)**: read-only aggregate; near-zero cost as an
  assertion inside the login spec (land on dashboard, expect 200 + nav).
  Not a standalone flow.
- **Messaging (#9, last)**: channels can't deliver (no OAuth/webhooks) —
  only a UI shell smoke is testable. No value until Phase 13/14 lights the
  channels.

### 2.3 Smallest first set (the 139-142 "smallest safe foundation" principle)

1. **`auth-login`** — login with seeded staging credentials → expect
   dashboard 200 + Explore/nav present (folds the dashboard smoke in).
   Negative case (wrong password → visible error, no redirect) optional
   but valuable; see Part 5 for why negatives need staging isolation.
2. **`fundraiser-donate`** — organizer creates fundraiser → donor donates
   via Stripe test card → expect success state + receipt. Covers the full
   money UI leg the backend signal cannot see.

Two flows. They prove the whole pattern end-to-end (runner → staging →
results → Sentinel) with one auth gate and one money path, before spending
anything on seating/QR/crypto/messaging complexity.

---

## PART 3 — QA results schema (reuse wins; one micro-migration)

### 3.1 Verdict: reuse `system_events` + `agent_runs`/`agent_reports`. No new table.

The runtime **already anticipated QA**: `agent_runs.triggered_by` CHECK
includes `'qa'` and `'schedule'` (`db/migration_142_agent_runtime.sql:68`).
The full result lifecycle maps onto existing tables with zero new theory:

| Need | Existing home | How |
|---|---|---|
| Run identity (who/when/trigger) | `agent_runs` (`agent_id`=qa, `triggered_by`=`schedule`, `status`, `duration_ms`, `error`) | Runner creates run via existing `createAgentRun()` (`lib/ai/agent-runs.ts`) |
| Step-by-step assertions | `agent_steps` (`kind`=`tool_result`/`error`, `resultSummary` ≤2000 chars) | One step per spec/assertion group |
| Human-readable report | `agent_reports` (`sections` JSONB: what_happened/tool_calls/evidence…) | QA run summary; `report_type` reuses `'task'` (or a 1-word CHECK addition of `'qa'` — cosmetic, optional) |
| Failure alerting → Sentinel | `system_events` → existing 60-min dedupe → `incidents` pipeline (`lib/observability/system-events.ts:73-180`) | **Yes** — see 3.2 |
| Screenshots/evidence artifacts | `metadata` JSONB holds a Storage URL; bytes go to an existing bucket (`cms-media/qa-runs/…`) or a small new `qa-evidence` bucket in 144b | No column needed |

Justification for no `qa_runs`/`qa_results` table: every column it would
have (id, flow, status, duration, detail, evidence link, timestamp) already
exists across `agent_runs` + `agent_steps` + `system_events.metadata`.
A bespoke table would duplicate the audit model and bypass the incident
pipeline — the exact "second parallel notification path" the brief warns
against.

### 3.2 The one required schema change (micro-migration, 144b)

`system_events.kind` is a **closed CHECK enum**
(`db/migration_143_sentinel_events.sql:33`) with no QA member. 144b needs:

```sql
ALTER TABLE system_events
  DROP CONSTRAINT system_events_kind_check,
  ADD CONSTRAINT system_events_kind_check CHECK (kind IN (
    'api_error','job_error','webhook_error','payment_reconciliation',
    'auth_failure','storage_error','guard_rejection','approval_block',
    'agent_tool_error','qa_failure'));
```

(Exact constraint name to be confirmed against live DB in 144b; additive
only — no existing kind touched.) Then a QA failure is:

```ts
insertSystemEvent({
  kind: 'qa_failure', severity_hint: 'error',
  tenant_id: null,                       // platform-level run, like sentinel-sweep
  agent_id: '<qa agent id>',
  route: '/qa/fundraiser-donate',         // the flow — dedupe axis
  error_code: 'donate_stripe_redirect',   // the failed assertion — dedupe axis
  message: '…',                           // ≤2000 chars
  metadata: { qa_run_id, spec, step, evidence_url },
  source: 'qa_sweep',                     // PASSES the existing source regex CHECK (migration_143:45)
});
```

`dedupeKey()` (`system-events.ts:34-37`) then yields
`qa_failure:/qa/fundraiser-donate:…:donate_stripe_redirect:platform` —
per-flow incident correlation **for free** through the existing 60-min
window (`findOrCreateIncidentForEvent`), and Sentinel's
`get_recent_events`/`get_active_incidents` read it with no tool changes
(kind is a filter value, not a column; `SAFE_COLUMNS` untouched).
`deriveSeverity()` (`system-events.ts:39-65`) needs a small `qa_failure`
branch in 144b code (proposal: payment-flow failure → `s2`, repeat-burst
≥5 → `s2`, else `s3`; never `s1` — a staging test failure is not a
production payments outage, and severity honesty matters).

### 3.3 "QA feeds Sentinel automatically" — yes, via this path, no second path

A QA failure inserting `system_events(kind='qa_failure')` flows through the
*identical* pipeline as every 143b signal: dedupe → incident open/bump →
`sentinel-sweep` picks it up via `get_recent_events` + `get_active_incidents`.
No reason found to build anything else; building a parallel QA→Sentinel
notifier would fork severity/dedupe semantics for zero gain.

---

## PART 4 — QA's tools and trigger mechanism

### 4.1 New agent tools: at most one, possibly zero

The browser automation itself is **not** an agent tool call (see Part 5) —
so QA-the-agent needs only *reporting* reads. Candidates:

- `get_qa_runs(limit, status?)` — recent QA runs from `agent_runs`
  (`agent_id`=qa), low risk, `SAFE_COLUMNS`-style allowlist. **Propose this
  one in 144b.**
- `get_qa_run_detail(runId)` — steps + evidence links. Deferrable: QA can
  narrate detail from `agent_reports.sections` via existing reads; add only
  if reporting proves thin.

Note Sentinel already covers the *failure-consumption* side
(`get_recent_events` reads `qa_failure` kinds unmodified) — no Sentinel
changes needed, none proposed. Dylan/QA ACLs otherwise untouched.

### 4.2 Trigger: qa-sweep canNOT mirror sentinel-sweep's execution — honest analysis

`sentinel-sweep` (`app/api/cron/sentinel-sweep/route.ts`) works because it
does millisecond DB reads + one LLM call inside a serverless function.
A browser sweep is a different animal:

- **Vercel function limits (current, Fluid compute, verified 2026-09-26)**:
  Hobby 300s max duration / Pro 800s (1800s beta); **250 MB uncompressed**
  function size (5 GB only via large-functions beta). A Playwright +
  Chromium bundle (~170 MB browser alone) strains the size cap, and the
  Lambda microVM lacks browser OS deps and a persistent browser cache —
  Playwright on Vercel serverless requires shims (e.g. `@sparticuz/chromium`,
  a **new** dependency with fidelity compromises). Even if squeezed in, a
  2-flow suite (login + donate incl. Stripe redirect) runs **minutes**,
  burns active-CPU billing per sweep, and inherits serverless flakiness.
- **Recommended 144b shape**: the runner lives **outside Vercel** —
  **GitHub Actions** (repo has no `.github/workflows` today; creating one
  is new infrastructure but free and standard) on `schedule` (daily, low
  hour — NOT per-2h like sentinel-sweep; browser suites are slow/flaky and
  staging failures are not production fires) plus `workflow_dispatch` for
  on-demand and optional deploy-trigger. The workflow runs
  `npx playwright test` against the staging URL, then ingests results via
  an authenticated ingest route (fail-closed `isAuthorizedCronRequest` +
  `NODE_ENV !== production` gate, copying the `/api/test-e2e` precedent)
  or a service-role script — the ingest path writes `agent_runs` /
  `agent_steps` / `agent_reports` / `system_events(qa_failure)` exactly as
  §3 specifies.
- **What a Vercel `qa-sweep` route could still be** (optional, thin): an
  orchestration/status endpoint that QA-the-agent can call to report *last
  known* QA state — never the browser executor. Do not put browsers in the
  cron route.

### 4.3 Zero-infra vs. new-infra for the trigger

- Zero-infra (exists): `isAuthorizedCronRequest`, `enforceRateLimit`,
  `insertSystemEvent` + incident pipeline, `createAgentRun/Report/Step`,
  Stripe **test-mode** keys, Playwright devDep + local binaries.
- New (required): staging deployment + staging Supabase project, GitHub
  Actions workflow, ingest route/script, CI secrets (staging credentials,
  ingest token), `qa_failure` CHECK migration, ≤1 reporting tool.

---

## PART 5 — Integration: autonomy, and the test-data question

### 5.1 L0 stays L0 — but "running a browser test" is outside the tool framework entirely

Explicit distinction, not glossed over:

- **QA-the-agent** remains L0 read-only: its *tool calls* stay reporting
  reads (`get_qa_runs`, existing catalog/tenant reads). Its system prompt
  already forbids triggering writes/deploys/production mutations
  (`db/migration_140_agent_registry.sql:98`). No autonomy change, no ACL
  change.
- **The test runner is not an agent action.** Like `sentinel-sweep`'s
  direct `supabaseAdmin` reads (which bypass `agent_tools` — precedent:
  the sweep route never calls `executeTenantTool` for its own incident
  query), the Playwright process acts under **its own authorization**:
  CI-held staging credentials + staging environment, not the agent
  approval framework. It *reports back* through agent-adjacent writes
  (`agent_runs`, `system_events`) made with the service role by the ingest
  path — the same service-role-write pattern 143b already blesses for
  emitters.
- **The gate that matters is environmental, not agentic**: the suite
  refuses to run unless `baseURL` is the staging host (hard fail
  otherwise), mirroring `/api/test-e2e`'s `NODE_ENV === "production"` →
  404 precedent. Reviews of *what the suite may touch* happen in code
  review of the specs, not at agent runtime. This is the correct layering:
  agent approvals govern *agent decisions*; CI + environment gates govern
  *deterministic test scripts*.

### 5.2 Test-data isolation (answered explicitly)

Four controls, all with in-repo precedent:

1. **Separate staging Supabase project.** Non-negotiable for two reasons:
   (a) test signups/donations/orders must never touch tenant tables the
   business reads; (b) **QA's own traffic must not become Sentinel signal
   in production** — negative login tests emit `auth_failure` events,
   failing checkouts emit `job_error`/`payment_reconciliation` events, and
   on a shared project the incident pipeline cannot distinguish "QA
   probing" from "users suffering." A separate project gives complete
   signal isolation for free. (Per-run `metadata.qa_run_id` + a dedicated
   QA organizer *within* staging is still recommended for debuggability,
   but it is defense-in-depth, not the isolation boundary.)
2. **Stripe test mode.** Local env already uses `sk_test_*`; staging uses
   test keys only. NOWPayments/crypto flows are **excluded** from the first
   set (sandbox mode unverified; key prefixes present but mode unknown —
   open question for 144b, irrelevant to flows #1–#2).
3. **Self-cleaning specs.** Every spec ends with a cleanup phase deleting
   what it created (test users via `auth.admin.deleteUser`, fundraiser
   drafts, orders) — precedent: `/api/test-e2e` deletes its article
   (route.ts:87); `purge-accounts` shows the account-lifecycle pattern.
   Plus a backstop: test accounts use a reserved prefix (`qa+<run>@…`) and
   a scheduled sweep deletes strays older than 24h.
4. **Messaging excluded by reality**: channels are schema-only
   (`migration_108`–`115`, no OAuth/webhooks), so no test message can ever
   leave staging — nothing to isolate there beyond the UI shell.

### 5.3 What QA must never do (restated guardrails for 144b)

No production baseURL (hard fail), no live payment keys (CI asserts
`sk_test` prefix), no new writes to Sentinel/Dylan ACLs, no autonomous
re-runs against failures (no retry loops that could spam staging or mask
flakes — retries are a fixed, reviewed spec parameter), no auto-remediation.

---

## 6. Proposed Phase 144b implementation scope (bullets only)

- Migration: `migration_14N_qa_failure_kind.sql` (+ rollback twin in `db/`,
  mirror in `supabase/migrations/`) — add `'qa_failure'` to
  `system_events.kind` CHECK; nothing else.
- `playwright.config.ts` (staging-only `baseURL` + hard-fail guard,
  chromium project, `test-results/` + HTML report, trace-on-failure).
- `e2e/auth-login.spec.ts` (login + dashboard smoke + optional negative case).
- `e2e/fundraiser-donate.spec.ts` (create → Stripe-test donate → receipt),
  both with cleanup phases + `qa+` test-user prefix.
- `lib/ai/tools/qa/qa-runs.ts` — `get_qa_runs` definition + executor
  (`SAFE_COLUMNS` allowlist, `logToolInvocation` + `screenToolResult`
  pattern) + `tool_definitions`/`agent_tools(qa)` seed rows; wire into
  `lib/ai/tools-registry.ts` dispatch.
- Ingest path: authenticated results-ingest route (fail-closed cron auth +
  non-production gate) writing `agent_runs`/`agent_steps`/`agent_reports`/
  `system_events(qa_failure)` per §3; `deriveSeverity` `qa_failure` branch
  in `lib/observability/system-events.ts`.
- `.github/workflows/qa-sweep.yml` — daily schedule + `workflow_dispatch`,
  Playwright install, run, artifact upload (traces/screenshots), ingest POST.
- Staging: deployment + staging Supabase project + CI secrets
  (outside repo; tracked as checklist).
- Hermetic suites: spec-count/config-guard tests in the existing
  `node --test` pattern (config asserts staging-guard; tool asserts ACL +
  logging), appended to the `package.json` test list.
- Verification: `eslint` + `tsc` + `npm test`, then one green scheduled run
  with results visible via `get_qa_runs` and a deliberate-failure drill
  proving the `qa_failure` → incident → `sentinel-sweep` path.

## 7. New infrastructure vs. existing infrastructure (Phase 143 §7 format)

| Need | Verdict | Detail |
|---|---|---|
| Browser engine | **Exists** | `playwright@^1.60` devDep + binaries on dev machine; zero new packages for authoring |
| Unit/contract testing | **Exists** | `node --test` hermetic suites; extend, don't replace |
| Run/report/audit model | **Exists** | `agent_runs` (`triggered_by` already has `'qa'`), `agent_steps`, `agent_reports`, `ai_tool_invocations` |
| Failure→Sentinel pipeline | **Exists** | `insertSystemEvent` + dedupe + incidents + `sentinel-sweep` readers; needs only the `qa_failure` enum word |
| Cron auth + rate limiting | **Exists** | `isAuthorizedCronRequest`, `enforceRateLimit` |
| Payment test keys | **Exists** | `sk_test_*` locally; staging mirrors |
| Test-seam + cleanup precedent | **Exists** | `/api/test-e2e` (env gate + self-cleanup) |
| `qa_failure` kind value | **New (micro)** | One CHECK-enum migration + `deriveSeverity` branch + optional `'qa'` report_type — smallest possible schema delta |
| `get_qa_runs` reporting tool | **New (micro)** | One read-only tool + ACL seed rows; standard 139-142 tool pattern |
| Test runner / scheduler | **New** | GitHub Actions workflow (no `.github/` today); Vercel cron explicitly NOT the executor (§4.2) |
| Execution target | **New** | Staging deployment + staging Supabase project; production is not a target |
| CI secrets | **New** | Staging credentials + ingest token in Actions secrets |
| Evidence bytes | **New (micro)** | Screenshots/traces: Actions artifacts short-term; `cms-media/qa-runs/` or tiny `qa-evidence` bucket for persisted links |
| QA dashboard, auto-remediation, Checkly/external runners, `pgvector`, Sentry | **Out of scope** | Deferred as in 143b §7; no new vendors for 144b |

---

*End of Phase 144 investigation. Awaiting review and separate 144b
authorization. Nothing was implemented, installed, migrated, or reconfigured
in the production codebase to produce this report.*
