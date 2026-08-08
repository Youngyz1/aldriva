import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/dashboard-context";
import { checkEventDeleteBlocked, checkFundraiserDeleteBlocked } from "@/lib/dashboard-delete";
import { Resend } from "resend";
import { BRAND } from "@/config/branding";

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const { password } = body;
  if (!password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  // 1. Verify password via sign-in attempt
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password,
  });

  if (authError) {
    return NextResponse.json({ error: "Invalid password." }, { status: 400 });
  }

  // 2. Fetch all organizers owned by the user
  const { data: organizers, error: orgError } = await supabaseAdmin
    .from("organizers")
    .select("id")
    .eq("user_id", user.id);

  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  const organizerIds = (organizers ?? []).map((o) => o.id);

  // 3. Check for blocking events or fundraisers
  if (organizerIds.length > 0) {
    const { data: events } = await supabaseAdmin
      .from("events")
      .select("id")
      .in("organizer_id", organizerIds);
    const eventIds = (events ?? []).map((e) => e.id);

    if (eventIds.length > 0) {
      const blockedEvents = await checkEventDeleteBlocked(eventIds);
      if (blockedEvents.blocked) {
        return NextResponse.json(
          { error: `Cannot delete account: ${blockedEvents.message}` },
          { status: 400 }
        );
      }
    }

    const { data: fundraisers } = await supabaseAdmin
      .from("fundraisers")
      .select("id")
      .in("organizer_id", organizerIds);
    const fundraiserIds = (fundraisers ?? []).map((f) => f.id);

    if (fundraiserIds.length > 0) {
      const blockedFundraisers = await checkFundraiserDeleteBlocked(fundraiserIds);
      if (blockedFundraisers.blocked) {
        return NextResponse.json(
          { error: `Cannot delete account: ${blockedFundraisers.message}` },
          { status: 400 }
        );
      }
    }
  }

  // 4. Set deleted_at and purge_at (now + 14 days)
  const now = new Date();
  const deletedAt = now.toISOString();
  const purgeAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  // Update profile
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      deleted_at: deletedAt,
      purge_at: purgeAt,
      status: "pending_deletion",
    })
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (organizerIds.length > 0) {
    // Update events
    await supabaseAdmin
      .from("events")
      .update({ deleted_at: deletedAt, purge_at: purgeAt })
      .in("organizer_id", organizerIds);

    // Update fundraisers
    await supabaseAdmin
      .from("fundraisers")
      .update({ deleted_at: deletedAt, purge_at: purgeAt })
      .in("organizer_id", organizerIds);

    // Update organizers
    await supabaseAdmin
      .from("organizers")
      .update({ deleted_at: deletedAt, purge_at: purgeAt })
      .eq("user_id", user.id);
  }

  // 5. Send deactivation confirmation email via Resend
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromAddress = `${BRAND.name} <${
        process.env.RESEND_FROM_EMAIL || BRAND.contactEmail
      }>`;
      const purgeDateFormatted = new Date(purgeAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      await resend.emails.send({
        from: fromAddress,
        to: user.email!,
        subject: "Your Aldriva account is scheduled for deletion",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
            <h2 style="color: #ef4444; margin-bottom: 20px;">Account Scheduled for Deletion</h2>
            <p>Hello,</p>
            <p>We are writing to confirm that your Aldriva account has been deactivated and is scheduled to be permanently deleted on <strong>${purgeDateFormatted}</strong> (14 days from now).</p>
            <p><strong>What this means:</strong></p>
            <ul>
              <li>Your public organizer profiles, events, and fundraisers have been hidden from public view immediately.</li>
              <li>You have been logged out of all active sessions.</li>
            </ul>
            <p><strong>Changed your mind?</strong></p>
            <p>You can cancel this request and recover your account at any time before the scheduled deletion date. Simply log back into your account before <strong>${purgeDateFormatted}</strong>, and you will be prompted with the option to restore your profile and data completely.</p>
            <p>If you take no action, your account details and personal identifying information will be permanently purged on ${purgeDateFormatted}.</p>
            <p style="margin-top: 30px; font-size: 12px; color: #6b7280;">Best regards,<br>The Aldriva Team</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("[Account Deactivation Email Error]", emailErr);
    }
  }

  // 6. Sign out globally across all sessions
  const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(user.id);
  if (signOutError) {
    console.error("[Deactivation signOutError]", signOutError.message);
  }

  return NextResponse.json({ success: true, purgeAt });
}
