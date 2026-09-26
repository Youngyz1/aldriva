/**
 * POST /api/qa/ingest — Stage 7 worker result ingest (control plane).
 *
 * Auth: per-run claim token as Bearer (Layer 2). The poll token is NOT
 * accepted here — 401 reveals nothing (missing run and bad token are
 * indistinguishable). Rate-limited (qaIngest bucket).
 *
 * On terminal failed runs of eligible suites: deterministic incident rule
 * (smoke only, per-suite-per-day, s3 → s2 on 3rd consecutive day,
 * flaky-only never). Shadow mode (QA_SHADOW_MODE !== 'false', default ON)
 * records the would-be emission in qa_runs.metadata instead of calling
 * insertSystemEvent(). Going live is a manual env flip + redeploy.
 */
import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyClaimToken } from '@/lib/qa/tokens';
import { ingestRunResults, evaluateIncidentDecision, isShadowMode } from '@/lib/qa/ingest';
import { insertSystemEvent } from '@/lib/observability/system-events';

/** Consecutive calendar days (ending yesterday) with ≥1 qa_failure event for the suite. */
function countConsecutiveFailDays(rows: { error_code: string | null; created_at: string }[], suite: string, today: string): number {
  const days = new Set<string>();
  for (const r of rows) {
    if (!r.error_code || !r.error_code.endsWith(`:${suite}`)) continue;
    days.add(r.created_at.slice(0, 10));
  }
  let streak = 0;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1); // start yesterday — today's row doesn't exist yet
  while (days.has(d.toISOString().slice(0, 10))) {
    streak += 1;
    d.setUTCDate(d.getUTCDate() - 1);
    if (streak > 30) break;
  }
  return streak;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit('qaIngest', req, null);
  if (limited) return limited;

  let body: { runId?: unknown; status?: unknown; results?: unknown; error?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.runId !== 'string' || typeof body.status !== 'string' || !Array.isArray(body.results)) {
    return NextResponse.json({ error: 'runId, status, and results[] are required' }, { status: 400 });
  }

  const presented = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  try {
    const admin = createSupabaseAdmin();
    const nowIso = new Date().toISOString();

    // Claim-gated load: missing run and bad token share one 401 (no oracle).
    const rows = (await admin
      .from('qa_runs')
      .select('id,suite,environment,target_tenant_id,status,claim_token_hash,claim_expires_at,metadata')
      .eq('id', body.runId)
      .limit(1)) as unknown as { data: Array<{
        id: string; suite: string; environment: string; target_tenant_id: string | null;
        status: string; claim_token_hash: string | null; claim_expires_at: string | null;
        metadata: Record<string, unknown> | null;
      }> | null; error: { message: string } | null };
    const run = rows.data?.[0] ?? null;
    if (!run || !verifyClaimToken(presented, run.claim_token_hash, run.claim_expires_at, nowIso)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const outcome = await ingestRunResults(
      admin,
      {
        runId: body.runId,
        status: body.status,
        results: body.results as Parameters<typeof ingestRunResults>[1]['results'],
        error: typeof body.error === 'string' ? body.error : null,
      },
      nowIso
    );
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.message }, { status: 422 });
    }
    if (outcome.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // Incident rule: terminal failed runs with real (non-flaky) failures.
    const failed = (body.results as Array<{ status?: unknown }>).filter((r) => r.status === 'failed').length;
    const flakyOnly = failed === 0;
    if (body.status === 'failed' && !flakyOnly) {
      const today = nowIso.slice(0, 10);
      const prior = (await admin
        .from('system_events')
        .select('error_code,created_at')
        .eq('kind', 'qa_failure')
        .order('created_at', { ascending: false })
        .limit(30)) as unknown as { data: Array<{ error_code: string | null; created_at: string }> | null };
      const consecutive = countConsecutiveFailDays(prior.data ?? [], run.suite, today);
      const decision = evaluateIncidentDecision({
        suite: run.suite,
        date: today,
        failed,
        flakyOnly: false,
        consecutiveFailDays: consecutive,
      });
      if (decision) {
        const errorCode = `${decision.severity === 's2' ? 'qa_escalated' : 'qa_first'}:${run.suite}`;
        const message = `QA ${run.suite} suite failed (${failed} test(s)) on staging — run ${run.id}`;
        if (isShadowMode(process.env)) {
          const metadata = { ...(run.metadata ?? {}), shadow_suppressed: { date: today, severity: decision.severity, error_code: errorCode, failed } };
          await admin.from('qa_runs').update({ metadata }).eq('id', run.id);
        } else {
          await insertSystemEvent({
            kind: 'qa_failure',
            severity_hint: 'error',
            tenant_id: run.target_tenant_id,
            route: '/api/qa/ingest',
            tool_name: 'qa_ingest',
            error_code: errorCode,
            message,
            metadata: { suite: run.suite, runId: run.id, failed, consecutiveFailDays: consecutive },
            source: 'qa_sweep',
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[qa/ingest] fatal:', msg);
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500 });
  }
}
