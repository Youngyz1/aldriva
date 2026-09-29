/**
 * POST /api/exec/heartbeat — Stage 10.5 lease renewal endpoint.
 *
 * Auth: Layer-1 worker token (fail-closed). Renewal additionally requires the
 * per-claim token + owner match + live lease — a worker can never extend
 * another worker's lease, and expired leases are not renewable here (they go
 * through reclaim, which requeues under budget).
 */
import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { isAuthorizedWorkerRequest } from '@/lib/exec/tokens';
import { heartbeatClaim } from '@/lib/exec/recovery';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit('execClaim', req, null);
  if (limited) return limited;

  const header = req.headers.get('authorization');
  if (
    !isAuthorizedWorkerRequest(header, process.env.EXEC_WORKER_TOKEN, process.env.EXEC_WORKER_TOKEN_PREV)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { taskId?: unknown; workerId?: unknown; claimToken?: unknown; leaseTtlMs?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const taskId = typeof body.taskId === 'string' ? body.taskId : '';
  const workerId = typeof body.workerId === 'string' ? body.workerId.slice(0, 200) : '';
  const claimToken = typeof body.claimToken === 'string' ? body.claimToken : '';
  if (!taskId || !workerId || !claimToken) {
    return NextResponse.json({ error: 'taskId, workerId, and claimToken are required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdmin();
    const out = await heartbeatClaim(admin, {
      taskId,
      workerId,
      claimToken,
      leaseTtlMs: typeof body.leaseTtlMs === 'number' ? body.leaseTtlMs : undefined,
      nowIso: new Date().toISOString(),
    });
    if (!out.ok) {
      return NextResponse.json({ error: out.reason }, { status: 403 });
    }
    return NextResponse.json({ ok: true, leaseExpiresAt: out.leaseExpiresAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[exec/heartbeat] fatal:', msg);
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 });
  }
}
