import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const sessionId = sp.get("session_id");
  const paymentIntentId = sp.get("payment_intent_id");

  if (!sessionId && !paymentIntentId) {
    return NextResponse.json(
      { error: "Missing session_id or payment_intent_id" },
      { status: 400 }
    );
  }

  let piId = paymentIntentId || "";

  if (sessionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      piId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.id;
    } catch (e: any) {
      console.error("[receipts/lookup] Stripe session error:", e.message);
    }
  }

  if (!piId) {
    return NextResponse.json(
      { error: "Could not resolve payment intent." },
      { status: 404 }
    );
  }

  const { data: donation } = await supabaseAdmin
    .from("donations")
    .select("id, fundraiser_id")
    .eq("payment_intent_id", piId)
    .maybeSingle();

  if (!donation) {
    return NextResponse.json(
      { error: "Donation record not found yet." },
      { status: 404 }
    );
  }

  const { data: fundraiser } = await supabaseAdmin
    .from("fundraisers")
    .select("organizer_id")
    .eq("id", donation.fundraiser_id)
    .single();

  let isNonprofit = false;
  if (fundraiser?.organizer_id) {
    const { data: org } = await supabaseAdmin
      .from("organizers")
      .select("organization_name, nonprofit_registration_number")
      .eq("id", fundraiser.organizer_id)
      .single();
    if (org?.organization_name && org?.nonprofit_registration_number) {
      isNonprofit = true;
    }
  }

  return NextResponse.json({
    id: donation.id,
    is_nonprofit: isNonprofit,
  });
}
