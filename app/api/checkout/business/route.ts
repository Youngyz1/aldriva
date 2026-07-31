import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { businessId } = await req.json();
    if (!businessId) {
      return NextResponse.json({ error: "Missing business ID." }, { status: 400 });
    }

    // 1. Fetch business and validate ownership
    const { data: business, error: dbError } = await supabase
      .from("businesses")
      .select("id, name, slug, listing_tier, owner_id")
      .eq("id", businessId)
      .single();

    if (dbError || !business) {
      return NextResponse.json({ error: "Business not found." }, { status: 404 });
    }

    if (business.owner_id !== user.id) {
      return NextResponse.json({ error: "Forbidden: You do not own this business." }, { status: 403 });
    }

    // 2. Select Stripe Price ID based on tier
    let priceId = "";
    let checkoutMode: "payment" | "subscription" = "payment";

    if (business.listing_tier === "one_time") {
      priceId = process.env.STRIPE_PRICE_BUSINESS_ONETIME || "";
      checkoutMode = "payment";
    } else if (business.listing_tier === "subscription") {
      priceId = process.env.STRIPE_PRICE_BUSINESS_SUB || "";
      checkoutMode = "subscription";
    } else {
      return NextResponse.json({ error: "Invalid tier for payment." }, { status: 400 });
    }

    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price ID for tier '${business.listing_tier}' is not configured.` },
        { status: 500 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe secret key not configured." }, { status: 500 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;

    // 3. Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: user.email || undefined,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: checkoutMode,
      success_url: `${baseUrl}/dashboard/businesses?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/businesses?cancelled=true`,
      metadata: {
        kind: "business",
        business_id: business.id,
        listing_tier: business.listing_tier,
        user_id: user.id,
        stripe_price_id: priceId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
