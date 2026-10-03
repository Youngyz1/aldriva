import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  saveTrendToCalendar,
  getCalendarItems,
  updateCalendarItemStatus,
  ContentCalendarStatus,
} from '@/lib/ai/trend-synthesis';
import { insertSystemEvent } from '@/lib/observability/system-events';

export async function GET(req: NextRequest) {
  // Internal Growth Studio capability: admin-only (same gate as /api/ai/chat).
  await requireAdmin();
  const getLimited = await enforceRateLimit("articleAi", req);
  if (getLimited) return getLimited;
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as ContentCalendarStatus | null;
    const limit = Number(searchParams.get('limit')) || 20;

    const result = await getCalendarItems({
      status: status || undefined,
      limit,
    });

    if (!result.success) {
      console.error("[api/ai/calendar]", result.error);
      void insertSystemEvent({
        kind: 'api_error',
        severity_hint: 'error',
        route: 'GET /api/ai/calendar',
        status_code: 500,
        error_code: 'calendar_get_failed',
        message: String(result.error ?? 'Calendar operation failed.').slice(0, 2000),
        metadata: {},
        source: 'aldriva',
      });
      return NextResponse.json({ error: "Calendar operation failed. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ items: result.items });
  } catch (err: unknown) {
    console.error("[api/ai/calendar]", err);
    void insertSystemEvent({
      kind: 'api_error',
      severity_hint: 'error',
      route: 'GET /api/ai/calendar',
      status_code: 500,
      error_code: 'unhandled',
      message: (err instanceof Error ? err.message : String(err)).slice(0, 2000),
      metadata: {},
      source: 'aldriva',
    });
    return NextResponse.json({ error: "Calendar operation failed. Please try again." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  await requireAdmin();
  const postLimited = await enforceRateLimit("articleAi", req);
  if (postLimited) return postLimited;
  try {
    const body = await req.json();
    const { trend, adminNotes } = body;

    if (!trend || !trend.topic) {
      return NextResponse.json(
        { error: 'Valid trend object with topic is required.' },
        { status: 400 }
      );
    }

    const result = await saveTrendToCalendar(trend, adminNotes);

    if (!result.success) {
      console.error("[api/ai/calendar]", result.error);
      void insertSystemEvent({
        kind: 'api_error',
        severity_hint: 'error',
        route: 'POST /api/ai/calendar',
        status_code: 500,
        error_code: 'calendar_save_failed',
        message: String(result.error ?? 'Calendar operation failed.').slice(0, 2000),
        metadata: {},
        source: 'aldriva',
      });
      return NextResponse.json({ error: "Calendar operation failed. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: result.item });
  } catch (err: unknown) {
    console.error("[api/ai/calendar]", err);
    void insertSystemEvent({
      kind: 'api_error',
      severity_hint: 'error',
      route: 'POST /api/ai/calendar',
      status_code: 500,
      error_code: 'unhandled',
      message: (err instanceof Error ? err.message : String(err)).slice(0, 2000),
      metadata: {},
      source: 'aldriva',
    });
    return NextResponse.json({ error: "Calendar operation failed. Please try again." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  await requireAdmin();
  const patchLimited = await enforceRateLimit("articleAi", req);
  if (patchLimited) return patchLimited;
  try {
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: 'Item ID and new status are required.' },
        { status: 400 }
      );
    }

    const result = await updateCalendarItemStatus(id, status);

    if (!result.success) {
      console.error("[api/ai/calendar]", result.error);
      void insertSystemEvent({
        kind: 'api_error',
        severity_hint: 'error',
        route: 'PATCH /api/ai/calendar',
        status_code: 500,
        error_code: 'calendar_update_failed',
        message: String(result.error ?? 'Calendar operation failed.').slice(0, 2000),
        metadata: {},
        source: 'aldriva',
      });
      return NextResponse.json({ error: "Calendar operation failed. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[api/ai/calendar]", err);
    void insertSystemEvent({
      kind: 'api_error',
      severity_hint: 'error',
      route: 'PATCH /api/ai/calendar',
      status_code: 500,
      error_code: 'unhandled',
      message: (err instanceof Error ? err.message : String(err)).slice(0, 2000),
      metadata: {},
      source: 'aldriva',
    });
    return NextResponse.json({ error: "Calendar operation failed. Please try again." }, { status: 500 });
  }
}
