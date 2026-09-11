import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

import { isAdmin } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordDonationFromSession } from "@/lib/donations";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorization fix (F-07B): this route performs 50+ billable Stripe API
  // reads per call. Any authenticated user could previously trigger it.
  // Admin-only, same gate as other admin API routes.
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Even admins must not be able to loop it: paymentIntent tier, keyed on
  // the admin caller.
  const limited = await enforceRateLimit("paymentIntent", req, user.id);
  if (limited) return limited;

  if (!process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Sync is not configured." }, { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sessions = await stripe.checkout.sessions.list({ limit: 50 });
  let inserted = 0;
  const skipped: string[] = [];

  for (const session of sessions.data) {
    const result = await recordDonationFromSession(session);
    if (result.inserted) {
      inserted += 1;
    } else if (result.reason !== "not_donation" && result.reason !== "exists") {
      skipped.push(result.reason);
    }
  }

  return NextResponse.json({ inserted, skipped });
}
