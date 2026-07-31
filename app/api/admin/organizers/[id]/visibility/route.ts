/**
 * app/api/admin/organizers/[id]/visibility/route.ts
 * GET  — fetch current visibility offsets and audit history for an organizer.
 * PATCH — update follower_offset and/or events_offset; logs to audit table.
 * Admin-only: isAdmin() checked before any DB operation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAdmin, getCurrentUser } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const { data: org, error } = await supabaseAdmin
    .from('organizers')
    .select('id, follower_offset, events_offset')
    .eq('id', id)
    .maybeSingle();

  if (error || !org) {
    return NextResponse.json({ error: 'Organizer not found.' }, { status: 404 });
  }

  // Real counts
  const [{ count: realFollowers }, { count: realEvents }] = await Promise.all([
    supabaseAdmin
      .from('organizer_follows')
      .select('id', { count: 'exact', head: true })
      .eq('organizer_id', id),
    supabaseAdmin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('organizer_id', id),
  ]);

  // Audit history
  const { data: auditRows } = await supabaseAdmin
    .from('organizer_visibility_audit')
    .select('id, admin_user_id, field_name, old_value, new_value, created_at')
    .eq('organizer_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({
    organizer_id: id,
    real_followers: realFollowers ?? 0,
    follower_offset: org.follower_offset ?? 0,
    display_followers: (realFollowers ?? 0) + (org.follower_offset ?? 0),
    real_events: realEvents ?? 0,
    events_offset: org.events_offset ?? 0,
    display_events: (realEvents ?? 0) + (org.events_offset ?? 0),
    history: auditRows ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const adminUser = await getCurrentUser();
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json()) as {
    follower_offset?: unknown;
    events_offset?: unknown;
    reset?: boolean;
  };

  // Fetch current values
  const { data: org, error: fetchError } = await supabaseAdmin
    .from('organizers')
    .select('id, follower_offset, events_offset')
    .eq('id', id)
    .maybeSingle();

  if (fetchError || !org) {
    return NextResponse.json({ error: 'Organizer not found.' }, { status: 404 });
  }

  const updates: Record<string, number> = {};
  const auditEntries: Array<{
    organizer_id: string;
    admin_user_id: string;
    field_name: string;
    old_value: number;
    new_value: number;
  }> = [];

  if (body.reset === true) {
    // Reset both offsets to 0
    if ((org.follower_offset ?? 0) !== 0) {
      auditEntries.push({
        organizer_id: id,
        admin_user_id: adminUser.id,
        field_name: 'follower_offset',
        old_value: org.follower_offset ?? 0,
        new_value: 0,
      });
      updates.follower_offset = 0;
    }
    if ((org.events_offset ?? 0) !== 0) {
      auditEntries.push({
        organizer_id: id,
        admin_user_id: adminUser.id,
        field_name: 'events_offset',
        old_value: org.events_offset ?? 0,
        new_value: 0,
      });
      updates.events_offset = 0;
    }
  } else {
    // Validate and apply individual updates
    if (body.follower_offset !== undefined) {
      const val = Number(body.follower_offset);
      if (!Number.isInteger(val) || val < 0) {
        return NextResponse.json(
          { error: 'follower_offset must be a non-negative integer.' },
          { status: 400 }
        );
      }
      if (val !== (org.follower_offset ?? 0)) {
        auditEntries.push({
          organizer_id: id,
          admin_user_id: adminUser.id,
          field_name: 'follower_offset',
          old_value: org.follower_offset ?? 0,
          new_value: val,
        });
        updates.follower_offset = val;
      }
    }

    if (body.events_offset !== undefined) {
      const val = Number(body.events_offset);
      if (!Number.isInteger(val) || val < 0) {
        return NextResponse.json(
          { error: 'events_offset must be a non-negative integer.' },
          { status: 400 }
        );
      }
      if (val !== (org.events_offset ?? 0)) {
        auditEntries.push({
          organizer_id: id,
          admin_user_id: adminUser.id,
          field_name: 'events_offset',
          old_value: org.events_offset ?? 0,
          new_value: val,
        });
        updates.events_offset = val;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true, message: 'No changes made.' });
  }

  // Apply updates
  const { error: updateError } = await supabaseAdmin
    .from('organizers')
    .update(updates)
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Write audit log entries
  if (auditEntries.length > 0) {
    await supabaseAdmin.from('organizer_visibility_audit').insert(auditEntries);
  }

  return NextResponse.json({ success: true, updated: updates });
}
