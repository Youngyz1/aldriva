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
  const { status, role, identity_status: identityStatus } = body as {
    status?: string;
    role?: string;
    identity_status?: string;
  };

  if (currentUser?.id === id) {
    if (status === 'suspended' || role === 'user' || role === 'organizer') {
      return NextResponse.json(
        { error: 'You cannot modify your own admin account.' },
        { status: 400 }
      );
    }
  }

  const update: Record<string, string | null> = {};

  if (status) {
    if (!['active', 'suspended'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 });
    }
    update.status = status;

    /**
     * Revoking a pending deletion on the user's behalf. Setting status back to
     * 'active' is not enough: `deleted_at` hides the account from every public
     * query and `purge_at` is what the nightly cron selects on, so leaving
     * either behind produces an account that reports active but stays invisible
     * and gets re-flipped on the next run.
     */
    if (status === 'active') {
      update.deleted_at = null;
      update.purge_at = null;
    }
  }

  if (role) {
    if (!['admin', 'organizer', 'user'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role value.' }, { status: 400 });
    }
    update.role = role;
  }

  let previousIdentityStatus: string | null = null;
  if (identityStatus) {
    if (!['pending', 'verified', 'rejected'].includes(identityStatus)) {
      return NextResponse.json({ error: 'Invalid identity_status value.' }, { status: 400 });
    }

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('identity_status')
      .eq('id', id)
      .maybeSingle();
    previousIdentityStatus = existingProfile?.identity_status ?? null;

    update.identity_status = identityStatus;
    update.identity_verified_at = identityStatus === 'verified' ? new Date().toISOString() : null;
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

  if (identityStatus && currentUser) {
    await supabaseAdmin.from('profile_verification_audit').insert({
      profile_id: id,
      admin_user_id: currentUser.id,
      field_name: 'identity_status',
      old_value: previousIdentityStatus,
      new_value: identityStatus,
    });
  }

  return NextResponse.json({ success: true, id, ...update });
}
