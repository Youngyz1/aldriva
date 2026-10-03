/**
 * app/api/cron/sentinel-sweep/route.ts
 * Phase 143b — Sentinel sweep (read-only, L0). Vercel cron every 2h.
 * isAuthorizedCronRequest + enforceRateLimit(articleAi) + open incidents → orchestrate sentinel → report
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { orchestrate } from '@/lib/ai/orchestrator';


export async function POST(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limited = await enforceRateLimit('articleAi', req, null);
  if (limited) return limited;

  try {
    const admin = createSupabaseAdmin();
    const { data: incidents, error } = await admin
      .from('incidents')
      .select('id, severity, title, dedupe_key, event_count, updated_at')
      .in('status', ['open', 'investigating'])
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[sentinel-sweep] incidents query error:', error.message);
      return NextResponse.json({ error: 'Incidents query failed' }, { status: 500 });
    }

    const openCount = (incidents ?? []).length;

    // No incidents — still report healthy
    if (openCount === 0) {
      return NextResponse.json({ success: true, openCount: 0, message: 'No open incidents' });
    }

    // Run sentinel investigation via existing orchestrator (L0 read-only, best-effort)
    // Use a synthetic cron actor id (no auth) — orchestrate handles tenantId null as platform via synthetic ctx
    const prompt = `Sentinel sweep: summarize ${openCount} open/incident(s). Use get_active_incidents and get_recent_events to ground your answer. Provide severity, dedupe_key, and recommended next check.`;
    const result = await orchestrate({
      agent: 'sentinel',
      prompt,
      tenantId: null,
      userId: null,
    });
    console.log('[sentinel-sweep] orchestrate result', {
      runId: result.runId,
      guardVerdict: result.guardVerdict,
      provider: result.provider,
      toolCalls: result.toolCalls.map((t) => ({ tool: t.tool, resultPreview: JSON.stringify(t.result).slice(0, 400) })),
      textPreview: result.text.slice(0, 300),
      guardedPreview: result.guardedText.slice(0, 300),
      error: result.error,
    });

    // Stage 17 (O-3): link the swept incidents to the investigation run so
    // "which run investigated incident X" is answerable by FK. Conditional
    // (never overwrites) and non-fatal: a stamp failure must not fail the
    // sweep response.
    if (result.runId) {
      try {
        const ids = (incidents ?? []).map((i) => (i as { id: string }).id);
        if (ids.length > 0) {
          await admin
            .from('incidents')
            .update({ agent_run_id: result.runId })
            .in('id', ids)
            .is('agent_run_id', null);
        }
      } catch (err) {
        console.error('[sentinel-sweep] run stamp failed:', err instanceof Error ? err.message : String(err));
      }
    }

    return NextResponse.json({
      success: true,
      openCount,
      sentinel: {
        text: result.guardedText.slice(0, 2000),
        guardVerdict: result.guardVerdict,
        runId: result.runId,
        toolCalls: result.toolCalls,
        rawText: result.text.slice(0, 2000),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sentinel-sweep] fatal:', msg);
    return NextResponse.json({ error: 'Sentinel sweep failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
