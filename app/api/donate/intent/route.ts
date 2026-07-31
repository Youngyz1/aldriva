import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set.");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const {
      amount,
      tip = 0,
      fundraiserSlug,
      fundraiserTitle,
      donorName,
      donorEmail,
      message,
      anonymous = false,
      saveCard = false,
      currency = "usd",
      // UUID generated client-side at the moment the user clicks "Proceed".
      checkoutAttemptId,
    } = await req.json();
    const supabase = await createSupabaseServer();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id ?? "";
    console.log("[donate/intent] auth check:", {
  hasUser: Boolean(authData.user),
  userId: authData.user?.id,
  email: authData.user?.email,
});

    const donationAmount = Number(amount);
    const tipAmount = Number(tip) || 0;

    if (!fundraiserSlug || !Number.isFinite(donationAmount) || donationAmount < 1) {
      return NextResponse.json(
        { error: "Invalid donation details." },
        { status: 400 }
      );
    }

    const { data: fundraiser } = await supabaseAdmin
      .from("fundraisers")
      .select("id, title, slug")
      .eq("slug", fundraiserSlug)
      .single();

    if (!fundraiser) {
      return NextResponse.json(
        { error: "Fundraiser not found." },
        { status: 404 }
      );
    }

    const totalCents = Math.round((donationAmount + tipAmount) * 100);
    const normalizedEmail =
      typeof donorEmail === "string" ? donorEmail.trim() : "";
    const normalizedName =
      typeof donorName === "string" ? donorName.trim() : "";

    // Anonymous: hide the name from public donor feeds but keep it in Stripe
    // for internal records / fraud prevention (per spec requirement).
    const publicDonorName = anonymous
      ? "Anonymous"
      : normalizedName || "Anonymous";

    // Optional: create a Stripe Customer so future payments are linked
    let customerId: string | undefined;
    if (saveCard && normalizedEmail) {
      const customer = await stripe.customers.create({
        email: normalizedEmail,
        name: normalizedName || undefined,
        metadata: {
          kind: "donor",
          fundraiser_id: fundraiser.id,
          fundraiser_slug: fundraiser.slug,
        },
      });
      customerId = customer.id;
    }

    // Idempotency key: same fundraiser + donor + amount combination
    const idempotencyKey =
      checkoutAttemptId && typeof checkoutAttemptId === "string"
        ? `donation-intent-${checkoutAttemptId}`
        : `donation-${fundraiser.id}-${normalizedEmail || "guest"}-${totalCents}-${Date.now()}`;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        customer: customerId,
        setup_future_usage: saveCard ? "off_session" : undefined,
        ...(normalizedEmail ? { receipt_email: normalizedEmail } : {}),
        metadata: {
          // Identifies this intent as a donation for the webhook
          kind: "donation",
          fundraiser_id: fundraiser.id,
          fundraiser_slug: fundraiser.slug,
          fundraiser_title: fundraiser.title || fundraiserTitle || "",
          // Public name (shown on donor feed)
          donor_name: publicDonorName,
          // Full name always stored in Stripe for records (not shown publicly when anonymous)
          donor_name_real: normalizedName || "",
          donor_email: normalizedEmail,
          user_id: userId,
          message: message || "",
          donation_amount: String(donationAmount),
          tip_amount: String(tipAmount),
          total_amount: String(((donationAmount + tipAmount))),
          currency: currency.toLowerCase(),
          anonymous: String(anonymous),
          save_card: String(Boolean(saveCard)),
        },
      },
      { idempotencyKey }
    );

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err: unknown) {
    console.error("[donate/intent]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
