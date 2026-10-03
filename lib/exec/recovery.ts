/**
 * lib/exec/recovery.ts — Stage 10.5 heartbeat + stale-lease recovery.
 *
 * A crashed worker must never leave work permanently invisible, and a live
 * worker must be able to renew its lease — but a worker must NEVER extend
 * another worker's lease, and retries must stay bounded.
 *
 * - heartbeatClaim: owner + claim-token + live-lease verified, then renews
 *   expiry/heartbeat. Expired leases are NOT renewable here (they go through
 *   reclaim, which requeues under a new attempt budget check).
 * - reclaimStaleLeases: running + lease expired → budget left: requeue
 *   (lease cleared, run_after = now + deterministic backoff); budget spent:
 *   terminal failed with an auditable result_ref. Every write is conditional
 *   on the row still being (running + expired), so concurrent reclaimers are
 *   safe: exactly one wins per row.
 * - Crash-before-result and crash-after-execution-before-ingest are the same
 *   case here (lease expired without terminal ingest): requeue under budget,
 *   and let idempotent ingest (10.6) converge any duplicate effect.
 */

import { verifyExecClaimToken, EXEC_CLAIM_TTL_MS, EXEC_MAX_LEASE_MS } from './tokens';
import type { ExecClient } from './claim';

export const EXEC_RECOVERY_LIMIT = 10;
export const EXEC_BACKOFF_BASE_MS = 60_000;
export const EXEC_BACKOFF_CAP_MS = 3_600_000;

async function selectAll<T>(q: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await q) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`exec recovery ${what} failed: ${error.message}`);
  return (data ?? []) as T[];
}

/** Deterministic backoff: base * 2^(attempts-1), capped. Pure. */
export function computeBackoffMs(attemptCount: number, baseMs: number = EXEC_BACKOFF_BASE_MS): number {
  const n = Math.max(1, Math.floor(attemptCount));
  return Math.min(baseMs * 2 ** (n - 1), EXEC_BACKOFF_CAP_MS);
}

export interface HeartbeatInput {
  taskId: string;
  workerId: string;
  claimToken: string;
  leaseTtlMs?: number;
  nowIso?: string;
}

export type HeartbeatResult = { ok: true; leaseExpiresAt: string } | { ok: false; reason: string };

interface LeaseRow {
  id: string;
  status: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  claim_token_hash: string | null;
}

export async function heartbeatClaim(client: ExecClient, input: HeartbeatInput): Promise<HeartbeatResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const rows = await selectAll<LeaseRow>(
    client
      .from('agent_tasks')
      .select('id,status,lease_owner,lease_expires_at,claim_token_hash')
      .eq('id', input.taskId)
      .limit(1),
    'heartbeat read'
  );
  const row = rows[0] ?? null;
  if (!row) return { ok: false, reason: 'unknown job' };
  if (row.status !== 'running') return { ok: false, reason: 'not running' };
  if (row.lease_owner !== input.workerId) return { ok: false, reason: 'wrong worker' };
  if (!verifyExecClaimToken(input.claimToken, row.claim_token_hash, row.lease_expires_at, nowIso)) {
    return { ok: false, reason: 'bad token' };
  }
  const ttl = Math.min(Math.max(input.leaseTtlMs ?? EXEC_CLAIM_TTL_MS, 60_000), EXEC_MAX_LEASE_MS);
  const leaseExpiresAt = new Date(Date.parse(nowIso) + ttl).toISOString();
  const renewed = await selectAll<{ id: string }>(
    client
      .from('agent_tasks')
      .update({ lease_expires_at: leaseExpiresAt, last_heartbeat_at: nowIso })
      .eq('id', input.taskId)
      .eq('status', 'running')
      .eq('lease_owner', input.workerId)
      .select('id'),
    'heartbeat write'
  );
  if (renewed.length === 0) return { ok: false, reason: 'lease lost' };
  return { ok: true, leaseExpiresAt };
}

export interface ReclaimInput {
  nowIso?: string;
  limit?: number;
  backoffBaseMs?: number;
}

export interface ReclaimResult {
  requeued: string[];
  exhausted: string[];
}

interface StaleRow {
  id: string;
  attempt_count: number;
  max_attempts: number;
  lease_expires_at: string | null;
}

/**
 * Reclaim running jobs whose lease expired. Bounded, conditional, terminally
 * honest: budget left → requeue with backoff; budget spent → failed with
 * exec-retry-exhausted (auditable, never spun on).
 */
export async function reclaimStaleLeases(client: ExecClient, input: ReclaimInput): Promise<ReclaimResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const limit = Math.min(Math.max(input.limit ?? EXEC_RECOVERY_LIMIT, 1), 50);
  const out: ReclaimResult = { requeued: [], exhausted: [] };

  const stale = await selectAll<StaleRow>(
    client
      .from('agent_tasks')
      .select('id,attempt_count,max_attempts,lease_expires_at')
      .eq('status', 'running')
      .lte('lease_expires_at', nowIso)
      .order('lease_expires_at', { ascending: true })
      .limit(limit),
    'reclaim scan'
  );

  for (const row of stale) {
    if (row.attempt_count >= row.max_attempts) {
      const done = await selectAll<{ id: string }>(
        client
          .from('agent_tasks')
          .update({
            status: 'failed',
            result_ref: 'exec-retry-exhausted',
            lease_owner: null,
            lease_expires_at: null,
            claim_token_hash: null,
            last_heartbeat_at: nowIso,
          })
          .eq('id', row.id)
          .eq('status', 'running')
          .lte('lease_expires_at', nowIso)
          .select('id'),
        'reclaim exhaust'
      );
      if (done.length > 0) out.exhausted.push(row.id);
      // Stage 17 (O-1): close the orphaned attempt run. The attempt can never
      // complete now (task terminal; late ingest is rejected as job-not-running),
      // so without this the agent_runs row stays 'running' forever and reads as
      // busy. Conditional on running: never touches a terminal row. Task state,
      // attempt count and backoff above are untouched.
      await closeOrphanedAttempt(client, row.id, row.attempt_count, nowIso);
      continue;
    }
    const runAfter = new Date(Date.parse(nowIso) + computeBackoffMs(row.attempt_count, input.backoffBaseMs)).toISOString();
    const moved = await selectAll<{ id: string }>(
      client
        .from('agent_tasks')
        .update({
          status: 'queued',
          lease_owner: null,
          lease_expires_at: null,
          claim_token_hash: null,
          run_after: runAfter,
          last_heartbeat_at: nowIso,
        })
        .eq('id', row.id)
        .eq('status', 'running')
        .lte('lease_expires_at', nowIso)
        .select('id'),
      'reclaim requeue'
    );
    if (moved.length > 0) out.requeued.push(row.id);
    // Stage 17 (O-1): same orphan close on the requeue path. The requeued
    // task will run under a NEW attempt_no on next claim; this attempt row
    // can never transition (ingest rejects it as job-not-running).
    await closeOrphanedAttempt(client, row.id, row.attempt_count, nowIso);
  }
  return out;
}

/**
 * Stage 17 (O-1): close the agent_runs attempt row orphaned by a lease
 * expiry. Conditional on status='running' so replays are idempotent and a
 * terminal row is never overwritten. Fixed explanatory error string so the
 * closure reason is auditable on the row itself.
 */
async function closeOrphanedAttempt(
  client: ExecClient,
  taskId: string,
  attemptNo: number,
  nowIso: string
): Promise<void> {
  await selectAll<{ id: string }>(
    client
      .from('agent_runs')
      .update({
        status: 'failed',
        error: 'exec-lease-expired:superseded',
        completed_at: nowIso,
      })
      .eq('task_id', taskId)
      .eq('attempt_no', attemptNo)
      .eq('status', 'running')
      .select('id'),
    'reclaim orphan close'
  );
}
