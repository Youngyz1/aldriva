# Stage 10.9 — Live Smoke-Test Runbook (human-executed, NOT executed by any agent)

> Test-only action `execSmokeNotify` (dylan-only, approval-gated). Proves the
> generic path approval → materialize → claim → binding → run → ingest →
> terminal → audit with exactly one low-blast-radius write (one in-app
> notification row to the tenant owner; no email ever). Do NOT run any step
> marked "live DB" unless you intend to write a real notification row.

## 0. Preconditions (names only — never paste values into chat/logs)

- [ ] Migration `147_exec_smoke_notify` applied live (Supabase dashboard → SQL
      editor → run `db/migration_147_exec_smoke_notify.sql`; confirm 1 row in
      `tool_definitions` where `name='execSmokeNotify'` and 1 row in
      `agent_tools` joining the `dylan` agent).
- [ ] Migration 146 applied live (Stage 10 prerequisite).
- [ ] `EXEC_WORKER_TOKEN` set in the deployment environment (server reads
      `EXEC_WORKER_TOKEN` / `EXEC_WORKER_TOKEN_PREV`; never print it).
- [ ] Model provider key set: `GEMINI_API_KEY` or `OPENROUTER_API_KEY`.
- [ ] You are logged in as a user who OWNS an organizer tenant (entity_members
      role `owner`); note that tenant's UUID as `$TENANT`. You must also be
      platform admin (Approvals UI requires it).
- [ ] App deployed with Stage 10.9 code (routes `/api/exec/*` present).

## 1. Make dylan request the tool (creates the pending approval)

```bash
curl -s -X POST "$BASE_URL/api/ai/gateway" \
  -H 'Content-Type: application/json' \
  -H "Cookie: <your session cookie>" \
  -d "{
    \"agent\": \"dylan\",
    \"tenantId\": \"$TENANT\",
    \"prompt\": \"Use the execSmokeNotify smoke-test tool with note 'stage10 smoke 1' to notify the tenant owner. Do nothing else.\"
  }"
```

Expect HTTP 403 with `{"success":false,"approvalRequired":true,
"approvalId":"<uuid>",...}` (`app/api/ai/gateway/route.ts:113-129`). Save
`<APPROVAL>` from the response. (If the model does not call the tool, rephrase
the prompt to name the tool and its required `note` argument explicitly.)

## 2. Confirm the approval row + envelope (read-only SQL)

```sql
select id, action, status, audit_ref,
       proposed_outcome is not null as has_envelope,
       proposed_outcome->>'version' as env_version,
       proposed_outcome->'args' as env_args
from public.approvals
where id = '<APPROVAL>';
-- expect: action='execSmokeNotify', status='pending', audit_ref IS NULL,
-- has_envelope true, env_version '1'
```

## 3. Approve through the UI

Open `/admin/workforce/approvals/<APPROVAL>` → **Approve**. Row becomes
`status='approved'`, `decided_at` set (≈48h expiry from creation).

## 4. Drive the worker manually (replace $BASE_URL, $EXEC_WORKER_TOKEN)

```bash
# One bounded unit: materialize -> claim -> bind -> execute -> ingest
curl -s -X POST "$BASE_URL/api/exec/run" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $EXEC_WORKER_TOKEN" \
  -d '{"workerId":"manual:smoke-1"}'
# expect: {"claimed":true,"jobId":"...","outcome":"succeeded",
#          "transition":"running→completed",...}
```

(Equivalent split flow: `POST /api/exec/claim` → use returned `claimToken` with
`POST /api/exec/heartbeat` as needed → `POST /api/exec/ingest` with
`{taskId,runId,attemptNo,workerId,claimToken,outcome,retryable,output,error}`.)

## 5. Verify each stage (read-only SQL)

```sql
-- linkage + terminal state
select status, audit_ref from public.approvals where id = '<APPROVAL>';
-- expect: status='approved', audit_ref='exec-task:<JOB>'

select id, status, attempt_count, lease_owner, lease_expires_at,
       claim_token_hash, result_ref
from public.agent_tasks where id = '<JOB>';
-- expect: status='completed', attempt_count=1, lease_owner/lease_expires_at/
-- claim_token_hash all NULL (lease consumed), result_ref='exec-run:<RUN>'

select id, status, attempt_no, error, completed_at
from public.agent_runs where task_id = '<JOB>';
-- expect: one row, status='completed', attempt_no=1

select kind, result_summary from public.agent_steps where run_id = '<RUN>';
-- expect: one tool_result row

select id, report_type, summary from public.agent_reports where run_id = '<RUN>';
-- expect: one task report row

-- exactly one notification row, first owner, fixed prefix, no email involved
select user_id, type, title from public.notifications
where title like '[Stage 10.9 smoke test]%';
-- expect: exactly one NEW row, type='like', recipient = tenant owner
```

## 6. Replay check (idempotency proof)

Re-POST the identical `/api/exec/ingest` body from step 4/5. Expect
`{"ok":true,"duplicate":true,...}` and NO new rows in `agent_steps`,
`agent_reports`, or `notifications` (re-run the step-5 queries to confirm
counts unchanged).

## 7. Undo (in order)

```sql
-- 1. remove the smoke notification row(s)
delete from public.notifications where title like '[Stage 10.9 smoke test]%';
-- 2. (optional) remove execution rows newest-first if a pristine ledger matters:
-- agent_steps -> agent_reports -> agent_runs -> agent_tasks -> reset approvals.audit_ref
```

```sql
-- 3. remove the gating + grant (or apply the rollback twin, preferred):
-- db/migration_147_exec_smoke_notify_rollback.sql
```
