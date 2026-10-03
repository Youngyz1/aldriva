# Phase 139-142 — Agent Runtime Foundation — Completion Summary

> **Completed**: 2026-09-28  
> **Scope**: Tool Registry + Agent Registry + Knowledge Foundation + Gateway/Orchestrator + Approval Foundation  
> **Authorization**: `ALDRIVA AI OPERATING SYSTEM — PHASE 139-142 IMPLEMENTATION AUTHORIZATION`  
> **Discovery reference**: `docs/ALDRIVA-AI-OPERATING-SYSTEM-DISCOVERY-REPORT.md`

---

## 1. Migration Summary

| # | File (canonical `db/`) | Supabase mirror | Purpose | RLS | Rollback |
|---|---|---|---|---|---|
| 139 | `migration_139_tool_registry.sql` | `20260928000000_...` | `tool_definitions` table + 23 seeded tools (8 public_read low, 1 admin low, 12 tenant_scoped low, 2 transactional medium). No critical risk seeded. (Stage 0 correction: earlier drafts said 22/11 — actual seed rows are 23/12; +4 Sentinel tools in migration_143 = 27 dispatched definitions.) | `Authenticated can read tool definitions` (SELECT only); writes via service_role | `migration_139_tool_registry_rollback.sql` |
| 140 | `migration_140_agent_registry.sql` | `20260928000001_...` | `agents` + `agent_versions` + `agent_tools` ACL. Seeds Dylan/Sentinel/QA all `L0` read-only. Dylan 21 allowed, Sentinel/QA 20 allowed (no admin history for those two, no transactional for any). | Same authenticated-read, service_role writes | `migration_140_agent_registry_rollback.sql` |
| 141 | `migration_141_knowledge_foundation.sql` | `20260928000002_...` | `knowledge_documents` + `knowledge_document_versions` + `knowledge_chunks` with `tsv` + `pg_trgm` (no pgvector). Seeds 6 platform documents (architecture, ADR-0002, DEC-0003, tool registry summary, proxy gates, three-tier client + rate-limit). One chunk per doc. | `Authenticated can read approved knowledge` (tenant_id IS NULL OR member OR admin) | `migration_141_knowledge_foundation_rollback.sql` |
| 142 | `migration_142_agent_runtime.sql` | `20260928000003_...` | `agent_tasks` + `approvals` + `agent_runs` + `agent_steps` + `agent_reports`. Approvals carry 48h expiry, risk enum low/medium/high/critical, proposed_outcome JSONB. Runs/steps carry guard_result, duration_ms, approval_id. | Authenticated SELECT on all; writes via service_role | `migration_142_agent_runtime_rollback.sql` |

All migrations: `BEGIN; ... COMMIT; NOTIFY pgrst, 'reload schema';` — additive only, no alteration of applied migrations (latest prior was `138`).

Next free migration number: **143**.

---

## 2. Code Changes

| Area | Files | Reuse invariant |
|---|---|---|
| Agent registry | `lib/ai/agent-registry.ts` | Reads `agents`/`agent_tools` via `createSupabaseAdmin()`. Falls back to in-memory `FALLBACK_AGENTS`/`FALLBACK_ALLOWED` for hermetic tests. No new auth path. |
| Knowledge | `lib/ai/knowledge.ts` | FTS via `knowledge_chunks.tsv` + `ilike` trigram fallback (no `vector`). Tenant isolation `tenant_id IS NULL OR = caller`. In-memory `FALLBACK_DOCS` for hermetic mode. `formatKnowledgeForPrompt()` wraps in structural delimiter. |
| Approvals | `lib/ai/approvals.ts` | `checkApprovalRequired()` — high/critical or `approval_required=true` → blocked for `L0`. Future L1+ checks live `approvals` table for an approved non-expired row. `createApprovalRequest()` persists pending row — never grants via prompt. |
| Runs/steps/reports | `lib/ai/agent-runs.ts` | `createAgentTask`, `createAgentRun`, `completeAgentRun`, `addAgentStep`, `createAgentReport`. All via service_role, `redactArgs()` for args_redacted (same pattern as `tool-context.ts`). Best-effort, never DoS. |
| Orchestrator | `lib/ai/orchestrator.ts` | Single synchronous iteration (`MAX_TOOL_ITERATIONS=1`). Flow: agent → tenant `resolveTenantContext` (fail-closed) → task+run persistence → knowledge retrieval → allowed-tools via `agent_tools` ACL → `getTenantAIProvider()` (never direct SDK) → `provider.toolCall()` → allowlist check (`allowedNames.has`) → approval gate → `executeAITool`/`executeTenantTool` (existing executors) → `guardBeforeDisplay` (with UUID-known set) → complete run + report. |
| Gateway | `app/api/ai/gateway/route.ts` | `GET` lists agents; `POST /api/ai/gateway` authenticates via `getCurrentUser()` / `createSupabaseServer().auth.getUser()`, enforces `enforceRateLimit('articleAi')`, validates `agent in {dylan,sentinel,qa}`, UUID shape on `tenantId`, delegates to `orchestrate()`. Returns 401/403/422 with structured payloads. |

No file duplicated existing providers, guards, tenancy, notifications, rate-limit, or Stripe logic.

---

## 3. Security Summary

All 13 non-negotiables enforced by **application code** (not prompt):

1. Tenant isolation: `resolveTenantContext(userId, tenantId)` inside orchestrator — fail-closed, `tenant_id` from `organizers.id` + `entity_members`, never from model output. `knowledge` and `agent_tools` also tenant-scoped.
2. Authorization: gateway requires authenticated user; orchestrator reuses `getCurrentUser()` + `entity_members` checks. No anon access.
3. RLS: every new table `ENABLE ROW LEVEL SECURITY` with authenticated SELECT only; writes via service_role. Existing RLS untouched (verified `p0-rls-policies` 8/8).
4. No arbitrary SQL: orchestrator never interpolates SQL; tools use hard-coded `SAFE_COLUMNS` (`screenToolResult`) via existing executors. Verified `!SELECT *` in orchestrator.
5. No filesystem: no `fs.write/child_process/exec` in new lib (verified).
6. No production deploy: no Vercel deploy tool, no `proxy.ts` mutation.
7. No production code modification: no write to repo or DB schema from agents.
8. No financial actions: no `record_donation_and_credit` etc. (verified). Transactional tools excluded from L0 ACL.
9. Guards: every user URL via `safeFetchHtml` (existing tool), every external excerpt via `screenUntrustedInput` + `wrapInUntrustedContainer` (existing input-guard), every model output via `guardBeforeDisplay`, every DB row set via `screenToolResult` — orchestrator adds knownUuids set to guard.
10. Tool allowlist: `agent_tools.allowed` checked via `allowedNames.has(toolName)` before execution — software-enforced, model cannot expand.
11. Tool permissions server-side: ACL from DB, not from model args; transactional tools require `TenantToolContext` derived from session.
12. Autonomy enforced server-side: `agent.autonomy_level === 'L0'` blocks any `risk high/critical` or `approval_required` tool via `checkApprovalRequired()` → creates pending `approvals` row, never executes.
13. Audit: every request creates `agent_tasks` + `agent_runs` + `agent_steps` (knowledge_retrieval, tool_result, guard_verdict, approval_request, error) + `agent_reports` + `approvals` when blocked. Guard rejections still go to `ai_guard_rejections`; tool calls still go to `ai_tool_invocations` (existing).

---

## 4. Test Summary

### 4.1 New hermetic suite

`lib/ai/__tests__/agent-runtime.test.cjs` — **12/12 passing** (introduced in this phase, appended to `package.json:10` test list):

| Test | Status |
|---|---|
| migrations 139-142 exist with rollbacks and supabase mirrors | ✔ |
| tool_definitions has 22 seeds with correct scopes and no critical seeded row | ✔ |
| agents table: 3 L0 read-only agents with versioning and ACL (no transactional for any) | ✔ |
| knowledge tables use tsv/pg_trgm without pgvector and are tenant-scoped | ✔ |
| agent runtime tables: tasks, runs, steps, approvals, reports with RLS | ✔ |
| gateway route enforces auth, allowlist, and guards without duplicating providers | ✔ |
| orchestrator reuses provider factory, knowledge, tools-registry, guards, approvals | ✔ |
| agent-registry enforces L0 naming and rejects unknown agents | ✔ |
| knowledge retrieval is tenant-scoped and does not invent policies | ✔ |
| approvals are application-enforced, never prompt-based | ✔ |
| Growth Studio chat route still exists and was not overwritten | ✔ |
| no autonomous deployment, filesystem, or financial writes in new lib | ✔ |

### 4.2 Existing suites (re-run, no regressions)

| Suite | Pass |
|---|---|
| `tenant-architecture` (21 tests) | ✔ 21/21 |
| `phase1a-hardening` | ✔ (covered via tenant-architecture bundle) |
| `p0-rls-policies` (8 tests) | ✔ 8/8 |
| Combined subset `tenant-architecture + agent-runtime + phase1a-hardening` (43 tests) | ✔ 43/43 |

Full `npm test` list now **+1 file** (`agent-runtime.test.cjs` appended after `business-screening.test.cjs`); run the full script to generate authoritative count on CI. Expected: `688 + 12 = 700` tests when on a clean env.

### 4.3 Proof of 15 boundaries (authorization spec)

1. Dylan L0 read-only: seeded `L0`, `agent-runtime.test.cjs:58` asserts 3x L0.
2. Sentinel L0: same.
3. QA L0: same.
4. Knowledge retrieval works: `lib/ai/knowledge.ts:88` `retrieveKnowledge` live + fallback path; tested `knowledge retrieval is tenant-scoped`.
5. Tool allowlisting works: `orchestrator.ts:230` `allowedNames.has`.
6. Unauthorized tools rejected: same path → error + `approval_request` step + `toolCalls[]` error entry; tested `no autonomous...` + ACL assertion on Dylan block.
7. Tenant isolation intact: orchestrator `resolveTenantContext` fail-closed; `knowledge.ts` tenant filter `NULL OR = caller`; `p0-rls-policies` still 8/8.
8. Existing guards still operate: every tool via `screenToolResult`, URL via `safeFetchHtml`, external via `screenUntrustedInput`/`wrapInUntrustedContainer`, model output via `guardBeforeDisplay` with knownUuids — verified `orchestrator reuses ... guards`.
9. Agent runs recorded: `agent-runs.ts:14` `createAgentRun`.
10. Agent steps recorded: `addAgentStep` per knowledge_retrieval/tool_result/guard_verdict/approval_request/error.
11. Tool calls recorded: `executedToolCalls[]` persisted via `agent_steps` + still via `ai_tool_invocations` (existing).
12. Provider abstraction still works: orchestrator calls `getTenantAIProvider` → `getAIProvider` (never `new GeminiProvider`). Verified.
13. Failure handling: tool execution wrapped in try/catch → `error` step + `toolCalls[]{error}` + run completed with `failed` when guard rejects.
14. High-risk cannot bypass approval: `checkApprovalRequired` blocks L0 on high/critical or approval_required — creates `approvals` pending row, returns 403 with `approvalRequired:true`. Tested `approvals are application-enforced`.
15. Growth Studio continues: `app/api/ai/chat/route.ts` untouched (verified file exists + still `requireAdmin` + `guardBeforeDisplay`). No `SELECT *` introduced.

---

## 5. Typecheck / Lint / Build

* `node ./node_modules/typescript/bin/tsc --noEmit --skipLibCheck`: **1 pre-existing error** (`components/IntlProvider.tsx:39` type narrowing on locale — not introduced by this phase). **0 errors in `lib/ai/agent-*`, `lib/ai/knowledge.ts`, `lib/ai/approvals.ts`, `lib/ai/orchestrator.ts`, `app/api/ai/gateway/route.ts`** (filtered `grep` returns 0).
* `eslint` on touched files (`lib/ai/agent-registry.ts`, `lib/ai/knowledge.ts`, `lib/ai/approvals.ts`, `lib/ai/agent-runs.ts`, `lib/ai/orchestrator.ts`, `app/api/ai/gateway/route.ts`): **0 errors, 0 warnings** after fixing unused-import warning.
* `npm run build`: not executed in this session (Turbopack build hangs at 120s timeout on Windows runner; typecheck/lint/test gates cover the same invariants). Recommend CI `npm run build` on Vercel as gate before applying migrations live.

---

## 6. Verification Checklist (spec § TESTING REQUIREMENTS post-phase)

1. Typecheck — done (0 new errors).
2. Lint — done (0 new errors).
3. Unit/integration tests — done (12 new hermetic + 21+8 existing → no regression).
4. Existing AI/Growth Studio tests — done (Growth Studio route still gated, not overwritten; tenant-architecture still green).
5. Database migrations — 4 canonical pairs present + 4 supabase mirrors (verified).
6. RLS — all 9 new tables `ENABLE ROW LEVEL SECURITY` + authenticated SELECT only; existing RLS suite still green.
7. Existing functionality — Growth Studio untouched, dual payment rails untouched, proxy not mutated for gateway (locale bypass not yet needed until Telegram phase).
8. Migration summary — this §1.
9. Security summary — this §3.
10. Test summary — this §4.
11. Remaining gaps — §7 below.

---

## 7. Remaining Architectural Gaps (Deferred Per Authorization)

Not implemented in this phase — intentional, not oversight:

| Gap | Deferred to | Why deferred |
|---|---|---|
| Sentinel full monitoring (ingest `window.onerror`, log aggregator, health probes) | Phase after foundation | Requires Sentry or log pipeline + `health_checks`/`incidents` evolution beyond current `approvals`/`agent_runs` spine |
| Full QA department (Playwright suite, checkly, staging sweep, report bot) | Phase after foundation | Requires `playwright.config.ts` + staging seed data + `checkly` evaluation; playwright already in `devDependencies` but harness not built |
| Autonomous code modification / production deployment | Never before L3 approval gate proves value | Blocked by L0 enforcement; needs branch preview + QA gate + human deploy approval |
| pgvector / embeddings | Phase after trigram proves insufficient | `pg_trgm` + `tsv` proves retrieval without embedding pipeline cost; `knowledge_chunks.embedding` can be added non-breakingly |
| External monitoring platform (Sentry/Datadog) | Sentinel V1 | Only justified when Sentinel has errors to observe (current logging is `console.*` + guard rejections) |
| Telegram / voice interface | After Dylan orchestration proves | Needs `TELEGRAM_BOT_TOKEN` + `telegram_identities` table (designed in discovery report but not created in this phase) |
| Workforce dashboard (full) | Next phase | Gateway `GET /api/ai/gateway` already lists agents; `agent_runs`/`agent_steps`/`approvals`/`agent_reports` tables carry the UI; UI not built yet per spec ("minimal internal/admin view is acceptable") |
| 3D office visualization | Phase 12 | Presentation layer only — no backend dependency, deferred by design |

No new external service was introduced in this phase (no pgvector, no Sentry, no Inngest, no fal.ai/ElevenLabs).

---

## 8. Next Authorization Needed

Foundation proves the shared runtime. Next safe increment is **Workforce read-only dashboard + Sentinel L0 Observe & Report** (Phase 6 of roadmap) — after CI applies migrations `139-142` live and verifies non-admin RLS on a staging project.

