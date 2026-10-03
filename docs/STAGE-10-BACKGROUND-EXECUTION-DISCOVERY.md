# Stage 10 — Background Execution: Discovery Audit

> **Type**: Architecture + implementation-readiness audit (DISCOVERY ONLY).
> **Date**: 2026-09-29.
> **Boundary**: No migration, schema change, worker, queue, cron, route, permission,
> behavior, infrastructure, or Sentinel change was made for this report. No
> implementation code committed.
> **Baseline**: Stage 9 delivered as `7cf8279` (797/797 tests, tsc clean, eslint
> 0 errors + 1 pre-existing warning, build compiles but retains the pre-existing
> `/things-to-do/[city]` prerender failure; Sentinel strictly read-only).
> **Evidence convention**: every major conclusion cites file:line, table, route, or
> config. `UNVERIFIED` = not provable from the repo (no DB/network access; live
> applied state, live rows, live cron firing, provider keys all UNVERIFIED).

---

## 1. Executive summary

Aldriva can **plan and approve** work but cannot **durably execute** it. The single
broken link is approval→execution for the general case:

- The orchestrator (`lib/ai/orchestrator.ts`) runs one synchronous tool round
  (`MAX_TOOL_ITERATIONS = 1`, `:50`), mints an `approvals` row on block, ends the run
  as `awaiting_approval`, and returns. **Nothing re-polls, resumes, or re-executes**
  (`lib/workforce/approvals.ts:9-16`, self-declared). Deciding an approval flips the
  record only.
- The **only** background executor in the repo is the QA plane: external GitHub
  Actions worker + `pollAndClaim` lease + idempotent ingest (`lib/qa/claim.ts`,
  `lib/qa/ingest.ts`). It is narrow (QA-only), externally scheduled, and its
  on-demand path is currently broken by the evidence-format mismatch (§4).
- The **only** post-approval consumer is that same QA claim path. Generic (non-QA)
  approvals have **zero** consumers — approving them is audit-only.
- No queue, worker, lease table, attempt counter, idempotency key, heartbeat, delay,
  priority ordering, or resume function exists for the general path. `agent_tasks`
  even carries a `status='queued'` value and a comment promising
  `FOR UPDATE SKIP LOCKED` leasing (`db/migration_142_agent_runtime.sql:22`) —
  designed, never built.
- Stage 10 must therefore build the **minimum durable execution loop**: a lease +
  idempotency + attempt model reusing the proven QA claim-token pattern, an
  approval-binding check at the execution boundary, and audit persistence — without
  new vendors, and preferably without a new Vercel cron slot (Hobby gate, `87e5292`).
- Verdict: **READY TO SPECIFY, NOTHING TO REUSE BLINDLY.** The QA lease pattern is a
  sound template; transplanting it without its columns/constraints would provide no
  guarantees. One additive migration (lease + idempotency + attempt fields, likely on
  `agent_tasks`/`agent_runs`, exact shape in §18) appears genuinely required.

---

## 2. Current execution architecture

### 2.1 What can execute today (mechanism inventory)

| Mechanism | Entry / caller | Env | Durable? |
|---|---|---|---|
| AI orchestrator single round | `orchestrate()` (`lib/ai/orchestrator.ts:73`), called only by `POST /api/ai/gateway` (`gateway/route.ts:88`) and `sentinel-sweep` cron (`sentinel-sweep/route.ts:44`) | Sync request/response, dies with request | Rows durable; compute ephemeral; **no resume** |
| QA external worker | GHA `qa-sweep.yml` (cron `17 3 * * *`, 20-min timeout) → `GET /api/qa/poll` → Playwright → `POST /api/qa/ingest` | Background (GitHub-hosted), re-enterable via idempotency | **Durable lease + rows** — the sole background executor |
| 4 Vercel crons | `daily-post`, `promotion-engine`, `purge-accounts`, `invitation-retention` (`vercel.json:1-8`) | Sync route bodies | Rows durable; compute ephemeral |
| `decideWorkforceApproval` | Server action → `decideApproval` conditional update (`lib/workforce/approvals.ts:182-189`) | Sync | Record flip only — **never executes** |
| Dashboard server actions | `lib/actions/*` (user-session client, ownership/entity checks, status clamps) | Sync | Rows durable; ephemeral compute |
| Stripe/crypto webhooks | Signature/HMAC-verified, service-role, idempotent credit RPCs | Sync (retries via Stripe dunning, not internal queue) | Rows durable |
| Chat/calendar/synthesize/seating AI routes | Admin- or role-gated sync LLM calls | Sync | Mostly ephemeral (no task/run rows) |

Global negatives (verified): no queue deps in `package.json:18-85`; no `pg_cron`/`pg_net`
(anywhere; only `pg_trgm`/`pgcrypto`/`uuid-ossp` installed); no `maxDuration` except
seating `60s`; no server `setInterval`; no realtime subscriber on approvals; no DB
trigger that executes work (only `updated_at` bumpers); no `LISTEN/NOTIFY` worker.

### 2.2 Planning vs approval vs execution vs verification vs reporting

- **Planning**: prompt + knowledge + tool allowlist (`orchestrator.ts:95-210`) — works.
- **Approval**: per-tool gate → `approvals` pending row (`:291-309`) — works; human
  decide flips atomically (`approvals.ts:160-195`) — works.
- **Execution**: single sync tool round for non-blocked tools (`:369-420`); external
  GHA worker for QA only. **General post-approval execution: missing.**
- **Verification**: output guard (`:595-630`), ingest validators, forward-only QA
  transitions — works within each path.
- **Reporting**: `agent_reports`, `system_events`, activity, Sentinel reads — works
  (blocked runs notably skip `createAgentReport`, `:683` unreachable on the block path).

The five phases are **not** correctly separated: planning/approval/execution are fused
into one synchronous request, so approval inherently terminates rather than suspends.

---

## 3. Current approval architecture

- Gate: `checkApprovalRequired` (`lib/ai/approvals.ts:43-91`) — fires on
  `approval_required` OR high/critical risk; **L0 always blocks without reading the
  table** (`:59-65`); L1+ grants only on live `action + approved + unexpired` match
  (`:71-78`); DB error fails closed. All live agents are L0, so the L1+ branch is
  currently unreachable.
- Mint: `createApprovalRequest` (`:120-156`) inserts action/reason/evidence/risk/
  identities with `status='pending'`; never sets `expires_at` (DB default +48h,
  `migration_142:49`), `audit_ref`, `approver_id`, `decided_at`. Best-effort, never
  throws. Orchestrator passes **no `proposedOutcome`** (`orchestrator.ts:301-309`) —
  always NULL on this path (no writer found repo-wide).
- Decide: id + decision only from the client; action/risk/tenant re-read from DB;
  pending + unexpired + in-scope enforced; conditional `.eq(status,'pending')` update
  makes double-decide atomic (`approvals.ts:160-195`).
- Consumers of approval state: UI filters/counters only — plus exactly one execution
  consumer, the QA poll (`claim.ts:102-113`: `action='request_qa_run'`,
  `status='approved'`, `audit_ref IS NULL`, `expires_at>now`, limit 3).
- `approvals` table (`migration_142:36-60`): full identity/action/evidence/risk/
  decision/audit columns; SELECT-only RLS (`authenticated`); writes service-role only;
  `idx_approvals_status WHERE status='pending'` — **no index helps the
  approved-poll** (needs `(action,status,audit_ref,expires_at)` partial, §6/§18).

---

## 4. Agent-to-approval evidence mismatch

**Status: confirmed type + runtime break; production does not compensate; tests do not
cover the round-trip. DO NOT FIX HERE — minimum change documented below.**

| Side | Exact shape (code) |
|---|---|
| Producer | `orchestrator.ts:307`: `{tool, args}` where `args` is a provider JSON **string** sliced to 500 chars (possibly invalid JSON after slicing) |
| Sanitizer | `approvals.ts:101-114` (+ `redactArgs`, `tool-context.ts:78-99`): string args → `JSON.parse` → redacted **object** (secrets→`[redacted]`, strings>200ch truncated, nested→`[complex]`); unparseable → `"[unparseable args, N chars]"` string; non-string passthrough. Stored `evidence.args` is therefore **object \| descriptor-string**, never reliably the original string |
| Store | `evidence jsonb`, `proposed_outcome jsonb NULL` (`migration_142:43-45`); orchestrator path always NULL outcome |
| UI | keys-only rendering (`approvals.ts:202-205`, detail page, activity never selects evidence) — by design, unaffected |
| QA consumer | `parseRequestArgs` (`claim.ts:72-95`) **requires** `evidence.args` to be a JSON **string** with suite/environment/idempotencyKey — called on the **DB-read post-sanitize row** (`:105,120`) |

Consequence: after hygiene, `parseRequestArgs` on a sanitized row **always returns
null** (`:75` type guard) → `stamp('qa-invalid-evidence')` terminal (`:121-124`), no
`qa_runs` materialized. **Human-approved on-demand QA requests never materialize;
only the 20h standing smoke run proceeds.** General approvals are runtime-unaffected
(they never resume anyway, §2) but approvers still see keys-only.

- Classification: type-level + runtime-level break with conceptual root (sanitize
  destroys the fidelity the consumer needs).
- Tests: `approval-evidence.test.cjs` (58 lines) covers `sanitizeEvidenceArgs` in
  isolation only — never imports `parseRequestArgs`, never round-trips.
- Minimum coherent fix (Stage 10 or adjacent, NOT this audit): make producer and
  consumer agree — e.g. store a dedicated machine-readable `proposed_outcome`
  envelope (validated args object) at mint time while keeping `evidence` as the
  redacted human view, and have `parseRequestArgs` read the envelope with the string
  form as legacy fallback. Requires touching `orchestrator.ts` mint call (add
  outcome), `claim.ts` parser (accept object), and round-trip tests. No schema change
  strictly needed (`proposed_outcome` column exists) — but envelope format must be
  versioned and validated, not ad-hoc JSON.

---

## 5. Current task/execution relationship

- `agent_tasks` is a **request log**, not a queue: `createAgentTask`
  (`agent-runs.ts:69-100`) hardcodes `status='completed'`; `status='queued'` is never
  written repo-wide; `agent_tasks.approval_id` (loose UUID, no FK, `migration_142:17`)
  has **zero writers** (verified by grep — only read in `fetchApprovalLinks`), so the
  task-half of approval linkage is always empty.
- `agent_runs` is an **attempt record** (`task_id` FK `:65`, `approval_id` FK `:74`,
  `error`, `duration_ms`, `triggered_by` incl. `'qa'`) but unnumbered (no
  `attempt_no`), unleasable (no claim/heartbeat), and its status set lacks
  `queued/expired/requested`.
- Blocked runs end as `awaiting_approval` with `approval_id` set (`orchestrator.ts:
  344-350`) — a terminal state with no consumer except QA's poll (which reads
  `approvals`, not runs).
- Net: tasks name the work, runs record attempts, approvals gate tools — but **no
  row represents "approved work waiting for a worker."**

---

## 6. Current database capabilities

Reusable as-is: identity/ACL (`agents`, `agent_versions`, `agent_tools`), attempt
records (`agent_runs` + `agent_steps` append-only `UNIQUE(run_id,seq)` audit trail),
gate rows (`approvals` + pending/decision indexes), result summaries
(`agent_reports`), per-tool audit (`ai_tool_invocations`), guard evidence
(`ai_guard_rejections`), and the complete QA lease reference (`qa_runs`:
`idempotency_key UNIQUE`, `claim_token_hash/expiry`, `claimed_at/started_at/
finished_at`, terminal-needs-finish CHECK, natural-key results; partial claim index).

Missing for durable general execution (each justified in §18): lease owner + expiry +
heartbeat; attempt count; job-level idempotency `UNIQUE`; run-after/delay +
priority-ordered partial index (`WHERE status='queued' ... FOR UPDATE SKIP LOCKED`);
result pointer; worker credential scope (auth model in `lib/auth.ts:32-87` has human
identities only — no worker DB role; all writes require service-role via server
routes; RLS is SELECT-only on every candidate table).

Index gaps that hurt even today's paths: `idx_qa_runs_claim` lacks `claimed_at IS
NULL`; approved-`approvals` poll has no supporting index at all.

Mirrors: `supabase/migrations/` names match `db/` for 140/142/143/144/145 (content
equality and live applied state UNVERIFIED).

---

## 7. Current worker/queue capabilities

**None for the general path** (verified §2.1 negatives). The two precedents:

- **External GHA worker (QA)**: 20-min job timeout, 5–60-min cron slip (UNVERIFIED
  live), manual `workflow_dispatch` retry, safe re-entry via idempotency
  (`claim.ts:128-135`, duplicate-terminal no-op `ingest.ts:193-197`, natural-key
  upsert). Staging-only guard. Zero Vercel cron slots consumed.
- **Vercel cron polling**: proven shape (`sentinel-sweep` reads ≤20 incidents then
  orchestrates synchronously), but latency = cadence, work must fit request timeout,
  and a 5th cron slot re-hits the Hobby gate (`87e5292`).

`pg_cron`/`pg_net`/`pgmq`/BullMQ/Inngest/QStash: absent (deps, extensions, code;
hermetically asserted in `sentinel-events.test.cjs`).

---

## 8. Current retry behavior

- Orchestrator: exactly one synthesis retry (text-only leak retry,
  `orchestrator.ts:496-525`), else deterministic fallback; tool-call throws captured
  per-call, batch continues (`:401-420`). No job retry.
- GHA worker: no in-pipeline retry (`curl` without retry, `qa-ingest.mjs` exits 1 on
  non-200); safety comes from idempotent re-entry (re-run or next nightly), plus the
  20h standing-run window.
- Crons/webhooks: none internally (Stripe retries via dunning; purge/retention
  selectors are naturally idempotent).
- Timeouts found: provider 15s aborts (Gemini/OpenRouter), 12s SSRF/search, 60s
  seating override, 2h claim TTL, 20h standing window, 20-min GHA job, 48h approval
  expiry, 60-min incident correlation. No per-step execution budget, no backoff
  library, no DLQ concept.

---

## 9. Current idempotency behavior

- Strong, QA-scoped: `idempotency_key UUID UNIQUE` (`migration_145:33`) checked at
  claim (`claim.ts:128-135`) and returned as existing handle in
  `GitHubActionsQAProvider.requestRun`; natural-key upsert on results; terminal
  re-POST no-op; `decideApproval` conditional update (double-decide safe).
- **Absent everywhere else**: tasks/runs have no idempotency key (each orchestrate
  call mints new rows); dashboard actions rely on slug-uniqueness loops;
  payment paths rely on provider-side keys + `is_new` guards.
- Duplicate-execution vectors today: browser re-POST (safe: conditional decide),
  worker retry (QA-safe only), concurrent workers (QA claim-race safe via
  `audit_ref IS NULL` conditional stamp; **general path has no equivalent — two
  workers racing one approval would double-execute**), network replay (route-level
  auth only), process restart (in-request work lost silently; QA re-entry safe).

---

## 10. Current auditability

Answerable today: who initiated (`requested_by`, gateway user, cron secret actor
class), which agent (`requested_by_agent_id`, run rows), which task (`task_id`
chain), what was proposed (tool name + reason + evidence keys — **values
intentionally hidden**), who approved + when (`approver_id`, `decided_at`), what
executed (tool results in steps, QA results rows), attempt boundaries
(`created_at`/`completed_at`, claim/start/finish timestamps on QA), why it failed
(`error` text, redacted/truncated), external systems (provider/tool names, worker
run id, artifact URLs), evidence produced (reports, `qa_test_results`, incidents).

Missing: attempt numbering, retry history, worker identity (QA has
`external_run_id` text only), lease/heartbeat trail, resume lineage (no
continued-from link), exact executed arguments when redaction collapses them
(`[complex]`), blocked-run reports (skipped `createAgentReport`), and any record of
work lost to process death (nothing observes the observer's crash).

---

## 11. Security-boundary analysis

Boundaries that hold (must be preserved): allowlist-before-executor
(`orchestrator.ts:261-288`); L0 always-block; `decideApproval` id+decision-only +
conditional update; `SAFE_COLUMNS` + `screenToolResult`/`guardBeforeDisplay` +
`redactArgs`; QA two-layer tokens (timing-safe poll, SHA-256/2h claim, poll≠ingest,
oracle-free 401s, forward-only transitions, server counters, artifact allowlist,
shadow default); credit RPCs only from signature-verified webhooks (+gated admin
sync), zero hits in `lib/ai/**`; server-only secrets (no `NEXT_PUBLIC_` secret
leak, no service-role in `components/`).

Privilege-escalation risks relevant to Stage 10 (do not fix here; design around):

1. **Service-role sprawl** (~94 files): any new executor with `createSupabaseAdmin`
   bypasses RLS — gate stays purely app code. Keep fail-closed + `requireToolContext`.
2. **`chat/route.ts` approval bypass (latent)**: `executeAITool` with zero
   `checkApprovalRequired` (`:44,108`) — safe only because offered tools are all
   low-risk. A worker reusing this path for approved tools must add the gate.
3. **Sentinel platform-merge without admin check**: sentinel readers merge
   NULL-tenant rows under any valid tenant ctx — keep Sentinel platform-only, never
   tenant-callable from a worker.
4. **Second credit path**: `sync-stripe` admin route credits outside webhooks —
   keep gated; enforce the zero-RPC invariant for AI tools in CI.
5. **QA tenant self-assertion**: `target_tenant_id` comes from evidence args (model-
   influenced), not membership — never use as auth; label-only. Stage 10 must
   server-resolve tenant context, never trust payload tenant.
6. **Rate-limit fail-open** (`rate-limit.ts:130-164`): DB outage unmeters endpoints
   incl. `qaIngest`/`paymentIntent` — monitor as security signal.
7. **`select(*)` in `agent-registry.ts:113,125`** (+ `trend-synthesis.ts:320`): scope
   to columns before wider worker use.
8. **Proxy fail-open inconsistency**: 3 gates fail-open on fetch error vs website
   gate fail-closed — normalize separately, not in Stage 10.

---

## 12. Tenant-isolation analysis

- Read paths: heavily tested (scoped `.eq('tenant_id')`, agents never filtered;
  QA `.or()` vs Sentinel strict-eq contracts explicitly distinguished in tests).
- Write paths: `resolveTenantContext` fail-closed (`tenant-context.ts:62-98`);
  `requireToolContext` + NULL-coercion for platform audit (`tool-context.ts:43-58,
  153-163`); orchestrator mints synthetic viewer ctx for Sentinel-only platform runs
  (`orchestrator.ts:232-244`).
- Stage 10 rule (derived): the worker must **re-resolve** tenant from the approval
  row's `tenant_id` via the same fail-closed path at claim time, write it onto the
  job/run rows server-side, and never accept a tenant identifier from worker input
  or evidence args. Tenant-scoped tools execute only under that resolved context;
  platform jobs execute only under the Sentinel-style synthetic ctx with viewer role.

---

## 13. Sentinel integration analysis

Stage 9 Sentinel is a read-only consumer of `incidents`/`system_events` plus hops to
runs/tasks/approvals/reports/QA (`lib/workforce/sentinel.ts`, committed `7cf8279`).
Do not modify it. Execution failures should reach it through the **existing**
emitter, not new coupling:

- Observable events: claim give-up (all candidates invalid), lease expiry without
  ingest, attempt failure (final, after budget), idempotency collision anomalies,
  approval-expired-with-pending-job, worker-auth failures. Suggested kinds: reuse
  `job_error`/`api_error`/`agent_tool_error` (all exist in the CHECK); no new kind
  without a migration — and none is needed.
- Safe payload: `route` = worker route, `tool_name` = executed tool, `error_code` =
  machine code (`claim_failed`, `lease_expired`, `attempt_failed:<n>`), `message` =
  redacted/truncated summary (existing 2000ch cap + redaction judgment), `tenant_id`
  = server-resolved tenant. Never: raw args, secrets, full payloads, `metadata`
  blobs (UI never selects `metadata`).
- Incident linkage: shared `dedupe_key` mechanics group repeats automatically
  (`kind:route:tool:error:tenant|platform`, 60-min window); no direct FK needed and
  none proposed.
- Redaction: identical to Stage 8/9 judgment (truncate + secret-pattern screen at the
  fetch/emit boundary; forbidden-column scans in tests).

---

## 14. Existing tests and coverage

- Baseline: 797/797, 36 suites, all hermetic (node:test; fake chainable clients;
  static source scans; TS-transpile harness). 82 files registered in `package.json`;
  11 present-but-unregistered `.test.cjs` files exist (all unrelated to execution —
  CMS image upload, shop digital products, 9 dashboard phase files; silently never
  run — flag for a hygiene pass, not Stage 10).
- Already covered (Stage-10-relevant): claim-squat race, idempotent re-ingest,
  forward-only transitions, decide atomicity, hallucinated-tool rejection, L0
  always-block, evidence hygiene (isolated), hostile-input containment, claim-token
  discipline, tenant read-scoping, static production-safety scans.
- Gaps (required future tests, §28): execution-after-approval E2E, enforcement at
  the boundary (expired/rejected/forged approval blocks), unauthorized execution
  (cross-tenant, non-admin, tampered args), retry/timeout budgets, crash recovery
  (stale-lease reclaim, idempotent resume), concurrency idempotency race (two workers,
  one execution), partial failure (step-k-fails semantics), audit completeness
  (`agent-runs.ts` helpers have zero direct tests), tenant isolation in execution,
  production-safety at the boundary (crafted approval cannot trigger deploy/migrate/
  payment tools).

---

## 15. Identified architectural gaps

1. **No pickup/resume**: decided approvals are inert (except QA poll). The core gap.
2. **No durable job row**: no lease/attempt/idempotency/delay/priority/result-pointer
   fields outside QA's narrow columns.
3. **Evidence mismatch** (§4): on-demand QA broken; general envelope missing.
4. **Approval binding is name-global**: L1+ grant matches `action` name only
   (`approvals.ts:71-78`) — not agent, tenant, args, or task. An approved action
   name could grant a different invocation. No per-args binding exists.
5. **Missing indexes** for approved-poll and claimed-exclusion (§6).
6. **`agent_tasks.approval_id` unwritten**; blocked runs skip reports; `getAgentAutonomy`
   dead code (minor hygiene).
7. **No worker identity**: auth model has humans only; every worker write needs
   service-role via a server route (acceptable if routes stay the trust boundary).
8. **No timeout budget** on execution paths (except provider aborts); no backoff/DLQ.
9. **Rate-limit fail-open** unobserved; 429s invisible to Sentinel.
10. **11 unregistered test files** silently never run.

---

## 16. Proposed Stage 10 architecture

**Loop, not a platform**: `approvals (approved, unexpired)` → **claim** (conditional,
idempotent, lease TTL) → **bind** (re-check approval + allowlist + tenant at
execution time) → **execute** (single tool round, budgeted) → **ingest**
(forward-only status, server-side result accounting) → **audit** (run/steps/report
rows) → **observe** (existing emitter → Sentinel). Every arrow reuses an existing
mechanism except the claim/bind/ingest core, which copies the QA pattern with
general-purpose columns.

- **Where it runs**: start with the two proven executors — (a) Vercel cron polling a
  claim endpoint **only if** a slot is available (currently blocked on Hobby), else
  (b) the external-worker pattern (GitHub Actions precedent) hitting claim/ingest
  routes with split tokens. No new vendor, no `pg_cron`, no queue SDK in Stage 10.
  In-request execution stays exactly as today (single round, no resume).
- **What it executes**: allowlisted tools only, re-resolved at bind time; L0 agents
  execute only what a live, unexpired, action-matching approval grants; transactional
  tools keep their existing `approval_required` semantics, now actually satisfiable.
- **State lives in Postgres**: one additive migration (§18); RLS stays SELECT-only
  for authenticated; all worker writes via the existing service-role route pattern
  (routes remain the trust boundary — no worker DB role).
- **Sentinel stays untouched**: failures arrive via existing `insertSystemEvent`
  kinds; UI reads them with zero changes.

---

## 17. Proposed Stage 10 subphases

- **10.0 — Execution contract + evidence envelope.** Define the machine-readable
  approved-action envelope (action, args, agent, tenant, task, approval id, format
  version), fix the §4 mismatch (envelope at mint + object-tolerant parser with
  string fallback + round-trip tests). No behavior change to live paths except the
  additive envelope write.
- **10.1 — Durable claim model.** Additive migration (§18): lease + idempotency +
  attempt + delay/priority + result-pointer fields (prefer extending `agent_tasks`/
  `agent_runs`; new table only if review shows column-fit worse). Partial indexes
  for claim poll + open-dedupe. No behavior change yet.
- **10.2 — Claim + ingest endpoints (generalized).** New server routes copying the QA
  split-token pattern (poll-scoped secret vs per-claim token, oracle-free 401s,
  conditional-claim SQL, forward-only ingest, duplicate-safe re-POST). No scheduler
  attached yet; manually invokable + hermetically tested.
- **10.3 — Approval binding at execution.** Worker re-checks live approval
  (status/expires/action/risk), re-checks allowlist, re-resolves tenant, and binds
  all six (`approval+agent+task+action+args+execution`) before dispatch; any drift
  aborts auditable. Fixes gap §15.4 (per-args binding).
- **10.4 — Retry/timeout/recovery.** Attempt budget + backoff + per-step timeout;
  lease expiry + heartbeat; stale-lease reclaim; crash-resume via idempotency
  (re-entry creates no duplicate). Failure states per §20.
- **10.5 — Idempotency hardening.** Concurrency race tests (two workers, one
  execution); browser/worker/network replay safety; exactly-once-effect via
  conditional writes + natural keys.
- **10.6 — Audit + workforce/Sentinel surfacing.** Persist run/steps/report on every
  attempt (incl. failures); emit `job_error`/`agent_tool_error` on terminal failure;
  verify visibility in tasks/approvals/reports/activity/Sentinel with href-only
  upgrades where justified (Stage 9.4 precedent).
- **10.7 — Scheduler attachment (ops decision).** Attach the least-privilege proven
  executor: external-worker pattern first (zero cron slots); Vercel cron only if a
  slot frees. No vendor, no `pg_cron`.
- **10.8 — Verification.** Full hermetic suite + new execution suites (§28) +
  adversarial review (crafted approvals, forged tenants, replay storms) + staging
  runbook (seeded approval → claimed → executed → audited → Sentinel-visible).
- Sequence is linear 10.0→10.8; 10.7 may precede 10.6 if scheduling is needed for
  staging proof. Rollback per subphase (migration twin required from 10.1 on).

---

## 18. Proposed schema changes, if required

**One additive migration** (new number after latest; check `db/` head at
implementation time; rollback twin + `supabase/migrations/` mirror required).
Justification per field (why existing schema is insufficient — §6):

- On `agent_tasks` (preferred; else a new `job_claims` table if review prefers
  separation): `idempotency_key TEXT UNIQUE` (only `qa_runs` has one — without it,
  re-enqueue duplicates); `lease_owner TEXT` + `lease_expires_at TIMESTAMPTZ` +
  `last_heartbeat_at TIMESTAMPTZ` (no lease/heartbeat columns exist anywhere;
  `qa_runs.claim_*` is single-shot, unrenewable, QA-scoped); `attempt_count INT
  DEFAULT 0` + `max_attempts INT` (no attempt counter exists); `run_after
  TIMESTAMPTZ` (no delayed visibility exists); `result_ref TEXT`/`result JSONB`
  (task `payload` is input-only; runs have no result pointer); tighten
  `approval_id` to `REFERENCES approvals(id)` (currently loose — binding needs the
  FK; existing NULLs/orphans must be audited first).
- On `agent_runs`: `attempt_no INT` (unnumbered attempts today) + partial
  `UNIQUE(task_id, attempt_no)` (concurrency-safe attempt creation).
- Indexes: partial `WHERE status='queued'` claim index (`priority, run_after,
  created_at` + `FOR UPDATE SKIP LOCKED`-safe shape); approved-`approvals` poll
  index (`(action,status,audit_ref,expires_at)` partial); claimed-exclusion on
  `qa_runs` (`claimed_at IS NULL` partial — also fixes today's minor gap).
- RLS: **no new policies** (keep SELECT-only authenticated; worker writes stay
  service-role via routes — the existing trust boundary).
- New table instead only if: review finds task-row reuse confuses the request-log
  semantics (tasks are created `completed` today) — then a `job_claims` table with
  the same columns + `task_id`/`approval_id` FKs. Decision at 10.1 with evidence.

---

## 19. Proposed worker architecture

**Recommended: external-worker-first (GitHub Actions precedent), cron-poll second,
no vendor, no `pg_cron`.**

- External worker hits `POST /api/claims/poll` (Layer-1 secret, returns job +
  single-use claim token, never the token twice) → executes the bound tool round
  within a budget → `POST /api/claims/ingest` (Layer-2 per-claim token, TTL,
  forward-only, duplicate-safe). Mirrors `poll/route.ts` + `ingest/route.ts` +
  `tokens.ts` exactly, generalized beyond QA enums. Zero Vercel cron slots; 20-min
  job timeout precedent; staging-only guard precedent for rollout.
- Vercel cron poll as fallback only if a slot frees (Hobby gate documented); same
  routes, same tokens, `CRON_SECRET` auth. Latency = cadence; acceptable for
  non-urgent approvals.
- Rejected: `pg_cron`/`pg_net` (secret-in-DB, app guarantees not portable),
  hosted queue (new vendor/secret/egress for problems conditional writes already
  solve), in-request extension (timeouts kill it; Vercel wall-clock UNVERIFIED).

---

## 20. Proposed execution lifecycle

`requested → approved → claimed → running → (succeeded | failed | expired)`,
plus `cancelled` (human/ops) and `unknown/interrupted` (lease expired without
terminal ingest → reclaimable, never silently closed). Only states supported by
the architecture: no `paused`, no `delegated`, no priority-preemption. Transitions
forward-only (QA machine precedent, `execution-provider.ts:36-50`); terminal rows
frozen (duplicate re-POST = safe no-op); `expired` via lease TTL (not via the
orphaned `closeStale…` path — that function stays QA/incident-scoped); `cancelled`
requires an explicit human/ops writer (out of Stage 10 default unless approved).

---

## 21. Proposed approval enforcement model

Bind all six at dispatch, re-checked live (never cached from request time):

`approval(id, status=approved, unexpired, action, risk)` + `agent(allowlisted,
autonomy permits)` + `task(owns the run)` + `action(== approval.action)` +
`args(== approved envelope, byte-stable or canonicalized — any drift aborts)` +
`execution(single claim token, single attempt)`.

Concretely: worker presents claim token → route loads approval row fresh →
`status='approved'` + `expires_at>now` + `action` matches tool + risk/allowlist
re-resolved → tenant re-resolved server-side → dispatch once under the resolved
context → ingest writes results + consumes the claim (single-use: second ingest
with the same token rejected). Crafted/forged/expired/replayed approvals fail
closed with audit rows. L0 semantics preserved: nothing executes without a live
grant; the difference from today is that a live grant can actually complete.

---

## 22. Proposed retry/recovery model

- Attempt budget per job (`max_attempts`, default small, e.g. 3 — exact number at
  10.4 with cost analysis); backoff via `run_after` (no library — Postgres time
  comparisons, QA-window precedent).
- Per-step timeout (provider-abort precedent: 15s default, overridable per tool
  class); whole-attempt budget enforced by the worker process (20-min GHA
  precedent), not by Vercel.
- Lease TTL + heartbeat: worker renews `last_heartbeat_at`; expiry without terminal
  ingest → `unknown/interrupted` → reclaimable by the next poll (stale-lease index).
- Crash recovery = idempotent re-entry: re-claim finds existing attempt by
  idempotency key, links instead of duplicating (QA `claim.ts:128-135` precedent).
- No unbounded retry: budget exhaustion → terminal `failed` + `job_error` emission
  (Sentinel-visible) + full attempt history retained.

---

## 23. Proposed idempotency model

Three layers, all database-backed (no external-provider dependence):

1. **Enqueue**: `idempotency_key UNIQUE` — same key returns the existing job
   (QA `requestRun` precedent), never a second row.
2. **Claim**: conditional write (`WHERE status='queued' AND lease_expires_at IS NULL`
   / `audit_ref IS NULL`-style) — exactly one worker wins; losers observe, never
   error (`claim.ts:167-171` lost-race precedent).
3. **Ingest**: natural-key upsert + terminal freeze + single-use claim tokens —
   replays, browser refreshes, process restarts, and queue redelivery all converge
   to one effect (QA `duplicate:true` precedent).
   Point of enforcement: the database (constraints + conditional writes), never the
   worker's memory. Action-key derivation: hash of
   (approval id, action, canonical args, task id) minted at bind time.

---

## 24. Proposed audit model

Every attempt persists: `agent_runs` row (numbered, tenant-stamped, timed) +
ordered `agent_steps` (`seq`, redacted args, result summaries, guard verdicts) +
`agent_reports` entry (including failures — closing today's blocked-run gap) +
`ai_tool_invocations` row (existing fire-and-forget path) + terminal-failure
`system_events` emission (existing kinds). Direct unit tests for
`lib/ai/agent-runs.ts` helpers (currently zero). Secret discipline: existing
`redactArgs`/truncation/keys-only rendering extended unchanged; new VM/scan tests
per Stage 8/9 precedent. Retention: follow whatever policy the platform adopts for
`agent_*` (none exists today — flag, do not invent one in Stage 10).

---

## 25. Risks

1. **Scope swell into a platform**: queue vendor, DLQ service, dashboard rebuild —
   contained by §27 + §16 loop-only mandate.
2. **Approval-binding bypass by drift**: args mutated between approve and execute —
   contained by byte-stable envelope + live re-check (§21); penalize with abort.
3. **Double execution**: concurrent workers, replays — contained by three-layer
   idempotency (§23) + race tests (§28).
4. **Tenant confusion**: payload/worker-supplied tenant — contained by server-side
   re-resolution rule (§12); QA self-assertion precedent must not spread.
5. **Secret/token handling**: claim-token leak = execution authority — contain with
   hash-at-rest, single-use, TTL, oracle-free 401s (QA precedent verbatim).
6. **Vercel wall-clock killing mid-attempt**: external-worker-first avoids it;
   cron path must keep attempts shorter than the request budget (UNVERIFIED limit —
   measure in staging).
7. **Cost**: per-attempt LLM spend × retries — attempt budget + single-iteration
   default + rate-limit buckets bound it; cost analysis required at 10.4.
8. **Migration risk**: additive-only, rollback twin, mirror; `approval_id` FK
   tightening needs orphan audit first.
9. **Hobby cron gate**: 5th slot may silently not fire — external-worker-first
   sidesteps; verify entitlement before any cron attachment.
10. **Evidence-mismatch fix scope creep**: envelope work must not become a general
    evidence rewrite — bound to mint+parse+tests (§4 minimum).

---

## 26. Dependencies

- Migrations 140/142/143/145 applied where Stage 10 reads/writes (live state
  UNVERIFIED — verify in staging before 10.2).
- `QA_SHADOW_MODE`/staging env understanding for any QA-adjacent staging proof
  (no changes — read-only awareness).
- `CRON_SECRET` + QA token rotation hygiene if new secrets are minted (follow
  existing `_PREV` overlap pattern; no new secret kinds beyond the QA two-layer
  shape).
- Vercel plan entitlement check before any cron-slot use.
- Human approval UX already exists (Stage 4) — no dependency beyond it.
- Docs: readiness (`SENTINEL-STAGE-9-IMPLEMENTATION-READINESS.md`) + implementation
  (`SENTINEL-STAGE-9-IMPLEMENTATION-REPORT.md`) reports as audit trail.

---

## 27. Explicitly deferred work

Sentry/APM; full observability platform; autonomous production operation;
unrestricted agent autonomy; new AI agents; AI Studio redesign; 3D Office; general
security hardening (proxy fail-open normalization, `select(*)` scoping, chat-route
gate — recorded in §11/§15, separate tasks); comprehensive testing overhaul;
unrelated application bugs (donate-spec receipt, `things-to-do` prerender, 11
unregistered test files — hygiene pass, not Stage 10); `pg_cron`/queue vendors;
`health_checks`/`deployments` tables; frontend error ingestion; push notifications;
retention/TTL policies.

---

## 28. Recommended implementation order

1. **10.0 contract + envelope** (mint envelope, object-tolerant parser, round-trip
   tests; unblocks on-demand QA as a side effect — verify explicitly).
2. **10.1 migration** (additive lease/idempotency/attempt/index fields + twin +
   mirror; orphan audit for `approval_id` FK).
3. **10.2 claim + ingest routes** (split tokens, conditional claim, forward-only
   ingest; manual invocation; hermetic suites).
4. **10.3 binding enforcement** (live re-checks, six-way bind, drift-abort).
5. **10.4 retry/timeout/recovery** (budgets, backoff via `run_after`, heartbeat,
   reclaim).
6. **10.5 idempotency hardening** (concurrency race tests, replay safety).
7. **10.6 audit + surfacing** (`agent-runs.ts` unit tests, failure reports, Sentinel
   emission, href-only UI upgrades).
8. **10.7 scheduler attachment** (external-worker first; cron only if slot frees).
9. **10.8 verification** (new suites below + adversarial review + staging runbook).
   New test files (all hermetic, registered in `package.json`):
   `execution-after-approval`, `execution-boundary-authz`, `execution-retry-timeout`,
   `execution-crash-recovery`, `execution-idempotency-race`,
   `execution-partial-failure`, `execution-audit`, `execution-tenant-isolation`,
   `execution-production-safety` (all `.test.cjs` under `lib/ai/__tests__/`).

---

## 29. Exact repository evidence (index of major conclusions)

- Single-round sync execution, no resume: `lib/ai/orchestrator.ts:50,73,210,256,
  344-365` + `lib/workforce/approvals.ts:9-16`.
- L0 always-block / L1+ live-grant: `lib/ai/approvals.ts:43-91`.
- Decide flips only: `lib/workforce/approvals.ts:160-195`,
  `lib/actions/workforce-approvals.ts:19-42`.
- Evidence mismatch (string→object→string-required): `lib/ai/orchestrator.ts:307`,
  `lib/ai/approvals.ts:98-114`, `db/migration_142_agent_runtime.sql:43-45`,
  `lib/qa/claim.ts:72-95,102-124` (verified directly: `:74-75` type guard).
- `proposed_outcome` always NULL on orchestrator path: `orchestrator.ts:301-309`
  (no `proposedOutcome` arg; no other writer found).
- `agent_tasks.approval_id` unwritten: grep writers = ∅ (only
  `lib/workforce/approvals.ts:102` reads); `createAgentTask` hardcodes completed:
  `lib/ai/agent-runs.ts:69-100`.
- Queue aspirational only: `db/migration_142_agent_runtime.sql:22` comment;
  `status='queued'` never written (grep ∅ in `lib/`).
- QA lease precedent (full): `lib/qa/claim.ts:97-272`, `lib/qa/ingest.ts:164-273`,
  `lib/qa/tokens.ts:1-51`, `app/api/qa/poll/route.ts`, `app/api/qa/ingest/route.ts`,
  `scripts/qa-ingest.mjs`, `.github/workflows/qa-sweep.yml:22-122`,
  `db/migration_145_qa_execution.sql:21-116`.
- No queue/worker/pg_cron/vendor: `package.json:18-85`, `vercel.json:1-8`,
  `next.config.ts:105-184`, zero `maxDuration` except seating `:45`, zero server
  `setInterval`, zero `FOR UPDATE` outside seating holds.
- Approval-name-global grant: `lib/ai/approvals.ts:71-78` (matches `action` only).
- Dead code: `getAgentAutonomy` (`lib/ai/approvals.ts:162`, zero callers — verified).
- Missing indexes: `db/migration_145:54-55` (no `claimed_at` partial),
  `db/migration_142:55` (`pending`-only), claim filters in `claim.ts:102-113`.
- RLS posture + no worker identity: `db/migration_140:45-91`,
  `db/migration_142:31-127`, `db/migration_145:86-97`, `lib/auth.ts:32-87`.
- Chat-route latent bypass: `app/api/ai/chat/route.ts:44,108` without
  `checkApprovalRequired` (safe today: low-risk-only tool set).
- QA tenant self-assertion: `lib/qa/claim.ts:145,192` copies evidence `tenantId`;
  `app/api/qa/ingest/route.ts:119` propagates to incidents.
- Test inventory: `package.json` test list (82 files), 11 unregistered
  `.test.cjs` (CMS image upload, shop digital products, 9 dashboard phase files);
  12 execution-relevant suites mapped in §14; `agent-runs.ts` helpers untested.
- Cron/Hobby gate: `87e5292`, `vercel.json:1-8` (4 crons), seating `maxDuration=60`
  sole override, provider 15s aborts, 2h claim TTL, 20h standing window.

---

## Addendum — Implementation outcomes (Stage 10, 2026-09-29; findings above preserved)

- Built as specified with three documented deviations: (1) `agent_tasks.approval_id`
  FK tightening skipped (live orphans UNVERIFIED; binding enforced in
  `lib/exec/binding.ts` instead); (2) a `POST /api/exec/run` bounded-unit route
  added alongside claim/heartbeat/ingest so short tools execute without an
  external TS worker (no scheduler attached); (3) terminal ingests file one
  `agent_reports` row (Reports-UI visibility, terminal-only).
- Evidence mismatch (§4) resolved for new rows via `proposed_outcome` envelope +
  envelope-first `parseRowArgs`; legacy rows fall back unchanged.
- Migration 146 applied nowhere by this stage (no live DB access); staging apply
  remains an ops step with the rollback twin available.
- Verification: 861/797→861/861 hermetic, tsc clean, eslint 0 errors, build
  compiles (pre-existing `things-to-do` prerender failure unchanged).

*End of discovery. No implementation performed. Awaiting explicit approval for
Stage 10 implementation (proposed order §28).*
