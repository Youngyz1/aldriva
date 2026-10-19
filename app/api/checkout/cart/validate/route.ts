import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fromMinorUnits } from "@/lib/money";
import { validateCartCheckout } from "@/lib/store-cart-checkout";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/checkout/cart/validate
 * Same body as POST /api/checkout/cart. Runs the identical server
 * validation + live pricing and returns the priced review summary WITHOUT
 * creating orders or a Stripe session, so the drawer shows the exact
 * pre-payment totals (including any promo discount).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    const limited = await enforceRateLimit("paymentIntent", req, user?.id ?? null);
    if (limited) return limited;

    const body = await req.json();
    const checked = await validateCartCheckout({
      supabaseAdmin,
      stripeSecretKey: process.env.STRIPE_SECRET_KEY,
      siteSlug: body?.siteSlug,
      items: body?.items,
      buyerEmail: body?.buyerEmail ?? user?.email ?? null,
      buyerName: body?.buyerName,
      promoCode: body?.promoCode,
      viewerId: user?.id ?? null,
    });
    if (!checked.ok) {
      return NextResponse.json(
        { error: checked.error, ...(checked.issues ? { issues: checked.issues } : {}) },
        { status: checked.status }
      );
    }
    const cart = checked.cart;
    return NextResponse.json({
      currency: cart.currency,
      lines: cart.lines.map((line) => ({
        productId: line.productId,
        name: line.name,
        quantity: line.quantity,
        unitMajor: line.unitMajor,
        lineMajor: fromMinorUnits(line.lineMinor, cart.currency),
      })),
      subtotalMajor: fromMinorUnits(cart.subtotalMinor, cart.currency),
      discountMajor: fromMinorUnits(cart.discountMinor, cart.currency),
      totalMajor: fromMinorUnits(cart.totalMinor, cart.currency),
      promoCode: cart.promo ? cart.promo.code : null,
    });
  } catch (err) {
    console.error("cart-validate: unexpected error:", err);
    return NextResponse.json({ error: "Could not review the cart." }, { status: 500 });
  }
}
