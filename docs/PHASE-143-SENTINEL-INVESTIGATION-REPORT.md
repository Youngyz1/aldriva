# Phase 143 — Sentinel Observability & Incident Foundation — Investigation Report

> **Authorization**: Investigation only — no migrations, no code, no external SDKs, no pgvector, no autonomy changes  
> **Date**: 2026-09-28  
> **Precondition verified**: `tool_definitions:23`, `agents:3 (dylan,qa,sentinel L0)`, `agent_tools:61`, `knowledge 6/6`, `POST /api/ai/gateway` live  
> **Method**: Direct file reads with `file:line` evidence. `EXISTS` = durable, queryable signal. `DOES NOT EXIST` = only `console.*` / Vercel logs or entirely absent.

---

## 1. Where Signals Already Exist (Part 1)

### 1.1 Errors / exceptions

**EXISTS — ad-hoc per-route `try/catch`, no shared wrapper.**

- No `withErrorHandler` / `wrapApi` found. Every `app/api/**/route.ts` owns its `try/catch` and returns `NextResponse.json({error:...},{status:500})`:
  - `app/api/ai/gateway/route.ts:45-159` outer `try { POST } catch => 500 {error:'AI gateway error'}` + `console.error('[api/ai/gateway]',msg):157`
  - `app/api/donate/intent/route.ts:18-156` `try` / `catch:152 => 500 {error:"Could not start the payment..."}`
  - `app/api/webhooks/stripe/route.ts:1089-1122` sig verify `try/catch => 400`, handler `try/catch => console.error` but `return {received:true}` (swallowed to keep Stripe retries idempotent)
  - `app/api/crypto/webhook/route.ts:305-371` outer `try/catch => 500 {error:"Webhook processing failed."}`
  - `app/api/cron/purge-accounts/route.ts:27-87` `try/catch => 500`
- `lib/ai/orchestrator.ts:55-67` `getToolGate` fallback, `140-151` provider resolve fallback, `198-412` main loop `try/catch => return {success:false,error,runId,taskId}` + `completeAgentRun(status:'failed'):397`, `439-453` output-guard `try/catch => guardVerdict:'rejected'`
- `lib/actions/*.ts` — `if(error) return {success:false,error:"..."}` tuple style (`lib/actions/products.ts:243`, `lib/actions/articles.ts:148`), no thrown wrapper.
- `proxy.ts:282-481` — **zero** `try/catch`. Helpers like `checkArticleAccess:70` fail **open** (`if(!res.ok) return true`) to avoid blocking. Uncaught proxy exception bubbles to Next.js edge and becomes `500` / function crash.
- **Production fate**: Without a catch, Next.js returns generic `500` and logs `console.error` to Vercel function logs only. No durable row, no `system_events` table, no queue. *Durable signal: **DOES NOT EXIST** for uncaught — only `console.*`.*

### 1.2 API failures (4xx/5xx construction)

**EXISTS — consistent ad-hoc `NextResponse.json({error:string},{status})` shape, no helper.**

Reusable pattern is `app/api/ai/gateway/route.ts` which already distinguishes statuses deterministically:

- `app/api/ai/gateway/route.ts:40` `401 {error:'Unauthorized'}` (GET+POST)
- `51-52` `429` via `lib/rate-limit.ts:163-174` `rateLimitResponse()` (`Retry-After` + `Cache-Control:no-store`)
- `62-63` `400 {error:'agent is required...'}` / `65-66` `400 {error:'prompt is required'}`
- `71-72` `400 {error:'Unknown agent:…'}`
- `76-78` `404 {error:'Agent not found...'}`
- `84-86` `400 {error:'tenantId must be valid UUID'}`
- `98-112` `403 {success:false,approvalRequired:true,approvalId,reason,agent,runId,taskId,toolCalls}` (approval gate — **creatable event source**)
- `114-127` `422 {success:false,error,guardVerdict:'rejected',agent,runId...}` (output guard)
- `129-141` `500 {success:false,error,agent...}` (orchestrator failure)
- `155-159` `500 {error:'AI gateway error'}` outer catch

Other routes mirror the `{error, success?}` shape without a shared helper (`app/api/donate/intent/route.ts:56-82`, `app/api/products/[id]/upload-url/route.ts:60-80`). **Reusable event shape exists: `{status, error, guardVerdict?, approvalRequired?, agent?, runId?, taskId?, toolCalls?}` — could seed `system_events` directly without new theory.**

### 1.3 Background jobs / crons

**EXISTS — Vercel cron HTTP triggers (3 slots used), no queue, no `job_runs` table.**

- `vercel.json:2-6`: `daily-post 0 14 * * *`, `promotion-engine 0 18 * * *`, `purge-accounts 0 3 * * *` — all **occupied** (Vercel Hobby limit is 2, but Pro is 40; Aldriva uses 3 already).
- `lib/cron-auth.ts:22-33` `isAuthorizedCronRequest()` — **fails closed** (`if(!secret) return false`) + constant-time `timingSafeEqual(SHA256(Bearer ${secret}))`
- `app/api/cron/purge-accounts/route.ts:28-30` `if(!isAuthorized) 401`, else query/update with explicit `throw` → `500`
- `app/api/cron/daily-post/route.js:38-40` + `app/api/cron/promotion-engine/route.js:129-132` same gate, `catch => 500`
- `app/api/cron/invitation-retention/route.ts:10-15` — **exists but does NOT use `lib/cron-auth.ts`** and fails **open** (`if(cronSecret && header!==Bearer) 401` — missing env = true). **Also not in `vercel.json`** — unreachable except by manual HTTP.
- **No `job_runs` / `cron_runs` table**. Success/failure only goes to `console.log`/`console.error` captured in Vercel logs (not queryable via SQL). **Durable job-run signal: DOES NOT EXIST** (only `ai_tool_invocations`/`agent_runs`/`payment_reconciliation_failures` are durable).
- **No queue/worker** (`BullMQ`, `pg_cron`, `pgmq`, `Inngest`) — confirmed `grep queue|BullMQ|pg_cron` zero hits outside `node_modules`.

### 1.4 Webhook failures

**EXISTS — Stripe + Crypto + new-content webhooks, idempotent, not retried internally, partially durable.**

- `app/api/webhooks/stripe/route.ts:1089-1097` `400 Invalid signature` on `stripe.webhooks.constructEvent` failure; `1100-1122` dispatches `payment_intent.succeeded / checkout.session.completed / customer.subscription.deleted / invoice.payment_failed`; handler errors `catch:1120 => console.error` but returns `200 {received:true}` so **Stripe does not retry** — idempotency via RPC `is_new` flag `530-554,640-659`. **Durable hook:** `payment_reconciliation_failures` insert `53-63` + Resend alert `74-96` on `record_ticket/donation_and_credit` failure.
- `app/api/crypto/webhook/route.ts:310-330` `400 Missing x-nowpayments-sig`, `400 Invalid body`, `500 not configured`, `400 Invalid signature` (HMAC `sha512` over `sortKeysDeep`: `43-54`), `335-336` only acts on `finished/confirmed`, `364-370 => 500` on exception. **No reconciliation table** — only `console.error`.
- `app/api/webhooks/new-content/route.js:4-8` `401` if `x-webhook-secret !== SITE_WEBHOOK_SECRET`, `catch => 500` — **no durability**, no retry, no `job_runs`.
- **Retried? No** internal retry — relies on Stripe/Crypto provider retry. **Logged durably? Only payment reconciliation path — webhook-level `4xx/5xx` themselves are `console.*` only.**

### 1.5 Payment failures

**EXISTS — success path is durable; decline/failed is mostly `console.*` or silent.**

- Inline creation: `app/api/donate/intent/route.ts:117-147` `stripe.paymentIntents.create({amount:totalCents, metadata:{kind:'donation', fundraising fields}})` with `idempotencyKey:112-115`; `app/api/create-payment-intent/route.ts:333-342` same; `app/api/checkout/route.ts:145-187` `stripe.checkout.sessions.create` idempotent. **No `lib/stripe.ts` central helper.**
- Webhook success: Stripe `amount` is source-of-truth (`stripeAmount >0 ? stripeAmount : metaAmount`: `431-438`, `611-619`); RPC `record_donation/ticket_and_credit` is idempotent via `is_new`.
- **Failed payment:** Stripe `invoice.payment_failed` handled at `app/api/webhooks/stripe/route.ts:1150-1155` — `console.warn` only, retains `status` to let Stripe dunning retry, **no table**, **no event**. `customer.subscription.deleted` `1129-1148` flips `businesses.status='expired'` — only success mutation.
- **Existing failure durability: `payment_reconciliation_failures`** (`alertReconciliationFailure:44-97`) — **the single durable payment-failure signal in Aldriva**. Inserted only when provider reported `succeeded` but local RPC failed (charge exists, record does not). Emails `BRAND.supportEmail`. Comment header `34-42` explicitly notes *no Sentry / no generic failed-payment tracking* — this table is new infra, not a hookup.

### 1.6 Auth failures

**EXISTS — redirects and manual `401` per route, no audit table.**

- `lib/auth.ts:34-132` `getCurrentUser() => user??null` cached, `getCurrentUserProfile()` service-role returns `null` on error/purged, `isAdmin()/isOrganizer()` boolean, `requireAdmin() => redirect('/')`, `requireAuth() => redirect('/login'|' /recover-account')`.
- `proxy.ts:359-405` `isProtected && !user => redirect /{locale}/login?redirect=...`, `suspended => redirectAndSignOut(login?suspended=1):382`, `purged => ?deleted=1:386`, `pending_deletion => /recover-account:390`, `isAdminPath && role!=='admin' => /:398`. `redirectAndSignOut:261-280` deletes `sb-*` cookies.
- API routes: manual `NextResponse.json({error:'Unauthorized'}, {status:401})` at `app/api/ai/gateway/route.ts:40,48`, `app/api/donate/intent/route.ts:16?` none (relies on proxy redirect), **`app/api/signup-guard/route.ts:8-35`** `400` on bad payload, `200 {isPendingDeletion,purgeAt}`.
- **Durable auth-failure signal: DOES NOT EXIST** — no `auth_failures` / `audit_logs` for login/permission denial. Only `profiles.status` transitions persist.

### 1.7 Storage failures

**EXISTS — per-call thrown/returned errors, no central audit.**

- `lib/uploads.ts:126-128` `if(error) throw new Error(error.message)` after `storage.from(bucket).upload`.
- `lib/uploadImage.ts:122-153` `try uploadPublicFile catch => UploadImageError('network_error'|'upload_failed')` (`27-41` `ERROR_MESSAGES` map).
- `lib/image-processing.ts:94-132` `try storage upload 109-115 => console.warn + {success:false,error}`, `catch => {success:false,error}` — comment `119-122` notes **no fallback URL**.
- `app/api/products/[id]/upload-url/route.ts:60-65` `500 Failed to create signed upload URL`, `74-80` `catch => 500`.
- `app/api/products/[id]/assets/confirm/route.ts:86-150` `storage.list` verify `500`, `400 not found`, size cap `400` + `remove`.
- `app/api/articles/[id]/audio/route.ts:176-185` `if(uploadErr) throw ...` caught `222-240` `=> upsert status:'failed'`.
- **Durable signal: DOES NOT EXIST** as a unified table — per-feature error messages returned inline, not inserted anywhere queryable.

### 1.8 Guard rejections & approval blocks

**EXISTS — the only durable observability already in Aldriva. Must be reused, not rebuilt.**

- `lib/ai/output-guard.ts:89-130` `logRejection(context,category,reason,excerpt,options)` — **dual write**: `console.warn:102` + best-effort **async `supabase.from('ai_guard_rejections').insert({context,category,reason,excerpt,content_type,source_id,verdict}):113-129` fire-and-forget (never surfaces to caller, never becomes DoS). `screenModelOutput:152-204` detects `SYSTEM_PROMPT_ECHO_PATTERNS:56-66`, `EMAIL_PATTERN:69`, `PHONE_PATTERN:74`, `UUID_PATTERN:78` (v4 only) → `logRejection` flagged/rejected. `screenToolResult:223-269` row-level filtering logs per `tool.field`. `guardBeforeDisplay:287-313` throws on `rejected`, strips on `flagged`.
- `lib/ai/input-guard.ts:98-135` `logInputRejection` — same dual write into **same table** with `category:'input_'+category`, `content_type:'external_url'`, `verdict` (prefix disambiguates). `screenUntrustedInput:204-266` strips `<script>/<style>/<iframe>/<svg>/<head> & comments:155-161`, extracts `<article>/<main>:164-170`, detects `INJECTION_PATTERNS:27-92` (11 patterns) → `logInputRejection(...,flagged)` + sentence filter `247-251`. `wrapInUntrustedContainer:276-286` delimiter, `checkGuardAuditHealth:293-321` verifies table reachable.
- `lib/ai/approvals.ts:42-132` `checkApprovalRequired:42-90` — `HIGH_RISK={'high','critical'}:28`, `requiresApproval = approvalRequired||highRisk:51`. `L0 => blocked:true:57-64` (Phase 142 invariant). `L1+` queries `approvals {action,status='approved',expires_at>now}:70-77` → `blocked:false` if found else `blocked:true:85-89`. `createApprovalRequest:96-132` **inserts** `approvals {requested_by,requested_by_agent_id,tenant_id,action,reason,evidence,risk,status:'pending'}` and returns `id`. `lib/ai/orchestrator.ts:264-283` calls it on block and emits `agent_steps kind:'approval_request'`.
- **Already queryable today:** `ai_guard_rejections` (both guards), `approvals` (pending/approved/rejected/expired), `agent_steps.kind='guard_verdict'|'approval_request'`, `agent_runs.guard_result|status`, `ai_tool_invocations` (tool-level success/failed_closed). These are **platform-wide or tenant_id-nullable** and RLS-gated — no new external service needed to query them.

**Summary — EXISTS vs DOES NOT EXIST:**

| Signal | Durable/Queryable Today? | Evidence |
|---|---|---|
| Guard rejections (input+output) | **EXISTS** | `ai_guard_rejections` via both guards |
| Approval blocks | **EXISTS** | `approvals` + `agent_steps:approval_request` |
| Agent tool calls | **EXISTS** | `ai_tool_invocations` + `agent_steps:tool_result` |
| Agent runs | **EXISTS** | `agent_runs` + `agent_reports` |
| Payment reconciliation failure (succeeded but not recorded) | **EXISTS** | `payment_reconciliation_failures` |
| Uncaught server exceptions | **DOES NOT EXIST** (console only) | per-route `catch=>500` |
| API 4xx/5xx as event stream | **DOES NOT EXIST** (response only) | `gateway` returns, no insert |
| Job/cron run history | **DOES NOT EXIST** | `console.*` only |
| Webhook failure beyond reconciliation | **DOES NOT EXIST** (console only) | Stripe/Crypto not durable |
| Auth failure audit | **DOES NOT EXIST** | redirects only |
| Storage failure audit | **DOES NOT EXIST** | per-route return |

---

## 2. What Should Become an Event vs. an Incident (Part 2)

### Definition (grounded, not generic)

- **`system_events`** — high-volume, low-ceremony **raw occurrence**; `INSERT`-only, no human update path; the single ingest seam every existing emitter feeds. A single `POST /api/ai/gateway 403` or one `daily-post` crash becomes one row. Retained ~30 days, queried by Sentinel, then rolled off. **New table.**
- **`incidents`** — low-volume, **correlated grouping** of events that indicates something is actually wrong and merits `Sentinel` investigation or human attention. One incident groups 1-N events sharing a `dedupe_key` within a window. Retained indefinitely (compliance), status is human- or Sentinel-driven. **New table + join table.**

This mirrors the durable signals above: `ai_guard_rejections`/`payment_reconciliation_failures` are already mini-events; `system_events` generalizes that pattern to `console.error` today.

### `system_events` (columns, not DDL)

```
id                uuid PK default gen_random_uuid()
created_at        timestamptz NOT NULL default now()
kind              text NOT NULL CHECK in (
                    'api_error','job_error','webhook_error',
                    'payment_reconciliation','auth_failure',
                    'storage_error','guard_rejection','approval_block',
                    'agent_tool_error'
                  )
severity_hint     text NOT NULL CHECK in ('info','warn','error','critical')
                    -- emitter's local judgment; incidents re-derive severity
tenant_id         uuid NULL REFERENCES organizers(id) ON DELETE SET NULL
                    -- NULL = platform-wide (payment reconciliation w/o tenant, job without tenant)
actor_id          uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
agent_id          uuid NULL REFERENCES agents(id) ON DELETE SET NULL
route             text NULL  -- e.g. 'POST /api/ai/gateway', 'POST /api/webhooks/stripe'
tool_name         text NULL  -- when kind=agent_tool_error/guard_rejection
status_code       smallint NULL -- HTTP status when relevant (401/403/422/500)
error_code        text NULL      -- provider code / constraint name / cron name
message           text NOT NULL  -- redacted excerpt, truncated 2k, never secrets (use lib/ai/tools/tenant/tool-context redactArgs pattern)
metadata          jsonb NOT NULL default '{}' -- redacted, shaped per kind (see emitters below), includes runId/taskId/approvalId/guardCategory when available
dedupe_key        text NOT NULL  -- deterministic grouping key: `${kind}:${route}:${tool_name ?? ''}:${error_code ?? ''}:${tenant_id ?? 'platform'}`
```

**Emitter → metadata shape (examples, not exhaustive):**

- `gateway 403 approvalRequired` → `kind:approval_block, route:'POST /api/ai/gateway', tenant_id, agent_id, tool_name, message:reason, metadata:{approvalId, runId, taskId, risk}`
- `gateway 422 guardRejected` → `kind:guard_rejection, route:'POST /api/ai/gateway', tenant_id, agent_id, tool_name, message, metadata:{guardCategory, runId, taskId}`
- `cron job` → `kind:job_error, route:'POST /api/cron/daily-post', tenant_id null, message, metadata:{cronName, durationMs}`
- `webhook 500` → `kind:webhook_error, route:'POST /api/webhooks/stripe', message, metadata:{stripeEventId, kind:'ticket'}`
- `api_error` → `kind:api_error, route, status_code, message`

**Insertion seam:** single `lib/observability/system-events.ts:insertSystemEvent()` (service_role, best-effort, never surfaces, same non-blocking ` .then(({error})=>console.error)` as `logRejection`). Callers are **in-process** `catch` blocks — no queue, no external service.

### `incidents` + `incident_events` (columns, not DDL)

```
incidents
  id              uuid PK
  created_at      timestamptz NOT NULL default now()
  updated_at      timestamptz NOT NULL default now()
  status          text NOT NULL CHECK in ('open','investigating','resolved','expired')
  severity        text NOT NULL CHECK in ('s1','s2','s3','s4')  -- derived on open, re-derived on grouping
  title           text NOT NULL  -- derived: `${kind} — ${route} — ${error_code}` (human-readable, truncated)
  summary         text NULL      -- Sentinel fills after investigation (L0 read-only)
  tenant_id       uuid NULL      -- mirrors events if all grouped events share one tenant, else NULL for cross-tenant/platform
  dedupe_key      text NOT NULL  -- foreign to events.dedupe_key (the group's key)
  event_count     int NOT NULL default 1
  first_seen_at   timestamptz NOT NULL
  last_seen_at    timestamptz NOT NULL
  agent_run_id    uuid NULL REFERENCES agent_runs(id) -- Sentinel investigation that opened/updated it
  metadata        jsonb NOT NULL default '{}' -- {route, tool_name, guardCategory, representativeMessage}

incident_events   -- join, append-only
  id              uuid PK
  incident_id     uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE
  event_id        uuid NOT NULL REFERENCES system_events(id) ON DELETE CASCADE
  created_at      timestamptz NOT NULL
  UNIQUE(incident_id, event_id)

UNIQUE(incidents.dedupe_key) WHERE status IN ('open','investigating')  -- one open group per key
```

**Why two tables:** `system_events` is high-cardinality and time-boxed; `incidents` is low-cardinality and join-based. This keeps `system_events` insert-only and cheap while `incidents` stays small and human-awaitable.

### Correlation / deduplication (simple, deterministic, no ML/vector)

Inserted event's `dedupe_key` is deterministic and cheap (same as `rate-limit.ts` key shape). Grouping is SQL, not semantic:

1. `INSERT` the event → compute `dedupe_key`.
2. **In same DB call** (`insertSystemEvent` after `INSERT`): `SELECT id FROM incidents WHERE dedupe_key = $1 AND status IN ('open','investigating') FOR UPDATE` (or `supabase .select().eq().in()` then `insert` — best-effort is acceptable; race creates duplicate open incident which Sentinel can merge on next investigation).
3. **If found**: `UPDATE incidents SET event_count+=1, last_seen_at=now(), updated_at=now()` + `INSERT incident_events(incident_id, event_id)`. No severity re-grade on every event to keep path tight (re-grade only on Sentinel investigation).
4. **If not found**: `INSERT incidents(dedupe_key, status:'open', severity:derive(events in 60-min window or single event), title:derive, tenant_id:event.tenant_id, first_seen_at:event.created_at, last_seen_at:event.created_at, event_count:1)` + `INSERT incident_events`.
5. **Window**: Only events within `60 min` of `last_seen_at` re-open the group; older same-key event after `60 min` with no open group creates a **new** incident (time-decayed, prevents year-long `open`).

No natural-language deduplication, no embeddings. Two `guard_rejection` events on different pages share `kind:guard_rejection` but different `route`/`error_code`, so they are **separate** dedupe keys — correct for Sentinel to investigate separately.

### First-pass severity model (deterministic, explainable)

Derived once at `incidents` open (or re-derived by Sentinel investigation), **not** per-event vibe. All inputs are queryable at that instant:

| Signal | S1 (critical) | S2 (high) | S3 (moderate) | S4 (low) | Source columns |
|---|---|---|---|---|---|
| `payment_reconciliation` (succeeded but not recorded) | always | — | — | — | `kind='payment_reconciliation'` |
| `api_error` burst | `≥20` events on `dedupe_key` within `60 min` | `≥5` in `60 min` | `2-4` in `60 min` | `1` | `event_count` in window |
| `guard_rejection` burst | — | — | `≥5` in `60 min` OR single `guardCategory='pii_*'` | `1-4` | `guard_rejection` count + `guardCategory` in `metadata` |
| `approval_block` | — | — | `≥5` in `60 min` (rules gap?) | `1-4` | count |
| `job_error` | webhook Stripe `500` during `checkout.session.completed` | any `job_error` | — | — | `kind` + `route` |
| Tenant impact | `dedupe_key` contains concrete `tenant_id` (not `platform`) + `≥2` tenants share key → escalate one rank | single-tenant `S2` | — | — | `tenant_id` presence + distinct count |

Deterministic `max()` wins: an incident that is both `guard_rejection burst 10 in 60min` (**S3**) and `burst 25 api_error` (**S1**) → **S1**. No LLM severity invention; Sentinel *reports* severity, does not set it.

---

## 3. Sentinel's Tools (Part 3)

Sentinel today: seeded `20` of the `23` definitions via `agent_tools` (`migration_140` Dylan 21, Sentinel+QA 20 — neither has `get_content_history`? Sentinel seed explicitly excludes `admin` scope `get_content_history`; both lack the 2 `transactional` tools). **Phase 143 adds 4 new read-only tools, zero writes, zero autonomy change.**

For each: **READ-ONLY**, respects `lib/tenant-context.ts` (`resolveTenantContext` + `is_entity_member`), queries **NEW** `system_events`/`incidents` or **EXISTING** audit tables, risk consistent with `tool_definitions.risk`.

| Proposed tool | Scope | Queries | Why read-only | Tenant isolation | Risk |
|---|---|---|---|---|---|
| `get_recent_events` | `tenant_scoped` | **NEW** `system_events` | `SELECT` only; `INSERT` into `system_events` lives outside tools at the emitter seam, never via LLM | `tenant_id IS NULL` (platform) visible only to `isAdmin()` or `is_entity_member(tenant_id)` holder; caller supplies `tenantId` param validated as UUID, tool filters `system_events.tenant_id = $1 OR (tenant_id IS NULL AND caller isAdmin)` — same pattern as `lib/ai/tools/tenant/tenant-events.ts:98` | `low` (catalog-style, same as `get_upcoming_events`) |
| `get_active_incidents` | `tenant_scoped` | **NEW** `incidents (+ incident_events count)` | `SELECT` only on open/investigating incidents | Same tenant filter on `incidents.tenant_id` (NULL → admin/any-tenant-member view, non-NULL → member of that tenant) | `low` |
| `get_guard_rejections` | `tenant_scoped` (platform subset admin-readable) | **EXISTING** `ai_guard_rejections` | `SELECT` only; no `INSERT` via tool | In this phase this table is platform-global (no `tenant_id` column) — so tool is `tenant_scoped` but defensibly scoped: ordinary Sentinel call returns only `context` namespacing (e.g. `gateway.sentinel`) plus redacted `excerpt:500`; full cross-tenant excerpts require `isAdmin()`. Future phase adds `tenant_id` to `ai_guard_rejections` to make isolation complete. | `low` |
| `get_recent_webhook_failures` | `transactional` (reads payment-linked failures) | **EXISTING** `payment_reconciliation_failures` + **NEW** `system_events` (`kind='webhook_error'`) joined | `SELECT` only | `payment_reconciliation_failures` is platform-level (no `tenant_id`) — same shape as `getPaymentStatus`: service-role read, filtered by opportunity to instrument `tenant_id` in Phase 143b (see scope). `system_events` webhook subset uses same tenant filter as `get_recent_events`. | `medium` (financial-adjacent, same as `createNotification/notifyOwner` transactional tier, even though read-only — payment sensitivity demands `medium`) |

**Explicitly NOT proposed now:**

- `get_recent_deployments` — **DOES NOT EXIST** as a queryable table in Aldriva. Vercel deployment metadata is not queryable from within the app without a **new integration** (`VERCEL_TOKEN` + Vercel REST `api.vercel.com/v6/deployments`), adds a secret, adds egress, and `deployments` table in the discovery report is hypothetical. Deferred — Sentinel reports what it *can* observe without this.
- `get_failed_jobs` as separate tool — merged into `get_recent_events(kind='job_error')` to avoid tool sprawl. Sentinel can call `get_recent_events` with `kind='job_error'` + `limit`.
- Any `*_count` aggregator — `get_recent_events` returns window description (`first_seen_at`, `last_seen_at`, `event_count` derived from incident) so aggregations are not a second tool.

**All 4 new tools follow `executeTenantTool`/`executeAITool` pattern exactly:** definition in `tool_definitions` (scope/risk/input_schema), executor in `lib/ai/tools/sentinel/get_*` with hard-coded `SAFE_COLUMNS` (`select('id, created_at, kind, route, status_code, message, metadata, dedupe_key')` etc.), `requireToolContext(ctx, name, args)` as first line, `logToolInvocation` + `screenToolResult` wrapper, `redactArgs` on `metadata`. No `UPDATE`/`INSERT`/`DELETE` string in executor files.

---

## 4. How Sentinel Gets Triggered (Part 4)

| Mechanism | How it works | Zero new infra? | Trade-offs | Recommendation |
|---|---|---|---|---|
| **Scheduled health check (Vercel cron)** | New route `GET/POST /api/cron/sentinel-sweep` (`isAuthorizedCronRequest`) queries `incidents WHERE status IN ('open','investigating')` (+ recent `system_events` window) and, if evidence meets severity threshold, runs `orchestrate({agent:'sentinel', prompt: summarize + toolCalls:[get_*], tenantId?})` → `createAgentReport`. Cadence `0 */2 * * *` (every 2h) or `0 6 * * *` (daily sweep). | **Almost zero** — requires **one new cron slot** in `vercel.json` (adding a 4th entry to the existing 3). No new vendor, no queue, no `pg_cron`. `isAuthorizedCronRequest` + `CRON_SECRET` already handles auth. **Vercel cron limit:** Hobby = 2, Pro = 40. Aldriva already uses 3, so one more slot is within Pro and is the **actual gate** on Hobby. | **Pro:** Deterministic, uses already-trusted infra, no queue, bounded LLM cost (sweep runs once per cadence, not per event). **Con:** Latency = cadence period (a burst in minute 5 waits until next sweep); still consumes one Vercel cron slot and one gateway rate-limit token per sweep. | **Smallest viable starting point ✅** — start here. Sentinel already observes `ai_guard_rejections`+`approvals` durably without any event table; sweep can synthesize a report today before `system_events` exists. |
| **Event-driven enqueue (per-event)** | `insertSystemEvent()` after `INSERT system_events` would synchronously call `orchestrate(agent:'sentinel', prompt: 'investigate event $id')` or enqueue it. True async enqueue would require a **queue/worker**. | **No zero-infra path** — discovery report is still true: **no queue/worker exists** (`grep queue|BullMQ|pg_cron|pgmq|Inngest` zero hits). Synchronous per-event `orchestrate()` inside the emitter's `catch` is possible but **never** desired: one Stripe webhook burst of 100 failures = 100 LLM calls = cost bomb + `articleAi` rate-limit exhaustion + latency on the webhook `200`. | **Pro:** Near-real-time. **Con:** Requires queue to be safe (new infrastructure: `pg_cron` + leased `agent_tasks status='queued' FOR UPDATE SKIP LOCKED` per discovery report, or Inngest/QStash), or bounded coalescing per `dedupe_key`. | **Defer to after `system_events` + one cron sweep proves value.** Enqueue design in scope document: `insertSystemEvent` optionally does `INSERT agent_tasks(agent_id:sentinel_id, title:dedupe_key, payload:{eventId}, status:'queued')` and the *same* `sentinel-sweep` cron becomes the lease consumer (no second cron, just the sweeper drains `queued` rows `FOR UPDATE SKIP LOCKED`). |
| **On-demand only** (someone calls `POST /api/ai/gateway {agent:'sentinel',prompt}`) | No new route; existing gateway + `agent_tools` allowlist is sufficient. Any `authenticated` user with `tenant_id` membership can ask Sentinel `what happened?` and get a tool-grounded report. | **Zero infra** — exists today (`gateway` + `orchestrate` + `FALLBACK_ALLOWED` includes Sentinel `20` tools). | **Pro:** Zero cost when nobody asks. **Con:** No autonomous observation — requires a human or cron to remember to ask; burst can go unnoticed. | **Already achievable today ✅** — keep as the **manual trigger** alongside the sweep. No build needed. |

**Recommended Phase 143b start:** **(A) On-demand via existing gateway** (immediate, zero build) + **(B) One Vercel cron slot `sentinel-sweep`** (bounded, same `isAuthorizedCronRequest` + `enforceRateLimit(articleAi)` pattern). **Do not** build per-event enqueue/queue until sweep data proves the `dedupe_key` + severity model signals correctly. This is the smallest path that answers *What is happening?* without a vendor or a worker.

**What would require new infra (be explicit):**

- Per-event enqueue **queue/worker** — needs `agent_tasks` leasing (`status='queued' FOR UPDATE SKIP LOCKED`) or `Inngest`/`QStash` (new vendor).
- Additional cron slots beyond `sweep` — each is one `vercel.json` entry (Pro handles, Hobby limited to 2).
- `pgvector`/embeddings — not needed (severity + `dedupe_key` are exact-match, not semantic).
- `Sentry/Datadog` — not needed (sweep consumes `system_events` + existing `ai_guard_rejections`/`payment_reconciliation_failures`).

---

## 5. Integration with Existing Runtime (Part 5)

Confirm with file references — Sentinel does **not** gain a parallel path.

- **Same gateway:** `app/api/ai/gateway/route.ts:98-112` `approvalRequired:true → 403` + `lib/rate-limit.ts:163` + `getAgentByName(listAgents)` is the **only** gateway. Sentinel investigations are `POST /api/ai/gateway {agent:'sentinel', tenantId?, prompt}` or internally `orchestrate({agent:'sentinel', userId:'system: cron'…})` via the cron route — same `requireAuthUser()` / `enforceRateLimit` / allowlist shape.
- **Same orchestrator:** `lib/ai/orchestrator.ts:55-456` `getToolGate / checkApprovalRequired / executeAITool|executeTenantTool / guardBeforeDisplay / completeAgentRun / createAgentReport` is the **only** orchestrator. Sentinel's new tools plug in as `agent_tools` rows + `executeTenantTool` branches — no second orchestrator.
- **Same knowledge retrieval unchanged:** `lib/ai/knowledge.ts:88-170` `retrieveKnowledge(prompt, tenantId, 4)` + `formatKnowledgeForPrompt()` — Sentinel's `system_prompt` already includes `You must call only tools explicitly allowed…` and orchestrator injects `knowledgeBlock` at `lib/ai/orchestrator.ts:181-185`. No new knowledge table needed this phase (knowledge documents `6/6` already seed ADR-0002/DEC-0003/tool-registry).
- **Same tool executor pattern:** New `lib/ai/tools/sentinel/get_recent_events.ts` etc. follow verbatim `lib/ai/tools/tenant/tenant-events.ts:88-114` pattern — `AIToolDefinition {scope:'tenant_scoped', risk:'low'}`, `SAFE_COLUMNS` hard-coded `select`, `requireToolContext(ctx, name, args)` first line, `logToolInvocation` + `screenToolResult` wrapper, `redactArgs` from `lib/ai/tools/tenant/tool-context.ts:46`. `lib/ai/tools-registry.ts` dispatches `executeAITool`/`executeTenantTool` as today — only the `switch` grows.
- **Same RLS pattern as Phase 139-142:** `system_events` + `incidents` + `incident_events` are `ENABLE ROW LEVEL SECURITY` + `DROP POLICY IF EXISTS "Authenticated can read …" FOR SELECT USING (auth.role()='authenticated' AND (tenant_id IS NULL AND isAdmin() OR tenant_id IN (SELECT organizer_id FROM entity_members WHERE user_id=auth.uid())))` — identical to `agent_runs/agent_steps/knowledge_chunks` (`migration_141:132-140`, `migration_142:31-33`). Writes via `service_role` (`lib/supabase-admin.ts:1` `createSupabaseAdmin()`) only, best-effort fire-and-forget, never surfaces to caller — same as `logRejection:102-129` and `createApprovalRequest:106-122`.
- **Same approval gating constraint:** `lib/ai/approvals.ts:42-90` — `checkApprovalRequired` blocks `L0` on `high/critical` or `approval_required=true` to `blocked:true` + inserts `approvals status:'pending' (+ agent_steps kind:'approval_request')`. Sentinel stays `L0` this phase, so its writes stay **impossible** — the schema designs `incidents.status` as human/Sentinel-read-only-updateable but `system_events` remains insert-only, no `UPDATE approval_gated` path. Any future elevation above `L0` automatically falls under this gate without schema change.

---

## 6. Proposed Phase 143b Implementation Scope (bullet list only — authorization gate)

- Migration `143`: `system_events` (9 columns above, `pg_trgm` not needed) + `incidents` + `incident_events` — `ENABLE RLS`, service-role writes, 30-day TTL comment on `system_events`
- Lib `lib/observability/system-events.ts`: `insertSystemEvent()/findOrCreateIncidentForEvent()/closeStaleIncidents()` — service-role, redacted args, `dedupe_key` derive, `60-min` window, deterministic severity derivation at incident open only
- **Emitter seams** (no queue, bounded call sites): `app/api/ai/gateway/route.ts` `500/422/403` branches → `insertSystemEvent` fire-and-forget; `app/api/cron/*` catch → `system_events kind:job_error`; `app/api/webhooks/stripe|* 5xx` → `webhook_error`; `lib/ai/output-guard.ts` + `lib/ai/input-guard.ts` leave as **existing** `ai_guard_rejections` path — new `system_events` `guard_rejection` emitter is optional (Sentinel already reads `ai_guard_rejections` directly today)
- **Sentinel tools** (4 read-only, scoped — definitions in `tool_definitions` + executors under `lib/ai/tools/sentinel/`): `get_recent_events`, `get_active_incidents`, `get_guard_rejections`, `get_recent_webhook_failures` — `scope:tenant_scoped` except webhook `medium` risk note; all via `executeTenantTool` + `is_entity_member` filter + `redactArgs`
- **Sentinel seed ACL**: `INSERT agent_tools WHERE agent='sentinel' AND tool_name IN (4 new tools)` — keeps `20` old + `4` = `24`; Dylan/QA unchanged at `21/20`
- **Cron sweep**: `app/api/cron/sentinel-sweep/route.ts` — `isAuthorizedCronRequest` + `supabaseAdmin.from('incidents').select('* where status IN (open,investigating))` + optional `orchestrate({agent:'sentinel', prompt: summarize incidents using get_active_incidents + get_recent_events + get_guard_rejections, userId:'system:cron' })` → `createAgentReport` + `agent_steps`. Rate-limited via `enforceRateLimit('articleAi', 'cron:sentinel')` with `CRON_SECRET` identity (falls back to `ip:` bucket)
- `vercel.json` add `{path:"/api/cron/sentinel-sweep", schedule:"0 */2 * * *"}`
- Tests `lib/ai/__tests__/sentinel-events.test.cjs` (hermetic: migrations exist, RLS, tenant isolation, dedupe, severity, tool allowlist, emitter fire-and-forget)
- Append new test to `package.json:10` `test` script
- `npx eslint lib/observability/* lib/ai/tools/sentinel/* app/api/cron/sentinel-sweep/*` + `npx tsc --noEmit --skipLibCheck` (0 new errors) — no `npm run build` required beyond

---

## 7. What Requires New Infra vs. Achievable with Existing

| Item | New infra? | Evidence |
|---|---|---|
| `system_events`/`incidents`/`incident_events` tables + `insertSystemEvent()` seam in existentes `catch` blocks | **Zero** — Postgres + `service_role` + `pg_trgm` already present (`migration_141` proves); insert is best-effort `supabaseAdmin.from(...).insert()` like `logRejection` | `lib/supabase-admin.ts:1`, `lib/ai/output-guard.ts:106-129` |
| Sentinel 4 new read-only tools (`get_recent_events` etc.) | **Zero** — `tool_definitions` + `agent_tools` + `executeTenantTool` already exists; risk `low`/`medium` within existing enum | `db/migration_139:9-22`, `lib/ai/tools-registry.ts:51-258` |
| On-demand Sentinel investigation (`POST /api/ai/gateway {agent:'sentinel'}`) | **Zero** — exists today | `app/api/ai/gateway/route.ts:37-43` |
| Scheduled Sentinel sweep (`/api/cron/sentinel-sweep`) | **Almost zero — one new cron slot** | `vercel.json:2-6` 3 slots used; needs 4th |
| Per-event synchronous investigation (call `orchestrate` inside every `catch`) | **Zero code infra but costly** — no queue, but one LLM per event = cost bomb + rate-limit exhaustion | `lib/rate-limit.ts:16` `articleAi:30/60s` |
| Async per-event enqueue (enqueue on `INSERT` → dequeue via worker) | **Requires new infra** — `agent_tasks status='queued' FOR UPDATE SKIP LOCKED` lease loop or `Inngest`/`QStash` vendor | no `queue` in repo today (discovery §23 confirmed) |
| Vercel deployment metadata (`deployments` table) | **Requires new integration** — `VERCEL_TOKEN` secret + `api.vercel.com/v6/deployments` egress + polling | no deployment webhook in `app/api/webhooks/*`, no `deployments` table |
| `pgvector` / embeddings for severity/dedupe | **Requires new infra** — extension + embedding pipeline + external key | explicitly banned this phase, severity is exact `dedupe_key` not semantic |
| External observability SDK (Sentry/Datadog) | **Requires new infra** — vendor SDK + `SENTRY_DSN` + `instrumentation.ts` | not installed (`grep sentry|datadog` zero hits) |

---

*End — investigation only. Await separate authorization for 143b implementation.*

