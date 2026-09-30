/**
 * POST /api/exec/ingest — Stage 10.6 attempt-result ingest endpoint.
 *
 * Auth: Layer-2 per-claim token in the body (verified against the stored
 * hash + expiry inside ingestAttemptResult). The Layer-1 worker token is
 * deliberately NOT accepted here like the QA plane: possession of a claim
 * token authorizes exactly one attempt's result, nothing else.
 *
 * Terminal failures emit a metadata-only job_error signal (Stage 10.7) so
 * Sentinel observes execution outcomes through the existing pipeline.
 * Duplicate terminal replays converge to {duplicate:true} with no new rows,
 * steps, reports, or events.
 */
import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { ingestAttemptResult, type IngestOutcomeName } from '@/lib/exec/ingest';
import { logThrottledAuthDenial } from '@/lib/observability/system-events';
import { emitExecTerminal } from '@/lib/exec/emit';

const OUTCOMES: readonly string[] = ['succeeded', 'tool-failed', 'timeout', 'error', 'binding-failed'];

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit('execClaim', req, null);
  if (limited) return limited;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const taskId = typeof body['taskId'] === 'string' ? (body['taskId'] as string) : '';
  const runId = typeof body['runId'] === 'string' ? (body['runId'] as string) : '';
  const workerId = typeof body['workerId'] === 'string' ? (body['workerId'] as string).slice(0, 200) : '';
  const claimToken = typeof body['claimToken'] === 'string' ? (body['claimToken'] as string) : '';
  const attemptNo = typeof body['attemptNo'] === 'number' ? body['attemptNo'] : NaN;
  const outcome = typeof body['outcome'] === 'string' ? body['outcome'] : '';
  if (!taskId || !runId || !workerId || !claimToken || !Number.isInteger(attemptNo) || !OUTCOMES.includes(outcome)) {
    return NextResponse.json({ error: 'taskId, runId, attemptNo, workerId, claimToken, and outcome are required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdmin();
    const out = await ingestAttemptResult(admin, {
      taskId,
      runId,
      attemptNo,
      workerId,
      claimToken,
      outcome: outcome as IngestOutcomeName,
      retryable: body['retryable'] === true,
      output: body['output'],
      error: typeof body['error'] === 'string' ? (body['error'] as string).slice(0, 2000) : null,
      nowIso: new Date().toISOString(),
    });
    if (!out.ok) {
      // Stage 15 (S-10): token/owner failures are worker auth failures —
      // audited (throttled, fail-open); unknown job/attempt states are not.
      if (out.reason === 'bad token' || out.reason === 'wrong worker') {
        void logThrottledAuthDenial(req, 'POST /api/exec/ingest', 'claim_token_rejected');
      }
      return NextResponse.json({ error: out.reason }, { status: 422 });
    }
    if (out.transition === 'running→failed') {
      emitExecTerminal({
        tenantId: out.tenantId,
        action: out.action,
        transition: out.transition,
        jobId: taskId,
        attemptNo,
        route: '/api/exec/ingest',
      });
    }
    return NextResponse.json({ ok: true, transition: out.transition, duplicate: out.duplicate ?? false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[exec/ingest] fatal:', msg);
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500 });
  }
}
