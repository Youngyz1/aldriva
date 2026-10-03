/**
 * GET /api/qa/poll — Stage 7 worker poll endpoint (control plane).
 *
 * Auth: Layer-1 poll token (QA_INGEST_TOKEN [+ _PREV], timing-safe,
 * fail-closed). Authorizes listing + requesting a claim ONLY — the
 * response's per-run claim token is what unlocks ingest, and it is
 * minted here, hashed at rest, never logged.
 */
import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { isAuthorizedPollRequest } from '@/lib/qa/tokens';
import { logThrottledAuthDenial } from '@/lib/observability/system-events';
import { pollAndClaim } from '@/lib/qa/claim';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit('qaIngest', req, null);
  if (limited) return limited;

  const header = req.headers.get('authorization');
  const secret = process.env.QA_INGEST_TOKEN;
  const prev = process.env.QA_INGEST_TOKEN_PREV;
  if (!isAuthorizedPollRequest(header, secret, prev)) {
    // Stage 15 (S-10): audited denial — throttled, fail-open, response unchanged.
    void logThrottledAuthDenial(req, 'GET /api/qa/poll', 'worker_unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workerRunId = (new URL(req.url).searchParams.get('worker_run_id') ?? '').slice(0, 200);
  if (!workerRunId) {
    return NextResponse.json({ error: 'worker_run_id is required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdmin();
    const outcome = await pollAndClaim(admin, workerRunId, new Date().toISOString());
    if (!outcome.claimed) {
      return NextResponse.json({ claimed: false, message: outcome.message });
    }
    return NextResponse.json({
      claimed: true,
      run: outcome.run,
      claimToken: outcome.claimToken,
      claimExpiresAt: outcome.claimExpiresAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[qa/poll] fatal:', msg);
    return NextResponse.json({ error: 'Poll failed' }, { status: 500 });
  }
}
