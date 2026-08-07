import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl } from "@/lib/site-url";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Invites a beneficiary to claim their profile.
 *
 * Authorisation is the important part: the caller must actually run a
 * fundraiser that names this beneficiary. Without that check any signed-in
 * user could email an invite for any beneficiary, which is both a spam vector
 * and a way to hijack a profile by getting the claim link sent to an address
 * you control.
 *
 * The account itself is never created here — the invite only sends a link.
 * The beneficiary decides whether to sign up, so nobody ends up with an
 * account they did not ask for.
 */
/**
 * Escapes a value for interpolation into the email's HTML body.
 *
 * `beneficiary.name` is attacker-controlled (the organizer types it when
 * creating the fundraiser) and the recipient address is attacker-chosen, so
 * interpolating it raw let anyone send arbitrary HTML from Aldriva's verified
 * sending domain — phishing with the platform's branding and sender reputation.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Minimum gap between invite emails for the same beneficiary.
 *
 * Application-level throttle, independent of the edge WAF rule. Without it a
 * single fundraiser with one unclaimed beneficiary is an unmetered relay: the
 * owner can POST repeatedly with a different `email` each time and every call
 * sends a branded message to an address of their choosing.
 */
const INVITE_COOLDOWN_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Before any DB work or email. Keyed on the user id, so one organizer cannot
  // burn through invites by rotating IPs, and co-workers behind one NAT are not
  // throttled as a single caller. Complements the per-beneficiary cooldown
  // below, which stops repeat sends for one beneficiary but not a spray across
  // many.
  const limited = await enforceRateLimit("beneficiaryInvite", req, user.id);
  if (limited) return limited;

  let body: { beneficiaryId?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const beneficiaryId = body.beneficiaryId?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!beneficiaryId || !email) {
    return NextResponse.json(
      { error: "Beneficiary and email are both required." },
      { status: 400 }
    );
  }
  // Deliberately permissive but non-empty — real validation is that the
  // recipient has to receive the link and act on it.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  // The caller must own a fundraiser that names this beneficiary.
  const { data: ownedLink } = await admin
    .from("fundraisers")
    .select("id")
    .eq("beneficiary_id", beneficiaryId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (!ownedLink) {
    // Same response whether the beneficiary doesn't exist or isn't theirs —
    // no probing for valid beneficiary ids.
    return NextResponse.json(
      { error: "You can only invite a beneficiary of your own fundraiser." },
      { status: 403 }
    );
  }

  const { data: beneficiary } = await admin
    .from("beneficiaries")
    .select("id, name, user_id, claimed_at, claim_sent_at")
    .eq("id", beneficiaryId)
    .maybeSingle();

  if (!beneficiary) {
    return NextResponse.json({ error: "Beneficiary not found." }, { status: 404 });
  }
  if (beneficiary.user_id || beneficiary.claimed_at) {
    return NextResponse.json(
      { error: "This beneficiary has already claimed their profile." },
      { status: 409 }
    );
  }

  // Throttle resends. claim_sent_at is already persisted, so this needs no
  // extra storage.
  if (beneficiary.claim_sent_at) {
    const elapsed = Date.now() - new Date(beneficiary.claim_sent_at).getTime();
    if (elapsed < INVITE_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((INVITE_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        {
          error: `An invite was just sent for this beneficiary. Try again in ${Math.ceil(
            waitSeconds / 60
          )} minute(s).`,
        },
        { status: 429, headers: { "Retry-After": String(waitSeconds) } }
      );
    }
  }

  // New token on every send, so a previously emailed link stops working —
  // matters if an invite went to the wrong address.
  const token = randomBytes(32).toString("hex");

  const { error: updateError } = await admin
    .from("beneficiaries")
    .update({
      claim_email: email,
      claim_token: token,
      claim_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", beneficiaryId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const claimUrl = `${getSiteUrl().replace(/\/$/, "")}/beneficiary/claim/${token}`;

  if (!process.env.RESEND_API_KEY) {
    // Without mail configured the invite is still recorded, so the link can be
    // shared manually rather than the whole action failing.
    return NextResponse.json({
      ok: true,
      emailed: false,
      claimUrl,
      message: "Invite created, but email is not configured. Share the link manually.",
    });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddress = `Aldriva <${
      process.env.RESEND_FROM_EMAIL || "contact@fund4agoodcause.com"
    }>`;

    await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: `You're named as the beneficiary of an Aldriva campaign`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
          <h2 style="margin-bottom: 20px;">You've been named as a beneficiary</h2>
          <p>Hello,</p>
          <p>An Aldriva campaign is raising money for <strong>${escapeHtml(
            beneficiary.name ?? ""
          )}</strong>, and the organizer has invited you to claim that beneficiary profile.</p>
          <p>Claiming it lets you add a photo, a short bio, and ways for supporters to reach you. It does not give you control of the campaign itself.</p>
          <p style="margin: 28px 0;">
            <a href="${claimUrl}" style="background:#c2410c;color:#ffffff;padding:12px 22px;border-radius:9999px;text-decoration:none;font-weight:bold;">Claim your profile</a>
          </p>
          <p style="color:#6b7280;font-size:13px;">If you weren't expecting this, you can ignore this email — nothing is created unless you claim it.</p>
        </div>
      `,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send the invite email." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, emailed: true });
}
