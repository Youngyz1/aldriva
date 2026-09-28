# Sentinel — Stage 9 Implementation Readiness Report

> **Type**: Architecture discovery & implementation readiness (AUDIT ONLY).
> **Date**: 2026-09-28.
> **Scope**: Stages 0–8 complete and approved (Stage 7 substantially complete with one
> carried-forward donate-receipt assertion; Stage 8 QA Reporting UI approved, commit `a948ac6`).
> **Method**: Read-only repository inspection. No application code, migration, config,
> workflow, permission, or completed-stage change was made for this report.
> **Evidence convention**: Every significant claim cites a file path + line/section.
> Items that could not be verified from the repo are marked **UNVERIFIED**.
> Live-database state (which migrations are applied in production/staging, live rows,
> provider keys, cron firing) is **UNVERIFIED** throughout — this audit had no DB or
> network access.

---

## 1. Executive summary

**Sentinel is an executable backend without a face and without a lifecycle.**
Concretely:

- **Executable today**: Sentinel is a registered, `active`, L0 read-only agent
  (`db/migration_140_agent_registry.sql:97`; `lib/ai/agent-registry.ts:45-60`) with
  **24 allowlisted tools** (20 base + 4 observability, all `approval_required=false`),
  4 read-only executor implementations, a working gateway path
  (`POST /api/ai/gateway` with `agent:'sentinel'`), a working sweep path
  (`POST/GET /api/cron/sentinel-sweep`), and a functional event→incident pipeline
  (`lib/observability/system-events.ts` + migrations 143/144/145).
- **Missing**: the `/admin/workforce/sentinel` page is a `StageStub` placeholder;
  there is **no incident acknowledge/resolve/close path** (no API, no UI, no status
  writer — `closeStaleIncidentsolderThanHours` exists but has zero callers); there is
  **no human notification** for incidents (no email/Telegram/in-app incident type);
  the sweep cron route **exists but is not scheduled** (`vercel.json` has 4 crons, no
  `sentinel-sweep` entry); QA-failure emission is **shadow-suppressed by default**;
  there is no health endpoint, no structured logging, no queue/worker, no Sentry-type
  integration, no Sentinel-specific knowledge.
- **Stage 9 needs no new database migration.** The `incidents` / `system_events` /
  `incident_events` schema already supports an overview + list + detail UI with the
  real status set (`open/investigating/resolved/expired`) and severity set (`s1–s4`).
  The correct Stage 9 is a **read-only UI stage** reusing the Stage 1–8
  fetch + pure view-model pattern (`lib/workforce/sentinel.ts`, `sentinel/page.tsx`,
  `sentinel/[id]/page.tsx`), plus reciprocal-link upgrades to existing pages.
- **Readiness verdict: READY WITH PREREQUISITES** (see §16). The only true blockers
  are decisions, not code: (a) whether to schedule `sentinel-sweep` on Vercel or keep
  sweeps manual; (b) whether to fix the currently-failing `sentinel-events` cron-count
  test first; (c) confirming migrations 143–145 are applied where the UI will read.

---

## 2. Current Sentinel capabilities

### 2.1 Identity — FUNCTIONAL

| Field | Value | Evidence |
|---|---|---|
| `name` | `sentinel` | `db/migration_140_agent_registry.sql:97`, `lib/ai/agent-registry.ts:47` |
| `display_name` | `Sentinel — Reliability Intelligence` | same, `:48` |
| `department` | `reliability` | same, `:49` |
| `autonomy_level` | `L0` (CHECK `IN ('L0'..'L4')`, `migration_140:16`) | same, `:54` |
| `status` | `active` | same, `:56` |
| `tenant_id` | `NULL` (platform agent) | `migration_140:17,25` |
| `version` | `1` via `agent_versions` seed | `migration_140:102-104` |
| Fallback id | `00000000-0000-0000-0000-000000000002` | `lib/ai/agent-registry.ts:46` |

System prompt (DB seed + fallback, quoted verbatim in substance): read-only Reliability
Intelligence; observe available health signals; correlate evidence from authorized tools
and knowledge; classify severity; report findings with evidence; never modify code,
deploy, or access production secrets; call only explicitly allowed tools.
`isAgentReadOnly()` returns true for L0 (`lib/ai/agent-registry.ts:156-160`).

### 2.2 Tools / permissions — FUNCTIONAL (with one fallback gap)

Sentinel holds **24 tools**, all `approval_required=false` (hence never approval-blocked):

- 20 base tools from `db/migration_140_agent_registry.sql:121-132` (8 `public_read`/low
  + 12 `tenant_scoped`/low; deliberately **without** `get_content_history`, which Dylan
  alone holds).
- 4 observability tools from `db/migration_143_sentinel_events.sql:137-148`:
  `get_recent_events` (low), `get_active_incidents` (low), `get_guard_rejections` (low),
  `get_recent_webhook_failures` (medium). Dylan/QA unchanged by that seed.
- `request_qa_run` (`transactional`/medium/approval-gated) went to `qa` only
  (`migration_145:104-112`) — Sentinel cannot trigger QA runs.

**Gap (cosmetic, recorded)**: `FALLBACK_ALLOWED.sentinel`
(`lib/ai/agent-registry.ts:90-97`) lists only the 20 pre-143 tools. DB-connected path
yields 24; hermetic/DB-down fallback yields 20. `getAllowedToolNames()` prefers DB
(`:133-148`). Low risk (fallback is a degraded path), but Stage 9 should align the two
lists or document the divergence.

### 2.3 Executors — FUNCTIONAL, read-only

All four in `lib/ai/tools/sentinel/` take `TenantToolContext`, call
`requireToolContext` first, log via `logToolInvocation`, screen via `screenToolResult`,
and issue `SELECT` only (hermetically asserted — no `.insert/.update/.delete`):

| Tool | File | Reads | SAFE_COLUMNS |
|---|---|---|---|
| `getRecentEvents` | `sentinel-events.ts:27-55` | `system_events`, tenant eq + platform `NULL` merge, limit ≤ 10 | `:10` |
| `getActiveIncidents` | `sentinel-incidents.ts:26-55` | `incidents` default `status IN ('open','investigating')` | `:10` |
| `getGuardRejections` | `sentinel-guards.ts:28-58` | `ai_guard_rejections` (tenant column from migration 143) | `:11` |
| `getRecentWebhookFailures` | `sentinel-webhooks.ts:28-66` | `payment_reconciliation_failures` (platform-level, no tenant col) + `system_events` webhook/payment kinds | `:11-12` |

### 2.4 Execution paths — FUNCTIONAL code

- **Gateway**: `POST /api/ai/gateway` allowlists `dylan|sentinel|qa`
  (`app/api/ai/gateway/route.ts:68`), enforces auth + `enforceRateLimit('articleAi')`,
  delegates to `orchestrate()` (`:88-94`). Sentinel is end-to-end allowlisted.
- **Orchestrator**: accepts `agent:'sentinel'` (`lib/ai/orchestrator.ts:27`), single
  tool iteration (`MAX_TOOL_ITERATIONS = 1`, `:50`), tenant fail-closed with a
  platform-sweep synthetic context for tenant-less Sentinel runs (`:220-244`,
  placeholder coerced to real NULL in `lib/ai/tools/tenant/tool-context.ts:43-58`),
  approval gate never blocks Sentinel's all-low/medium toolset, output passes
  `guardBeforeDisplay` (`:592-630`), results persist via `completeAgentRun` +
  `createAgentReport` (`:668-697`).
- **Sweep route**: `app/api/cron/sentinel-sweep/route.ts:13-80` reads up to 20
  open/investigating incidents, returns healthy JSON when zero, else orchestrates a
  grounded Sentinel summary and returns `{success, openCount, sentinel:{...}}`.
  **But it is not scheduled** — `vercel.json:1-8` contains exactly 4 crons
  (`daily-post`, `promotion-engine`, `purge-accounts`, `invitation-retention`) and no
  `sentinel-sweep` entry. The route header claim ("Vercel cron every 2h") is
  aspirational. Manual `POST/GET` with `CRON_SECRET` remains invokable.
  History: entry removed in commit `87e5292` ("Hobby plan limit; staging-only").
- **Runtime rows**: none seeded (by design — `createAgentTask/createAgentRun/...` in
  `lib/ai/agent-runs.ts:20-162` create rows dynamically). Live Sentinel runs are
  **UNVERIFIED**.

### 2.5 Knowledge — MISSING (Sentinel-specific)

Migration 141 seeds 6 generic platform documents (tenant model, ADR-0002, DEC-0003,
tool registry, proxy gates, client tiers) — zero Sentinel playbooks, zero
`agent_role`/`sop`/`incident` rows. `retrieveKnowledge()` (`lib/ai/knowledge.ts:79-186`)
is agent-generic. Sentinel reasons from the same corpus as every agent.

### 2.6 UI / components — STUB

- `app/[locale]/admin/workforce/sentinel/page.tsx:1-9` renders only
  `<StageStub title="Sentinel" stage="Stage 9" …/>` — no fetching, no list, no detail.
- `components/` contains zero sentinel references.
- Existing pages already **link to** the stub: Command Center open-incidents section
  (`app/[locale]/admin/workforce/page.tsx:139`), Sentinel link card (`:236-243`),
  report detail incident link (`reports/[id]/page.tsx:90-93`), activity feed incident
  and event entries (`lib/workforce/activity.ts:199,210`), admin nav
  (`app/[locale]/admin/layout.tsx:104`).

### 2.7 Capability summary

| Layer | State |
|---|---|
| Agent identity (DB + fallback + versions) | FUNCTIONAL |
| 24-tool ACL | FUNCTIONAL in DB; fallback lists 20 (gap) |
| 4 read-only executors | FUNCTIONAL |
| Gateway + orchestrator paths | FUNCTIONAL |
| Sweep handler | FUNCTIONAL code, UNSCHEDULED |
| Command Center incidents + activity feed reads | FUNCTIONAL |
| Sentinel page | STUB |
| Sentinel-specific knowledge | MISSING |
| Live rows / live migration state / provider keys | UNVERIFIED |

---

## 3. Existing incident infrastructure inventory

### 3.1 Tables (migrations 143 + 144 + 145-kind; mirrors identical in `supabase/migrations/`)

**`system_events`** (`db/migration_143_sentinel_events.sql:30-46`) — raw occurrence stream,
insert-only, service-role writes:
`id`, `created_at`, `kind` (CHECK 9 values at `:33`: `api_error, job_error,
webhook_error, payment_reconciliation, auth_failure, storage_error, guard_rejection,
approval_block, agent_tool_error`; **`qa_failure` added by migration 145:80-83**),
`severity_hint` (`info/warn/error/critical`), `tenant_id→organizers NULL`,
`actor_id→auth.users NULL`, `agent_id→agents NULL`, `route`, `tool_name`,
`status_code` (100–599), `error_code`, `message` (1–2000 chars), `metadata JSONB`,
`dedupe_key` (1–400, deterministic `kind:route:tool_name:error_code:tenant_id|platform`
per comment `:50`), `source` (regex `^[a-z][a-z0-9_]{1,30}$` after fix 144:7-9).
Indexes on `created_at`, `(dedupe_key, created_at)`, `(kind, created_at)`,
`(tenant_id, created_at)` partial (`:52-55`).

**`incidents`** (`:68-83`): `id`, `created_at`, `updated_at` (bump trigger `:91-94`),
`status` CHECK (`open/investigating/resolved/expired` — **no `closed`, no `acknowledged`**),
`severity` CHECK (`s1/s2/s3/s4`), `title` (5–300), `summary` nullable,
`tenant_id→organizers NULL` (NULL = platform), `dedupe_key`,
`event_count ≥ 1`, `first_seen_at`, `last_seen_at`,
`agent_run_id→agent_runs NULL`, `metadata JSONB`.
Partial unique `uq_incidents_open_dedupe ON (dedupe_key) WHERE status IN
('open','investigating')` — one open group per key. Indexes on
`(dedupe_key,status)` partial, `(status,severity,updated_at)`, `(tenant_id,updated_at)`
partial.

**`incident_events`** (`:106-112`): `incident_id→incidents CASCADE`,
`event_id→system_events CASCADE`, `UNIQUE(incident_id, event_id)`, indexes both ways.
Append-only join: one incident groups 1–N events sharing a dedupe key.

**`ai_guard_rejections.tenant_id`** added by 143 (`:9-15`); writers
`lib/ai/output-guard.ts:89-131` and `lib/ai/input-guard.ts:98-136` persist it.

### 3.2 RLS — SELECT-only, tenant/admin shape, no writers

- `system_events`: single `FOR SELECT` policy (`:57-65`); `incidents`: single `FOR
  SELECT` (`:96-104`, verified verbatim — `(tenant NULL AND active-admin) OR
  (tenant NOT NULL AND is_entity_member(…all six roles…)) OR active-admin`);
  `incident_events`: `FOR SELECT` via parent incident (`:118-133`, fixed by 144).
- **No INSERT/UPDATE/DELETE policies anywhere**: writes are service-role only.
  Consequence: no authenticated path (and therefore no UI path) can change incident
  status today — lifecycle mutation is structurally admin-service-only.

### 3.3 Emitter — `lib/observability/system-events.ts`

- `insertSystemEvent(input): Promise<string|null>` (`:81-126`): slices message to 2000,
  inserts via `createSupabaseAdmin()`, `console.error + return null` on failure, then
  `void findOrCreateIncidentForEvent(...).catch(console.error)` — **never throws**.
- `findOrCreateIncidentForEvent` (`:129-188`): 60-min lookup on
  `(dedupe_key, status IN open/investigating, last_seen_at >= now-60m)`; hit → bump
  `event_count/last_seen_at` + join row (severity **not** re-graded); miss → burst-count
  via exact-count head query → `deriveSeverity()` (`:40-73`: payment_reconciliation→s1;
  api/agent_tool bursts ≥20→s1, ≥5→s2, ≥2→s3 else s4; guard PII→s3; approval bursts;
  job_error checkout/stripe→s1 else s2; webhook_error→s1; qa escalated→s2 else s3;
  default s4) → insert `status:'open'` + join row.
- Edge (recorded, accepted in `docs/PHASE-143-SENTINEL-INVESTIGATION-REPORT.md:205`):
  a stale `open` row outside the 60-min window is invisible to lookup but still blocks
  the partial unique index → insert fails unique violation (logged, event row persists).
  No `FOR UPDATE`/`SKIP LOCKED`/transaction — concurrent doubles can collide.
- `closeStaleIncidentsolderThanHours(hours=24)` (`:190-204`, name typo verbatim):
  sets `expired` where `last_seen_at` older than window. **Zero callers** — orphaned.
- Producers (all `void` fire-and-forget **except QA ingest which awaits**):
  gateway approval_block/guard_rejection/api_error (`app/api/ai/gateway/route.ts:98-207`),
  chat guard/api (`app/api/ai/chat/route.ts:172-215`), calendar 6× api_error,
  synthesize-trends 2× api_error, purge-accounts 2× job_error, Stripe webhook outer
  `webhook_error` (still returns `{received:true}` — Stripe never sees 5xx),
  crypto webhook outer `webhook_error`, QA ingest `qa_failure`
  (`app/api/qa/ingest/route.ts:95-127`, `source:'qa_sweep'`, the only non-`aldriva`
  source). `new-content` webhook, 4 of 5 crons, and all 429 rate-limit responses emit
  nothing.

### 3.4 Lifecycle trace (creation → closure)

| Transition | State | Evidence |
|---|---|---|
| → `open` | EXISTS | `system-events.ts:168-187` hardcodes `open`, `event_count:1`, join insert |
| `open → investigating` (ack) | MISSING | zero `UPDATE … investigating` in repo; no `/api/incidents*` route; no UI control; Sentinel tools provably read-only |
| → `resolved` | MISSING | value exists only in CHECK + docs |
| → `expired` | EXISTS but ORPHANED | `closeStale…` defined, never called; no cron/route/UI invokes it |
| → `closed` | IMPOSSIBLE | violates CHECK |
| Transition enforcement | MISSING | only trigger bumps `updated_at`; no `enforce_*` trigger (contrast `migration_134` promotion guard) |
| Audit history | MISSING | no history table; `get_incident_history` explicitly asserted non-existent (`lib/ai/__tests__/agent-runtime.test.cjs:204-232`) |

Full trace today: `catch → void insertSystemEvent → system_events row → void
findOrCreateIncident → bump-or-open → (if scheduled) sweep reads + orchestrates →
agent_reports` → **stop**. No ack/resolve/close/API/UI/notification/closure.

### 3.5 Notifications — MISSING (pull-only)

- `NotificationType` (`lib/notifications.ts:11-21`) has no incident/sentinel type;
  `createNotification` is never imported by `system-events.ts`, the sweep route, or any
  Sentinel tool. Sweep output is `console.log` + JSON only.
- Resend serves business events (receipts, tickets, invites, reconciliation `URGENT`
  mail in `app/api/webhooks/stripe/route.ts:75-94`) — never incident severity.
- Telegram: zero implementation hits; only the `triggered_by` enum value `'telegram'`
  in `migration_142:68`.
- Human surface today is pull: Command Center incidents, activity feed, sweep
  `agent_reports`, `/admin/ai/rejections`. Out-of-band paging is **UNVERIFIED**.

### 3.6 Dedupe / correlation

Key `kind:route:tool_name:error_code:tenant_id|platform` (400ch cap;
`system-events.ts:35-38`). QA uses a parallel per-day decision key
(`qa_failure:<suite>:<date>`, `lib/qa/ingest.ts:265`) but the persisted event still
carries the standard key (`route /api/qa/ingest`, `tool qa_ingest`). Severity is graded
at open only, never re-graded on bumps. QA emission is shadow-suppressed by default
(`QA_SHADOW_MODE!=='false'` → writes `qa_runs.metadata.shadow_suppressed` instead of
emitting; `lib/qa/ingest.ts:270-273`, `app/api/qa/ingest/route.ts:112-114`).

---

## 4. Monitoring and observability inventory

| Capability | Verdict | Evidence |
|---|---|---|
| App/API error reporting (gateway, chat, calendar, synthesize) | PARTIAL + UNVERIFIED live | `void insertSystemEvent` emitters listed in §3.3; swallowing errors makes emitter success invisible; live migration/service-key state UNVERIFIED |
| Webhook 5xx | PARTIAL (outer-only; Stripe masks 200; new-content absent) | `app/api/webhooks/stripe/route.ts:1121-1135`; `app/api/crypto/webhook/route.ts:365-381`; `app/api/webhooks/new-content/route.js:17-20` |
| Cron `job_error` | PARTIAL (purge-accounts only; 4 of 5 crons silent) | `app/api/cron/purge-accounts/route.ts:73-105`; no `cron_runs` table |
| Rate-limit 429 | MISSING (fails open + console only) | `lib/rate-limit.ts:130-191` |
| Generic-error convention | PARTIAL (static test, per-route hand-coded) | `lib/security/__tests__/p1-generic-error-responses.test.cjs:47-129`; no shared helper |
| Cron execution log | MISSING (no central table; Vercel-side only) | 5 cron routes audited; `GET` aliases `POST` on sweep |
| Background queue/worker | MISSING by design (hermetically asserted) | no bullmq/pg-boss/Inngest/QStash/pg_cron deps or code; `sentinel-events.test.cjs:187` |
| QA→incident | STUB (shadow-suppressed by default) | §3.6; worker `.github/workflows/qa-sweep.yml:22-122` has no incident step |
| Deployment monitoring | MISSING | no deploy hooks/webhook/table; `instrumentation*.ts` is DNS-only |
| Structured logging | MISSING (`console.*` only, no correlation IDs) | ~100+ hits; no `lib/logger*`, no pino/winston; `proxy.ts` injects no request ID |
| Ops alerting (email/Telegram/paging) | MISSING | §3.5 |
| Health endpoint | MISSING | no `app/api/**/health*`; `DISCOVERY-REPORT:161` attests absence |
| Third-party APM (Sentry/Datadog/…) | MISSING (documented as absent) | `package.json:18-85`; stripe route comment `:34-44`; `PHASE-139-142-SUMMARY:142-151` |

---

## 5. Workforce integration map (Stages 1–8)

**Pattern contract** (all reusable as-is): `CommandCenterClient`
(`lib/workforce/command-center.ts:33-35`) → `fetch*` (bounded, newest-first, throws
`Workforce <area> read failed`) → pure `build*ViewModel` with `empty.*` flags; pages
call `await headers(); await requireAdmin();` then `createSupabaseServer()`
(authenticated RLS, never service-role); `[id]` routes validate UUID shape →
`notFound()` on bad/missing; lists fall back to unfiltered on unknown filters;
`p2-admin-page-gates` inventory fails the suite if a new `page.tsx` is untracked.

| Stage | Surface | Sentinel-relevant reuse |
|---|---|---|
| 1 Command Center | `app/[locale]/admin/workforce/page.tsx:138-157`; `command-center.ts:163-174` reads `incidents` open/investigating ≤10 | Already links to `/admin/workforce/sentinel`; needs no redesign — optionally add severity-count line once list exists |
| 2 Agents | `agents/[id]` shows any agent's runs/tasks/reports (5-row windows); sentinel row seeded (`migration_140:97`) | Sentinel agent detail **already works generically** — no change needed |
| 3 Tasks | `fetchTaskDetail` runs/steps/reports; links report→detail | Sweep-created tasks appear automatically; no change |
| 4 Approvals | `fetchApprovalLinks` (tasks+runs by `approval_id`); Stage 8 added `fetchQaRunsByApproval` | Pattern for incident→approval reverse lookup; no change |
| 5 Reports | incident hop via `incidents.agent_run_id` (`reports.ts:176-187`); `report_type` includes `incident/investigation` (`migration_142:116`); incident link currently → sentinel stub | **Upgrade link target** to `sentinel/[id]` once detail exists (1-line change + test) |
| 6 Activity | incident/event entries already shaped (`activity.ts:191-212`), both `href='/admin/workforce/sentinel'` | **Upgrade hrefs** to `sentinel/[id]` once detail exists |
| 7 QA exec | `qa_failure → incident` path + `evaluateIncidentDecision` | Display-only consumer; no change |
| 8 QA UI | `lib/workforce/qa.ts` tenant-null `.or()` contract; `STATUS_TONE`, chips, `isQaRunIdShape` | Closest template for `lib/workforce/sentinel.ts` + pages (note: incidents use plain `tenant_id`, not QA's `.or()` — see §10.1) |
| Nav | `app/[locale]/admin/layout.tsx:95-107` (`Sentinel`, Radar icon, position 8 of 9) | No new group needed; overview replaces stub at existing path |

No dedicated incident UI exists anywhere else (`components/` zero hits; dashboard zero
hits; only Command Center list, report link, activity entries).

---

## 6. Functional gaps (prioritized)

1. **Sentinel overview/list/detail UI** — stub only. (Stage 9 core.)
2. **Incident lifecycle writes** — no ack/investigate/resolve path; `expired` orphaned;
   no transition guard. (Requires decision: UI-driven vs runtime-owned; see §11.5.)
3. **Human notification** — no incident email/in-app/Telegram. (Defer push to post-9
   except at most a digest surface; see §7.)
4. **Sweep scheduling** — route exists, Vercel entry absent (Hobby-limit removal,
   `87e5292`); live sweep cadence is a deploy/ops decision, not code.
5. **QA emission live** — shadow default ON; live branch (`QA_SHADOW_MODE=false`) is a
   Vercel-env decision. Emitting real `qa_failure` incidents changes Sentinel signal
  volume — coordinate with UI landing.
6. **Stale-incident expiry** — `closeStale…` uncalled; without it, `resolved`-never +
   unique-index edge ( §3.2) slowly clogs the open set with invisible-to-lookup rows.
7. **Fallback ACL drift** — sentinel fallback lists 20 tools vs 24 in DB.
8. **Failing `sentinel-events` cron test** — asserts 5 crons incl. `sentinel-sweep`;
   reality is 4. Must be fixed (to 4, or to 5 with the entry restored) before Stage 9
   can claim a green suite.
9. **Emitter coverage** — new-content webhook, 4 crons, 429s emit nothing; Stripe
   masks 200. (Post-9 hardening, not Stage 9.)
10. **No health endpoint / structured logs / APM / queue** — explicitly post-9 (Stage 10+
    or dedicated phases per DISCOVERY-REPORT §16).

---

## 7. Proposed Stage 9 scope

**Essential (Stage 9):**
- 9.0 — Test hygiene: fix `sentinel-events` cron-count assertion to match `vercel.json`
  reality (4 crons, no sweep entry); align `FALLBACK_ALLOWED.sentinel` to 24 tools
  (or pin the divergence in a comment + test). Green suite is the floor.
- 9.1 — `lib/workforce/sentinel.ts`: `fetchIncidentList` (status/severity filters,
  limit 50), `fetchIncidentDetail` (incident + `incident_events`→`system_events`
  timeline, limit 100), `fetchEventList` (kind filter, limit 50), view models with
  `empty.*` + duration math; error/message truncation (mirror QA's 300ch) — `message`
  is worker/output text and gets the same redaction judgment.
- 9.2 — `sentinel/page.tsx` overview: counts (open/investigating), severity
  distribution (s1–s4 from real rows), recent incidents, recent `qa_failure` events,
  attention-needed section (s1/s2 open). Every number from a query; empty states per
  Stage 1–8 copy.
- 9.3 — `sentinel/incidents/page.tsx` (or list inside overview — prefer separate list
  per Tasks/Approvals/QA precedent) + `sentinel/incidents/[id]/page.tsx` detail:
  summary, severity/status, first/last seen, event timeline, dedupe key, linked QA
  runs (via `qa_failure` events' dedupe/route — display linkage, no new FK),
  task/approval/report hops (`agent_run_id → run → task`; `fetchApprovalLinks`
  pattern), investigation history = linked `agent_reports` (`incident`/`investigation`
  types), audit = `incident_events` join rows. Recommended-next-steps rendered **only**
  from persisted sweep `agent_reports`, never synthesized in UI.
- 9.4 — Reciprocal upgrades: report-detail incident link and activity incident/event
  hrefs → `sentinel/incidents/[id]`; gates inventory append; new `sentinel.test.cjs`
  registered in `package.json`.
- 9.5 — Read-only discipline: no status-write UI. If triage writes are wanted, they
  belong to a scoped Stage 9.x decision (see §11.5), not the default.

**Explicitly deferred (Stage 10+ / later):** incident status writes + transition guard,
push notifications (email/Telegram), sweep scheduling change, QA shadow go-live,
health endpoint, structured logging, Sentry, queue/worker, `health_checks`/
`deployments` tables, frontend `window.onerror` ingestion, Sentinel knowledge seeding
(beyond at most 1–2 SOP docs if needed for sweep quality — optional, not required).

---

## 8. Proposed UI structure

All data-backed; no invented metrics:

- **Overview** (`admin/workforce/sentinel`): open count, investigating count,
  severity histogram (counts grouped from the bounded recent-200 window per
  Tasks/QA precedent), 10 most recent incidents, 8 most recent events
  (Command Center precedent), recent `qa_failure` events (≤5), attention list
  (open s1/s2, ≤10). Empty: "No open or investigating incidents…" (existing copy).
- **Incident list**: filters = actual `status` (open/investigating/resolved/expired)
  + actual `severity` (s1–s4); newest-first (`last_seen_at` desc); bounded 50;
  tenant + platform visibility (platform admin view unfiltered; tenant view
  `.eq('tenant_id')` — incidents share the tasks/reports contract, **not** QA's
  `.or()`); empty + error states per precedent.
- **Incident detail**: title/summary/severity/status; first/last seen + event_count;
  correlated events timeline (via `incident_events`, ordered by event `created_at`);
  dedupe key (mono, truncated display); related QA runs (events with
  `kind='qa_failure'` → link QA list filtered… QA list has no route filter, so link
  to QA list unfiltered with note, or match `qa_runs` by date/suite — display-only
  heuristic, labeled as such); task/approval/report chain via `agent_run_id`;
  investigation history = linked reports; audit = join rows. Sensitive `message`
  text truncated + redacted (same judgment as Stage 5 sections / Stage 8 errors).
- **Agent detail (existing)**: no change — `/agents/<sentinel-id>` already exposes
  runs/tasks/reports; overview links to it for "who is Sentinel".
- **Command Center**: no structural change; optionally add `s1/s2` count to the
  incidents hint line once the list can back it. Link targets stay valid.

---

## 9. Data and API requirements

- **Database: none required.** Overview/list/detail read `incidents`,
  `incident_events`, `system_events` (+ existing hops to `agent_runs/tasks/reports/
  approvals/qa_runs`). Statuses, severities, kinds all exist. **No migration in
  Stage 9.** (If triage writes are later approved, that — and only that — needs a
  migration: UPDATE policy + transition guard; see §11.5.)
- **API: none required.** Server Components via `createSupabaseServer()`
  (authenticated RLS) suffice, per Stages 1–8. No new `/api/*` routes. The sweep
  route already exists; scheduling it is an ops/vercel.json decision with Hobby-plan
  implications (`87e5292`), not an API change.
- **New modules**: `lib/workforce/sentinel.ts`,
  `lib/workforce/__tests__/sentinel.test.cjs`,
  `app/[locale]/admin/workforce/sentinel/page.tsx` (rewrite),
  `app/[locale]/admin/workforce/sentinel/incidents/[id]/page.tsx` (new; list may live
  in overview or `sentinel/incidents/page.tsx`).
- **Touched**: `reports/[id]` incident link, `activity.ts` hrefs, gates inventory,
  `package.json` test list, `FALLBACK_ALLOWED` alignment, `CHANGELOG`.

---

## 10. Security and safety assessment

1. **Tenant isolation** — PASS by schema: `incidents`/`system_events` SELECT policies
   restrict tenant rows to `is_entity_member(…, all six roles)` and platform rows to
   active admins (`migration_143:57-104`). UI must pass `tenantId` through (all
   current pages pass `null` = platform admin view) and never use service-role.
2. **Platform-level incident access** — PASS: NULL-tenant rows admin-only in RLS;
   Sentinel tools merge platform rows only under the synthetic platform ctx
   (`orchestrator.ts:220-244`, placeholder→NULL in `tool-context.ts:43-58`).
3. **Admin authorization** — PASS pattern: every workforce page calls
   `await requireAdmin()`; gates test pins it (`p2-admin-page-gates.test.cjs:76-82`).
   New pages must be appended to `SERVER_PAGES`.
4. **Authenticated DB access** — PASS pattern: `createSupabaseServer()` (user-scoped);
   `createSupabaseAdmin()` confined to routes/lib emitters. New UI must not import
   the admin client.
5. **RLS enforcement** — PASS with tech-debt note: policies use
   `auth.role() = 'authenticated'`-adjacent shapes plus `auth.uid()` checks; per current
   Supabase guidance `auth.role()` is deprecated in favor of `TO <role>` and can
   misbehave with anonymous sign-ins. Flagged for a future RLS-modernization pass —
   **not** Stage 9 (no policy change proposed).
6. **Tool registry permissions** — PASS: Sentinel's 24 tools are low/medium,
   `approval_required=false`; `request_qa_run` and all transactional tools excluded;
   allowlist enforced pre-executor (`orchestrator.ts:260-288`); hallucinated tools
   rejected (`agent-runtime.test.cjs:204-232`).
7. **Approval requirements** — PASS: `checkApprovalRequired`
   (`lib/ai/approvals.ts:43-56`) blocks high/critical or flagged tools; none of
   Sentinel's tools qualify, so investigation orchestration never stalls — and
   Sentinel owns no write tool that could need gating.
8. **Error/log redaction** — PASS pattern, must extend: QA errors truncated+redacted
   (Stage 8); report sections whitelisted (Stage 5); tool results via
   `screenToolResult` (`output-guard.ts:225`); args via `redactArgs`
   (`tool-context.ts:78`). Incident `message` (≤2000ch, may echo payloads) and
   `metadata JSONB` (never select in UI) get the same treatment in `sentinel.ts`.
9. **Prompt-injection from incident content** — MITIGATED in pipeline:
   `screenUntrustedInput` + `wrapInUntrustedContainer` (`input-guard.ts:206-295`),
   `guardBeforeDisplay` (`output-guard.ts:289`), single-iteration L0 synthesis.
   Residual: sweep prompt interpolates incident counts only, not message bodies —
   keep it that way; UI must never feed raw `message` text into agent prompts.
10. **Untrusted external payloads** — PARTIAL: webhook bodies land in `metadata`
    (UI must not render `metadata` raw); `message` is capped; artifact URLs are
    ingest-allowlisted. Stage 9 renders `message` truncated/redacted, never `metadata`.
11. **Rate limiting** — PRESENT but fail-open (`lib/rate-limit.ts:130-164`) and 429s
    are unobserved (§4). Sweep + gateway share the `articleAi` bucket. No change for
    read-only UI (RSC reads aren't rate-limited); note as hardening backlog.
12. **Audit logging** — PASS: `logToolInvocation` per tool call; agent runs/steps/
    reports persisted; `incident_events` join is append-only (`UNIQUE` pair).
    Missing: incident *status* audit (no writes exist to audit — moot until §11.5).
13. **Replay/duplicates** — HANDLED: dedupe key + 60-min window + partial unique index;
    QA ingest idempotent re-POST no-op (`lib/qa/ingest.ts:193-198`); known unique-
    collision edge logged, needs expiry caller (§6.6).
14. **Status transition integrity** — N/A today (no writers). Any future write path
    must add: UPDATE RLS + `enforce_*_status_transition()` trigger (precedent:
    `migration_134`) + conditional-update server action (precedent: `decideApproval`
    in `lib/workforce/approvals.ts:160-195`).

**Non-negotiable boundary — HOLDS**: Sentinel owns zero deploy/migrate/infra/payment/
delete/security/SQL-bypass capabilities (no such tools registered; L0 blocks
high/critical; service-role confined to server code paths that Sentinel cannot invoke
— its executors are SELECT-only and its gateway/orchestrator path issues no writes
except its own run/report rows). Nothing in Stage 9 changes this: read-only UI adds no
permission. No new permissions are introduced by this report.

---

## 11. Architecture recommendations

1. **Consume the existing incident pipeline — do not extend it.** Tables, dedupe,
   severity, emitters, and read tools exist and are tested hermetically. Stage 9 is a
   presentation stage.
2. **Detection stays in existing producers.** Gateway/chat/calendar/webhooks/QA-ingest
   already emit at failure points; gaps (new-content webhook, silent crons, 429s) are
   one-line `void insertSystemEvent` additions for a hardening pass — not new
   infrastructure, and deliberately out of Stage 9 to keep the diff reviewable.
3. **QA→incident without duplicates**: keep the single `qa_failure` path
   (per-day decision key + standard event dedupe + partial unique index). Do not add a
   parallel notifier (already rejected in `AI-WORKFORCE-IMPLEMENTATION-READINESS:124-125`).
   Coordinate shadow go-live with UI landing so the first live incidents render
   correctly.
4. **Correlation**: keep dedupe-key grouping + `incident_events` join. No new
   correlation tables. Cross-link QA→incident in UI via display heuristics only.
5. **State persistence**: `incidents` rows as today. No `incident_history` table until
   writes exist (creating an audit table for zero writers is speculative schema).
6. **No new migration in Stage 9.** Stated with evidence: every proposed read is
   covered by 143/144/145. Next free number stays untouched.
7. **No dedicated Sentinel service.** Reuse orchestrator + gateway + sweep route +
   workforce UI infra. A service/process would add hosting surface for zero functional
   gain (no queue exists by design).
8. **Activity + audit systems are sufficient** for Stage 9 (feed entries, run/step/
   report persistence, append-only joins). Revisit only if triage writes land.
9. **Sync vs background**: keep sweep synchronous request/response (current design,
   `CURRENT-STATE-AUDIT:373`); read-only UI adds only bounded SELECTs (≤50/100 rows).
   No new load concern on Vercel/Supabase beyond ordinary page renders.
10. **Future agents** integrate via the registry (`agents` + `agent_tools` + `SAFE_COLUMNS`
    + `screenToolResult`), never by coupling to Sentinel code. Sentinel remains a
    consumer of shared tables, not a dependency of other agents.
11. **Sweep scheduling**: recommend restoring the Vercel entry (`0 */2 * * *`) only
    after confirming plan limits (it was removed for Hobby limits, `87e5292`) and
    fixing the cron-count test to the chosen reality. Manual invocation + gateway
    runs suffice for Stage 9 verification.

---

## 12. Detailed implementation sequence

**9.0 — Test hygiene & suite green** (prerequisite, no UI)
- Objective: green suite before building.
- Changes: `sentinel-events.test.cjs:167-180` cron assertion → match `vercel.json`
  (4 crons) unless sweep scheduling is restored first; `FALLBACK_ALLOWED.sentinel`
  +24th-tool alignment (or documented pin + test).
- DB/API/UI: none. Security: none (test-only). Tests: the fixed tests themselves.
- Acceptance: `npm test` passes fully (currently 781/782).
- Rollback: revert commit.

**9.1 — `lib/workforce/sentinel.ts` data access** (no routes)
- Objective: fetch + pure VM for incidents/events, Stage 1–8 shape.
- Files: new `lib/workforce/sentinel.ts`, new `lib/workforce/__tests__/sentinel.test.cjs`
  (+ `package.json` registration).
- DB/API/UI: none. Security: SELECT allowlists mirroring tool `SAFE_COLUMNS`; never
  select `metadata`; truncate + redact `message`; tenant `.eq('tenant_id')` contract
  (platform `null` unfiltered); `isIncidentIdShape`/`isEventIdShape` guards.
- Tests: list filters (status/severity/kind), tenant scoping, forbidden-column scan,
  redaction scan, empty states, by-`agent_run_id` hop, 404-null, reciprocal
  `fetchIncidentsByQaRun`-style helper if adopted.
- Acceptance: hermetic suite green; `npx eslint`; `npx tsc --noEmit`.
- Rollback: delete two files + package.json line.

**9.2 — Overview page** (`sentinel/page.tsx` rewrite)
- Objective: counts, severity distribution, recent incidents/events, QA failures,
  attention list — all queried, empty states honest.
- Files: rewrite stub; reuse `StatCard/SectionHead/EmptyNote` copy conventions.
- DB/API: none. Security: `requireAdmin`; gates inventory unchanged (path already
  listed). Tests: extend `sentinel.test.cjs` (VM empties); gates test still passes.
- Acceptance: renders with zero incidents (honest empty) and with fixture-backed
  hermetic confidence; no fabricated numbers.
- Rollback: revert one file.

**9.3 — Incident list + detail** (`sentinel/incidents/page.tsx`,
  `sentinel/incidents/[id]/page.tsx`)
- Objective: filterable list + full detail (§8).
- Files: two new pages (+ gates inventory entries — required, suite fails otherwise).
- DB/API: none. Security: `requireAdmin` both; `notFound()` on bad/missing id;
  message redaction; artifact-style honesty for absent links.
- Tests: 404-on-bad-id, empty timeline, missing-linkage states.
- Acceptance: open→detail navigation from overview, list, activity, and report pages.
- Rollback: delete pages + inventory lines.

**9.4 — Reciprocal upgrades**
- Objective: report-detail incident link + activity incident/event hrefs →
  `sentinel/incidents/[id]`; Command Center optional s1/s2 hint.
- Files: `reports/[id]/page.tsx`, `lib/workforce/activity.ts` (+ tests), maybe
  Command Center copy. Security: none (href-only). Tests: updated activity tests.
- Acceptance: every existing incident pointer resolves to a real page.
- Rollback: revert hrefs.

**9.5 — Docs & closeout**
- `docs/CHANGELOG.md` entry; verification `eslint → tsc → build → npm test`;
  delivery report (failed QA/incident honesty confirmation); commit; STOP.

Dependencies: 9.0 → 9.1 → 9.2 → 9.3 → 9.4 → 9.5 linear. No migration, no API, no
permission, no scheduling change in any subphase.

---

## 13. Testing and acceptance criteria

- **New hermetic suite** `lib/workforce/__tests__/sentinel.test.cjs` (node:test,
  fake chainable client, TS-transpile harness per Stages 2–8 precedent), registered in
  `package.json` explicit file list: list/status/severity/kind filters; tenant
  isolation (tenant rows hidden cross-tenant; platform rows admin-only — RLS is
  DB-side, so tests assert the `.eq('tenant_id')` contract + no service-role import);
  forbidden-column scan (`metadata`, claim-adjacent, credentials); message redaction
  scan with crafted secrets; empty states; invalid-ID 404 (`null` detail + shape
  guard); reciprocal-link helper.
- **Regression**: full `npm test` green (fix 9.0 first); `p2-admin-page-gates` green
  with new pages inventoried; Stages 1–8 suites untouched and passing.
- **Static**: `npx eslint <files>` clean; `npx tsc --noEmit` clean; `npm run build`
  evaluated against the known pre-existing `things-to-do/[city]` prerender failure
  (unrelated; must not be newly broken by Stage 9 — verify failure signature
  unchanged).
- **Staging (requires infra, post-implementation)**: with 143–145 applied, seed one
  `api_error` burst + one `qa_failure` (shadow OFF in staging only) → overview shows
  s-graded incidents; sweep manual run → `agent_reports` row; RLS check as non-admin
  member vs outsider. Local-only cannot prove these — mark staging results accordingly.
- **Acceptance bar**: every number on every Sentinel surface traces to a query;
  failed QA/incidents render honestly; no secrets in any render; no new permission;
  no migration; no invented statuses/severities/kinds.

---

## 14. Dependencies and risks

| # | Dependency / Risk | Mitigation |
|---|---|---|
| 1 | Migrations 143–145 must be applied where UI reads (live state UNVERIFIED) | Stage 9 verify step queries `incidents`/`qa_runs` existence before sign-off; empty-state copy covers unapplied case without 500 (missing-table surfaces as read error → honest error state, same as Stage 1 contract) |
| 2 | `sentinel-events` test currently red (cron assertion) | Fix in 9.0 before building |
| 3 | Sweep unscheduled → overviews may show stale `last_seen_at` with no fresh summaries | UI labels data recency honestly ("last observed", never "live"); scheduling decision tracked as ops follow-up, not Stage 9 code |
| 4 | QA shadow default ON → few/no `qa_failure` incidents in prod | Expected; staging go-live coordinated separately; UI empty states cover it |
| 5 | `closeStale…` uncalled → open-set clog + unique-collision edge | Document; propose single `void` call site (sweep route post-read) as optional 9.x — needs no migration, but keep out of default 9.0–9.5 to preserve read-only scope |
| 6 | `message`/`metadata` may carry secrets from payloads | Truncate + redact + never-select-metadata (tested); residual risk accepted and disclosed |
| 7 | Prompt-injection via incident text into future prompts | Sweep prompt keeps count-only interpolation; no new prompt surface in Stage 9 |
| 8 | Hobby-plan cron limits if sweep rescheduled | Keep manual; rescheduling is an explicit plan/ops decision |
| 9 | Stale doc claims (readiness doc says 5 crons; audit says 4-cron assertion / 20 tools) | Correct the two stale lines as part of 9.5 docs pass (doc-only, no code) |
| 10 | Scope creep into monitoring platform (Sentry, health checks, queues, PR bots) | §15 enforced; each deferred item names its future home |

---

## 15. Explicit out-of-scope items

- Incident status writes (ack/investigate/resolve UI, UPDATE RLS, transition trigger).
- Push notifications (email/Telegram/Slack incident alerts).
- `sentinel-sweep` scheduling change (vercel.json edit).
- QA shadow go-live (`QA_SHADOW_MODE=false`).
- Health endpoint, structured logging, correlation IDs.
- Sentry/Datadog/any APM, log aggregators.
- Queue/worker (pg-boss/BullMQ/Inngest/pg_cron), background execution (Stage 10).
- `health_checks` / `deployments` tables or any migration.
- Frontend error ingestion (`window.onerror`, `global-error.tsx` hook).
- New agent permissions of any kind.
- Sentinel knowledge seeding (unless a 1–2 doc SOP proves necessary for sweep quality —
  even then, separate decision).
- Command Center redesign; Stages 1–8 page redesigns (href upgrades only).
- Donate-spec fix; build prerender fix; any unrelated bug.

---

## 16. Final readiness assessment

**READY WITH PREREQUISITES — proceed to Stage 9 implementation on approval.**

- **What exists**: executable L0 Sentinel (identity, 24 tools, 4 read executors,
  gateway + sweep paths), complete incident persistence (tables, dedupe, severity,
  RLS), pull surfaces (Command Center, activity, reports), and a proven UI pattern
  (Stages 1–8) that maps 1:1 onto the proposed work.
- **What is genuinely missing**: the UI itself, lifecycle writes, notifications,
  scheduling, and live-signal volume (shadow mode) — of which **only the UI** belongs
  in Stage 9.
- **Prerequisites before implementation**: (a) approve the read-only scope (§7) and
  the no-migration constraint (§9); (b) decide sweep-scheduling disposition (keep
  manual — recommended); (c) acknowledge the two pre-existing reds (cron-count test,
  `things-to-do` prerender) as out-of-scope tracked items so Stage 9 acceptance stays
  clean.
- **Risk posture**: low. Stage 9 as scoped adds SELECT-only UI code under existing
  RLS + `requireAdmin`, introduces no permission, migration, API, or background work,
  and is revertible per-subphase (§12). The non-negotiable boundary (§10) holds
  throughout.

---

## Appendix A — Document divergences found (stale claims, for the 9.5 docs pass)

1. `docs/AI-WORKFORCE-IMPLEMENTATION-READINESS.md:30` — "5 Vercel crons incl.
   `sentinel-sweep`": stale. `vercel.json:1-8` has 4 crons, no sweep entry (removed
   `87e5292`). Also `:9-10` failure counts predate Stage 8.
2. `docs/AI-OPERATING-SYSTEM-CURRENT-STATE-AUDIT.md:427` — "asserts exactly 4 crons":
   stale. The test asserts 5 (`sentinel-events.test.cjs:178`); reality is 4 → red.
3. Same audit `:94` — "Sentinel (20)" tools: stale. DB seeds 24 (fallback still 20 —
   the §2.2 gap).
4. `app/api/cron/sentinel-sweep/route.ts:3` — "Vercel cron every 2h": aspirational
   while unscheduled.

## Appendix B — Investigation notes

- Sub-reports used: Sentinel agent registry/tools/executability; incident
  infrastructure (143/144/145, emitter, lifecycle, notifications, dedupe);
  observability inventory (10 capabilities classified); workforce Stages 1–8
  integration map. Key claims above were spot-verified directly (vercel.json,
  sweep route, incidents RLS `migration_143:96-133`, fallback allowlist
  `agent-registry.ts:79-148`, guard exports in `output-guard.ts`/`input-guard.ts`).
- No Stage 0–8 implementation-report doc exists for Stage 8 itself (its deliverable
  was the commit + `docs/CHANGELOG.md:8-17` entry); Phase summaries
  (`PHASE-139-142-SUMMARY`, `PHASE-143-SENTINEL-INVESTIGATION-REPORT`,
  `PHASE-143b-SUMMARY`, `PHASE-144-QA-INVESTIGATION-REPORT`) plus `STAGE-7-*` docs
  were consulted.
- `docs/CURRENT-STATE.md` / `docs/ROADMAP.md` do not track the AI Workforce stages
  (they cover the website/commerce phases); workforce truth lives in the
  AI-OS docs + `docs/CHANGELOG.md`.
