import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { tagCryptoOrderId, getNowPaymentsConfig } from "@/lib/cryptoPayment";
import { getSiteUrl } from "@/lib/site-url";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TIER_AMOUNTS: Record<string, number> = {
  one_time: 49,
  subscription: 19,
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { businessId } = await req.json();
    if (!businessId) {
      return NextResponse.json({ error: "Missing business ID." }, { status: 400 });
    }

    // Validate ownership
    const { data: business, error: dbError } = await supabaseAdmin
      .from("businesses")
      .select("id, name, slug, listing_tier, owner_id")
      .eq("id", businessId)
      .single();

    if (dbError || !business) {
      return NextResponse.json({ error: "Business not found." }, { status: 404 });
    }

    if (business.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Forbidden: You do not own this business." },
        { status: 403 }
      );
    }

    const amount = TIER_AMOUNTS[business.listing_tier];
    if (!amount) {
      return NextResponse.json(
        { error: `Crypto checkout is not available for tier '${business.listing_tier}'.` },
        { status: 400 }
      );
    }

    const nowPayments = getNowPaymentsConfig();
    if (!nowPayments.apiKey) {
      return NextResponse.json(
        { error: "NOWPayments is not configured on the server." },
        { status: 500 }
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || getSiteUrl();
    const orderId = crypto.randomUUID();
    const successUrl = `${baseUrl}/crypto-pending?orderId=${orderId}&kind=business`;
    const cancelUrl = `${baseUrl}/dashboard/businesses?cancelled=true`;
    const ipnCallbackUrl = `${baseUrl}/api/crypto/webhook`;

    const nowpaymentsRes = await fetch(`${nowPayments.baseUrl}/invoice`, {
      method: "POST",
      headers: {
        "x-api-key": nowPayments.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: "usd",
        // Tagged with "business" so the IPN webhook can dispatch straight to
        // the businesses table instead of probing donations/ticket_orders
        // first. crypto_payment_id below still stores the raw, untagged id.
        order_id: tagCryptoOrderId("business", orderId),
        order_description: `Business listing (${business.listing_tier}) – ${business.name}`,
        ipn_callback_url: ipnCallbackUrl,
        success_url: successUrl,
        cancel_url: cancelUrl,
      }),
    });

    const nowpaymentsData = await nowpaymentsRes.json();
    if (!nowpaymentsRes.ok || !nowpaymentsData.invoice_url) {
      console.error("NOWPayments invoice error:", nowpaymentsData);
      return NextResponse.json(
        { error: nowpaymentsData.message || "Failed to create NOWPayments invoice." },
        { status: 502 }
      );
    }

    const paymentId = String(nowpaymentsData.id);
    const paymentUrl = nowpaymentsData.invoice_url;

    // Store the crypto orderId on the business row so the webhook can activate it
    await supabaseAdmin
      .from("businesses")
      .update({ crypto_payment_id: orderId })
      .eq("id", business.id);

    return NextResponse.json({ paymentUrl, paymentId, orderId });
  } catch (err: unknown) {
    console.error("business-crypto route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
