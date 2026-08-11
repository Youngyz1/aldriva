/**
 * app/api/admin/organizers/[id]/route.ts
 * GET — organizer detail for admin drawer.
 * PATCH — update organizer status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getOrganizerDetail, supabaseAdmin } from '@/lib/admin-data';

const VALID_STATUSES = ['pending', 'verified', 'rejected', 'suspended'] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const organizer = await getOrganizerDetail(id);
    if (!organizer) {
      return NextResponse.json({ error: 'Organizer not found.' }, { status: 404 });
    }
    return NextResponse.json({ organizer });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load organizer.';
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
  const { status, payment_enabled: paymentEnabled, fundraising_approved: fundraisingApproved } =
    (await req.json()) as {
      status?: string;
      payment_enabled?: boolean;
      fundraising_approved?: boolean;
    };

  if (status !== undefined && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 });
  }

  if (
    status === undefined &&
    paymentEnabled === undefined &&
    fundraisingApproved === undefined
  ) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (status !== undefined) {
    update.status = status;
    if (status === 'verified') {
      update.verified_at = new Date().toISOString();
    }
  }

  let previousPaymentEnabled: boolean | null = null;
  let previousFundraisingApproved: boolean | null = null;
  if (paymentEnabled !== undefined || fundraisingApproved !== undefined) {
    const { data: existingOrganizer } = await supabaseAdmin
      .from('organizers')
      .select('payment_enabled, fundraising_approved')
      .eq('id', id)
      .maybeSingle();
    previousPaymentEnabled = existingOrganizer?.payment_enabled ?? null;
    previousFundraisingApproved = existingOrganizer?.fundraising_approved ?? null;
  }

  if (paymentEnabled !== undefined) {
    update.payment_enabled = paymentEnabled;
    update.payment_enabled_at = paymentEnabled ? new Date().toISOString() : null;
  }

  if (fundraisingApproved !== undefined) {
    update.fundraising_approved = fundraisingApproved;
    update.fundraising_approved_at = fundraisingApproved ? new Date().toISOString() : null;
  }

  const { error } = await supabaseAdmin
    .from('organizers')
    .update(update)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (currentUser) {
    const auditRows: Record<string, unknown>[] = [];
    if (paymentEnabled !== undefined && paymentEnabled !== previousPaymentEnabled) {
      auditRows.push({
        organizer_id: id,
        admin_user_id: currentUser.id,
        field_name: 'payment_enabled',
        old_value: previousPaymentEnabled ? 1 : 0,
        new_value: paymentEnabled ? 1 : 0,
      });
    }
    if (fundraisingApproved !== undefined && fundraisingApproved !== previousFundraisingApproved) {
      auditRows.push({
        organizer_id: id,
        admin_user_id: currentUser.id,
        field_name: 'fundraising_approved',
        old_value: previousFundraisingApproved ? 1 : 0,
        new_value: fundraisingApproved ? 1 : 0,
      });
    }
    if (auditRows.length) {
      await supabaseAdmin.from('organizer_visibility_audit').insert(auditRows);
    }
  }

  return NextResponse.json({ success: true, id, status, payment_enabled: paymentEnabled, fundraising_approved: fundraisingApproved });
}
