import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { synthesizeTrends } from '@/lib/ai/trend-synthesis';

export async function POST(req: NextRequest) {
  // Internal Growth Studio capability: admin-only. Provider selection in the
  // body is honored only after this gate (server-side policy applies).
  await requireAdmin();
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
      return NextResponse.json(
        { error: result.error || 'Failed to synthesize trends.' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
