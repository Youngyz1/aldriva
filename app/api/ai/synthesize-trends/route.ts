import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { synthesizeTrends } from '@/lib/ai/trend-synthesis';
import { insertSystemEvent } from '@/lib/observability/system-events';

export async function POST(req: NextRequest) {
  // Internal Growth Studio capability: admin-only. Provider selection in the
  // body is honored only after this gate (server-side policy applies).
  await requireAdmin();
  // LLM synthesis per call: same per-caller AI budget as the article
  // assistant (articleAi tier).
  const limited = await enforceRateLimit("articleAi", req);
  if (limited) return limited;
  try {
    const body = await req.json();
    const { quarantinedContent, focusArea, maxTrends, provider } = body;

    if (!quarantinedContent || typeof quarantinedContent !== 'string') {
      return NextResponse.json(
        { error: 'quarantinedContent is required as a string.' },
        { status: 400 }
      );
    }

    const result = await synthesizeTrends(quarantinedContent, {
      focusArea,
      maxTrends,
      providerId: provider,
    });

    if (!result.success) {
      console.error("[api/ai/synthesize-trends]", result.error);
      void insertSystemEvent({
        kind: 'api_error',
        severity_hint: 'error',
        route: 'POST /api/ai/synthesize-trends',
        status_code: 500,
        error_code: 'synthesize_failed',
        message: String(result.error ?? 'Failed to synthesize trends.').slice(0, 2000),
        metadata: {},
        source: 'aldriva',
      });
      return NextResponse.json(
        { error: 'Failed to synthesize trends.' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("[api/ai/synthesize-trends]", err);
    void insertSystemEvent({
      kind: 'api_error',
      severity_hint: 'error',
      route: 'POST /api/ai/synthesize-trends',
      status_code: 500,
      error_code: 'unhandled',
      message: (err instanceof Error ? err.message : String(err)).slice(0, 2000),
      metadata: {},
      source: 'aldriva',
    });
    return NextResponse.json({ error: 'Failed to synthesize trends.' }, { status: 500 });
  }
}
