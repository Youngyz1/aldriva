import Stripe from "stripe";
import { NextResponse } from "next/server";

import { recordDonationFromSession } from "@/lib/donations";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
