/**
 * lib/exec/claim.ts — Stage 10.2 generic conditional claim + lease.
 *
 * Generalizes the proven QA poll-and-claim pattern (lib/qa/claim.ts) to
 * workforce tasks WITHOUT transplanting QA semantics: queue rows are
 * agent_tasks(status='queued'), attempts are agent_runs(attempt_no), and the
 * lease lives in the Stage 10.1 columns (lease_owner/expiry, heartbeat,
 * claim_token_hash, attempt_count, run_after).
 *
 * Atomicity: claim is a single conditional UPDATE
 * (status='queued' AND attempt_count=<seen> AND run_after-claimable). It is
 * NEVER select-then-update as two raceable operations — zero matched rows
 * means a lost race and the worker moves to the next candidate.
 *
 * Claimability per candidate: valid/canonical envelope in payload, live
 * approval (approved + unexpired) when the task names one, remaining attempt
 * budget. Anything else is marked terminally failed with an `exec-*`
 * result_ref (auditable, never retried, never spun on).
 *
 * All functions take an injected client + explicit now inputs (hermetically
 * testable). Routes supply service-role client + env (Layer-1 auth) + clock.
 */

import { parseExecutionEnvelope, type ExecutionEnvelope } from './envelope';
import { mintExecClaimToken, EXEC_CLAIM_TTL_MS } from './tokens';

export interface ExecClient {
  from(table: string): any;
}

export interface EnqueueInput {
  agentId: string;
  tenantId: string | null;
  requestedBy?: string | null;
  title: string;
  action: string;
  envelope: ExecutionEnvelope;
  approvalId?: string | null;
  priority?: string;
  maxAttempts?: number;
  runAfterIso?: string | null;
  idempotencyKey?: string;
}

export type EnqueueResult = { ok: true; jobId: string; duplicate?: boolean } | { ok: false; message: string };

async function selectAll<T>(q: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await q) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`exec claim ${what} failed: ${error.message}`);
  return (data ?? []) as T[];
}

interface TaskRow {
  id: string;
  agent_id: string;
  tenant_id: string | null;
  approval_id: string | null;
  attempt_count: number;
  max_attempts: number;
  run_after: string | null;
  payload: Record<string, unknown> | null;
}

/**
 * Durable enqueue: idempotent on idempotencyKey (same key returns the
 * existing job, never a second row). The envelope travels in payload —
 * tasks list/detail never select payload, so raw args stay out of UI reads.
 */
export async function enqueueExecution(
  client: ExecClient,
  input: EnqueueInput,
  nowIso: string = new Date().toISOString()
): Promise<EnqueueResult> {
  void nowIso;
  if (input.idempotencyKey) {
    const existing = await selectAll<{ id: string }>(
      client.from('agent_tasks').select('id').eq('idempotency_key', input.idempotencyKey).limit(1),
      'enqueue idempotency'
    );
    if (existing[0]) return { ok: true, jobId: existing[0].id, duplicate: true };
  }
  const inserted = await selectAll<{ id: string }>(
    client
      .from('agent_tasks')
      .insert({
        agent_id: input.agentId,
        tenant_id: input.tenantId,
        requested_by: input.requestedBy ?? null,
        title: input.title,
        payload: { envelope: input.envelope },
        status: 'queued',
        priority: input.priority ?? 'normal',
        approval_id: input.approvalId ?? null,
        idempotency_key: input.idempotencyKey ?? null,
        max_attempts: input.maxAttempts ?? input.envelope.budget.maxAttempts,
        run_after: input.runAfterIso ?? null,
      })
      .select('id'),
    'enqueue insert'
  );
  if (!inserted[0]) return { ok: false, message: 'enqueue failed' };
  return { ok: true, jobId: inserted[0].id };
}

export interface ClaimInput {
  /** Explicit auditable worker identity (e.g. gha:<run_id>, manual:<user-id>). */
  workerId: string;
  nowIso?: string;
  leaseTtlMs?: number;
  limit?: number;
}

export interface ClaimedJob {
  jobId: string;
  attemptNo: number;
  agentId: string;
  tenantId: string | null;
  approvalId: string | null;
  action: string;
  envelope: ExecutionEnvelope;
  runId: string;
  leaseExpiresAt: string;
}

export type ClaimResult =
  | { claimed: true; message: string; job: ClaimedJob; claimToken: string }
  | { claimed: false; message: string };

interface ApprovalRow {
  id: string;
  action: string;
  risk: string;
  status: string;
  expires_at: string;
}

async function markInvalid(
  client: ExecClient,
  taskId: string,
  reason: string,
  nowIso: string
): Promise<void> {
  await selectAll<{ id: string }>(
    client
      .from('agent_tasks')
      .update({ status: 'failed', result_ref: reason, last_heartbeat_at: nowIso })
      .eq('id', taskId)
      .eq('status', 'queued')
      .select('id'),
    'mark invalid'
  );
}

/**
 * Atomically claim one queued execution for workerId. Returns the first
 * successfully claimed candidate (oldest first); skips raced/invalid rows.
 */
export async function claimExecution(client: ExecClient, input: ClaimInput): Promise<ClaimResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const limit = Math.min(Math.max(input.limit ?? 3, 1), 10);
  if (!input.workerId || input.workerId.length > 200) return { claimed: false, message: 'bad workerId' };

  const candidates = await selectAll<TaskRow>(
    client
      .from('agent_tasks')
      .select('id,agent_id,tenant_id,approval_id,attempt_count,max_attempts,run_after,payload')
      .eq('status', 'queued')
      .or(`run_after.is.null,run_after.lte.${nowIso}`)
      .order('run_after', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .limit(limit),
    'claim candidates'
  );

  for (const task of candidates) {
    // 1. Canonical envelope present and valid.
    const parsed = parseExecutionEnvelope(
      task.payload !== null && typeof task.payload === 'object' ? (task.payload as Record<string, unknown>)['envelope'] : null
    );
    if (!parsed.ok) {
      await markInvalid(client, task.id, `exec-invalid-envelope:${parsed.reason}`, nowIso);
      continue;
    }
    const envelope = parsed.envelope;

    // 2. Live approval when the task names one (approved + unexpired).
    if (task.approval_id) {
      const approvals = await selectAll<ApprovalRow>(
        client.from('approvals').select('id,action,risk,status,expires_at').eq('id', task.approval_id).limit(1),
        'claim approval'
      );
      const approval = approvals[0] ?? null;
      if (!approval || approval.status !== 'approved' || approval.expires_at <= nowIso) {
        await markInvalid(client, task.id, `exec-invalid-approval:${approval?.status ?? 'missing'}`, nowIso);
        continue;
      }
      void approval;
    }

    // 3. Remaining attempt budget.
    if (task.attempt_count >= task.max_attempts) {
      await markInvalid(client, task.id, 'exec-budget-exhausted', nowIso);
      continue;
    }

    // 4. Atomic conditional claim (lost race = zero rows = next candidate).
    const minted = mintExecClaimToken(Date.parse(nowIso), EXEC_CLAIM_TTL_MS);
    const attemptNo = task.attempt_count + 1;
    const claimed = await selectAll<{ id: string }>(
      client
        .from('agent_tasks')
        .update({
          status: 'running',
          lease_owner: input.workerId,
          lease_expires_at: minted.expiresAtIso,
          last_heartbeat_at: nowIso,
          claim_token_hash: minted.hash,
          attempt_count: attemptNo,
        })
        .eq('id', task.id)
        .eq('status', 'queued')
        .eq('attempt_count', task.attempt_count)
        .or(`run_after.is.null,run_after.lte.${nowIso}`)
        .select('id'),
      'claim write'
    );
    if (claimed.length === 0) continue;

    // 5. Numbered attempt row (visibility + ingest anchor). Release on failure.
    const runs = await selectAll<{ id: string }>(
      client
        .from('agent_runs')
        .insert({
          task_id: task.id,
          agent_id: task.agent_id,
          tenant_id: task.tenant_id,
          triggered_by: 'manual',
          status: 'running',
          approval_id: task.approval_id,
          attempt_no: attemptNo,
        })
        .select('id'),
      'claim run'
    );
    if (!runs[0]) {
      await releaseClaim(client, task.id, input.workerId, nowIso);
      continue;
    }

    return {
      claimed: true,
      message: 'Claimed.',
      job: {
        jobId: task.id,
        attemptNo,
        agentId: task.agent_id,
        tenantId: task.tenant_id,
        approvalId: task.approval_id,
        action: envelope.action,
        envelope: { ...envelope, approvalId: task.approval_id },
        runId: runs[0].id,
        leaseExpiresAt: minted.expiresAtIso,
      },
      claimToken: minted.token,
    };
  }
  return { claimed: false, message: 'No claimable executions.' };
}

/** Best-effort lease release (owner-guarded). Used on claim-path failures. */
export async function releaseClaim(
  client: ExecClient,
  taskId: string,
  workerId: string,
  nowIso: string
): Promise<boolean> {
  const rows = await selectAll<{ id: string }>(
    client
      .from('agent_tasks')
      .update({
        status: 'queued',
        lease_owner: null,
        lease_expires_at: null,
        claim_token_hash: null,
        last_heartbeat_at: nowIso,
      })
      .eq('id', taskId)
      .eq('lease_owner', workerId)
      .select('id'),
    'release claim'
  );
  return rows.length > 0;
}
