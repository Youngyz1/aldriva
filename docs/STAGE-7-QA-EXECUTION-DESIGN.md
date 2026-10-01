# Stage 7 — QA Execution Architecture: Design Document
## DESIGN ONLY. No code, no migration, no workflow, no runtime change ships with this doc.

> **Status quo re-verified 2026-09-26 for this design** (not inherited on faith):
> no `.github/` exists; no staging environment or staging refs exist in config;
> `system_events.kind` is a closed CHECK of 9 values with **no `qa_failure`**
> (`db/migration_143_sentinel_events.sql:33`; 144 untouched kinds);
> `agent_runs.triggered_by` already admits `'qa'` and `'schedule'`
> (`db/migration_142_agent_runtime.sql:68`); L0 hard-block verified in
> `lib/ai/approvals.ts:60-68` (L0 + approval-gated tool → always blocked,
> table never consulted); blocked runs end synchronously with an approvals
> row + `approvalId` (orchestrator.ts:300-330, `MAX_TOOL_ITERATIONS=1`) —
> **no resume/poll worker exists today**.
>
> **Core design decision up front**: the QA agent proposes runs through the
> *existing* approval gate (which L0 can only ever trigger, never pass),
> a human approves in the Stage 4 surface (unchanged), and an external
> worker *polls* for approved work. The L0-always-blocks property — the
> thing that looks like a limitation — becomes the safety feature: the
> agent can propose, never execute.

---

## 1. Execution provider interface (backend-neutral, zero GitHub concepts)

```ts
// lib/qa/execution-provider.ts (to be created in implementation)
export type QAEnvironment = 'staging'; // closed today; never 'production'
export type QARunStatusValue = 'requested' | 'approved' | 'running' | 'passed' | 'failed' | 'cancelled' | 'expired';

export interface QARunRequest {
  suite: string;               // must be in the allowlisted suite registry (see §7)
  environment: QAEnvironment;
  tenantId: string | null;     // staging tenant under test
  commitSha: string | null;    // app revision under test, if known
  idempotencyKey: string;      // client-generated UUID; re-POSTs are no-ops
  requestedByAgentId: string | null;
  approvalId: string | null;   // set when flowing through the approval gate (§5)
}

export interface QARunHandle { runId: string; status: QARunStatusValue; }

export interface QAArtifact {
  kind: 'screenshot' | 'trace' | 'video' | 'log';
  testName: string | null;
  url: string;                 // https only, allowlisted host suffixes
  bytes: number | null;
}

export interface QAExecutionProvider {
  /** Enqueue a run. Never executes synchronously; returns the persisted handle. */
  requestRun(input: QARunRequest): Promise<QARunHandle>;
  /** Read-only status + counters for a run. */
  getRunStatus(runId: string): Promise<QARunHandle & {
    startedAt: string | null; finishedAt: string | null;
    passed: number; failed: number; skipped: number;
  }>;
  /** Artifact links for a run (from qa_test_results, never generated live). */
  getArtifacts(runId: string): Promise<QAArtifact[]>;
  /**
   * Best-effort cancellation. Accepted only when the run is non-terminal;
   * returns { accepted:false } otherwise. Never force-kills worker infra —
   * cancellation is a row-state request the worker honors at its next
   * checkpoint, not remote code execution.
   */
  cancelRun(runId: string, reason: string): Promise<{ accepted: boolean }>;
}
```

Error modes: `SuiteNotAllowlisted`, `EnvironmentNotAllowlisted`,
`DuplicateIdempotencyKey` (returns the original handle — not an error to
the caller, but surfaced), `RunNotFound`, `TerminalState` (cancel/status
writes against passed/failed/cancelled/expired are rejected). All errors
are typed values, never raw DB/provider text (P1 error policy).

GitHub leakage audit: no workflow names, no workflow_dispatch, no GHA run
IDs, no `ref`/`sha`-as-branch, no Actions artifacts API. The worker's own
opaque identifier is stored as `external_run_id TEXT` (any backend's
string). A `GitHubActionsQAProvider implements QAExecutionProvider` adapter
holds 100% of the GitHub concepts; swapping backends replaces one file.

`runBrowserTest()` from the master-plan sketch is folded into `requestRun`
(`suite` + optional `testNameFilter` field) — a fifth method that only
narrows the same enqueue path would be API theater.

## 2. Chosen backend: GitHub Actions — re-justified, polling (not dispatch)

**Re-verified alternatives, 2026-09-26:**
- *Vercel cron route executing Playwright*: rejected (unchanged) — 250 MB
  function cap vs ~170 MB browser, no browser OS deps on the microVM,
  minutes-long suites vs function durations, per-run CPU billing.
- *Dedicated container/VM*: rejected for now — real cost + ops ownership
  with zero repo affinity, and the repo has no container story anywhere.
- *Self-hosted runner*: deferred optimization, not a starter (attestation
  and maintenance burden with no scale need yet).
- *GitHub Actions*: still the choice — free tier covers nightly + dispatch,
  first-class Playwright + artifact storage, and it simultaneously closes
  the repo's other open gap (no CI runs `npm test` automatically).

**Trigger direction (the important refinement): the worker polls; Vercel
never calls GitHub.** Rationale: pushing from the control plane would
require a GitHub token with `actions:write` living in Vercel env — a
powerful credential guarding a test convenience. Polling inverts the trust:
- GHA workflow runs on `schedule` (nightly, low hour) + `workflow_dispatch`
  (urgent/manual). Each run first calls `GET /api/qa/poll` (ingest-token
  authed, §4), which returns at most one claimable approved request
  (oldest-first), claimed atomically (conditional update, same pattern as
  Stage 4's `decideApproval`).
[ADDENDUM — see A1 for cadence/latency ruling and A2 for the claim-token split.]
- No claimable work → the workflow still runs the nightly smoke suite
  against staging (the standing regression signal), then exits.
- Control plane holds **zero** GitHub credentials. The only new secret is
  the ingest token (§4), which is strictly less powerful.

**Worker→Aldriva authentication**: `QA_INGEST_TOKEN`, 256-bit random,
[ADDENDUM — superseded by A2: split into poll token + per-run claim tokens.]
Vercel env + GHA secret (manual `workflow_dispatch` callers never see it).
Presented as `Authorization: Bearer`, compared timing-safe against SHA-256
(same construction as `lib/cron-auth.ts`), **fail-closed when unset**.
Scoping (structural, not promissory): the token is checked in exactly two
routes (`GET /api/qa/poll`, `POST /api/qa/ingest`) and authorizes exactly:
claim-one-approved-request, insert qa_test_results for a claimed run,
transition that run's status forward, emit at most one `qa_failure` event
per run. It cannot read other tables, cannot approve, cannot touch
approvals/agents/production data paths. Rotation: dual-token support
(`QA_INGEST_TOKEN` + `QA_INGEST_TOKEN_PREV`, either accepted, logged which)
so rotation never breaks a midnight run; procedure documented in the
implementation prompt, not here.

## 3. Migration 145 — exact shape (designed, NOT created)

```sql
-- db/migration_145_qa_execution.sql (+ _rollback twin; supabase mirror)
BEGIN;

CREATE TABLE IF NOT EXISTS qa_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite TEXT NOT NULL CHECK (suite IN ('smoke','auth','payments')),
  environment TEXT NOT NULL CHECK (environment IN ('staging')),
  target_tenant_id UUID REFERENCES organizers(id) ON DELETE SET NULL,
  commit_sha TEXT CHECK (commit_sha IS NULL OR commit_sha ~ '^[0-9a-f]{7,40}$'),
  triggered_by TEXT NOT NULL DEFAULT 'schedule'
    CHECK (triggered_by IN ('schedule','manual','qa','incident')),
  requested_by_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  approval_id UUID REFERENCES approvals(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','running','passed','failed','cancelled','expired')),
  idempotency_key UUID NOT NULL UNIQUE,
  passed INT NOT NULL DEFAULT 0 CHECK (passed >= 0),
  failed INT NOT NULL DEFAULT 0 CHECK (failed >= 0),
  skipped INT NOT NULL DEFAULT 0 CHECK (skipped >= 0),
  external_run_id TEXT,
  artifact_base_url TEXT,
  error TEXT CHECK (error IS NULL OR char_length(error) <= 2000),
  started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT qa_runs_terminal_needs_finish CHECK (
    status NOT IN ('passed','failed','cancelled','expired') OR finished_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_qa_runs_claim ON qa_runs(status, created_at)
  WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_qa_runs_suite_created ON qa_runs(suite, created_at DESC);

CREATE TABLE IF NOT EXISTS qa_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
  file TEXT NOT NULL CHECK (char_length(file) BETWEEN 1 AND 300),
  status TEXT NOT NULL CHECK (status IN ('passed','failed','skipped','flaky')),
  duration_ms INT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error TEXT CHECK (error IS NULL OR char_length(error) <= 2000),
  screenshot_url TEXT, trace_url TEXT, logs_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qa_results_run ON qa_test_results(run_id);

-- Incident wiring: admit the qa_failure kind (closed CHECK today has 9 values, §verified).
ALTER TABLE system_events DROP CONSTRAINT IF EXISTS system_events_kind_check;
ALTER TABLE system_events ADD CONSTRAINT system_events_kind_check CHECK (kind IN (
  'api_error','job_error','webhook_error','payment_reconciliation','auth_failure',
  'storage_error','guard_rejection','approval_block','agent_tool_error','qa_failure'));

ALTER TABLE qa_runs ENABLE ROW LEVEL SECURITY;
-- Reads mirror the 142 convention: any authenticated role may read.
DROP POLICY IF EXISTS "Authenticated can read qa runs" ON qa_runs;
CREATE POLICY "Authenticated can read qa runs" ON qa_runs FOR SELECT USING (auth.role() = 'authenticated');
ALTER TABLE qa_test_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read qa test results" ON qa_test_results;
CREATE POLICY "Authenticated can read qa test results" ON qa_test_results FOR SELECT USING (auth.role() = 'authenticated');
-- No INSERT/UPDATE/DELETE policies: writes are service-role only, via the
-- ingest route (§4). Same posture as agent_tasks/approvals/agent_reports.

COMMIT;
NOTIFY pgrst, 'reload schema';
```

Design notes: suite/environment are closed CHECKs (worker cannot invent
targets — production is *unrepresentable*); counts live on the run row so
list views never aggregate; `claimed_at` + conditional claim makes
double-pickup impossible; `idempotency_key UNIQUE` makes re-requests safe;
[ADDENDUM — see A2: plus claim_token_hash + claim_expires_at columns.]
terminal rows must carry `finished_at` (reportable invariant). No changes
to any existing table except the additive kind value. No UI reads are
designed here (Stage 8).

## 4. Ingest route design

- `GET /api/qa/poll`: ingest-token authed. [ADDENDUM — see A1 (nightly
  03:17 UTC + dispatch path) and A2 (poll token vs claim token split).] Returns oldest `approved`,
  unclaimed (`claimed_at IS NULL`), unexpired run for an allowlisted suite
  — or 204 empty. Claim is atomic in the same handler: conditional
  `UPDATE … SET claimed_at/status='running' WHERE id AND status='approved'
  AND claimed_at IS NULL`; zero rows → 409 already-claimed (another worker
  won; no error, just backoff).
- `POST /api/qa/ingest`: ingest-token authed. Body `{ runId, idempotencyKey,
  status, counters, results[], artifacts[], error? }`. Idempotency: run
  UUID + idempotencyKey match an existing terminal run → 200 no-op (returns
  current state); non-terminal re-POST → upsert results by
  `(run_id, file, name)` natural key, recompute counters server-side
  (worker-supplied counters are advisory, recomputed authoritatively).
- Validation (malicious/compromised-worker containment): status transitions
  only forward along requested→approved→running→{passed,failed,cancelled,
  expired} (server-side transition table; anything else 422); suite and
  environment re-validated against allowlists (a stolen token cannot aim
  runs at production — production is not a representable value); error
  strings truncated to 2000; artifact URLs must be https and limited to
  allowlisted host suffixes (Actions artifacts + staging storage);
  `kind` is hardcoded to `qa_failure` server-side — the worker never
  chooses an event kind, route, or tenant outside the run's own target;
  per-run result caps (e.g. 500 rows) bound abuse.
- Rate envelope: ingest route sits behind the existing rate-limit helper
  (new bucket, e.g. `qaIngest`, modest per-minute cap per token).

## 5. L0 boundary enforcement, concretely

- **New tool** (implementation stage): `request_qa_run`, scope
  `transactional`, risk `medium`, `approval_required = true`, granted to
  the QA agent only via one `agent_tools` row. Its executor does NOT run
  anything: it validates (suite/environment allowlists, idempotency key
  shape) and returns a "request recorded for human approval" receipt.
  Because `approval_required=true`, `checkApprovalRequired`
  (`lib/ai/approvals.ts:60-68`) blocks it for L0 *unconditionally* — the
  orchestrator then creates the approvals row
  (`action='request_qa_run'`, evidence `{suite, environment,
  idempotencyKey}` — already redacted-shape-safe, no raw args by
  construction) and ends the run with `approvalId`. **The agent's only
  possible outcome is a human-readable proposal.** It cannot execute code,
  hold the ingest token, reach the worker, or self-approve: self-approval
  would require L1+ (none exists) or the Stage 4 UI (human session).
- **Scope non-expansion proof**: the tool has no parameters that touch
  execution (no commands, paths, URLs, credentials — only closed-enum
  suite/environment + tenant UUID + idempotency UUID); the worker polls
  approved *DB rows*, never agent output — even a compromised agent
  session can at most create approval proposals a human must still approve.
- **Approval required — no bypass, justified**: requesting spins external
  compute and mutates staging. Cost + staging-write risk clear the bar
  that Stage 4's surface exists to clear, and routing through it gives the
  approvals table its first genuine consumer (narrowing the Stage 4
  hand-off gap for this domain). Pure reads (`get_qa_runs`-style history,
  low risk, mirroring existing read tools) bypass approval like all reads.

## 6. Staging/test target (re-verified absent)

No staging deployment, no staging Supabase project, no staging config
exists today (re-checked `.env.example`, `vercel.json`, `package.json` —
zero staging refs). Minimum viable safe target for the first smoke suite:
1. **Separate Supabase project** (`aldriva-staging`) — non-negotiable:
   test signups/donations/orders must never touch tenant tables the
   business reads, and QA negative tests emit `auth_failure`/`api_error`
   rows that would otherwise page Sentinel as production incidents.
2. **Vercel preview deployment** pinned as the suite target (production
   domain never targeted; target URL in GHA secrets, asserted `https`).
3. **Seeded harness tenant**: one reserved organizer (e.g. name `QA Staging
   Harness`, UUID recorded in GHA secrets + staging seed script), test
   users `qa+<run>@…`, per-spec cleanup + 24h stray sweep (precedent:
   `/api/test-e2e` self-delete).
4. **Test-mode payments only**: Stripe test keys in staging env (live keys
   must not exist in the staging project — CI asserts `sk_test` prefix
   before running; NOWPayments/crypto flows excluded from the first suite,
   sandbox mode still unverified).
- Tradeoffs stated: separate project costs money/ops and can drift from
  prod (mitigate: seed from schema + nightly suite as the drift detector);
  the rejected alternative — reserved tenant *in production* — saves a
  project but pollutes ledgers and Sentinel signal, which defeats the
  purpose of QA. Not close.

## 7. First smoke suite scope (confirmed: login + donate, unchanged)

Still the right minimal pair: `auth-login` (the gate for everything;
highest silent-regression risk, especially under the ongoing `[locale]`
restructure) + `fundraiser-donate` via Stripe test card (the money-path UI
leg the backend `payment_reconciliation_failures` signal cannot see —
complementary, not redundant, per the Phase 144 report). Dashboard lands
as assertions inside login (200 + nav), not a third suite. Ticket
checkout, organization creation, messaging stay second-wave (heavier,
dormant channels, lower marginal proof-per-flake).

## 8. Failure → incident wiring (existing pipeline, concrete thresholds)

On ingest of a terminal `failed` run, the ingest handler — not the worker —
evaluates, deterministically:
- Eligible suites: `smoke` only at first (auth/payments categories).
- Dedupe: `qa_failure:<suite>:<date>` (one incident per suite per day max —
  per-test spam is explicitly rejected; per-test rows remain queryable).
- Severity: first failing day → `s3`; third consecutive failing day for
  [ADDENDUM — see A3: this logic ships gated behind QA_SHADOW_MODE.]
  the same suite → escalate to `s2` (counter derived from prior
  `qa_failure` events for the dedupe family, same burst-count idiom as
  `deriveSeverity`). Never `s1` (staging failures are not prod outages).
- `flaky` (failed-then-passed-on-retry within the run): recorded, never an
  incident. `skipped`: never an incident.
- Emission path: the existing `insertSystemEvent()` with the new
  `qa_failure` kind → existing 60-min dedupe → `incidents` → picked up by
  `sentinel-sweep` via `get_recent_events`/`get_active_incidents` with
  zero tool changes (kind is a filter value, not a column). No parallel
  notifier is built — same verdict as the Phase 144 report §3.

## 9. Rollback strategy for migration 145

Standard twin `db/migration_145_qa_execution_rollback.sql` (+ Supabase
mirror): drop `qa_test_results`, drop `qa_runs`, restore the 9-value kind
CHECK. Two caveats, stated in the rollback header: (a) the CHECK restore
fails if any `qa_failure` system_events exist — purge or accept them
first; (b) rollback is only sanctioned pre-first-production-data — after
real runs accumulate, forward-fix instead (documented policy, same as
prior phases). No existing table is altered except the additive kind
value, so blast radius is confined to QA surfaces.

## 10. Open risks / low-confidence items (explicit)

1. **GHA→Supabase network reliability** (medium confidence): poll/ingest
   are plain HTTPS POSTs, but transient failures mid-run need worker-side
   retry with the same idempotency key — validate with a throwaway spike
   (manual dispatch against staging, kill network mid-run) before calling
   the pipeline durable.
2. **Playwright flake → incident noise** (genuine risk): thresholds (§8)
   mitigate, but the first month should run in *non-incidenting shadow
   [ADDENDUM — resolved by A3: shadow mode is now in-scope with QA_SHADOW_MODE default true.]
   mode* (record everything, emit nothing) to calibrate flake baselines —
   propose this explicitly for the implementation prompt.
3. **Staging drift from production** (accepted): the nightly suite IS the
   drift detector; supplement with schema-parity check in the workflow
   (compare migration heads) — cheap, high-value.
4. **Claim races between concurrent workflow runs** (low risk, handled):
   conditional claim makes double-pickup impossible, but untested under
   concurrency — covered by a hermetic test on the claim predicate plus a
   two-dispatch spike.
5. **Ingest-token lifecycle** (process risk): rotation procedure must be
   exercised once (dual-token acceptance helps); compromise response =
   rotate + audit `qa_runs` claimed in the window.
6. **Approval UX latency**: nightly poll means an approved request may
   wait hours; acceptable for scheduled QA, but on-demand expectations
   must be set (manual dispatch path covers urgency).
7. **Cost**: GHA minutes + staging project + artifact retention — small
   but nonzero; artifact retention cap (e.g. 14 days) belongs in the
   implementation.

---

*End of Stage 7 design. Nothing implemented, migrated, installed, or
configured. Awaiting design approval before any implementation prompt.*

---

# ADDENDUM — 2026-09-26 (trigger latency, token scope, shadow mode)

> Three clarification answers appended without rewriting the design above.
> Where an answer changes a section's meaning, the section carries an
> inline `[ADDENDUM — see A1/A2/A3]` pointer; the authoritative new text
> lives here. Original sections remain as approved in shape.

## A1. Trigger latency — polling kept as an accepted tradeoff (not an oversight)

**Mechanism (concrete): a scheduled GHA workflow, not dispatch-triggered.**
- Standing signal: `schedule: [{ cron: '17 3 * * *' }]` — nightly 03:17 UTC.
  The off-hour minute is deliberate: GitHub documents that scheduled runs
  slip (commonly 5–30 min, occasionally 30–60+) during platform-wide high
  load, worst at the top of every hour, and that queued jobs *may be
  dropped* under sufficient load
  (`docs.github.com/actions/using-workflows/events-that-trigger-workflows`;
  minimum granularity is 5 minutes — finer expressions do not run).
  03:17 dodges the :00 spike; it does not eliminate jitter.
- Each scheduled run does two jobs in order: (1) poll-and-claim at most
  one approved on-demand request (§2/§4), (2) run the standing nightly
  smoke suite regardless. One schedule covers both standing signal and
  approved requests — no second workflow.
- Urgent path: `workflow_dispatch` (manual, in the GitHub UI — the
  control plane deliberately holds no GitHub credentials, §2, so there is
  no "Run now" button in Aldriva Stage 7/8; a same-day result outside the
  nightly window means a human clicks Run workflow).
- Ops footnotes the implementation must include: scheduled workflows run
  only on the default branch at its latest commit; GitHub disables
  schedules on repos inactive 60 days (ops checklist: the nightly suite
  itself is the heartbeat — N missed scheduled runs with no results
  ingested must page as a `job_error`, so a silently-disabled schedule
  cannot masquerade as "all green").

**Is the latency acceptable?** "Reasonable" for QA means: standing nightly
signal by morning, and an approved on-demand request fulfilled by the next
scheduled sweep (worst case ~24h + documented jitter), with a minutes-scale
manual path for true urgency. That meets the QA use case: QA regressions
are next-day decisions, not paging incidents (nothing in §8 pages). The
alternative — Vercel-held GitHub credentials for dispatch-on-approval —
would buy minutes at the cost of a powerful credential guarding a test
convenience, and would still leave the standing nightly schedule in place.
**Decision: polling kept, latency accepted explicitly.** UI copy (Stage 8)
must set the expectation ("results by the next scheduled sweep, nightly
03:17 UTC") rather than implying immediacy.

## A2. Token blast radius — revised to per-run claim tokens (was: shared token)

**Verdict: the shared-long-lived-token design is NOT kept.** Replaced with
two-layer credentials (small delta, recorded as an amendment to §2–§4):

- **Layer 1 — poll token** (`QA_INGEST_TOKEN`, long-lived, dual-token
  rotation as originally described): authorizes exactly `GET /api/qa/poll`
  (list claimable approved requests) and *requesting* a claim. Leak blast
  radius, stated precisely: an attacker can enumerate the approved-request
  queue (suite names + target tenant UUIDs — low sensitivity) and can
  claim-squat runs (mark them claimed so the legitimate worker backs off).
  Squatting is bounded by a short claim TTL (30 min, after which the run
  becomes claimable again) and is *visible* (claim records worker identity
  + timestamp; expired-unfulfilled claims are counted and surfaced). The
  poll token alone **cannot ingest a single test result**.
- **Layer 2 — per-run claim token** (new): returned only inside a
  successful poll-claim response, 256-bit random, single-run-scoped,
  2-hour expiry. Ingest (`POST /api/qa/ingest`) requires the claim token
  matching that run; the poll token is not accepted there. Leak blast
  radius, stated precisely: at most one run's worth of fabricated results,
  only within 2h of claim, still bound by all §4 validation (closed suite/
  environment enums, recomputed counters, 2000-char error caps, URL host
  allowlists, server-chosen `qa_failure` kind, one-incident-per-suite-day).
  It cannot claim other runs, read anything, or touch approvals.

**Schema amendment to §3** (adds two columns to `qa_runs`):
```sql
claim_token_hash TEXT,      -- SHA-256 of the issued claim token; NULL until claimed
claim_expires_at TIMESTAMPTZ, -- claim time + 2 hours; ingest rejects past expiry
```
Ingest verifies `sha256(presented) = claim_token_hash AND now < claim_expires_at`.
Neither long-lived token is minted per run (that would just move the
problem); the per-run token is minted server-side at claim time and exists
only as a hash at rest. Cost of the change: two nullable columns, one extra
comparison in ingest, claim-TTL reclaim logic in poll. Accepted as stated;
the residual risks (claim-squatting DoS bounded by TTL+visibility; token
theft inside the 2h window bounded by validation) are documented, not open.

## A3. Shadow mode — pulled into Stage 7/8 scope (not a risk-list ornament)

**Representation**: environment variable `QA_SHADOW_MODE`, default `true`
(ON = record everything, emit no incidents). Env var rather than a column:
incident emission is a deployment-wide posture decision, not per-run data,
and a redeploy-to-flip is acceptable friction for a decision taken once
after review (a per-row flag would invite half-shadowed states that are
harder to reason about).

**What "built but silent" means concretely** (amends §8): the full incident
wiring — threshold evaluation (smoke-only, per-suite-per-day dedupe,
s3-first-day → s2-third-consecutive, flaky-never) — is implemented in the
ingest handler, but the final `insertSystemEvent()` call is wrapped:
```ts
if (process.env.QA_SHADOW_MODE !== 'false') {
  log would-be emission (suite, dedupe_key, would-be severity) to the run record;
} else {
  insertSystemEvent({ kind: 'qa_failure', ... }); // existing pipeline, unchanged
}
```
The would-be-emission log makes shadow mode *auditable*: the go-live
review reads "would have opened N incidents, M escalations" from real
shadow data instead of guessing flake rates.

**Duration and decider (concrete default, adjustable later)**: manual.
An admin reviews after the **first full week of green smoke-suite shadow
runs**, then flips `QA_SHADOW_MODE=false` and redeploys. Automatic
promotion (e.g. "after N clean runs") is explicitly rejected: flake
calibration needs human judgment over distributions (which tests flake,
on which days, correlated with what), not a counter threshold that a
quiet-but-broken week could satisfy. If week one is red/noisy, the clock
restarts — the decision is "reviewed and deliberately flipped," never
"timed out into incidents."

**Scope consequence**: shadow flag + would-be-emission logging + review
readout are Stage 7/8 implementation scope (the migration needs no new
columns for this — env var only). §10 risk 2 is hereby retired from
"open risk" to "mitigated by design, pending calibration data."

