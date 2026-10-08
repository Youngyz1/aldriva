import "server-only";
/**
 * POST /api/exec/run — Stage 10.4 bounded execution unit (control plane).
 *
 * Auth: Layer-1 worker token (fail-closed). Executes ONE claimed job attempt
 * end-to-end inside the request: claim → load live rows → six-way binding →
 * single bounded dispatch → idempotent ingest → terminal-failure emission.
 *
 * This is the externally-triggerable worker (manual POST, operator script) —
 * NOT a scheduler: no cron entry, no loop, no background process. Long tools
 * are bounded by the envelope budget; wall-clock is additionally bounded by
 * the serverless request lifetime (attempts that overrun become reclaimable
 * via lease expiry — the at-least-once window is documented, not hidden).
 */
import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { isAuthorizedWorkerRequest } from '@/lib/exec/tokens';
import { logThrottledAuthDenial } from '@/lib/observability/system-events';
import { claimExecution } from '@/lib/exec/claim';
import { runAttempt } from '@/lib/exec/runner';
import { dispatchApprovedTool } from '@/lib/exec/dispatch';
import { ingestAttemptResult } from '@/lib/exec/ingest';
import { emitExecTerminal } from '@/lib/exec/emit';
import type { BindingApproval, BindingAgent, BindingToolDef } from '@/lib/exec/binding';

async function selectAll<T>(q: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await q) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`exec run ${what} failed: ${error.message}`);
  return (data ?? []) as T[];
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit('execClaim', req, null);
  if (limited) return limited;

  const header = req.headers.get('authorization');
  if (
    !isAuthorizedWorkerRequest(header, process.env.EXEC_WORKER_TOKEN, process.env.EXEC_WORKER_TOKEN_PREV)
  ) {
    // Stage 15 (S-10): audited denial — throttled, fail-open, response unchanged.
    void logThrottledAuthDenial(req, 'POST /api/exec/run', 'worker_unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { workerId?: unknown; userId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const workerId = typeof body.workerId === 'string' ? body.workerId.slice(0, 200) : '';
  if (!workerId) {
    return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
  }
  const userId = typeof body.userId === 'string' && body.userId.length > 0
    ? body.userId.slice(0, 200)
    : `system:exec-worker:${workerId.slice(0, 100)}`;

  try {
    const admin = createSupabaseAdmin();
    const nowIso = new Date().toISOString();

    const claimed = await claimExecution(admin, { workerId, nowIso, limit: 1 });
    if (!claimed.claimed) {
      return NextResponse.json({ claimed: false, message: claimed.message });
    }
    const job = claimed.job;

    const [approvals, agents, toolDefs] = await Promise.all([
      job.approvalId
        ? selectAll<BindingApproval>(
            admin.from('approvals').select('id,action,risk,status,expires_at,tenant_id,proposed_outcome').eq('id', job.approvalId).limit(1),
            'run approval'
          )
        : Promise.resolve([] as BindingApproval[]),
      selectAll<BindingAgent>(
        admin.from('agents').select('id,name,autonomy_level,status').eq('id', job.agentId).limit(1),
        'run agent'
      ),
      selectAll<BindingToolDef>(
        admin.from('tool_definitions').select('name,scope,risk,approval_required').eq('name', job.action).limit(1),
        'run tooldef'
      ),
    ]);

    const attempt = await runAttempt({
      job,
      workerId,
      userId,
      rows: { approval: approvals[0] ?? null, agent: agents[0] ?? null, toolDef: toolDefs[0] ?? null },
      nowIso,
      execute: (ctx, uid) => dispatchApprovedTool({ context: ctx, userId: uid }),
    });

    if (attempt.outcome === 'lease-expired') {
      // No dispatch happened and the token may already be stale: leave the
      // job for reclaim instead of writing a result for it.
      return NextResponse.json({ claimed: true, jobId: job.jobId, outcome: attempt.outcome });
    }

    const ingested = await ingestAttemptResult(admin, {
      taskId: job.jobId,
      runId: job.runId,
      attemptNo: job.attemptNo,
      workerId,
      claimToken: claimed.claimToken,
      outcome: attempt.outcome as 'succeeded' | 'tool-failed' | 'timeout' | 'error' | 'binding-failed',
      retryable: attempt.retryable,
      output: attempt.output,
      error: attempt.error ?? null,
      nowIso: new Date().toISOString(),
    });
    if (ingested.ok && ingested.transition === 'running→failed') {
      emitExecTerminal({
        tenantId: ingested.tenantId,
        action: ingested.action,
        transition: ingested.transition,
        jobId: job.jobId,
        attemptNo: job.attemptNo,
        route: '/api/exec/run',
      });
    }
    return NextResponse.json({
      claimed: true,
      jobId: job.jobId,
      runId: job.runId,
      attemptNo: job.attemptNo,
      outcome: attempt.outcome,
      transition: ingested.ok ? ingested.transition : `ingest-failed:${ingested.reason}`,
      durationMs: attempt.durationMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[exec/run] fatal:', msg);
    return NextResponse.json({ error: 'Run failed' }, { status: 500 });
  }
}
