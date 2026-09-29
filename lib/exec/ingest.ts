/**
 * lib/exec/ingest.ts — Stage 10.6 idempotent result ingest, forward-only.
 *
 * Persists one attempt's outcome: task transition + run transition + one
 * audit step row. Rules:
 *
 * - Duplicate-safe: a terminal attempt row short-circuits to
 *   {ok:true, duplicate:true} BEFORE token verification (same no-op shape as
 *   QA duplicate-terminal ingest). Replays, refreshes, and redeliveries
 *   converge to one effect; no duplicate steps, reports, or events.
 * - Single-use tokens: every live ingest consumes the claim token (hash
 *   cleared), so reuse/replay after completion fails verification.
 * - Forward-only: running → completed | failed | queued(retry). Terminal rows
 *   never regress; every write is conditional on the expected status.
 * - Retry routing: retryable + budget left → requeue with deterministic
 *   backoff (run_after); permanent or budget spent → terminal failed with an
 *   auditable result_ref. Binding failures are always terminal.
 * - Lease-expired results are REJECTED (no write): the attempt was reclaimed
 *   and may re-execute; accepting a stale result could overwrite newer state.
 *   At-least-once duplicates from this window converge via idempotent
 *   re-entry — external side effects rely on tool-level safety (§22 boundary,
 *   documented, not claimed away).
 */

import { verifyExecClaimToken } from './tokens';
import { computeBackoffMs } from './recovery';
import type { ExecClient } from './claim';
import type { AttemptOutcome } from './runner';

export type IngestOutcomeName = 'succeeded' | 'tool-failed' | 'timeout' | 'error' | 'binding-failed';

export interface IngestInput {
  taskId: string;
  runId: string;
  attemptNo: number;
  workerId: string;
  claimToken: string;
  outcome: IngestOutcomeName;
  /** Executor-classified; binding-failed is always terminal regardless. */
  retryable: boolean;
  output?: unknown;
  error?: string | null;
  nowIso?: string;
}

export type IngestResult =
  | { ok: true; duplicate?: boolean; transition: string; tenantId: string | null; action: string }
  | { ok: false; reason: string };

async function selectAll<T>(q: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await q) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`exec ingest ${what} failed: ${error.message}`);
  return (data ?? []) as T[];
}

interface JobRow {
  id: string;
  status: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  claim_token_hash: string | null;
  attempt_count: number;
  max_attempts: number;
  tenant_id: string | null;
  agent_id: string;
  approval_id: string | null;
  payload: Record<string, unknown> | null;
}

interface RunRow {
  id: string;
  task_id: string;
  attempt_no: number | null;
  status: string;
}

function truncate(s: string | null | undefined, n: number): string | null {
  if (s === null || s === undefined) return null;
  return s.length > n ? `${s.slice(0, n)}…[truncated]` : s;
}

function summarizeOutput(output: unknown): string | null {
  if (output === undefined) return null;
  let s: string;
  try {
    s = JSON.stringify(output) ?? 'null';
  } catch {
    return '[unserializable output]';
  }
  return truncate(s, 2000);
}

export async function ingestAttemptResult(client: ExecClient, input: IngestInput): Promise<IngestResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();

  const jobs = await selectAll<JobRow>(
    client
      .from('agent_tasks')
      .select('id,status,lease_owner,lease_expires_at,claim_token_hash,attempt_count,max_attempts,tenant_id,agent_id,approval_id,payload')
      .eq('id', input.taskId)
      .limit(1),
    'ingest job'
  );
  const job = jobs[0] ?? null;
  if (!job) return { ok: false, reason: 'unknown job' };

  const runs = await selectAll<RunRow>(
    client.from('agent_runs').select('id,task_id,attempt_no,status').eq('id', input.runId).limit(1),
    'ingest run'
  );
  const run = runs[0] ?? null;
  if (!run || run.task_id !== input.taskId || run.attempt_no !== input.attemptNo) {
    return { ok: false, reason: 'unknown attempt' };
  }

  // Duplicate short-circuit: terminal attempt converges replays to a no-op
  // BEFORE token checks (token was consumed by the first ingest).
  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    return { ok: true, duplicate: true, transition: 'none', tenantId: job.tenant_id, action: payloadAction(job) };
  }
  if (job.status !== 'running') {
    return { ok: false, reason: 'job not running' };
  }

  // Live-claim verification: owner + single-use token + unexpired lease.
  if (job.lease_owner !== input.workerId) return { ok: false, reason: 'wrong worker' };
  if (!verifyExecClaimToken(input.claimToken, job.claim_token_hash, job.lease_expires_at, nowIso)) {
    return { ok: false, reason: 'bad token' };
  }

  const terminalFailure = input.outcome === 'binding-failed' || !input.retryable;
  const budgetLeft = job.attempt_count < job.max_attempts;
  const requeue = !terminalFailure && budgetLeft;

  const errorText = truncate(input.error ?? null, 1000);
  const outcomeText = input.outcome === 'succeeded' ? summarizeOutput(input.output) : errorText;

  if (input.outcome === 'succeeded') {
    await transitionToTerminal(client, job, run.id, 'completed', `exec-run:${run.id}`, outcomeText, nowIso, input.attemptNo);
    return { ok: true, transition: 'running→completed', tenantId: job.tenant_id, action: payloadAction(job) };
  }
  if (requeue) {
    const runAfter = new Date(Date.parse(nowIso) + computeBackoffMs(job.attempt_count)).toISOString();
    await transitionToQueued(client, job.id, run.id, runAfter, outcomeText, nowIso);
    return { ok: true, transition: 'running→queued', tenantId: job.tenant_id, action: payloadAction(job) };
  }
  const reason = input.outcome === 'binding-failed'
    ? `exec-binding-failed:${(input.error ?? 'binding').slice(0, 200)}`
    : `exec-failed:${input.outcome}`;
  await transitionToTerminal(client, job, run.id, 'failed', reason, outcomeText, nowIso, input.attemptNo);
  return { ok: true, transition: 'running→failed', tenantId: job.tenant_id, action: payloadAction(job) };
}

/** Best-effort action label from the stored envelope (display only). */
function payloadAction(job: JobRow): string {
  try {
    const payload = job.payload as Record<string, unknown> | null;
    const env = payload !== null && typeof payload === 'object' ? (payload['envelope'] as Record<string, unknown> | undefined) : undefined;
    if (env && typeof env['action'] === 'string' && (env['action'] as string).length > 0) {
      return (env['action'] as string).slice(0, 80);
    }
  } catch {
    // fall through with generic label
  }
  return 'background execution';
}

async function writeAuditStep(
  client: ExecClient,
  runId: string,
  kind: 'tool_result' | 'error',
  summary: string | null,
  nowIso: string
): Promise<void> {
  const seqRows = await selectAll<{ seq: number }>(
    client.from('agent_steps').select('seq').eq('run_id', runId).order('seq', { ascending: false }).limit(1),
    'ingest seq'
  );
  const seq = (seqRows[0]?.seq ?? -1) + 1;
  await selectAll<{ id: string }>(
    client
      .from('agent_steps')
      .insert({ run_id: runId, seq, kind, result_summary: summary })
      .select('id'),
    'ingest step'
  );
  void nowIso;
}

async function transitionToTerminal(
  client: ExecClient,
  job: JobRow,
  runId: string,
  status: 'completed' | 'failed',
  resultRef: string,
  summary: string | null,
  nowIso: string,
  attemptNo: number
): Promise<void> {
  const taskId = job.id;
  const updated = await selectAll<{ id: string }>(
    client
      .from('agent_tasks')
      .update({
        status,
        result_ref: resultRef,
        lease_owner: null,
        lease_expires_at: null,
        claim_token_hash: null,
        last_heartbeat_at: nowIso,
      })
      .eq('id', taskId)
      .eq('status', 'running')
      .select('id'),
    'ingest terminal'
  );
  if (updated.length === 0) throw new Error('job transition lost race');
  await selectAll<{ id: string }>(
    client
      .from('agent_runs')
      .update({ status, error: summary, completed_at: nowIso })
      .eq('id', runId)
      .eq('status', 'running')
      .select('id'),
    'ingest run terminal'
  );
  await writeAuditStep(client, runId, status === 'completed' ? 'tool_result' : 'error', summary, nowIso);
  await writeTerminalReport(client, job, runId, status, summary, nowIso, attemptNo);
}

/**
 * Terminal-only investigation record: visible in Reports UI + report-detail
 * incident/task hops with zero new surfaces. Requeues file nothing (the next
 * attempt reports); duplicates never reach here (short-circuit above).
 */
async function writeTerminalReport(
  client: ExecClient,
  job: JobRow,
  runId: string,
  status: 'completed' | 'failed',
  summary: string | null,
  nowIso: string,
  attemptNo: number
): Promise<void> {
  void nowIso;
  const action = payloadAction(job);
  const what = `Background execution of ${action} ${status} on attempt ${attemptNo}.${summary ? ` ${summary.slice(0, 400)}` : ''}`;
  await selectAll<{ id: string }>(
    client
      .from('agent_reports')
      .insert({
        agent_id: job.agent_id,
        run_id: runId,
        tenant_id: job.tenant_id,
        report_type: 'task',
        summary: what.slice(0, 5000),
        sections: { what_happened: what.slice(0, 1000), tool_calls: [{ tool: action }] },
      })
      .select('id'),
    'ingest report'
  );
}

async function transitionToQueued(
  client: ExecClient,
  taskId: string,
  runId: string,
  runAfter: string,
  summary: string | null,
  nowIso: string
): Promise<void> {
  const updated = await selectAll<{ id: string }>(
    client
      .from('agent_tasks')
      .update({
        status: 'queued',
        run_after: runAfter,
        lease_owner: null,
        lease_expires_at: null,
        claim_token_hash: null,
        last_heartbeat_at: nowIso,
      })
      .eq('id', taskId)
      .eq('status', 'running')
      .select('id'),
    'ingest requeue'
  );
  if (updated.length === 0) throw new Error('job transition lost race');
  await selectAll<{ id: string }>(
    client
      .from('agent_runs')
      .update({ status: 'failed', error: summary, completed_at: nowIso })
      .eq('id', runId)
      .eq('status', 'running')
      .select('id'),
    'ingest run attempt close'
  );
  await writeAuditStep(client, runId, 'error', summary, nowIso);
}

export type { AttemptOutcome };
