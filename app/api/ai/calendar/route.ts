import { NextRequest, NextResponse } from 'next/server';
import {
  saveTrendToCalendar,
  getCalendarItems,
  updateCalendarItemStatus,
  ContentCalendarStatus,
} from '@/lib/ai/trend-synthesis';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as ContentCalendarStatus | null;
    const limit = Number(searchParams.get('limit')) || 20;

    const result = await getCalendarItems({
      status: status || undefined,
      limit,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ items: result.items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: result.item });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
