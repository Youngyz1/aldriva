# Aldriva AI Operating System — Current-State Audit
## Investigation only. No code, migrations, installs, or refactors were made to produce this report.

> **Date**: 2026-09-26. **Method**: direct repository inspection (migrations,
> runtime code, tests, docs, git state) plus three read-only subagent
> inventories (test suite, AI systems, workforce UI). Every claim cites a
> real path. File existence was never treated as completeness — enforcement
> paths were traced.
>
> **Headline**: the AI OS foundation (139–142, plus 143/143b-era Sentinel
> work present in-tree) is **implemented in the working tree but almost
> entirely uncommitted and therefore undeployed as a unit**; live-DB status
> of migrations 139+ cannot be determined from the repo. The test suite is
> larger than documented and has **3 new failures** from working-tree drift.

---

## 1. Executive Summary

- **Phases 139–142 are code-complete in the working tree** (registries,
  agents, knowledge, gateway/orchestrator/approvals/audit) with hermetic
  test coverage — but **every canonical migration file 139–144 and the core
  runtime files are untracked (`??`)**, i.e. never committed. HEAD is
  `e67934d` (a dashboard fix); the tree carries 332 deletions, 46
  modifications, 43 untracked entries. Nothing about 139+ can be called
  "shipped" until committed, migration-applied-live verified, and docs
  reconciled.
- **QA today is answer B: an agent identity with 20 read-only tools, L0.**
  It can answer grounded questions through the gateway; it cannot execute,
  schedule, or report any test. No runner, no specs, no trigger, no results
  schema, no UI.
- **Sentinel exists as identity + 4 read tools + tables + cron sweep +
  7 emitter call sites.** No health_checks, no Sentry/external monitoring,
  no dashboard, no slow-request/job monitoring.
- **Verification (2026-09-26)**: `tsc` 1 pre-existing error
  (`components/IntlProvider.tsx`, unrelated i18n file); `npm test` **713
  tests, 710 pass, 3 fail** — all 3 failures are new, caused by
  working-tree drift (5th cron; AI routes vs P1 error policy). 11 test
  files on disk are silently never run (not in the package.json list).
- **Security perimeter holds**: no arbitrary SQL, no filesystem access, no
  deploy/financial paths in the agent runtime; L0 hard-blocks approvals;
  tenant isolation is fail-closed and UUID-strict. Two noted exceptions:
  rate limiting is deliberately fail-open; new AI routes violate the P1
  generic-error policy (caught by the failing tests, not by review).
- **Next migration number: 145.** Next technically required work: commit +
  reconcile the tree, fix the 3 failing tests, confirm 139+ live, then QA
  foundation or Sentinel hardening per dependency order in §18/§21.

---

## 2. Phase 139 Status — Tool Registry

IMPLEMENTED (working tree; uncommitted — see §14):

- `tool_definitions` table + 22 seeded definitions across 4 scopes
  (`db/migration_139_tool_registry.sql:9`; 4 `INSERT INTO tool_definitions`
  batches). Scopes: `public_read` (8), `admin` (1, `get_content_history`),
  `tenant_scoped` (11), `transactional` (2, medium risk). Risk levels
  `low/medium/high` seeded (`migration_140_agent_registry.sql:80` CHECK).
- Registry code: `lib/ai/tools-registry.ts` — `PUBLIC(8)+ADMIN(1)+TENANT(18)=27`
  definitions today (18 = 14 tenant + 4 Sentinel additions from 143b-era
  work). `executeAITool` refuses tenant tools without context
  (tools-registry.ts:167-171); `executeTenantTool` enforces UUID-strict
  fail-closed context (tools-registry.ts:233-244).
- Every tool file carries hard-coded `SAFE_COLUMNS` + `screenToolResult()`
  + `logToolInvocation()` + `redactArgs()` (tenant: `tenant-events.ts`,
  `tenant-fundraising.ts`, `tenant-products.ts`, `tenant-payments.ts`,
  `tenant-notifications.ts`; sentinel: 4 files under `tools/sentinel/`).
  No `INSERT/UPDATE/DELETE` in tool files except the audit logger.
- RLS: `ai_tool_invocations.tenant_id` nullable FK to `organizers`
  (`db/migration_113_ai_tool_invocations.sql:17`); NULL rows admin-only.

PARTIALLY IMPLEMENTED:
- Seed-content drift: the Phase-141 knowledge seed still describes "22
  Tools… tenant-scoped (11)" (`db/migration_141_knowledge_foundation.sql`
  seed block) while the registry has 27 definitions (14 tenant + 4
  sentinel). Cosmetic but factually wrong grounding data.

MISSING / DEFERRED: none structural. (Transactional-tool approval UX is a
142/Workforce-UI matter.)

CONCERNS: the entire phase (migration + rollback + mirror) is untracked;
live application unverified from repo (§14).

---

## 3. Phase 140 Status — Agent Registry

IMPLEMENTED (working tree; uncommitted):

- `agents`, `agent_versions`, `agent_tools` tables
  (`db/migration_140_agent_registry.sql:8,55,76`); autonomy CHECK
  `L0–L4` with `DEFAULT 'L0'`; column comment locks L0 to Phases 140–142.
- Seeds: **Dylan (21 tools), Sentinel (20), QA (20)** — all `L0/active`
  with read-only system prompts explicitly forbidding writes/deploys/
  financial actions (`migration_140_agent_registry.sql:96-98`; QA seed:
  "You must never trigger writes, deploys, or production mutations").
  Neither Sentinel nor QA gets `get_content_history` (admin) or the 2
  transactional tools.
- Enforcement is real, traced end-to-end: gateway allowlists
  `dylan|sentinel|qa` (`app/api/ai/gateway/route.ts:68`) → orchestrator
  resolves agent via `getAgentByName` and loads per-agent tool defs
  (`lib/ai/orchestrator.ts:94-109,180-181`) → allowlist rejects
  hallucinations before any executor/DB call (orchestrator.ts:257-285) →
  `checkApprovalRequired` hard-blocks L0 on anything approval-gated
  (`lib/ai/approvals.ts:60-68`). `agent-registry.ts` falls back to
  hard-coded L0 identities if the DB is unreachable.

PARTIALLY IMPLEMENTED: `agent_versions` snapshots v1 only; no versioning
workflow. `approval_id` wiring is application-level (no DB constraint).

MISSING: escalation path beyond L0 (by design — requires human-signature
flow that does not exist yet).

---

## 4. Phase 141 Status — Knowledge Foundation

IMPLEMENTED (working tree; uncommitted):

- `knowledge_documents`, `knowledge_document_versions`, `knowledge_chunks`
  (`db/migration_141_knowledge_foundation.sql:11,83,102`).
- Retrieval is genuinely FTS-first: `CREATE EXTENSION IF NOT EXISTS pg_trgm`
  (migration_141:8), GIN tag index, `to_tsvector('english')` trigger on
  chunks, one-chunk-per-document MVP seeding.
- 6 curated platform seeds (architecture excerpt, ADR-0002, DEC-0003, tool
  registry summary, proxy gates, client/rate-limit tiers) with `source_ref`
  attribution and `ON CONFLICT DO NOTHING`.
- Runtime: `retrieveKnowledge(query, tenantId, limit)` filters
  `tenant_id IS NULL OR = tenant` with in-code `FALLBACK_DOCS` when the DB
  path is unavailable (`lib/ai/knowledge.ts:79-186`); prompt formatting via
  `formatKnowledgeForPrompt`, injected into every orchestrated run
  (orchestrator.ts:168-177).

PARTIALLY IMPLEMENTED: chunking is 1 chunk = 1 document (no 1000-char
windows); no tenant-authored documents exist (seeds are platform-only);
no agent-specific scoping (retrieval is agent-agnostic); no versioning UX.

MISSING (deferred by design): vector search — correctly **not** present
(`pgvector` extension available-not-installed; no embedding pipeline).
Verdict: this is **DOCUMENT RETRIEVAL, not a full knowledge engine**
(see §9/§13 for the distinction).

---

## 5. Phase 142 Status — Agent Runtime / Gateway / Orchestration / Approvals / Audit

IMPLEMENTED (working tree; largely untracked — `orchestrator.ts`,
`agent-registry.ts`, `knowledge.ts` are `??`; gateway route and guards
are tracked):

- Tables: `agent_tasks`, `approvals`, `agent_runs` (incl.
  `triggered_by` CHECK already containing `'qa'`/`'schedule'`),
  `agent_steps`, `agent_reports` (`db/migration_142_agent_runtime.sql`).
- Gateway: `app/api/ai/gateway/route.ts` — authenticated user only,
  `articleAi` rate limit, agent allowlist, tenantId UUID pre-validation,
  approval-required → 403 path, `insertSystemEvent` emitter wiring for
  `approval_block`/`guard_rejection`/`api_error`.
- Orchestrator: `lib/ai/orchestrator.ts:73-712` — resolve agent →
  fail-closed tenant resolution → task+run persistence → knowledge →
  provider (tenant-aware via `getTenantAIProvider`) → single tool-call
  round (`MAX_TOOL_ITERATIONS=1`) → allowlist + approval gates →
  execution → mandatory `guardBeforeDisplay` with tool-result UUID
  allowlisting → run completion + `createAgentReport`. Bounded synthesis
  retry with deterministic fallback (orchestrator.ts:467-525).
- Provider abstraction: `provider-factory.ts` (sole SDK instantiation
  point), `gemini.ts` (default `gemini-3.6-flash`), `openrouter.ts`
  (default `llama-3.3-70b-instruct`), tenant overrides via
  `ai_provider_configs`. No OpenAI/Anthropic SDKs anywhere.
- Audit: every run persists task + run + steps (knowledge_retrieval,
  tool_result, guard_verdict, approval_request, error) + report;
  `ai_tool_invocations` per tool call; `ai_guard_rejections` admin panel
  at `/admin/ai/rejections`.
- Tenant isolation: `resolveTenantContext(userId, tenantId)` fail-closed
  (`lib/tenant-context.ts:62`); tools pin `organizer_id = tenantId`;
  synthetic platform ctx (`PLATFORM_TENANT_PLACEHOLDER`) coerced to NULL
  at the audit boundary (`tool-context.ts:47-51`).

PARTIALLY IMPLEMENTED: approvals create `pending` rows but **no human
approval surface exists** (no UI, no notification — `approvals.ts` writes
rows; `createNotification` is not called; gateway only logs
`approval_block`). L1+ "live DB approval check" code exists but is
unreachable while all agents are L0.

MISSING: background/queued execution (see §8), Workforce UI (§5-workforce),
Telegram/voice (not started).

---

## 6. QA Current State — Answer: B (agent identity WITH tools; cannot execute tests)

Evidence (`db/migration_140_agent_registry.sql:98,137-144`):

- QA seed: `('qa','QA Engineer','quality', … 'L0','active')`, system prompt
  limits it to "describe test plans, analyze available test evidence… and
  report quality findings."
- QA tool ACL: 20 allowed (8 public catalog + 12 tenant reads incl.
  `getPaymentStatus`); no `get_content_history`, no transactional tools,
  no Sentinel observability tools.
- Runtime integration: QA is in the gateway allowlist and
  `getAllowedToolDefinitions('qa')` resolves — QA **can** hold a grounded
  Q&A conversation today (knowledge + 20 read tools, guarded, audited).

WHAT QA CAN DO TODAY: answer questions about catalog/tenant data via the
gateway with guardrails and full audit trail, like Dylan/Sentinel.

WHAT QA CANNOT DO TODAY: execute, schedule, or report a single test —
no runner, no specs (`playwright.config.*`, `e2e/`, `*.spec.ts`,
`test-results/` all absent), no results schema, no trigger, no UI.
(Corroborated by the Phase 144 investigation report,
`docs/PHASE-144-QA-INVESTIGATION-REPORT.md`.)

INFRASTRUCTURE QA ALREADY HAS: the hermetic `node --test` pattern (extend,
don't replace); `playwright@^1.60.0` in devDependencies + browser binaries
on the dev machine (authoring-capable, not configured); Stripe `sk_test_*`
locally; the `/api/test-e2e` env-gated self-cleaning seam precedent;
`agent_runs.triggered_by` already accepting `'qa'`.

QA STILL NEEDS: staging deployment + staging Supabase project, GitHub
Actions runner (no `.github/` exists), `playwright.config.ts` + first specs,
`qa_failure` results path, ≤1 reporting tool, evidence storage.

---

## 7. Existing Test Coverage (subagent inventory, verified)

- **83 `.test.cjs` files on disk** (33 `lib/__tests__`, 24
  `lib/security/__tests__`, 21 `lib/dashboard/__tests__`, 4
  `lib/ai/__tests__`, 1 `lib/articles/__tests__`) + 1 `.test.ts`
  (audio logic, separate runner). **package.json lists only 72 — 11 files
  are silently never run** (incl. `phase1`–`phase7` invitation/seating
  suites, `shop-digital-products`, `cms-image-upload`).
- Framework: exclusively `node --test` + `node:assert/strict`; zero
  Jest/Vitest/Cypress. Style is hermetic: pure-unit, static-SQL-assertion,
  or mocked-client — **no test touches a live DB or network** (stub envs,
  `createFakeSupabase`, explicit "no database connection" headers;
  DEC-0012). No CI executes anything (no workflows, no hooks).
- GOOD COVERAGE: seating/venue engine math, website builder/blocks/embeds,
  RLS-policy static assertions (migration_101 etc.), auth guards
  (signup/password/oauth-redirect), XSS/sanitization, tenant scoping,
  AI runtime contracts (139–142 + sentinel events).
- PARTIAL: API-route authz (mocked handlers only), payments (pricing math
  + mocked Stripe; no live or test-mode replay), webhooks (static emitter
  assertions only).
- NO MEANINGFUL COVERAGE: browser/E2E journeys, cross-route integration
  against a live app, staging/production smoke, RLS behavior under real
  authenticated sessions (policies asserted as text, never executed),
  background/cron behavior beyond static route assertions.

---

## 8. Sentinel Current State

EXISTS TODAY (working tree; core files untracked): agent identity (L0,
reliability dept); 4 read tools (`get_recent_events`,
`get_active_incidents`, `get_guard_rejections`,
`get_recent_webhook_failures`, the last medium-risk); `system_events` +
`incidents` + `incident_events` tables with 60-min dedupe→incident
correlation and S1–S4 severity derivation
(`lib/observability/system-events.ts:73-180`); `sentinel-sweep` cron
(every 2h) that reads open incidents and orchestrates a grounded summary;
7 emitter call sites (`gateway`, `ai/chat`, `synthesize-trends`,
`calendar`, `purge-accounts`, stripe + crypto webhooks);
`payment_reconciliation_failures` table (`db/migration_69…`, committed
era) as the payment-failure source of truth.

PARTIALLY EXISTS: severity signal quality is unproven in production
(single s4 incident observed during verification); `get_recent_webhook_failures`
reads but nothing pages/expired-manages beyond `closeStaleIncidents`.

NOT IMPLEMENTED: `health_checks` table, any SLO/latency or slow-request
detection, job-queue monitoring (no queue exists), storage-failure
monitoring beyond webhook surface, external integrations
(Sentry/Datadog/PagerDuty — zero hits), Sentinel dashboard/UI, alert
routing/notifications, auto-remediation (correctly absent).

---

## 9. AI Workforce Current State (subagent UI inventory, verified)

| Item | Status | Path |
|---|---|---|
| Agent Registry | IMPLEMENTED | `lib/ai/agent-registry.ts` (+ `db/migration_140…`) |
| Agent Runtime | IMPLEMENTED | `lib/ai/orchestrator.ts` |
| Tool Registry | IMPLEMENTED | `lib/ai/tools-registry.ts` (+ `db/migration_139…`) |
| Tool ACL | IMPLEMENTED | `agent_tools` + allowlist + fail-closed dispatch |
| Knowledge Engine | PARTIAL | retrieval only (`lib/ai/knowledge.ts`); no authoring/versioning/UI |
| Agent Memory | NOT STARTED | no cross-run memory; `agent_tasks.payload` is per-task only |
| Task system | IMPLEMENTED (backend) | `agent_tasks` + `createAgentTask()`; no UI |
| Approval system | PARTIAL | rows + enforcement exist; no human surface, no notifications |
| Agent Runs/Steps/Reports | IMPLEMENTED (backend) | `lib/ai/agent-runs.ts`; no UI |
| Audit trail | IMPLEMENTED | invocations + guard rejections + steps |
| Notifications (agent) | NOT STARTED | `lib/notifications.ts` has no agent/approval types; orchestrator never calls it |
| Guards | IMPLEMENTED | input/output/SSRF (`lib/input-guard`→`lib/ai/`, `output-guard.ts`, `lib/ssrf-guard.ts`) |
| Model/provider abstraction | IMPLEMENTED | factory + gemini/openrouter + tenant overrides |
| Background worker / Queue | NOT STARTED | none; see §12 |
| Scheduled agent execution | PARTIAL | exactly one: `sentinel-sweep` cron → `orchestrate()` |
| Telegram / Voice | NOT STARTED | no code, no env, no deps |
| Workforce dashboard / Command Center | NOT STARTED | no pages |
| Agents / Tasks / Approvals / Reports / Activity / Knowledge / Sentinel / QA UI | ALL NOT STARTED | backend only; existing admin UIs are Growth Studio, guard rejections, and business verticals |
| 3D office | NOT STARTED | no deps, no code |

---

## 10. Existing AI Systems (subagent inventory)

Seven systems; only ONE is integrated with the Agent Runtime:

1. **Agent Runtime (Dylan/Sentinel/QA)** — the runtime itself (§5).
2. **Growth Studio chat** (`app/api/ai/chat` + `GrowthStudioClient`) —
   admin-only, user-selected provider, tenant tools deliberately excluded.
   Standalone. **Preserve** (working admin product surface).
3. **Trend synthesis + content calendar** (`synthesize-trends`, `calendar`
   routes, `lib/ai/trend-synthesis.ts`) — admin research pipeline.
   Standalone. **Preserve.**
4. **Social automation** (`daily-post`, `promotion-engine` crons;
   `generateCaption.js`, `generatePlatformContent.js`, `facebook*.js`) —
   platform-global publishing with brand-accuracy gates. Standalone.
   **Preserve.**
5. **Article assistant** (`app/api/articles/ai-assistant` + modal) — any
   author, 4 ops, input+output guarded. Standalone. **Preserve.**
6. **Seating assistant** (`events/[id]/seating/ai-assistant`) —
   event-manager scoped, aggregate counts only, provably no DB mutations.
   Standalone. **Preserve.**
7. **Article TTS** (NVIDIA Magpie via `lib/audio/`, `article_audios`
   table) — not LLM. Standalone. **Preserve.**

Migration guidance: none of 2–7 should be replaced merely because the
runtime exists. The natural convergence point — if ever — is routing
their LLM calls through `orchestrate()` for unified audit, but that is
unnecessary while each carries its own auth, rate limit, and guards, all
verified present.

---

## 11. Security / Control Boundaries (traced, not assumed)

Verified present: server-derived tenant resolution, fail-closed on unknown
tenant/no membership; UUID-strict tool context gates at two layers
(registry + `requireToolContext`); per-agent tool allowlists enforced
*before* any executor/DB call; L0 hard-block on approval-gated tools;
input quarantine (`===BEGIN UNTRUSTED===`), output PII/echo/UUID screening
with known-UUID allowlisting, SSRF DNS+redirect validation, per-endpoint
Postgres-backed rate limits, `CRON_SECRET` timing-safe cron auth,
redacted audit args, service-role confined to server code.

Searched explicitly, **not found** in the agent runtime (`lib/ai/`): no
`.rpc(` raw-SQL execution, no `fs`/child-process access, no deploy paths,
no financial-action tools (the only money-adjacent tool,
`getPaymentStatus`, is read-only; `record_*_credit` RPCs remain
webhook-only), no model-supplied tenant IDs.

Exceptions / concerns (evidence, no fixes applied):
- Rate limiting is **deliberately fail-open** on RPC error
  (`lib/rate-limit.ts:123-156`, documented as outage-avoidance). Accepted
  tradeoff; recorded so it is never mistaken for fail-closed.
- New AI routes violate the P1 generic-error policy (`err.message` in
  client responses in `ai/chat`, `ai/gateway`, `ai/calendar`,
  `synthesize-trends`, `sentinel-sweep`, `purge-accounts`, crypto/stripe
  webhooks) — currently **failing tests**, not silent (§15).
- Growth Studio chat excludes tenant tools by code comment + tool-list
  construction (`app/api/ai/chat/route.ts:84-89`) rather than by ACL row —
  correct today, fragile to future edits; an ACL-level denial would be
  stronger.

---

## 12. Background Execution — synchronous only

There is **no true background autonomous execution**. What exists:
Vercel cron (5 entries) invoking serverless routes; durable DB rows as the
only state; one bounded LLM retry inside the request lifecycle. Every agent
run — including `sentinel-sweep` — is **synchronous request/response**
(cron-triggered function, must complete within function duration) with no
queue, worker, lease (`FOR UPDATE SKIP LOCKED` appears only as future
design in docs), retry policy, or failure recovery beyond best-effort
catches. `agent_tasks` has no status-driven worker consuming it. pg_cron,
pgmq, BullMQ, Inngest, QStash, pg_net: all confirmed absent (runtime
absence is itself hermetically asserted by `sentinel-events.test.cjs`).

---

## 13. Knowledge System — DOCUMENT RETRIEVAL, not a knowledge engine

What exists: 6 curated platform documents + 1-chunk-per-document rows,
english-FTS + pg_trgm indexes, tenant-vs-platform scoping at query time,
prompt injection each run, DB-unavailable fallback docs in code.
What "full knowledge engine" would additionally require (all absent):
document authoring/approval UI, versioning workflow beyond the v1 snapshot,
agent- or role-specific corpora, tenant-authored content ingestion, code /
SOP / incident corpora, re-chunking pipeline, retrieval quality metrics,
cross-run memory. No vector search exists and none is needed yet — trigram
retrieval is unproven at scale but also unstressed (6 documents).

---

## 14. Database / Migrations

- Canonical `db/migration_NNN_*.sql` + `_rollback` twins exist for
  139–144; `supabase/migrations/` timestamped mirrors exist for all six.
  Ordering is consistent (139→144, 20260928→20260929).
- **All twelve 139–144 files are untracked (`??`)** — like the runtime
  code, the schema foundation has never been committed.
- Seeds included: 22 tool definitions (139), 3 agents + ACL rows (140),
  6 knowledge docs + chunks (141); 142 seeds none (runtime tables start
  empty). RLS/indexes/constraints/FKs verified present in-file (incl.
  service-role-only writes, authenticated-read policies).
- Live-application status of 139+ is **undeterminable from the repo**
  (CURRENT-STATE.md tracks only up to 138, itself "not yet applied live"
  as of 09-24). This must be confirmed against the live DB before any
  phase is called done.
- **Next unused migration number: 145.**

---

## 15. Verification Results (run 2026-09-26, non-mutating only)

| COMMAND | RESULT | NOTES |
|---|---|---|
| `npx tsc --noEmit` | 1 error — PRE-EXISTING | `components/IntlProvider.tsx:39` locale-type error in untracked i18n file; untouched by AI work; full-project check otherwise clean |
| `npm test` (72 files, hermetic) | **713 tests — 710 pass, 3 FAIL (NEW)** | 26s, zero live-DB/network contact |
| AI runtime subset (4 files) | 3 of 4 files green; 1 failing test | — |
| `npx eslint` (AI paths, prior session) | 0 errors on touched files | scoped, not full-repo |
| `npm run build` | NOT RUN | expensive; unnecessary for an audit (dev server healthy on :3000 per prior session) |

The 3 NEW failures (all working-tree drift, none pre-existing):
1. `sentinel-events.test.cjs:178` — asserts exactly 4 `vercel.json` crons;
   tree now has 5 (`invitation-retention` scheduled without updating the test).
2. `p1-generic-error-responses.test.cjs:90` — AI-era routes
   (`ai/chat`, `ai/gateway`, `ai/calendar`, `synthesize-trends`,
   `sentinel-sweep`, `purge-accounts`, both payment webhooks) return
   `err.message`/`result.error` to clients, violating the enforced
   generic-error convention (allowlist covers only 3 deliberate exceptions).
3. Same file `:102` — allowlisted line numbers drifted after route edits
   (anti-drift assertion working as designed).

---

## 16. Documentation Consistency

- CURRENT: `docs/PHASE-139-142-SUMMARY.md`, `PHASE-143-SENTINEL-INVESTIGATION-REPORT.md`,
  `PHASE-143b-SUMMARY.md`, `PHASE-144-QA-INVESTIGATION-REPORT.md`,
  `ALDRIVA-AI-OPERATING-SYSTEM-DISCOVERY-REPORT.md` (as the original spec).
- OUTDATED: `docs/CURRENT-STATE.md` (claims Phase 5/138, "688/688 (36
  suites)" — tree has 713 tests across 72 listed / 83 on-disk files and
  the entire AI OS); `AGENTS.md` ("~38 test files, 304 tests" — wrong by
  2×); knowledge seed content ("22 tools" vs 27 definitions).
- INCOMPLETE: `docs/ROADMAP.md` ends at the website/AI-expansion phases
  with no 139–144 entries; no doc records live-application status of
  139+; no staging/CI documentation exists (because neither exists).
- CONTRADICTORY: CURRENT-STATE's "TypeScript 0 errors / build verified"
  vs today's 1 tsc error and 3 test failures (all drift since 09-24).

---

## 17. Actual Architecture (only components that exist)

```
USER (authenticated session)
 ↓
AI GATEWAY (app/api/ai/gateway/route.ts — auth, rate limit, allowlist)
 ↓
AGENT REGISTRY (agents/agent_tools/tool_definitions + L0 fallback)
 ↓
ORCHESTRATOR (tenant fail-closed → task/run → knowledge → provider →
               1 tool round → allowlist → approval gate → executor)
 ↓            ↙ KNOWLEDGE (FTS/pg_trgm retrieval, platform+tenant scoped)
MODEL PROVIDER (factory → gemini / openrouter / tenant override)
 ↓
TOOL EXECUTORS (public 8 + admin 1 + tenant 14 + sentinel 4;
                SAFE_COLUMNS, no raw SQL, no writes except audit/notify)
 ↓
APPROVAL GATE (L0 hard-block; pending rows, no human surface)
 ↓
GUARDS (input quarantine → output screen → SSRF validated fetch)
 ↓
AUDIT / REPORT (ai_tool_invocations, ai_guard_rejections,
                agent_tasks/runs/steps/reports)
              ↘ EMITTERS → (143b-era) system_events → incidents
                 ↘ sentinel-sweep cron (only scheduled agent run)
```

Not in the diagram (do not exist): workers/queue, memory, Telegram/voice,
any workforce/QA/Sentinel UI, external monitoring, staging/CI.

---

## 18. Remaining Work (dependency order, no value ranking)

**A. Complete current foundation** — commit + reconcile tree (§14);
fix 3 failing tests; confirm 139+ applied live; update CURRENT-STATE/
AGENTS.md/ROADMAP; bring AI routes into P1 error policy or deliberately
allowlist. Blocks everything below being called "done."
**B. QA** — §19. Depends on A (failing suite can't gate anything).
**C. Sentinel** — signal-quality review on live data; `closeStale`
wiring; dashboard (under E); possibly `health_checks` table. Depends on A.
**D. Background workers** — queue/lease design (docs sketch:
`agent_tasks` + `SKIP LOCKED`), retries, dead-letter. Depends on A;
needed before any autonomous scheduling beyond single-shot crons.
**E. Workforce UI** — agents/tasks/approvals/reports/activity/knowledge
pages (gateway already exposes `GET list agents`). Depends on A; approvals
UI is the highest-value slice (unblocks the approval rows' purpose).
**F. Telegram** — bot token, `telegram_identities`, command route.
Depends on D (commands are background work) + E for approvals-by-chat.
**G. Voice** — TTS exists for articles; agent voice has no design.
Depends on F or E. Furthest out.
**H. Knowledge expansion** — authoring flow, tenant docs, chunking,
quality metrics. Depends on A; pgvector only if trigram proves
insufficient (no evidence yet).
**I. Memory** — cross-run agent memory design. Depends on H.
**J. Autonomy** — L1+ with human-signature approvals. Depends on E
(approval surface) + D. Explicitly not before.
**K. Security hardening** — P1 error-policy conformance, Growth Studio
ACL-level tenant denial, rate-limit fail-open review, secret rotation
hygiene. Partly independent; error policy depends on A.
**L. 3D office** — no code, no deps, no design beyond docs. Last.
**M. Other** — 11 orphaned test files into the `npm test` list; staging +
CI (cross-cutting, see §19); invitation-retention live verification.

---

## 19. QA Completion Roadmap (technical sequence; prerequisites explicit)

- **QA FOUNDATION** (prereq: §18A green suite) — commit test-list fix for
  the 11 orphaned files; record QA's contract hermetically (ACL = 20
  tools, L0, gateway allowlisted) — partially exists via agent-runtime
  tests.
- **QA ENVIRONMENT** (prereq: foundation; **the critical path**) —
  staging deployment + staging Supabase project + CI secrets. Nothing
  browser-based can begin without this; production is not a target
  (test traffic would emit production Sentinel incidents).
- **QA EXECUTION** (prereq: environment) — GitHub Actions workflow
  (none exists) running `npx playwright test` on schedule + dispatch
  against staging; results ingest via authenticated, non-production-gated
  route writing `agent_runs`/`agent_steps`/`agent_reports`/
  `system_events(kind='qa_failure'` — requires micro-migration).
- **QA BROWSER AUTOMATION** (prereq: execution harness) —
  `playwright.config.ts` (staging-only baseURL hard-fail) + smallest
  first set: `auth-login` (+dashboard smoke), `fundraiser-donate`
  (Stripe test mode). Playwright is **usable today for authoring only**
  (devDep + local binaries); it is not configured, scheduled, or targeted.
- **QA TEST DATA** (prereq: environment) — dedicated QA organizer,
  `qa+` user prefix, per-spec cleanup phases (precedent: `/api/test-e2e`
  self-delete), 24h stray-sweep; NOWPayments mode decision for any future
  crypto flow (excluded from first set).
- **QA REPORTING** (prereq: execution) — `get_qa_runs` read-only tool +
  ACL seed; failure → existing incident pipeline (no parallel path);
  screenshots to Actions artifacts short-term, `cms-media/qa-runs/` or
  micro-bucket for persisted links.
- **QA REGRESSION** (prereq: reporting green ≥1 cycle) — event/ticket
  checkout, organization creation; deliberate-failure drill proving
  `qa_failure` → incident → `sentinel-sweep` visibility.
- **QA SECURITY** (prereq: regression) — RLS-under-session journeys,
  authz negative tests (staging-isolated by §19-environment), secret
  handling in specs.
- **QA AGENT INTEGRATION** (prereq: reporting) — QA-the-agent narrates
  results via existing tools; no autonomy change, no new writes for the
  agent itself (runner writes under CI authorization, same layering as
  sentinel-sweep's direct reads).

---

## 20. Next-Phase Readiness

- **Completing QA** — READY WITH PREREQUISITES: runtime + audit + test-mode
  keys exist; missing staging, runner, specs, results path (§19). No
  architectural blocker.
- **Sentinel foundation** — READY WITH PREREQUISITES: tables/tools/sweep/
  emitters exist in-tree; missing commit + live-apply confirmation +
  signal-quality review + dashboard. Must not be called production-ready
  until 139+ live status is confirmed.
- **Background workers** — NOT READY: no queue, worker, lease, or retry
  primitive; only a docs sketch. Requires design + implementation phase.
- **Workforce UI** — READY WITH PREREQUISITES: all backend reads exist
  (gateway `GET`, registry functions, report/step tables); missing pages
  only. Approvals UI is the dependency that unlocks J (autonomy).

---

## 21. Recommended Technical Sequence

1. **Reconcile the tree**: commit 139–144 work (or consciously restage),
   resolve the 332-deletion i18n restructure against HEAD, fix the 3
   failing tests, add the 11 orphaned test files to `npm test`.
2. **Confirm live**: verify 139+ migrations applied (and 138!) against the
   live DB; record status in CURRENT-STATE.md; correct AGENTS.md test
   counts and ROADMAP phase entries.
3. **Security conformance**: bring AI routes into the P1 generic-error
   policy (or documented allowlist); review Growth Studio tenant-tool
   exclusion at ACL level.
4. **Then, in dependency order**: QA environment → QA execution (§19) **or**
   Sentinel signal review → Workforce approvals UI → workers → Telegram →
   autonomy. Knowledge/memory/voice/3D office last.

---

*End of audit. No application code, migration, dependency, config, or doc
(other than this report) was created or modified. Awaiting direction.*
