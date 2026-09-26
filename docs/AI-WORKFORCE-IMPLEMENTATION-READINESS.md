# AI Workforce + QA Execution — Implementation Readiness Report
## Inspection only. No implementation follows. STOP after this report and await approval.

> **Date**: 2026-09-26. **Basis**: fresh re-verification (this session) +
> `docs/AI-OPERATING-SYSTEM-CURRENT-STATE-AUDIT.md` (audit, 2026-09-26) +
> `docs/PHASE-139-142-SUMMARY.md` + discovery report. Re-verified this
> session: git HEAD still `e67934d`; 332 deleted / 46 modified / 44
> untracked (was 43 — the delta is the audit doc itself); migrations
> 139–144 still untracked; **all 3 test failures still present**
> (`sentinel-events` + 2× `p1-generic-error-responses`, 11 pass / 3 fail
> on the two files); no `.github`, no `playwright.config.*`, 5 Vercel
> crons, no staging. **The audit is current. Nothing has been resolved
> since it.** The 22-vs-27 tool discrepancy is also still present (seed
> content says 22; registry dispatches 27).

---

## 1. What already exists (reuse — do not rebuild)

| System | Reuse point | Path |
|---|---|---|
| Agent Runtime | `orchestrate()` — the single execution entry; Workforce never executes tools itself | `lib/ai/orchestrator.ts` (untracked, in-tree) |
| Agent/Tool registries | `getAgentByName/listAgents/getAllowedToolDefinitions` — UI reads these, never hardcodes agents | `lib/ai/agent-registry.ts` |
| Audit/read tables | `agents, agent_tools, tool_definitions, agent_tasks, approvals, agent_runs, agent_steps, agent_reports, knowledge_documents/chunks, system_events, incidents` — all authenticated-SELECT readable; writes stay service-role | `db/migration_139–144*.sql` |
| Gateway | `POST /api/ai/gateway` (execute) + `GET` (list agents — explicitly left for Workforce wiring) | `app/api/ai/gateway/route.ts` |
| Approval enforcement | `checkApprovalRequired` L0 hard-block; server-side only, UI must never authorize | `lib/ai/approvals.ts` |
| Guards/tenancy/rate-limit/cron-auth | input/output/SSRF guards, `resolveTenantContext`, `articleAi` bucket, `isAuthorizedCronRequest` — every new Workforce/QA route reuses these, no new auth inventions | `lib/ai/*guard*`, `lib/tenant-context.ts`, `lib/rate-limit.ts`, `lib/cron-auth.ts` |
| AI Studio (creation surface) | Growth Studio chat + guard-rejections panel stay as-is; Workforce is the *operations* surface, not a replacement | `app/[locale]/admin/ai/` (nav: `app/[locale]/admin/layout.tsx:82`) |
| Notifications infra | `lib/notifications.ts` types + delivery; agent/approval types do NOT exist yet — extension point, not reuse | `lib/notifications.ts:49` |
| Cron (control-plane scheduling) | 5 Vercel crons incl. `sentinel-sweep` (the only cron calling `orchestrate()`) | `vercel.json`, `app/api/cron/sentinel-sweep/route.ts` |
| Test suite | 72 listed / 83 on-disk hermetic suites; 11 orphans must be registered before they can gate anything | `package.json` "test" script |
| Playwright (authoring only) | devDep `^1.60.0` + local browser binaries; zero config/specs | `package.json:80` |

---

## 2. What is missing (create, in dependency order)

1. **Stage 0 reconciliation** (before anything): commit/stage 139–144 work,
   fix 3 failing tests, register 11 orphan test files, confirm 139+ live,
   correct seed/docs counts (22→27). Nothing new is "done" on a red suite.
2. **Workforce UI shell + 9 sections** (Command Center, Agents, Tasks,
   Approvals, Reports, Activity, Knowledge, Sentinel, QA) under the
   existing admin nav pattern — read-only first, actions only where the
   model permits (Stage 4 approve/reject via server action).
3. **Approval human surface** (highest-value slice): pending list + review/
   approve/reject writing `approvals.status` through an admin-gated server
   route; enforcement stays in `approvals.ts`.
4. **QA execution plane**: provider abstraction + GitHub Actions workflow +
   `playwright.config.ts` + 2 first specs + results ingest (§5–§7).
5. **Results schema delta**: micro-migration adding `'qa_failure'` to the
   `system_events.kind` CHECK (+ `deriveSeverity` branch) — the only
   144b-adjacent schema change currently foreseen; next number **145**.
6. **Durable workers** (Stage 10, after QA proves the pattern): queue/lease
   on `agent_tasks`, retries/timeout/cancel/idempotency.
7. **Memory, Telegram, voice, 3D office**: no code; memory design must
   precede any persistent-fact writes.

---

## 3. What can be reused (explicit no-build list)

Runtime, registries, gateway, guards, tenancy, rate limiting, cron auth,
all seven legacy AI systems (Growth Studio, trends, social automation,
article/seating assistants, TTS), the hermetic test pattern, FTS/pg_trgm
retrieval, the notifications delivery mechanism, the incident pipeline
(dedupe → incident → sweep readers). **No provider, guard, tenancy, or
publishing logic is to be duplicated.**

---

## 4. What needs to be created (new code/surfaces)

Workforce UI (9 sections, real-data-only, intentional empty states);
approve/reject server action + route; QA execution provider abstraction
(`runTestSuite/runBrowserTest/getRunStatus/getArtifacts/cancelRun`
interface — no GitHub concepts leak into the runtime); GHA workflow;
Playwright config + 2 smoke specs + seed/cleanup strategy; results-ingest
route (fail-closed auth + non-production gate, cf. `/api/test-e2e`
precedent); `get_qa_runs` read-only tool + ACL seed; migration 145
(`qa_failure` kind); hermetic tests for every new subsystem (Stage 16
list); staging deployment + staging Supabase project + CI secrets
(out-of-repo checklist).

---

## 5. What should remain in Vercel (control plane)

Gateway, runtime, registries, knowledge, tasks/approvals/reports CRUD,
entire Workforce UI, Sentinel UI + sweep, QA UI + results ingest,
ingest/status endpoints, cron *triggers*. Rule: if it answers a question,
renders a page, or records a decision — Vercel. Browsers never execute
inside request handlers (250 MB function cap, no browser OS deps, per-run
CPU billing, minutes-long suites vs function durations).

---

## 6. What should run externally (execution plane)

Playwright/API/browser suites, screenshots/traces/videos, future heavy
jobs and durable workers. **Decision: GitHub Actions first.** Reasoned
against the alternatives: Vercel rejected above; dedicated container/VM
adds cost/ops with no repo affinity; self-hosted runner is a later
optimization, not a starter. GHA is free, has first-class Playwright
support + artifact storage, and — critically — the repo has no CI at all,
so Actions also closes the "tests never run automatically" gap. The
runtime couples only to the provider interface (§4), so a later backend
swap touches one adapter, not the agent model. The worker reports back
via the ingest route; the control plane never shells out, never holds
worker credentials beyond an ingest token.

---

## 7. How QA execution should work (end-to-end)

```
QA Agent (L0, read-only tools: get_qa_runs + existing 20)
  → QA Task (agent_tasks row, human or schedule created)
  → Execution Request (provider interface; GHA adapter: workflow_dispatch /
     schedule with suite + env + commit SHA)
  → QA Worker (GHA: playwright vs STAGING baseURL — hard-fail otherwise;
     Stripe sk_test only; qa+ test users; per-spec cleanup + 24h stray sweep)
  → Structured Result (ingest route → agent_runs[triggered_by=schedule] /
     agent_steps / agent_reports / system_events(kind=qa_failure) on failure)
  → Control plane: QA UI reads it; qa_failure → existing incident pipeline →
     sentinel-sweep picks it up. No parallel notifier.
```

First suite (unchanged from Phase 144 report): `auth-login` (+dashboard
smoke) and `fundraiser-donate`. Daily schedule + on-demand dispatch — not
per-2h; staging failures are not production fires. Full category list
(smoke→security/RLS/AI/regression) is framework headroom, not 144b scope:
build for 18 categories, ship 2 specs. L0 invariant: the agent *requests
and reads*; the worker *executes* under CI authorization — same layering
as sentinel-sweep's direct reads, never agent shell access.

---

## 8. How Workforce UI connects to the Agent Runtime

- **Reads**: Next.js Server Components via the authenticated server client
  (RLS already grants authenticated SELECT on registry/runtime/knowledge/
  observability tables) or via existing code (`listAgents`,
  `getAllowedToolDefinitions`, direct Supabase reads mirroring
  `GrowthStudioClient`/rejections-page patterns). No new read API needed;
  agents/tools come from the registry — hardcoding agents in UI is
  prohibited and unnecessary.
- **Writes**: exclusively through server actions/routes that re-check
  `requireAdmin` + ownership, then use the service role — approve/reject
  flips `approvals.status`; QA run requests create `agent_tasks` rows the
  *external* worker consumes (the UI never triggers execution directly).
- **Never in UI**: authorization decisions, tenant IDs from client input,
  permission/role/risk overrides, secret exposure, ephemeral-model-output
  dependence (reports persist first, UI reads the row).
- **Placement**: new section under the existing admin navigation
  (`app/[locale]/admin/layout.tsx` pattern; current AI entries: Growth
  Studio + Guard Rejections). No redesign of app navigation.

---

## 9. Database changes required

- **Stage 0**: none (reconciliation only).
- **Workforce UI (Stages 1–6, 9UI, 11)**: none anticipated — all reads
  against existing tables; approve/reject updates existing `approvals`
  columns.
- **QA execution (Stages 7–8)**: **migration 145** — add `'qa_failure'`
  to `system_events.kind` CHECK (+ rollback twin, Supabase mirror, RLS
  untouched, hermetic test). Optionally extend `agent_reports.report_type`
  with `'qa'` (cosmetic; `'task'` suffices). Evidence artifacts live in
  Storage (`cms-media/qa-runs/` or micro-bucket), referenced by URL from
  `metadata` — no new table (rejected with justification in the Phase 144
  report §3: `agent_runs`+`agent_steps`+`system_events` already cover
  identity/steps/alerting).
- **Stage 10+**: queue/lease columns or table (design phase, not now);
  Telegram identities (Stage F, not now). No pgvector (no demonstrated
  need — reaffirmed).

---

## 10. Correct implementation sequence (stages as ordered, with gates)

```
Stage 0  Reconcile  ── gate: suite 713/713, tree committed, 139+ live-confirmed,
                       counts corrected ──► unblocks everything
   ├─► Workforce UI shell + Command Center (reads only) ── gate: real-data review
   ├─► Agents → Tasks → Reports → Activity (reads only)
   ├─► Approvals surface (first UI write; server-enforced) ── gate: L0 still L0,
   │       UI cannot authorize (adversarial review)
   ├─► Knowledge UI (reads) + Sentinel UI (reads on existing tables/events)
   ├─► QA: staging → provider adapter → GHA → config + 2 specs → ingest →
   │       get_qa_runs → UI ── gate: green cycle + deliberate-failure drill
   │       proving qa_failure → incident → sweep visibility
   └─► Workers / memory / Telegram / autonomy — each gated on the above;
       3D office last (visualization only, never a second runtime)
```

Per-stage STOP-and-report applies before each major stage (what exists /
to add / files / DB / security / tests / migration # / rollback), exactly
as the master plan requires. Cross-cutting Stage 15 (per-route auth,
tenancy, ACL, guards) and Stage 16 (hermetic tests incl. tenant-isolation,
worker-auth, duplicate-execution protection) are acceptance criteria on
every stage, not separate stages. Stage 18 prohibitions (no autonomous
deploy/migrate/shell/finance/infra) hold throughout; agents stay L0.

---

*End of readiness report. No code, migration, dependency, config, spec, or
workflow was created or modified. Awaiting stage-by-stage approval,
starting with Stage 0.*
