/**
 * app/api/admin/events/route.ts
 * GET — all events joined with organizer name.
 * Admin-only.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdmin } from '@/lib/auth';

// Service role: bypasses RLS — admin operations only
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('events')
    .select('id, title, visibility, status, is_featured, created_at, organizers(name)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const events = (data ?? []).map((e) => {
    const org = Array.isArray(e.organizers) ? e.organizers[0] : e.organizers;
    return {
      id:             e.id,
      title:          e.title,
      organizer_name: (org as { name?: string } | null)?.name ?? '—',
      visibility:     e.visibility ?? 'public',
      status:         e.status ?? 'approved',
      is_featured:    e.is_featured ?? false,
      created_at:     e.created_at,
    };
  });

  return NextResponse.json({ events });
}
