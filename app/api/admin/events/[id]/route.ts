/**
 * app/api/admin/events/[id]/route.ts
 * PATCH — update event status or is_featured flag.
 * When featuring an event, sets featured_until to 30 days from now.
 * Admin-only: checks isAdmin() before any DB operation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdmin } from '@/lib/auth';

// Service role: bypasses RLS — admin operations only
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_STATUSES = ['pending', 'approved', 'rejected'] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json()) as { status?: string; is_featured?: boolean };

  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as (typeof VALID_STATUSES)[number])) {
      return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 });
    }
    update.status = body.status;
  }

  if (body.is_featured !== undefined) {
    update.is_featured = body.is_featured;
    // When featuring, set featured_until to 30 days from now.
    // When unfeaturing, clear the expiry.
    update.featured_until = body.is_featured
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('events')
    .update(update)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, event: { ...update } });
}
