/**
 * POST /api/exec/claim — Stage 10.2 worker claim endpoint (control plane).
 *
 * Auth: Layer-1 worker token (EXEC_WORKER_TOKEN [+ _PREV], timing-safe,
 * fail-closed). Authorizes recovery + materialization + claim ONLY — the
 * response's per-job claim token is what unlocks heartbeat/ingest, and it is
 * minted here, hashed at rest, never logged.
 *
 * Each call (bounded): reclaim stale leases → materialize newly-approved
 * approvals → claim one queued job. All three steps are idempotent, so worker
 * cadence is safe to repeat. No scheduler attached (Stage 10 boundary).
 */
import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { isAuthorizedWorkerRequest } from '@/lib/exec/tokens';
import { logThrottledAuthDenial } from '@/lib/observability/system-events';
import { reclaimStaleLeases } from '@/lib/exec/recovery';
import { materializeApproved } from '@/lib/exec/materialize';
import { claimExecution } from '@/lib/exec/claim';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit('execClaim', req, null);
  if (limited) return limited;

  const header = req.headers.get('authorization');
  if (
    !isAuthorizedWorkerRequest(header, process.env.EXEC_WORKER_TOKEN, process.env.EXEC_WORKER_TOKEN_PREV)
  ) {
    // Stage 15 (S-10): audited denial — throttled, fail-open, response unchanged.
    void logThrottledAuthDenial(req, 'POST /api/exec/claim', 'worker_unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { workerId?: unknown; leaseTtlMs?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const workerId = typeof body.workerId === 'string' ? body.workerId.slice(0, 200) : '';
  if (!workerId) {
    return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
  }
  const leaseTtlMs = typeof body.leaseTtlMs === 'number' ? body.leaseTtlMs : undefined;

  try {
    const admin = createSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const recovered = await reclaimStaleLeases(admin, { nowIso });
    const materialized = await materializeApproved(admin, { nowIso });
    const outcome = await claimExecution(admin, { workerId, nowIso, leaseTtlMs });
    if (!outcome.claimed) {
      return NextResponse.json({
        claimed: false,
        message: outcome.message,
        reclaimed: recovered.requeued.length + recovered.exhausted.length,
        materialized: materialized.materialized.length,
      });
    }
    return NextResponse.json({
      claimed: true,
      job: outcome.job,
      claimToken: outcome.claimToken,
      reclaimed: recovered.requeued.length + recovered.exhausted.length,
      materialized: materialized.materialized.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[exec/claim] fatal:', msg);
    return NextResponse.json({ error: 'Claim failed' }, { status: 500 });
  }
}
