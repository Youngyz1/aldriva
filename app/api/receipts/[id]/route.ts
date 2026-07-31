import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import { generateReceiptPdf } from "@/lib/receipt";
import Stripe from "stripe";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid receipt ID." }, { status: 400 });
  }

  // Retrieve donation
  const { data: donation, error: donError } = await supabaseAdmin
    .from("donations")
    .select("id, donor_name, donor_email, amount, currency, created_at, payment_intent_id, fundraiser_id")
    .eq("id", id)
    .single();

  if (donError || !donation) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  // Retrieve fundraiser
  const { data: fundraiser } = await supabaseAdmin
    .from("fundraisers")
    .select("title, organizer_id")
    .eq("id", donation.fundraiser_id)
    .single();

  // Retrieve organizer
  let organizer = null;
  if (fundraiser?.organizer_id) {
    const { data: org } = await supabaseAdmin
      .from("organizers")
      .select("user_id, name, organization_name, nonprofit_registration_number, tax_id")
      .eq("id", fundraiser.organizer_id)
      .single();
    organizer = org;
  }

  // Authorization Check
  let authorized = false;

  // Check 1: Session ID from Stripe (for guest download right after checkout)
  const sp = request.nextUrl.searchParams;
  const sessionId = sp.get("session_id");

  if (sessionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const stripePi = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
      if (stripePi && stripePi === donation.payment_intent_id) {
        authorized = true;
      }
    } catch (e) {
      console.error("Stripe session retrieval error:", e);
    }
  }

  // Check 2: Authenticated user
  if (!authorized) {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Is admin?
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .single();
      
      if (profile?.role === "admin" && profile.status === "active") {
        authorized = true;
      }
      // Is donor?
      else if (donation.donor_email && user.email && donation.donor_email.toLowerCase() === user.email.toLowerCase()) {
        authorized = true;
      }
      // Is organizer?
      else if (organizer?.user_id === user.id) {
        authorized = true;
      }
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  // Generate PDF
  try {
    const pdfBuffer = await generateReceiptPdf(
      donation,
      organizer,
      fundraiser?.title || "Campaign"
    );

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `attachment; filename=receipt_${id}.pdf`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers,
    });
  } catch (err: any) {
    console.error("PDF generation failed:", err);
    return NextResponse.json({ error: "Failed to generate receipt PDF." }, { status: 500 });
  }
}
