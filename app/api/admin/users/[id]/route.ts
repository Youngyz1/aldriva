/**
 * app/api/admin/users/[id]/route.ts
 * GET — user detail for admin drawer.
 * PATCH — update user status or role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getUserDetail, supabaseAdmin } from '@/lib/admin-data';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const currentUser = await getCurrentUser();

  try {
    const user = await getUserDetail(id, currentUser?.id ?? null);
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load user.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const currentUser = await getCurrentUser();
  const body = await req.json();
  const { status, role } = body as { status?: string; role?: string };

  if (currentUser?.id === id) {
    if (status === 'suspended' || role === 'user' || role === 'organizer') {
      return NextResponse.json(
        { error: 'You cannot modify your own admin account.' },
        { status: 400 }
      );
    }
  }

  const update: Record<string, string> = {};

  if (status) {
    if (!['active', 'suspended'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 });
    }
    update.status = status;
  }

  if (role) {
    if (!['admin', 'organizer', 'user'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role value.' }, { status: 400 });
    }
    update.role = role;
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { data: updatedProfile, error } = await supabaseAdmin
    .from('profiles')
    .update(update)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updatedProfile) {
    const insertPayload: Record<string, string> = { id, role: 'user', status: 'active', ...update };
    const { error: insertError } = await supabaseAdmin.from('profiles').insert(insertPayload);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, id, ...update });
}
