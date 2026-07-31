/**
 * app/api/admin/fundraisers/[id]/route.ts
 * PATCH — update fundraiser is_featured flag and/or backdate created_at.
 * Admin-only: checks isAdmin() before any DB operation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

// Service role: bypasses RLS — admin operations only
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TEN_YEARS_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json()) as {
    is_featured?: boolean;
    created_at?: string;
    status?: string;
    rejection_reason?: string | null;
  };

  if (
    body.is_featured === undefined &&
    body.created_at === undefined &&
    body.status === undefined
  ) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.is_featured !== undefined) {
    update.is_featured = body.is_featured;
    update.featured_until = body.is_featured
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
  }

  if (body.created_at !== undefined) {
    const parsed = new Date(body.created_at);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid date format for created_at.' }, { status: 400 });
    }
    const now = Date.now();
    if (parsed.getTime() > now) {
      return NextResponse.json({ error: 'created_at cannot be in the future.' }, { status: 400 });
    }
    if (now - parsed.getTime() > TEN_YEARS_MS) {
      return NextResponse.json({ error: 'created_at cannot be more than 10 years in the past.' }, { status: 400 });
    }
    update.created_at = parsed.toISOString();
  }

  if (body.status !== undefined) {
    if (!['pending_review', 'published', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }
    update.status = body.status;
    // rejection_reason is only meaningful on a rejection; clear it otherwise.
    update.rejection_reason =
      body.status === 'rejected'
        ? (body.rejection_reason ?? '').trim() || null
        : null;
  }

  const { error } = await supabaseAdmin
    .from('fundraisers')
    .update(update)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A status change flips a campaign's public visibility, so bust the cached
  // /fundraisers grid (unstable_cache) immediately rather than waiting out its
  // revalidate TTL. (The detail page is force-dynamic, so it needs no busting.)
  if (body.status !== undefined) {
    revalidatePath('/fundraisers');

    if (body.status === 'published' || body.status === 'rejected') {
      notifyOwnerOfReviewDecision(id, body.status, update.rejection_reason as string | null).catch(
        (err) => console.error('[admin/fundraisers] Failed to notify owner of review decision:', err)
      );
    }
  }

  return NextResponse.json({ success: true, fundraiser: update });
}

async function notifyOwnerOfReviewDecision(
  fundraiserId: string,
  status: 'published' | 'rejected',
  rejectionReason: string | null
) {
  const { data: fundraiser } = await supabaseAdmin
    .from('fundraisers')
    .select('title, slug, organizer_id, user_id')
    .eq('id', fundraiserId)
    .maybeSingle();

  if (!fundraiser) return;

  let ownerUserId = fundraiser.user_id;
  if (fundraiser.organizer_id) {
    const { data: organizer } = await supabaseAdmin
      .from('organizers')
      .select('user_id')
      .eq('id', fundraiser.organizer_id)
      .maybeSingle();
    if (organizer?.user_id) ownerUserId = organizer.user_id;
  }

  if (!ownerUserId) return;

  // Review decisions are account-status emails (not a discretionary alert like
  // donation/ticket notices), so they're always sent — no preferences lookup.
  const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(ownerUserId);
  const email = userRes?.user?.email;
  const shouldEmail = Boolean(email);
  const link = fundraiser.slug ? `/fundraisers/${fundraiser.slug}` : null;

  if (status === 'published') {
    await createNotification({
      userId: ownerUserId,
      type: 'fundraiser_approved',
      title: 'Fundraiser approved',
      body: `"${fundraiser.title}" is now live.`,
      link,
      relatedType: 'fundraiser',
      relatedId: fundraiserId,
      email: shouldEmail
        ? {
            to: email!,
            subject: `Your fundraiser "${fundraiser.title}" is approved 🎉`,
            html: approvalEmailHtml(fundraiser.title, link),
          }
        : null,
    });
    return;
  }

  await createNotification({
    userId: ownerUserId,
    type: 'fundraiser_rejected',
    title: 'Fundraiser rejected',
    body: rejectionReason ? `"${fundraiser.title}": ${rejectionReason}` : `"${fundraiser.title}" was rejected.`,
    link,
    relatedType: 'fundraiser',
    relatedId: fundraiserId,
    email: shouldEmail
      ? {
          to: email!,
          subject: `Your fundraiser "${fundraiser.title}" was not approved`,
          html: rejectionEmailHtml(fundraiser.title, rejectionReason, link),
        }
      : null,
  });
}

function emailShell(headerColor: string, heading: string, bodyHtml: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:${headerColor};padding:32px;text-align:center;">
                  <p style="margin:0;color:#ffffffcc;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Aldriva Alerts</p>
                  <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;font-weight:900;">${heading}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">${bodyHtml}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function approvalEmailHtml(title: string, link: string | null) {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  return emailShell(
    'linear-gradient(135deg,#10b981,#059669)',
    'Fundraiser Approved! 🎉',
    `
      <p style="margin:0 0 16px;color:#18181b;font-size:16px;line-height:1.6;">Hi there,</p>
      <p style="margin:0 0 24px;color:#18181b;font-size:16px;line-height:1.6;">
        Great news! Your fundraiser <strong>${title}</strong> has been reviewed and is now live for the public to see and support.
      </p>
      ${link ? `<a href="${base}${link}" style="display:inline-block;background:#10b981;color:#ffffff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:50px;text-decoration:none;">View your fundraiser</a>` : ''}
    `
  );
}

function rejectionEmailHtml(title: string, reason: string | null, link: string | null) {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  return emailShell(
    'linear-gradient(135deg,#ef4444,#dc2626)',
    'Fundraiser Not Approved',
    `
      <p style="margin:0 0 16px;color:#18181b;font-size:16px;line-height:1.6;">Hi there,</p>
      <p style="margin:0 0 16px;color:#18181b;font-size:16px;line-height:1.6;">
        Your fundraiser <strong>${title}</strong> was reviewed and was not approved for publishing.
      </p>
      ${reason ? `<p style="margin:0 0 24px;padding:16px;background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;color:#71717a;font-size:14px;"><strong>Reason:</strong> ${reason}</p>` : ''}
      ${link ? `<a href="${base}${link}" style="display:inline-block;background:#ef4444;color:#ffffff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:50px;text-decoration:none;">View details</a>` : ''}
    `
  );
}
