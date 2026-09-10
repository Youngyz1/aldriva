/**
 * app/api/admin/fundraisers/route.ts
 * GET — all fundraisers. Admin-only.
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
    .from('fundraisers')
    .select('id, title, slug, organizer, raised, goal, is_featured, status, rejection_reason, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("[admin/fundraisers]", error);
    return NextResponse.json({ error: "Failed to load fundraisers." }, { status: 500 });
  }

  return NextResponse.json({ fundraisers: data ?? [] });
}
