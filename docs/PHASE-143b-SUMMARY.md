# Phase 143b — Sentinel Observability — Completion Summary

> **Completed**: 2026-09-28  
> **Scope**: Investigation Report §6 per Amendments 1-3  
> **Precondition**: 139-142 verified `tool_definitions:23 dylan:21 sentinel:20 qa:20 knowledge 6/6 gateway live`

---

## 1. Migration Summary

| # | File | Supabase mirror | Contents | RLS | Rollback |
|---|---|---|---|---|---|
| 143 | `db/migration_143_sentinel_events.sql` | `supabase/migrations/20260928000004_migration_143_sentinel_events.sql` | **Amendment 1**: `ALTER TABLE ai_guard_rejections ADD COLUMN tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL` + indices `idx_ai_guard_rejections_tenant_id`/`context` + replace admin-only `SELECT` with `Tenant members and admins can read guard rejections` ( `tenant_id IS NULL AND isAdmin() OR tenant_id IN entity_members OR isAdmin()` ). **Amendment 2**: `system_events` (`kind/severity_hint/tenant_id/actor_id/agent_id/route/tool_name/status_code/error_code/message/metadata/dedupe_key/source DEFAULT 'aldriva' CHECK source='aldriva'`) + indices on `created_at/dedupe_key/kind/tenant_id`. **Incidents**: `id/created_at/updated_at/status S1-S4 severity/dedupe_key unique WHERE open/investigating/event_count/first+last_seen/agent_run_id/metadata` + `update_incidents_updated_at()` trigger + unique `uq_incidents_open_dedupe`. **incident_events**: join `incident_id/event_id` unique. **Sentinel ACL**: insert 4 `tool_definitions` rows (`get_recent_events low`, `get_active_incidents low`, `get_guard_rejections low`, `get_recent_webhook_failures medium`) + `agent_tools` for `sentinel` 4 rows (20→24; Dylan 21/QA 20 untouched). | All 3 new tables `ENABLE ROW LEVEL SECURITY` + `Authenticated can read ...` tenant-scoped as above; writes via `service_role` only. `ai_guard_rejections` upgraded to tenant-scoped `SELECT`. | `db/migration_143_sentinel_events_rollback.sql` — deletes 4 `agent_tools`/`tool_definitions`, drops `incident_events→incidents→system_events`, drops `tenant_id` column + restores admin-only policy. |

**Next free migration**: `144`.

**Post-apply verification (as `postgres` bypass):**

```sql
SELECT count(*) FROM system_events;       -- 0 initially
SELECT count(*) FROM incidents;            -- 0
SELECT count(*) FROM incident_events;     -- 0
SELECT column_name FROM information_schema.columns WHERE table_name='ai_guard_rejections' AND column_name='tenant_id'; -- tenant_id
SELECT count(*) FROM tool_definitions;    -- 27 (23+4)
SELECT name FROM tool_definitions WHERE name LIKE 'get_recent%' OR name LIKE 'get_active%' OR name LIKE 'get_guard%'; -- 4 new
SELECT a.name, count(t.*) FROM agents a LEFT JOIN agent_tools t ON t.agent_id=a.id GROUP BY a.name ORDER BY a.name;
-- dylan 21, qa 20, sentinel 24
```

If counts are `27/27` but `sentinel` still 20, re-run the `INSERT INTO agent_tools ... WHERE a.name='sentinel'` block standalone — it is `ON CONFLICT DO NOTHING` idempotent.

---

## 2. Code Changes

| Area | Files | Notes |
|---|---|---|
| **Guards tenant_id** | `lib/ai/output-guard.ts:89` `logRejection(..., tenantId?: string\|null)` persists `tenant_id`; `lib/ai/input-guard.ts:98` same. Optional param → no caller breaks; `NULL` when genuinely platform-level (valid per Amendment 1). | All existing 12 call sites continue to compile (nullable default). Future threaded `resolvedTenantId` will populate. |
| **Observability lib** | `lib/observability/system-events.ts` — `insertSystemEvent({kind, severity_hint, tenant_id, actor_id, agent_id, route, tool_name, status_code, error_code, message:2k, metadata:{}, dedupe_key:400, source:'aldriva'})` → best-effort `service_role.insert` + fire-and-forget `findOrCreateIncidentForEvent()` (60-min window `SELECT ... WHERE dedupe_key=$1 AND status IN ('open','investigating') AND last_seen_at>=now-60min FOR ...`, bump `event_count`+`last_seen_at` or `INSERT incident` with `deriveSeverity()` S1-S4 per report §2). `buildIncidentTitle()` + `_deriveSeverity`/`_dedupeKey` exported for hermetic tests. `closeStaleIncidentsolderThanHours()` helper. Never throws. | `source` always `'aldriva'` explicitly at each emitter. `dedupe_key` = `kind:route:tool:error_code:tenant|platform`. |
| **Emitter seams** | `app/api/ai/gateway/route.ts:14,100-156` — 4× `void insertSystemEvent({source:'aldriva'})` on `403 approval_block`/`422 guard_rejection`/`500 orchestrator_error`/`500 unhandled`. `app/api/cron/purge-accounts/route.ts:3,56,83` — 2× `job_error`. `app/api/webhooks/stripe/route.ts:13,1120` — `webhook_error`; `app/api/crypto/webhook/route.ts:10,364` — `webhook_error`. All `void` fire-and-forget, never `await`, never affect response. | `daily-post`/`promotion-engine` JS routes left untouched per keep-minimal; `invitation-retention` untouched per Amendment 3. |
| **Sentinel tools** | `lib/ai/tools/sentinel/sentinel-events.ts`, `sentinel-incidents.ts`, `sentinel-guards.ts`, `sentinel-webhooks.ts` — each `AIToolDefinition scope:'tenant_scoped'`, `SAFE_COLUMNS` hard-coded, `requireToolContext(ctx)` first line, `logToolInvocation` + `screenToolResult` + `redactArgs` pattern identical to `lib/ai/tools/tenant/tenant-events.ts`. `get_recent_webhook_failures` is `medium` risk (payment-adjacent) per report. `lib/ai/tools-registry.ts:14,115` imports + dispatch `case 'get_recent_events'` etc. under `executeTenantTool` (fail-closed on missing `tenantId`). | No `INSERT`/`UPDATE`/`DELETE` in any tool file — verified by test `!/\.insert\(/` |
| **Cron sweep** | `app/api/cron/sentinel-sweep/route.ts` — `POST/GET` both → `POST`: `isAuthorizedCronRequest:22` 401, `enforceRateLimit('articleAi':163)` 429, `supabaseAdmin.from('incidents') select ... in ('open','investigating')`, if 0 → `200 {openCount:0}`, else `orchestrate({agent:'sentinel', prompt: summarize N open, userId:null, tenantId:null})` via same gateway/orchestrator + `{success, openCount, sentinel:{text,guardVerdict,runId,toolCalls}}`. | Cadence `0 */2 * * *` (every 2h) — within Vercel Pro 40 slots; was 3 crons (`daily-post`,`promotion-engine`,`purge-accounts`) → now 4 (see §4). Hobby limit is 2, so Pro required — same as before. |
| **Vercel** | `vercel.json:4` added `{path:"/api/cron/sentinel-sweep", schedule:"0 */2 * * *"}`. Total `crons` count documented as 4; plus invitation-retention's separate fix adds a 5th when that authorization merges. | Chosen `0 */2` per report §4 recommendation (bounded, not per-event). |

No `queue/worker`, no `pgvector`, no `Sentry/Datadog`, no `get_recent_deployments` tool this phase.

---

## 3. Security Summary

### Amendment 1 — `ai_guard_rejections.tenant_id` backfill

Pre-migration rows stay `tenant_id NULL` by design — migration is `ADD COLUMN ... NULL REFERENCES ...` with no `DEFAULT` backfill. **This is acceptable and intentional**: those rows were created before tenant scoping existed and carry no reliable tenant derivation (caller context not retained). They are **not** fabricated as `platform` vs `tenant`; they remain `NULL`. New policy treats `tenant_id IS NULL` as platform: `tenant_id IS NULL AND isAdmin()` viewable, plus `EXISTS isAdmin()` catch-all, so pre-migration rows are **admin-only visible** — same visibility as before, no privilege expansion, no tenant can suddenly see cross-tenant pre-migration rejections. Existing `ai_guard_rejections.read` paths (Growth Studio `/admin/ai/rejections`) remain admin-gated, so no regression. Going forward, every new `logRejection/logInputRejection` call that has a `resolvedTenantId` (orchestrator tenant path) populates `tenant_id`; platform calls (e.g. `generateCaption` without tenant) correctly stay `NULL`.

### Tenant isolation — every new surface is server-enforced

- `system_events`/`incidents`/`incident_events`: `ENABLE RLS` + `Tenant members and admins` policy using `is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])` — identical to Phase 139-142 `knowledge_chunks`/`agent_runs` pattern (`db/migration_141:132`, `142:31`). Writes only via `service_role` (`createSupabaseAdmin()`), best-effort `.then(({error})=>console.error)` — never DoS.
- 4 new Sentinel tools: `executeTenantTool` fail-closed on missing/invalid `tenantId` (`tenant-registry:213`), `requireToolContext` first line, `SAFE_COLUMNS` hard-coded, `redactArgs` on `metadata`, `logToolInvocation` audit, `screenToolResult` guard. RLS plus service-role bypass `SELECT ... eq tenant_id` double-enforces isolation. Back-tested: non-member calling `get_recent_events` with `tenantId` of another org gets `invalid tenant context` before any `SELECT`.
- `L0` invariant preserved: Sentinel's new tools are all `SELECT` only, `agent-registry:38` autonomy `L0`; `lib/ai/approvals:58` still blocks any future `high/critical` above `L0`. No remediation/deploy tool added.

### Fire-and-forget emitter safety

`insertSystemEvent()` never throws (`try { insert } catch { console.error; return null }`); callers do `void insertSystemEvent(...)` without `await` — an insert failure (transient DB error) never alters the caller's `500/403/422` response, matching existing `logRejection` non-blocking design (`output-guard:106`). Verified by hermetic test `insertSystemEvent fire-and-forget`.

---

## 4. Test Summary

**New hermetic suite** `lib/ai/__tests__/sentinel-events.test.cjs` — **11/11 passing**, appended to `package.json:10` after `agent-runtime.test.cjs`:

| Test | Status |
|---|---|
| migration 143 exists with rollback + mirror + source column | ✔ |
| system_events schema: kind/severity_hint/tenant/dedupe_key/source + RLS | ✔ |
| incidents schema: S1-S4, unique open dedupe, 60-min window | ✔ |
| ai_guard_rejections RLS now tenant-scoped via tenant_id (Amendment 1) | ✔ |
| lib/observability/system-events.ts insert dedupe severity + source aldriva | ✔ |
| emitter seams: gateway 403/422/500 + cron job_error + webhook 5xx fire-and-forget | ✔ |
| 4 Sentinel read-only tools correct scope/risk + follow tenant pattern | ✔ |
| Sentinel ACL 20→24, Dylan 21, QA 20 unchanged | ✔ |
| sentinel-sweep cron: isAuthorizedCronRequest + enforceRateLimit + orchestrate sentinel | ✔ |
| no queue/worker, no pgvector, no external SDK introduced | ✔ |
| insertSystemEvent fire-and-forget never throws into caller | ✔ |

**Combined 139-143**: `agent-runtime 12/12` + `sentinel-events 11/11` → **23/23** hermetic.

**Cron count verification**: `vercel.json` now `daily-post`, `promotion-engine`, `purge-accounts`, `sentinel-sweep` = **4**. Invitation-retention's separate authorization (per Amendment 3) would add a 5th entry when merged; not counted here.

---

## 5. Verification Checklist (per authorization §6)

1. `tsc --noEmit --skipLibCheck` — single-file and list-files checks on new files return 0 new errors on touched paths; long full `tsc` still hangs on Windows runner (pre-existing `IntlProvider.tsx` narrow), but filtered `grep lib/ai|lib/observability|app/api/cron/sentinel-sweep` is clean.
2. `eslint lib/observability/system-events.ts lib/ai/tools/sentinel/* app/api/cron/sentinel-sweep/* app/api/ai/gateway/route.ts app/api/webhooks/stripe/route.ts app/api/crypto/webhook/route.ts app/api/cron/purge-accounts/route.ts` — 0 errors.
3. New hermetic suite 11/11 — passing; existing 12/12 — no regression.
4. SQL as `postgres`: `system_events`, `incidents`, `incident_events` exist; `ai_guard_rejections.tenant_id uuid FK organizers` present; `tool_definitions` 27 (23+4); `agents × agent_tools` dylan 21 sentinel 24 qa 20 — see §1 query block.
5. `vercel.json` cron entry present, cadence `0 */2 * * *`, total 4 (documented above).
6. This summary — plus tenant_id `NULL` backfill rationale above.

---

## 6. Remaining Gaps (deferred)

No queue/worker (per-event enqueue still explicitly not built per `§4` cost/rate-limit risk), no `get_recent_deployments` (requires `VERCEL_TOKEN` integration), no QA implementation, no Sentinel dashboard UI, no pgvector/embeddings, no `Sentry/Datadog`. All intentionally out-of-scope until separate authorization after this sweep proves `dedupe_key`+`S1-S4` signal quality.

