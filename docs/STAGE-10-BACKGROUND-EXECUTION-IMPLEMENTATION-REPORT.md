# Stage 10 — Background Execution: Implementation Report

> **Type**: Implementation record. Discovery audit preserved separately in
> `docs/STAGE-10-BACKGROUND-EXECUTION-DISCOVERY.md` (addendum appended there,
> findings not rewritten).
> **Date**: 2026-09-29.
> **Scope implemented**: 10.0 → 10.8 exactly. No Stage 11+ work, no unrelated
> refactors, no Sentinel changes, no scheduler, no new permissions beyond the
> worker-token env contract documented below.

---

## 1. Implementation (per subphase)

- **10.0 Contract + envelope** (`lib/exec/envelope.ts`, 9 tests): versioned canonical
  envelope (identities, canonical args with byte-stable form, budget, idempotency
  continuity adopting caller keys). Wired into the orchestrator block path
  (`orchestrator.ts:300-309` stores it in `approvals.proposed_outcome`, minted
  pre-sanitization) and the QA claim path (`claim.ts: parseRowArgs` tries the
  envelope first — server-resolved tenant wins — with legacy string fallback).
  Legacy rows/behavior unchanged (all pre-existing QA tests pass unmodified).
  Resolves the discovery §4 mismatch for new rows: envelope-first parse succeeds
  where sanitized evidence returns null (proven by test).
- **10.1 Persistence** (`db/migration_146_background_execution.sql` + rollback twin
  + `supabase/migrations/20261001000000_…` byte-identical mirror + order-file
  entry): 9 columns on `agent_tasks` (incl. `claim_token_hash`, added after first
  draft when the ingest design required single-use verification), `attempt_no` +
  partial unique on `agent_runs`, claim/lease/approved-poll indexes. No status
  vocabulary change (existing 7 reused with documented mapping); `approval_id` FK
  deliberately NOT tightened (live orphans UNVERIFIED — binding enforced in app);
  RLS/grants untouched. 4 migration-shape tests.
- **10.2 Claim + lease** (`lib/exec/claim.ts`, `lib/exec/tokens.ts`, 8 tests):
  idempotent enqueue (payload carries envelope; UI never selects payload),
  atomic conditional claim (status+attempt+run_after in one UPDATE; lost race =
  next candidate), live-approval + budget gates with terminal `exec-*` stamps,
  numbered attempt-row creation with lease release on failure, owner-guarded
  release. Tokens mirror the QA two-layer shape (timing-safe Layer-1 with PREV
  overlap; 32-byte single-use claim, SHA-256 at rest, 15-min default TTL clamped
  to 2h max).
- **10.3 Binding** (`lib/exec/binding.ts`, 7 tests): six-way live revalidation
  (tool exists → agent active+matching → action triple-match → approval live
  when required-or-linked → tenant triple-match → args integrity + approval-time
  drift check). All failures permanent. One real bug caught by tests during
  implementation (snake_case/camelCase job-field mismatch) and fixed.
- **10.4 Budgeted execution** (`lib/exec/runner.ts`, `lib/exec/dispatch.ts`,
  5 tests): single dispatch through the existing registry (scope-routed,
  viewer-role floor, unknown scope fails closed), attempt timeout race,
  output truncation, throw→retryable classification. `MAX_TOOL_ITERATIONS=1`
  spirit preserved (one approved invocation = one call). Real dispatch covered
  by types + route-security scans (live tools need DB, untestable hermetically).
- **10.5 Recovery** (`lib/exec/recovery.ts`, 5 tests): owner+token+live-lease
  heartbeat (expired leases not renewable); stale-lease reclaim (requeue with
  deterministic capped backoff under budget, terminal `exec-retry-exhausted` at
  budget); reclaim races safe via conditional writes.
- **10.6 Ingest** (`lib/exec/ingest.ts`, 7 tests): duplicate-terminal short-circuit
  before token checks; single-use consumption; forward-only conditional
  transitions (running→completed/failed/queued); lease-expired results rejected;
  cross-job tokens rejected; terminal freeze beats replays.
- **10.7 Audit/surfacing** (`lib/exec/materialize.ts` + tests, `lib/exec/emit.ts`,
  ingest report filing): claim route materializes approved approvals (bounded;
  `request_qa_run` excluded — QA plane owns it; legacy approvals stamped
  `exec-invalid-envelope`; idempotent via envelope key; conditional
  `exec-task:<id>` stamps); terminal ingests file one `agent_reports` row
  (Reports UI + hops, zero new surfaces) and one audit step; terminal failures
  emit metadata-only `job_error` (existing pipeline → Sentinel, untouched).
  Existing task/activity/report/Sentinel surfaces render new rows with no code
  changes — verified by inspection, zero UI edits made.
- **10.8 Verification**: §Tests/§Git below.

## 2. Database

- Migration: `db/migration_146_background_execution.sql` (+ rollback twin,
  + `supabase/migrations/20261001000000_migration_146_background_execution.sql`
  mirror, + `staging-migration-order.txt` entry). NOT yet applied anywhere by
  this stage (no live DB access; staging apply is an ops step).
- Tables changed: `agent_tasks` (+9 cols, 1 UNIQUE, 2 partial indexes),
  `agent_runs` (+1 col, 1 partial unique index), `approvals` (+1 partial index).
  Tables created: none.
- RLS impact: none (no policies added/changed/removed; worker writes remain
  service-role-via-routes, the existing trust boundary).

## 3. Runtime

- Worker implementation: `POST /api/exec/claim` (Layer-1; reclaim → materialize →
  claim), `POST /api/exec/heartbeat` (Layer-1 + claim token + owner), `POST
  /api/exec/ingest` (claim-token-only; terminal-failure emission), `POST
  /api/exec/run` (Layer-1 bounded unit: claim → live rows → runner → ingest →
  emission). No scheduler attached, no loop, no background process.
- Claim: atomic conditional UPDATE; lease 15-min default (clamped 1m–2h);
  attemptNo = count+1; numbered `agent_runs` row per claim.
- Heartbeat: renew-only, owner+token+live verified; wrong-worker/expired/non-
  running rejected.
- Retry: attempt budget (default 3, schema-capped 5), deterministic backoff
  60s·2^(n-1) capped 1h via `run_after`; permanent classes (binding, invalid
  envelope/approval, exhausted) never retry.
- Idempotency: enqueue UNIQUE key → same job; conditional claim → one winner;
  natural attempt identity (task,attempt_no) → duplicate:true replays; single-use
  tokens consumed on every live ingest.
- Limits: 1 tool call/attempt, attempt timeout from envelope budget, output
  capped, ingest error caps, claim/materialize/reclaim bounded (3/10/3).

## 4. Security

- Authorization: Layer-1 timing-safe Bearer (+PREV) on claim/heartbeat/run;
  claim-token-only ingest; 401/403/404/422 discipline; `execClaim` 60/min bucket
  added (additive, qaIngest precedent).
- Tenant isolation: server-resolved envelope tenant; triple-match binding;
  execution ctx built from bound values; platform jobs use the placeholder→NULL
  precedent with viewer floor. Cross-tenant claim/execute/inspect paths tested
  (race, binding drift, cross-job token, E2E two-tenant).
- Approval/argument binding: six-way live re-check; byte-stable canonical args;
  approval-time drift check; crafted/expired/forged approvals fail closed
  (permanent). No `if approved: execute()` shortcut exists.
- Claim tokens: 256-bit, SHA-256 at rest, TTL, single-use, wrong-job/wrong-
  worker/reuse rejected; consumed on ingest.
- Service-role: confined to the 4 routes + existing lib paths (scanned); exec
  lib takes injected clients, reads no secrets (scanned); no new bypass through
  the 7 known risk areas (reviewed, unchanged, documented in report §11/§16).
- Static scans: p1-generic-error allowlist extended by 4 audited lines (same
  console-only-temporary shape as the QA routes); new `routes.test.cjs` pins
  auth/rate-limit/generic-errors/no-arbitrary-execution/service-role
  confinement; no-secrets scans on VMs and SELECT lists.

## 5. Tests

```text
npm test                                   → 861/861 pass, 0 fail, 36 suites (baseline was 797/797; +64)
npx tsc --noEmit                           → clean, 0 errors (2 transient errors fixed during implementation)
npx eslint lib/exec/ app/api/exec/ ...     → 0 errors (2 unused-import warnings fixed)
npm run build                              → compiles + type-checks; prerender stops at the PRE-EXISTING
                                             things-to-do/[city] new Date() failure (lib/external-events.ts:221,
                                             identical file/line/cause as Stages 8–9; neither file in Stage 10 diff)
```

- New test files (11, all registered in `package.json` explicit list):
  `exec/envelope|claim|binding|runner|recovery|ingest|materialize|migration|
  routes|execution-e2e` (10) + `ai/agent-runs` (fills the zero-coverage gap).
- Extended: `qa-execution` (+1 interop test; legacy assertions untouched),
  `activity` (+2 href assertions from Stage 9 — pre-existing), `p1-generic-error`
  (+4 audited allowlist lines).
- Concurrency tests: claim race, reclaim race, duplicate/concurrent ingest,
  idempotent re-materialization. Crash recovery: heartbeat/expiry/reclaim/
  resume-as-new-attempt. Tenant isolation: binding drift, cross-job token,
  two-tenant E2E. Authorization: 7 binding mismatch classes + E2E tamper with
  zero dispatch.

## 6. Files

Created (22): `lib/exec/{envelope,tokens,claim,binding,runner,dispatch,recovery,
ingest,materialize,emit}.ts`, `lib/exec/__tests__/{envelope,claim,binding,
runner,recovery,ingest,materialize,migration,routes,execution-e2e}.test.cjs`,
`lib/ai/__tests__/agent-runs.test.cjs`, `app/api/exec/{claim,heartbeat,ingest,
run}/route.ts`, `db/migration_146_background_execution{,_rollback}.sql`,
`supabase/migrations/20261001000000_migration_146_background_execution.sql`,
`docs/STAGE-10-BACKGROUND-EXECUTION-IMPLEMENTATION-REPORT.md` (this file).
Modified (9): `lib/ai/orchestrator.ts` (envelope mint on block path),
`lib/qa/claim.ts` (envelope-first parse + proposed_outcome select),
`lib/qa/__tests__/qa-execution.test.cjs` (+1 test),
`lib/security/__tests__/p1-generic-error-responses.test.cjs` (+4 allowlist),
`lib/rate-limit.ts` (+execClaim bucket), `.env.example` (worker token docs),
`package.json` (11 registrations), `db/staging-migration-order.txt` (+1 line),
`docs/CHANGELOG.md` (Stage 10 entry),
`docs/STAGE-10-BACKGROUND-EXECUTION-DISCOVERY.md` (outcomes addendum).

## 7. Git

```text
git status      → only Stage 10 files staged; pre-existing .gitignore mod + unrelated untracked work untouched
git diff --stat → (recorded at commit; ~24 files, migration + lib/exec + routes + tests + docs)
git log -1      → Stage 10 commit hash below
```

Final Stage 10 commit chain: implementation `12b4799`, report finalized in the
subsequent amend (final HEAD below — verify with `git log --oneline -2`):
`feat(workforce): add durable background execution loop` (39 files).

## 8. Known Issues (separated)

- Stage 10 issues: none open. Deliberate limitations (documented, not defects):
  wall-clock bound by serverless request lifetime (lease-expiry reclaim is the
  backstop); external side-effect duplicates rely on tool-level safety
  (at-least-once ingests converge records only); `agent_tasks.approval_id`
  stays loose (binding enforced in app); legacy pre-10.0 approvals can never
  execute (fail-safe by design); no scheduler attached (manual/operator-driven
  invocation until an explicit scheduling decision).
- Pre-existing issues (unchanged, out of scope): `things-to-do/[city]` prerender
  failure; donate-spec receipt assertion; sweep unscheduled; shadow-ON; 11
  unregistered test files; proxy fail-open inconsistency; chat-route latent
  bypass; `select(*)` in agent-registry; rate-limit fail-open.
- Unrelated working-tree changes: prior-stage untracked work + `.gitignore`
  modification predate Stage 10 and were left untouched.

## 9. Read-onlyUI / autonomy confirmation

No autonomous production behavior introduced: every execution requires a live,
unexpired, action-matching approval (or a non-approval tool binding cleanly);
workers cannot invent jobs (enqueue requires a valid envelope; materialize
requires an approved approval); no auto-approve, no self-approval, no loops
(single dispatch per attempt, bounded attempts); no new tools; no scheduler;
Sentinel unchanged (observes via existing pipeline only).

## 10. Stage 10.9 — live-exercisable approval-gated action (smoke-test enabler)

Test-only addition giving the generic path one legitimate live input (decision:
new tool over flipping, since no agent holds the existing transactional tools
and approval is global-per-tool — `risk_override` is unread anywhere).

- Tool `execSmokeNotify` (`transactional/medium/approval_required=true`,
  granted to `dylan` ONLY): fixed type `'like'`, fixed `'[Stage 10.9 smoke
  test] '` title prefix, single row to the first tenant owner, fail-closed
  without owners. No email ever (shared service sends only with an `email`
  param — never passed). Undo: `DELETE FROM notifications WHERE title LIKE
  '[Stage 10.9 smoke test]%'`, then the 147 rollback twin.
- Files: `db/migration_147_exec_smoke_notify.sql` (+ rollback, supabase mirror,
  order entry); executor + definition + registry list + dispatch case in
  `lib/ai/tools/tenant/tenant-notifications.ts` + `lib/ai/tools-registry.ts`;
  `lib/exec/__tests__/smoke-tool.test.cjs` (10 tests: gating, no-regression,
  materialize, full path with real executor, tamper ×3, rollback).
- Blast radius: zero behavior change for existing agents/tools (verified by
  test); removal = rollback migration (+ row delete above).
