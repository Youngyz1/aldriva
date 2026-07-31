/**
 * @deprecated  POST /api/donate
 * ─────────────────────────────
 * LEGACY — This endpoint previously created an off-platform Stripe Checkout
 * Session and redirected the donor away from the site. It is no longer called
 * by any page in the application.
 *
 * It is preserved here (returning 410 Gone) so that any cached external links
 * receive a meaningful error instead of a 404, without breaking the build.
 *
 * The active donation flow is:
 *   POST /api/donate/intent  →  returns { clientSecret }
 *   Client renders <StripeProvider> + <PaymentForm> inline (no redirect)
 *
 * TODO: Delete this file entirely once confirmed no external integrations call it.
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error:
        "This endpoint is deprecated. Use POST /api/donate/intent for inline donations.",
      migration: "/api/donate/intent",
    },
    { status: 410 }
  );
}
