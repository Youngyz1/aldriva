import { NextRequest, NextResponse } from 'next/server';
import { toCsv } from '@/lib/admin-query';

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get('format') ?? 'csv';
  const base = req.nextUrl.origin;
  const query = req.nextUrl.searchParams.toString();

  const res = await fetch(`${base}/api/dashboard/reports?${query}`, {
    headers: { cookie: req.headers.get('cookie') ?? '' },
  });
  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data.error ?? 'Export failed.' }, { status: 500 });
  }

  const rows = [
    { metric: 'Tickets Sold', value: data.stats.tickets },
    { metric: 'Ticket Revenue', value: data.stats.revenue },
    { metric: 'Donations', value: data.stats.donations },
    ...(data.topEvents ?? []).map((e: { title: string; revenue: number }) => ({
      metric: `Event: ${e.title}`,
      value: e.revenue,
    })),
  ];

  const csv = toCsv(rows, ['metric', 'value']);
  const contentType =
    format === 'pdf'
      ? 'application/pdf'
      : format === 'xlsx'
        ? 'application/vnd.ms-excel'
        : 'text/csv; charset=utf-8';

  return new NextResponse(csv, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="reports-export.${format === 'pdf' ? 'pdf' : format === 'xlsx' ? 'csv' : 'csv'}"`,
    },
  });
}
